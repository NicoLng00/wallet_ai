from datetime import datetime, timezone

import pytest

from serena.agents.profiles.archetypes import ARCHETYPE_PRIORS
from serena.agents.profiles.generator import (
    AgentPersonaDraft,
    AgentPersonaDraftBatch,
    LLMBackedPersonaGenerator,
    apply_persona_overlay,
    generate_agent_population,
    generate_archetype_batch_deterministic,
)
from serena.agents.strategies.hints import STRATEGY_HINTS, momentum_hint
from serena.llm.client import LLMQuotaExceededError, LLMUnavailableError
from serena.models.agent import AgentArchetype

NOW = datetime(2026, 8, 22, 12, 0, tzinfo=timezone.utc)


def test_every_archetype_has_a_prior_and_a_strategy_hint():
    assert set(ARCHETYPE_PRIORS.keys()) == set(AgentArchetype)
    assert set(STRATEGY_HINTS.keys()) == set(AgentArchetype)


# --- strategy hints ---------------------------------------------------------------------------

def test_momentum_hint_is_bullish_after_a_strong_uptrend():
    closes = [100.0 + i for i in range(15)]  # trend costante al rialzo
    assert momentum_hint(closes) > 0.5


def test_momentum_hint_is_bearish_after_a_strong_downtrend():
    closes = [100.0 - i for i in range(15)]
    assert momentum_hint(closes) < 0.5


def test_momentum_hint_is_neutral_with_insufficient_history():
    assert momentum_hint([100.0, 101.0]) == 0.5


def test_mean_reversion_hint_is_opposite_of_momentum_on_the_same_series():
    from serena.agents.strategies.hints import mean_reversion_hint

    closes = [100.0 + i for i in range(15)]
    assert mean_reversion_hint(closes) < 0.5 < momentum_hint(closes)


def test_all_hints_return_a_value_in_unit_range():
    closes = [100.0 + (i % 5) - 2 for i in range(120)]
    for archetype, hint in STRATEGY_HINTS.items():
        value = hint(closes)
        assert 0.0 <= value <= 1.0, f"{archetype} hint fuori range: {value}"


# --- deterministic generation -------------------------------------------------------------------

def test_deterministic_batch_produces_the_requested_count_and_schema_valid_profiles():
    import numpy as np

    rng = np.random.default_rng(42)
    profiles = generate_archetype_batch_deterministic(
        AgentArchetype.MOMENTUM, count=5, start_index=0, rng=rng, created_at=NOW, preferred_assets=["BTC/USDT"],
    )
    assert len(profiles) == 5
    assert [p.agent_id for p in profiles] == [f"momentum-{i:03d}" for i in range(5)]
    assert all(p.archetype == AgentArchetype.MOMENTUM for p in profiles)
    assert all(p.preferred_assets == ["BTC/USDT"] for p in profiles)


def test_deterministic_batch_seeds_beliefs_from_strategy_hint():
    import numpy as np

    rng = np.random.default_rng(1)
    closes_by_asset = {"BTC/USDT": [100.0 + i for i in range(15)]}
    profiles = generate_archetype_batch_deterministic(
        AgentArchetype.MOMENTUM, count=1, start_index=0, rng=rng, created_at=NOW,
        preferred_assets=["BTC/USDT"], closes_by_asset=closes_by_asset,
    )
    assert profiles[0].beliefs["BTC/USDT"] > 0.5


@pytest.mark.asyncio
async def test_generate_agent_population_is_deterministic_for_the_same_seed():
    counts = {AgentArchetype.MOMENTUM: 3, AgentArchetype.CONTRARIAN: 2}
    population_a = await generate_agent_population(counts, seed=777, created_at=NOW, preferred_assets=["BTC/USDT"])
    population_b = await generate_agent_population(counts, seed=777, created_at=NOW, preferred_assets=["BTC/USDT"])
    assert population_a == population_b


@pytest.mark.asyncio
async def test_generate_agent_population_differs_across_seeds():
    counts = {AgentArchetype.MOMENTUM: 3}
    population_a = await generate_agent_population(counts, seed=1, created_at=NOW, preferred_assets=["BTC/USDT"])
    population_b = await generate_agent_population(counts, seed=2, created_at=NOW, preferred_assets=["BTC/USDT"])
    assert population_a != population_b


@pytest.mark.asyncio
async def test_generate_agent_population_covers_every_requested_archetype_with_persistent_ids():
    counts = {AgentArchetype.MOMENTUM: 13, AgentArchetype.WHALE: 1}  # 13 forza piu' di un batch (batch_size=12)
    population = await generate_agent_population(counts, seed=5, created_at=NOW, preferred_assets=["BTC/USDT"], batch_size=12)
    assert len(population) == 14
    momentum_ids = sorted(p.agent_id for p in population if p.archetype == AgentArchetype.MOMENTUM)
    assert momentum_ids == [f"momentum-{i:03d}" for i in range(13)]
    assert len({p.agent_id for p in population}) == 14  # tutti unici, nessuna collisione fra batch


@pytest.mark.asyncio
async def test_generate_agent_population_rejects_unknown_archetype_without_a_prior():
    with pytest.raises(ValueError):
        await generate_agent_population({"not_a_real_archetype": 1}, seed=1, created_at=NOW)  # type: ignore[dict-item]


@pytest.mark.asyncio
async def test_generate_agent_population_is_independent_of_archetype_iteration_order():
    """Ogni archetipo ora gira in parallelo (asyncio.gather) con un seed derivato per archetipo
    invece di uno condiviso — questo test verifica esplicitamente che l'ordine con cui gli archetipi
    vengono passati non cambi il risultato per nessuno di essi (garanzia di indipendenza richiesta
    per la parallelizzazione sicura)."""
    forward = await generate_agent_population(
        {AgentArchetype.MOMENTUM: 3, AgentArchetype.CONTRARIAN: 3}, seed=42, created_at=NOW, preferred_assets=["BTC/USDT"],
    )
    backward = await generate_agent_population(
        {AgentArchetype.CONTRARIAN: 3, AgentArchetype.MOMENTUM: 3}, seed=42, created_at=NOW, preferred_assets=["BTC/USDT"],
    )
    assert sorted(forward, key=lambda p: p.agent_id) == sorted(backward, key=lambda p: p.agent_id)


# --- persona overlay ---------------------------------------------------------------------------

def test_apply_persona_overlay_replaces_only_qualitative_fields():
    import numpy as np

    profile = generate_archetype_batch_deterministic(
        AgentArchetype.MOMENTUM, count=1, start_index=0, rng=np.random.default_rng(0), created_at=NOW,
    )[0]
    persona = AgentPersonaDraft(
        agent_id=profile.agent_id, identity="Un trader esperto e cauto.", strategy="breakout_confermato_v2",
        information_sources=["Bloomberg", "on-chain data"], behavioral_biases=["overconfidence"],
    )
    overlaid = apply_persona_overlay(profile, persona)
    assert overlaid.identity == "Un trader esperto e cauto."
    assert overlaid.strategy == "breakout_confermato_v2"
    assert overlaid.information_sources == ["Bloomberg", "on-chain data"]
    assert overlaid.behavioral_biases == ["overconfidence"]
    # i coefficienti numerici e le beliefs NON cambiano mai per via della persona
    assert overlaid.capital == profile.capital
    assert overlaid.beliefs == profile.beliefs
    assert overlaid.maximum_position == profile.maximum_position


# --- LLM-backed persona generator (Tier 1), testato con client finto ----------------------------

class _FakeLLMClient:
    def __init__(self, response=None, fail_first: bool = False):
        self._response = response
        self._fail_first = fail_first
        self.calls: list[float] = []

    async def complete_json(self, prompt, schema, *, tier, temperature, seed=None):
        self.calls.append(temperature)
        if self._fail_first and len(self.calls) == 1:
            raise LLMUnavailableError("simulated outage")
        return self._response


def _fake_personas(agent_ids: list[str]) -> AgentPersonaDraftBatch:
    return AgentPersonaDraftBatch(personas=[
        AgentPersonaDraft(agent_id=agent_id, identity=f"Persona di {agent_id}", strategy=f"{agent_id}_strategy",
                           information_sources=["fonte1"], behavioral_biases=["bias1"])
        for agent_id in agent_ids
    ])


@pytest.mark.asyncio
async def test_llm_backed_persona_generator_returns_validated_batch_on_success():
    expected = _fake_personas(["momentum-000", "momentum-001"])
    client = _FakeLLMClient(response=expected)
    generator = LLMBackedPersonaGenerator(client, temperature=0.0)
    result = await generator.generate_batch(AgentArchetype.MOMENTUM, ["momentum-000", "momentum-001"])
    assert result == expected.personas
    assert client.calls == [0.0]


@pytest.mark.asyncio
async def test_llm_backed_persona_generator_retries_once_at_reduced_temperature():
    expected = _fake_personas(["momentum-000"])
    client = _FakeLLMClient(response=expected, fail_first=True)
    generator = LLMBackedPersonaGenerator(client, temperature=0.3, retry_temperature_delta=0.1)
    result = await generator.generate_batch(AgentArchetype.MOMENTUM, ["momentum-000"])
    assert result == expected.personas
    assert client.calls == [0.3, pytest.approx(0.2)]


@pytest.mark.asyncio
async def test_llm_backed_persona_generator_does_not_retry_on_quota_exceeded():
    """VERIFICATO dal vivo (Fase 5, ricostruzione con Gemini): la chiave usata in questo progetto ha
    esaurito la quota gratuita giornaliera di gemini-3.5-flash (20 richieste/giorno) mentre
    generavamo la popolazione MVP — un retry immediato contro la stessa quota esaurita e' garantito
    fallire di nuovo, quindi non deve avvenire: una sola chiamata, mai due."""
    call_count = 0

    async def raise_quota_exceeded(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        raise LLMQuotaExceededError("quota esaurita per oggi")

    client = _FakeLLMClient()
    client.complete_json = raise_quota_exceeded
    generator = LLMBackedPersonaGenerator(client, temperature=0.0)
    with pytest.raises(LLMQuotaExceededError):
        await generator.generate_batch(AgentArchetype.MOMENTUM, ["momentum-000"])
    assert call_count == 1


@pytest.mark.asyncio
async def test_llm_backed_persona_generator_rejects_mismatched_agent_ids():
    wrong_ids_batch = _fake_personas(["momentum-999"])  # chiesto momentum-000, l'LLM ne "genera" un altro
    client = _FakeLLMClient(response=wrong_ids_batch)
    generator = LLMBackedPersonaGenerator(client, temperature=0.0)
    with pytest.raises(ValueError):
        await generator.generate_batch(AgentArchetype.MOMENTUM, ["momentum-000"])


@pytest.mark.asyncio
async def test_generate_agent_population_falls_through_to_deterministic_when_persona_generator_fails():
    class AlwaysFailingGenerator:
        async def generate_batch(self, *args, **kwargs):
            raise LLMUnavailableError("no key configured")

    counts = {AgentArchetype.MOMENTUM: 3}
    population = await generate_agent_population(
        counts, seed=9, created_at=NOW, preferred_assets=["BTC/USDT"], persona_generator=AlwaysFailingGenerator(),
    )
    assert len(population) == 3
    assert all(p.archetype == AgentArchetype.MOMENTUM for p in population)
    # ricaduto sull'identity deterministica generica, mai un crash
    assert all(p.identity.startswith("Momentum agent #") for p in population)


@pytest.mark.asyncio
async def test_generate_agent_population_overlays_llm_persona_when_it_succeeds():
    agent_ids = [f"whale-{i:03d}" for i in range(2)]
    expected = _fake_personas(agent_ids)
    client = _FakeLLMClient(response=expected)
    generator = LLMBackedPersonaGenerator(client, temperature=0.0)
    population = await generate_agent_population(
        {AgentArchetype.WHALE: 2}, seed=1, created_at=NOW, preferred_assets=["BTC/USDT"], persona_generator=generator,
    )
    assert [p.identity for p in population] == [f"Persona di {agent_id}" for agent_id in agent_ids]
    assert [p.strategy for p in population] == [f"{agent_id}_strategy" for agent_id in agent_ids]
    # i coefficienti numerici restano quelli del prior seedato, mai inventati dall'LLM
    assert all(p.capital > 0 for p in population)
