"""Generazione della popolazione di agenti (docs/TRADING_ARCHITECTURE.md §6): chiamate LLM a batch
(~10-15 profili per chiamata, non 1 per agente ne' tutti e 50 in una chiamata sola — pattern
verificato utile in MiroFish, docs/MIROFISH_REVERSE_ENGINEERING.md §A.5), a `cohort_temperature`
(default 0.0), con il prior deterministico dell'archetipo come fallback strutturale — MAI un
fallback a `random`, la causa verificata di non-determinismo in MiroFish/OASIS (§A.12/§B.11).

`generate_agent_population()` e' l'orchestratore: prova il batch via LLM (se un client e' fornito),
un retry a temperatura ridotta e' gia' incapsulato in LLMBackedProfileBatchGenerator (stesso pattern
di EventEngine/LLMBackedEventInterpreter, Fase 3), e ricade sul generatore deterministico per QUEL
batch se anche il retry fallisce — mai l'intera popolazione, solo il batch che ha fallito."""
from __future__ import annotations
from datetime import datetime
from typing import Optional

import numpy as np
from pydantic import BaseModel, ConfigDict

from serena.agents.profiles.archetypes import ARCHETYPE_PRIORS, Range
from serena.agents.strategies.hints import STRATEGY_HINTS
from serena.llm.client import LLMClient, LLMTier
from serena.models.agent import AgentArchetype, AgentProfile
from serena.models.run import RandomSeedBundle

DEFAULT_BATCH_SIZE = 12


class AgentProfileBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    profiles: list[AgentProfile]


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


class LLMBackedProfileBatchGenerator:
    """Tier 1 (docs/TRADING_ARCHITECTURE.md §7): un retry a temperatura ridotta su fallimento di
    validazione, poi rilancia l'errore — la decisione di ricadere sul prior deterministico e'
    dell'orchestratore (generate_agent_population), non di questa classe (stesso principio di
    separazione di LLMBackedEventInterpreter, Fase 3)."""

    def __init__(self, llm_client: LLMClient, tier: LLMTier = "opus", temperature: float = 0.0,
                 retry_temperature_delta: float = 0.1):
        self._llm_client = llm_client
        self._tier = tier
        self._temperature = temperature
        self._retry_temperature_delta = retry_temperature_delta

    async def generate_batch(self, archetype: AgentArchetype, count: int, start_index: int,
                              created_at: datetime, preferred_assets: Optional[list[str]] = None) -> list[AgentProfile]:
        try:
            return await self._call(archetype, count, start_index, created_at, preferred_assets, self._temperature)
        except Exception:
            return await self._call(
                archetype, count, start_index, created_at, preferred_assets,
                max(0.0, self._temperature - self._retry_temperature_delta),
            )

    async def _call(self, archetype: AgentArchetype, count: int, start_index: int, created_at: datetime,
                     preferred_assets: Optional[list[str]], temperature: float) -> list[AgentProfile]:
        prior = ARCHETYPE_PRIORS[archetype]
        prompt = (
            f"Genera esattamente {count} profili di agenti trader con archetipo '{archetype.value}', "
            f"agent_id da '{archetype.value}-{start_index:03d}' a '{archetype.value}-{start_index + count - 1:03d}', "
            f"capitale tra {prior.capital_low} e {prior.capital_high}, risk_profile='{prior.risk_profile}', "
            f"time_horizon='{prior.time_horizon}', preferred_assets={preferred_assets or []}, "
            f"created_at={created_at.isoformat()}."
        )
        batch = await self._llm_client.complete_json(prompt, AgentProfileBatch, tier=self._tier, temperature=temperature)
        if len(batch.profiles) != count:
            raise ValueError(f"attesi {count} profili, ricevuti {len(batch.profiles)}")
        return batch.profiles


async def generate_agent_population(
    archetype_counts: dict[AgentArchetype, int],
    seed: int,
    created_at: datetime,
    preferred_assets: Optional[list[str]] = None,
    closes_by_asset: Optional[dict[str, list[float]]] = None,
    llm_generator: Optional[LLMBackedProfileBatchGenerator] = None,
    batch_size: int = DEFAULT_BATCH_SIZE,
) -> list[AgentProfile]:
    missing = set(archetype_counts) - set(ARCHETYPE_PRIORS)
    if missing:
        raise ValueError(f"nessun prior per gli archetipi: {missing}")

    seeds = RandomSeedBundle.derive(seed, ["cohort_generation"])
    rng = np.random.default_rng(seeds.seed_for("cohort_generation"))

    profiles: list[AgentProfile] = []
    for archetype, count in archetype_counts.items():
        start_index = 0
        remaining = count
        while remaining > 0:
            this_batch = min(batch_size, remaining)
            batch: Optional[list[AgentProfile]] = None
            if llm_generator is not None:
                try:
                    batch = await llm_generator.generate_batch(archetype, this_batch, start_index, created_at, preferred_assets)
                except Exception:
                    batch = None
            if batch is None:
                batch = generate_archetype_batch_deterministic(
                    archetype, this_batch, start_index, rng, created_at, preferred_assets, closes_by_asset,
                )
            profiles.extend(batch)
            start_index += this_batch
            remaining -= this_batch
    return profiles
