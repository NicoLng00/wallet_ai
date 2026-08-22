from datetime import datetime, timezone

import pytest

from serena.llm.client import LLMUnavailableError
from serena.models.data import DataPoint
from serena.simulation.events.engine import (
    EventEngine,
    EventInterpretation,
    HeuristicEventInterpreter,
    LLMBackedEventInterpreter,
    compute_novelty,
    resolve_entities,
)

NOW = datetime(2026, 8, 22, 12, 0, tzinfo=timezone.utc)


def make_data_point(payload_hash: str = "dp-1") -> DataPoint:
    return DataPoint(timestamp=NOW, source="cointelegraph_rss", asset=None, raw_payload_hash=payload_hash, normalized={})


# --- resolve_entities -------------------------------------------------------------------------

def test_resolve_entities_matches_known_keywords_case_insensitively():
    assert resolve_entities("Bitcoin surges after BlackRock ETF inflow") == ["BTC", "ENTITY_BLACKROCK", "PRODUCT_ETF"]


def test_resolve_entities_returns_empty_list_when_nothing_matches():
    assert resolve_entities("completely unrelated text about gardening") == []


# --- compute_novelty ----------------------------------------------------------------------------

def test_compute_novelty_is_maximal_with_no_prior_history():
    assert compute_novelty("Bitcoin ETF approved", []) == 1.0


def test_compute_novelty_drops_for_near_duplicate_text():
    novelty = compute_novelty("Bitcoin ETF approved by regulators", ["Bitcoin ETF approved by regulators"])
    assert novelty == 0.0


def test_compute_novelty_is_between_zero_and_one_for_partial_overlap():
    novelty = compute_novelty("Bitcoin ETF sees record inflows today", ["Bitcoin ETF approved by regulators"])
    assert 0.0 < novelty < 1.0


# --- HeuristicEventInterpreter (Tier 3) ----------------------------------------------------------

@pytest.mark.asyncio
async def test_heuristic_interpreter_detects_bullish_language():
    result = await HeuristicEventInterpreter().interpret("Bitcoin ETF approval sparks massive rally and inflows")
    assert result.direction == "bullish"
    assert result.confidence == 0.35


@pytest.mark.asyncio
async def test_heuristic_interpreter_detects_bearish_language():
    result = await HeuristicEventInterpreter().interpret("Exchange hacked, users report major losses amid selloff")
    assert result.direction == "bearish"


@pytest.mark.asyncio
async def test_heuristic_interpreter_defaults_to_neutral_with_no_signal_words():
    result = await HeuristicEventInterpreter().interpret("Market participants await next week's data")
    assert result.direction == "neutral"


@pytest.mark.asyncio
async def test_heuristic_interpreter_raises_importance_for_high_impact_keywords():
    low = await HeuristicEventInterpreter().interpret("A minor market update with no real signal")
    high = await HeuristicEventInterpreter().interpret("SEC announces new regulation affecting ETF issuers")
    assert high.importance > low.importance


# --- LLMBackedEventInterpreter (Tier 1/2) --------------------------------------------------------

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


@pytest.mark.asyncio
async def test_llm_backed_interpreter_returns_validated_schema_on_success():
    expected = EventInterpretation(direction="bullish", importance=0.8, confidence=0.9)
    client = _FakeLLMClient(response=expected)
    interpreter = LLMBackedEventInterpreter(client, temperature=0.0)
    result = await interpreter.interpret("some market text")
    assert result == expected
    assert client.calls == [0.0]


@pytest.mark.asyncio
async def test_llm_backed_interpreter_retries_once_at_reduced_temperature():
    expected = EventInterpretation(direction="neutral", importance=0.3, confidence=0.5)
    client = _FakeLLMClient(response=expected, fail_first=True)
    interpreter = LLMBackedEventInterpreter(client, temperature=0.3, retry_temperature_delta=0.1)
    result = await interpreter.interpret("some market text")
    assert result == expected
    assert client.calls == [0.3, pytest.approx(0.2)]


@pytest.mark.asyncio
async def test_llm_backed_interpreter_propagates_error_after_retry_also_fails():
    client = _FakeLLMClient(response=None)

    async def always_fail(*args, **kwargs):
        raise LLMUnavailableError("still down")

    client.complete_json = always_fail
    interpreter = LLMBackedEventInterpreter(client, temperature=0.0)
    with pytest.raises(LLMUnavailableError):
        await interpreter.interpret("some market text")


# --- EventEngine composition ----------------------------------------------------------------------

@pytest.mark.asyncio
async def test_event_engine_falls_through_to_heuristic_when_llm_interpreter_fails():
    class AlwaysFailingInterpreter:
        async def interpret(self, text):
            raise LLMUnavailableError("no key configured")

    engine = EventEngine(interpreter=AlwaysFailingInterpreter())
    event = await engine.build_event(
        make_data_point(), text="Bitcoin ETF approval sparks rally", event_id="evt-1", event_type="ETF_FLOW",
    )
    assert event.direction == "bullish"
    assert event.confidence == 0.35


@pytest.mark.asyncio
async def test_event_engine_builds_a_schema_valid_event_end_to_end():
    engine = EventEngine()  # default: HeuristicEventInterpreter, no LLM/network involved
    event = await engine.build_event(
        make_data_point("dp-77"), text="Ethereum sees bearish sentiment after exchange hack",
        event_id="evt-77", event_type="SOCIAL_SPIKE",
    )
    assert event.event_id == "evt-77"
    assert event.entities == ["ETH"]
    assert event.direction == "bearish"
    assert event.source_ids == ["dp-77"]
    assert 0.0 <= event.novelty <= 1.0


@pytest.mark.asyncio
async def test_event_engine_novelty_decreases_for_repeated_similar_entity_text():
    engine = EventEngine()
    first = await engine.build_event(make_data_point("dp-1"), "Bitcoin ETF approved by regulators today", "evt-1", "ETF_FLOW")
    second = await engine.build_event(make_data_point("dp-2"), "Bitcoin ETF approved by regulators today", "evt-2", "ETF_FLOW")
    assert first.novelty == 1.0
    assert second.novelty == 0.0


@pytest.mark.asyncio
async def test_event_engine_defaults_unresolved_entities_explicitly_rather_than_empty_list():
    engine = EventEngine()
    event = await engine.build_event(make_data_point(), "unrelated gardening content", "evt-x", "SOCIAL_SPIKE")
    assert event.entities == ["UNRESOLVED"]
