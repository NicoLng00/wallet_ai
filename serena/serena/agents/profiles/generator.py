"""Generazione della popolazione di agenti (docs/TRADING_ARCHITECTURE.md §6): chiamate LLM a batch
(~10-15 profili per chiamata, non 1 per agente ne' tutti e 50 in una chiamata sola — pattern
verificato utile in MiroFish, docs/MIROFISH_REVERSE_ENGINEERING.md §A.5), a `cohort_temperature`
(default 0.0), con il prior deterministico dell'archetipo come fallback strutturale — MAI un
fallback a `random`, la causa verificata di non-determinismo in MiroFish/OASIS (§A.12/§B.11).

RIDISEGNATO dopo aver collegato una vera GEMINI_API_KEY (vedi docs/IMPLEMENTATION_PLAN.md, sezione
"Post-MVP"): il primo tentativo (AgentProfileBatch, con l'intero AgentProfile incluse le beliefs)
falliva SEMPRE con UnsupportedSchemaError perche' AgentProfile.beliefs e' un dict[str, float] a
proprieta' libere, non rappresentabile nello schema strutturato di Gemini (verificato dal vivo, non
assunto). L'LLM ora genera SOLO la parte qualitativa (AgentPersonaDraft: identity/strategy/
information_sources/behavioral_biases) — MAI i coefficienti di rischio numerici ne' le beliefs, che
restano sempre campionati dal prior seedato di archetypes.py: lo stesso principio "l'LLM non aggira
mai un controllo di rischio deterministico" applicato alla generazione degli agenti, non solo al
trading. `generate_agent_population()` sovrappone la persona LLM (se fornita) sullo scheletro
numerico deterministico gia' pronto, e ricade su quello scheletro (identity/strategy generiche ma
valide) se la chiamata fallisce — mai un crash del run.

OTTIMIZZAZIONE: gli archetipi vengono generati in PARALLELO (asyncio.gather) invece che in sequenza —
ogni chiamata LLM e' un vero round-trip di rete (~1-3s, misurato dal vivo), e gli archetipi sono
completamente indipendenti. Per restare deterministico anche sotto esecuzione concorrente (l'ordine
di completamento delle chiamate di rete non e' garantito), ogni archetipo riceve il proprio
generatore numerico seedato in modo indipendente (un componente RandomSeedBundle per archetipo)
invece di condividerne uno condiviso fra le coroutine."""
from __future__ import annotations
import asyncio
from datetime import datetime
from typing import Optional

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from serena.agents.profiles.archetypes import ARCHETYPE_PRIORS, Range
from serena.agents.strategies.hints import STRATEGY_HINTS
from serena.llm.client import LLMClient, LLMQuotaExceededError, LLMTier
from serena.models.agent import AgentArchetype, AgentProfile
from serena.models.run import RandomSeedBundle

DEFAULT_BATCH_SIZE = 12

# Ordine fisso e canonico (l'ordine di definizione dell'enum AgentArchetype), sempre lo stesso
# indipendentemente da quali archetipi vengono richiesti in un dato run o in che ordine il chiamante
# li ha inseriti nel dict — RandomSeedBundle.derive() assegna i seed per POSIZIONE nella lista di
# componenti (spawn() di numpy e' posizionale), quindi derivare i seed da un elenco che varia con
# l'input del chiamante romperebbe silenziosamente "stesso seed => stessa popolazione" ogni volta che
# l'ordine di iterazione del dict cambia (trovato con un test che confronta {MOMENTUM,CONTRARIAN} con
# {CONTRARIAN,MOMENTUM}: falliva prima di questo fix). Usare SEMPRE l'elenco completo e fisso rende la
# posizione di ogni archetipo costante, quindi il suo seed dipende solo da (seed, se stesso).
_ALL_ARCHETYPE_COMPONENT_NAMES = [f"cohort_generation:{archetype.value}" for archetype in AgentArchetype]


class AgentPersonaDraft(BaseModel):
    """Solo la parte qualitativa di un profilo — VERIFICATO compatibile con lo schema strutturato di
    Gemini (nessun dict a proprieta' libere, a differenza di AgentProfile intero, vedi
    tests/test_schema_conversion.py)."""
    model_config = ConfigDict(extra="forbid")

    agent_id: str = Field(min_length=1)
    identity: str = Field(min_length=1)
    strategy: str = Field(min_length=1)
    information_sources: list[str] = Field(default_factory=list)
    behavioral_biases: list[str] = Field(default_factory=list)


class AgentPersonaDraftBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    personas: list[AgentPersonaDraft]


def _sample(rng: np.random.Generator, value_range: Range) -> float:
    return float(rng.uniform(value_range.low, value_range.high))


def generate_archetype_batch_deterministic(
    archetype: AgentArchetype, count: int, start_index: int, rng: np.random.Generator,
    created_at: datetime, preferred_assets: Optional[list[str]] = None,
    closes_by_asset: Optional[dict[str, list[float]]] = None,
) -> list[AgentProfile]:
    prior = ARCHETYPE_PRIORS[archetype]
    hint = STRATEGY_HINTS[archetype]
    assets = list(preferred_assets or [])
    closes_by_asset = closes_by_asset or {}

    profiles: list[AgentProfile] = []
    for offset in range(count):
        index = start_index + offset
        beliefs = {asset: hint(closes_by_asset.get(asset, [])) for asset in assets}
        profiles.append(AgentProfile(
            agent_id=f"{archetype.value}-{index:03d}",
            archetype=archetype,
            identity=f"{archetype.value.replace('_', ' ').title()} agent #{index}",
            capital=float(rng.uniform(prior.capital_low, prior.capital_high)),
            risk_profile=prior.risk_profile,
            time_horizon=prior.time_horizon,
            strategy=f"{archetype.value}_v1",
            beliefs=beliefs,
            information_sources=[],
            behavioral_biases=[],
            social_influence=_sample(rng, prior.social_influence),
            information_sensitivity=_sample(rng, prior.information_sensitivity),
            herding_coefficient=_sample(rng, prior.herding_coefficient),
            contrarian_coefficient=_sample(rng, prior.contrarian_coefficient),
            news_sensitivity=_sample(rng, prior.news_sensitivity),
            risk_aversion=_sample(rng, prior.risk_aversion),
            maximum_position=_sample(rng, prior.maximum_position),
            maximum_drawdown=_sample(rng, prior.maximum_drawdown),
            preferred_assets=assets,
            created_at=created_at,
        ))
    return profiles


def apply_persona_overlay(profile: AgentProfile, persona: AgentPersonaDraft) -> AgentProfile:
    """Sovrascrive SOLO i campi qualitativi — mai capital/beliefs/coefficienti di rischio, che
    restano quelli campionati dal prior seedato indipendentemente da cosa dice l'LLM."""
    return profile.model_copy(update={
        "identity": persona.identity,
        "strategy": persona.strategy,
        "information_sources": persona.information_sources,
        "behavioral_biases": persona.behavioral_biases,
    })


class LLMBackedPersonaGenerator:
    """Tier 1 (docs/TRADING_ARCHITECTURE.md §7): genera solo identity/strategy/information_sources/
    behavioral_biases per un batch di agent_id gia' assegnati. Un retry a temperatura ridotta su
    fallimento, poi rilancia — la decisione di ricadere sul profilo deterministico e'
    dell'orchestratore (generate_agent_population), non di questa classe (stesso principio di
    separazione di LLMBackedEventInterpreter, Fase 3)."""

    def __init__(self, llm_client: LLMClient, tier: LLMTier = "opus", temperature: float = 0.0,
                 retry_temperature_delta: float = 0.1):
        self._llm_client = llm_client
        self._tier = tier
        self._temperature = temperature
        self._retry_temperature_delta = retry_temperature_delta

    async def generate_batch(self, archetype: AgentArchetype, agent_ids: list[str]) -> list[AgentPersonaDraft]:
        try:
            return await self._call(archetype, agent_ids, self._temperature)
        except LLMQuotaExceededError:
            # VERIFICATO dal vivo (Fase 5): ritentare contro una quota giornaliera esaurita e'
            # garantito fallire di nuovo e spreca solo un'altra chiamata — rilanciato subito.
            raise
        except Exception:
            return await self._call(archetype, agent_ids, max(0.0, self._temperature - self._retry_temperature_delta))

    async def _call(self, archetype: AgentArchetype, agent_ids: list[str], temperature: float) -> list[AgentPersonaDraft]:
        prompt = (
            f"Genera una persona di trading realistica e credibile in italiano per ciascuno di questi "
            f"ID agente, tutti con archetipo '{archetype.value}': {agent_ids}. Per ciascuno: agent_id "
            f"ESATTAMENTE uguale a uno di quelli elencati (uno per agente, nessuno ripetuto, nessuno "
            f"omesso); identity (2-3 frasi che descrivono chi e' questo trader e il suo stile); "
            f"strategy (nome breve e specifico della sua variante di strategia, non generico); "
            f"information_sources (2-4 fonti informative plausibili per questo archetipo); "
            f"behavioral_biases (1-3 bias comportamentali psicologici plausibili per questo archetipo, "
            f"es. overconfidence, herding, loss aversion)."
        )
        batch = await self._llm_client.complete_json(prompt, AgentPersonaDraftBatch, tier=self._tier, temperature=temperature)
        returned_ids = {persona.agent_id for persona in batch.personas}
        if returned_ids != set(agent_ids):
            raise ValueError(f"agent_id restituiti ({returned_ids}) non corrispondono a quelli richiesti ({set(agent_ids)})")
        return batch.personas


async def generate_agent_population(
    archetype_counts: dict[AgentArchetype, int],
    seed: int,
    created_at: datetime,
    preferred_assets: Optional[list[str]] = None,
    closes_by_asset: Optional[dict[str, list[float]]] = None,
    persona_generator: Optional[LLMBackedPersonaGenerator] = None,
    batch_size: int = DEFAULT_BATCH_SIZE,
) -> list[AgentProfile]:
    missing = set(archetype_counts) - set(ARCHETYPE_PRIORS)
    if missing:
        raise ValueError(f"nessun prior per gli archetipi: {missing}")

    seeds = RandomSeedBundle.derive(seed, _ALL_ARCHETYPE_COMPONENT_NAMES)

    async def build_for_archetype(archetype: AgentArchetype, count: int) -> list[AgentProfile]:
        rng = np.random.default_rng(seeds.seed_for(f"cohort_generation:{archetype.value}"))
        profiles: list[AgentProfile] = []
        start_index = 0
        remaining = count
        while remaining > 0:
            this_batch = min(batch_size, remaining)
            batch = generate_archetype_batch_deterministic(
                archetype, this_batch, start_index, rng, created_at, preferred_assets, closes_by_asset,
            )
            if persona_generator is not None:
                try:
                    personas = await persona_generator.generate_batch(archetype, [profile.agent_id for profile in batch])
                    persona_by_id = {persona.agent_id: persona for persona in personas}
                    batch = [apply_persona_overlay(profile, persona_by_id[profile.agent_id]) for profile in batch]
                except Exception:
                    pass  # ricade sullo scheletro deterministico gia' pronto, mai un crash del run
            profiles.extend(batch)
            start_index += this_batch
            remaining -= this_batch
        return profiles

    results = await asyncio.gather(*(build_for_archetype(archetype, count) for archetype, count in archetype_counts.items()))
    return [profile for batch in results for profile in batch]
