from datetime import datetime, timezone

import pytest

from serena.agents.profiles.archetypes import ARCHETYPE_PRIORS
from serena.agents.profiles.generator import (
    AgentProfileBatch,
    LLMBackedProfileBatchGenerator,
    generate_agent_population,
    generate_archetype_batch_deterministic,
)
from serena.agents.strategies.hints import STRATEGY_HINTS, momentum_hint
from serena.llm.client import LLMUnavailableError
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


# --- LLM-backed batch generator (Tier 1), testato con client finto ------------------------------

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


def _fake_batch(archetype: AgentArchetype, count: int, start_index: int) -> AgentProfileBatch:
    profiles = generate_archetype_batch_deterministic(
        archetype, count, start_index, __import__("numpy").random.default_rng(0), NOW, ["BTC/USDT"],
    )
    return AgentProfileBatch(profiles=profiles)


@pytest.mark.asyncio
async def test_llm_backed_generator_returns_validated_batch_on_success():
    expected = _fake_batch(AgentArchetype.MOMENTUM, 3, 0)
    client = _FakeLLMClient(response=expected)
    generator = LLMBackedProfileBatchGenerator(client, temperature=0.0)
    result = await generator.generate_batch(AgentArchetype.MOMENTUM, 3, 0, NOW, ["BTC/USDT"])
    assert result == expected.profiles
    assert client.calls == [0.0]


@pytest.mark.asyncio
async def test_llm_backed_generator_retries_once_at_reduced_temperature():
    expected = _fake_batch(AgentArchetype.MOMENTUM, 2, 0)
    client = _FakeLLMClient(response=expected, fail_first=True)
    generator = LLMBackedProfileBatchGenerator(client, temperature=0.3, retry_temperature_delta=0.1)
    result = await generator.generate_batch(AgentArchetype.MOMENTUM, 2, 0, NOW, ["BTC/USDT"])
    assert result == expected.profiles
    assert client.calls == [0.3, pytest.approx(0.2)]


@pytest.mark.asyncio
async def test_llm_backed_generator_rejects_wrong_batch_size_even_if_schema_valid():
    wrong_count_batch = _fake_batch(AgentArchetype.MOMENTUM, 5, 0)  # chiesti 3, l'LLM ne "genera" 5
    client = _FakeLLMClient(response=wrong_count_batch)
    generator = LLMBackedProfileBatchGenerator(client, temperature=0.0)
    with pytest.raises(ValueError):
        await generator.generate_batch(AgentArchetype.MOMENTUM, 3, 0, NOW, ["BTC/USDT"])


@pytest.mark.asyncio
async def test_generate_agent_population_falls_through_to_deterministic_when_llm_generator_fails():
    class AlwaysFailingGenerator:
        async def generate_batch(self, *args, **kwargs):
            raise LLMUnavailableError("no key configured")

    counts = {AgentArchetype.MOMENTUM: 3}
    population = await generate_agent_population(
        counts, seed=9, created_at=NOW, preferred_assets=["BTC/USDT"], llm_generator=AlwaysFailingGenerator(),
    )
    assert len(population) == 3
    assert all(p.archetype == AgentArchetype.MOMENTUM for p in population)


@pytest.mark.asyncio
async def test_generate_agent_population_uses_llm_batch_when_it_succeeds():
    expected = _fake_batch(AgentArchetype.WHALE, 2, 0)
    client = _FakeLLMClient(response=expected)
    generator = LLMBackedProfileBatchGenerator(client, temperature=0.0)
    population = await generate_agent_population(
        {AgentArchetype.WHALE: 2}, seed=1, created_at=NOW, preferred_assets=["BTC/USDT"], llm_generator=generator,
    )
    assert population == expected.profiles
