"""Nessun mock: ogni test qui usa un vero OasisSimulationAdapter (sqlite reale su tmp_path) e un vero
EventEngine (Tier 3 deterministico) — stessa disciplina di test_oasis_adapter.py."""
from __future__ import annotations
from datetime import datetime, timezone

import pytest

from serena.artifacts import RunArtifactWriter
from serena.models.agent import AgentArchetype, AgentProfile
from serena.models.data import DataPoint
from serena.simulation.events.engine import EventEngine
from serena.simulation.oasis.adapter import OasisSimulationAdapter
from serena.simulation.round_loop import DECISION_MARGIN, SimulationRoundLoop

NOW = datetime(2026, 8, 22, 12, 0, tzinfo=timezone.utc)
ASSET = "BTC/USDT"


def make_profile(agent_id: str, archetype: AgentArchetype, belief: float = 0.5) -> AgentProfile:
    return AgentProfile(
        agent_id=agent_id, archetype=archetype, identity=f"{archetype.value} trader {agent_id}",
        capital=100_000.0, risk_profile="moderate", time_horizon="6h-24h", strategy=f"{archetype.value}_v1",
        beliefs={ASSET: belief}, maximum_position=0.2, maximum_drawdown=0.15, created_at=NOW,
    )


def make_data_point() -> DataPoint:
    return DataPoint(timestamp=NOW, source="test_source", asset=ASSET, raw_payload_hash="hash-1", normalized={})


@pytest.fixture
def writer(tmp_path):
    return RunArtifactWriter("round-loop-test", root=tmp_path)


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "oasis.db"


@pytest.mark.asyncio
async def test_run_round_without_market_event_still_produces_one_decision_per_agent(writer, db_path):
    agents = [make_profile("news-000", AgentArchetype.NEWS), make_profile("momentum-000", AgentArchetype.MOMENTUM)]
    adapter = OasisSimulationAdapter(agents, platform="reddit", seed=1, database_path=db_path)
    try:
        await adapter.initialize()
        loop = SimulationRoundLoop(agents, EventEngine(), adapter, ASSET, writer)
        outcome = await loop.run_round(0, NOW)
        assert outcome.events == []
        assert len(outcome.decisions) == 2
        assert {d.agent_id for d in outcome.decisions} == {"news-000", "momentum-000"}
    finally:
        await adapter.close()


@pytest.mark.asyncio
async def test_run_round_with_market_event_creates_and_persists_a_real_event(writer, db_path):
    agents = [make_profile("news-000", AgentArchetype.NEWS)]
    adapter = OasisSimulationAdapter(agents, platform="reddit", seed=2, database_path=db_path)
    try:
        await adapter.initialize()
        loop = SimulationRoundLoop(agents, EventEngine(), adapter, ASSET, writer)
        outcome = await loop.run_round(
            0, NOW, market_event_text="Bitcoin ETF approval sparks massive rally", market_data_point=make_data_point(),
        )
        assert len(outcome.events) == 1
        assert outcome.events[0].direction == "bullish"
        persisted_events = writer.read_jsonl("events.jsonl")
        assert len(persisted_events) == 1
    finally:
        await adapter.close()


@pytest.mark.asyncio
async def test_bullish_event_moves_a_news_sensitive_agent_belief_up_and_yields_buy(writer, db_path):
    agent = make_profile("news-000", AgentArchetype.NEWS, belief=0.5)
    adapter = OasisSimulationAdapter([agent], platform="reddit", seed=3, database_path=db_path)
    try:
        await adapter.initialize()
        loop = SimulationRoundLoop([agent], EventEngine(), adapter, ASSET, writer)
        outcome = await loop.run_round(
            0, NOW, market_event_text="Bitcoin ETF approval sparks massive rally and inflows",
            market_data_point=make_data_point(),
        )
        decision = outcome.decisions[0]
        assert decision.belief_update[ASSET] > 0.5
        assert len(outcome.belief_updates) >= 1
        assert outcome.belief_updates[0].reason.startswith("Evento")
    finally:
        await adapter.close()


@pytest.mark.asyncio
async def test_decision_thresholds_translate_belief_into_action(writer, db_path):
    agents = [
        make_profile("bull-agent", AgentArchetype.QUANT, belief=0.9),
        make_profile("bear-agent", AgentArchetype.QUANT, belief=0.1),
        make_profile("neutral-agent", AgentArchetype.QUANT, belief=0.5),
    ]
    adapter = OasisSimulationAdapter(agents, platform="reddit", seed=4, database_path=db_path)
    try:
        await adapter.initialize()
        loop = SimulationRoundLoop(agents, EventEngine(), adapter, ASSET, writer)
        outcome = await loop.run_round(0, NOW)  # QUANT hint is neutral (0.5), so beliefs barely move
        by_id = {d.agent_id: d for d in outcome.decisions}
        assert by_id["bull-agent"].action == "BUY"
        assert by_id["bear-agent"].action == "SELL"
        assert by_id["neutral-agent"].action == "HOLD"
        assert abs(DECISION_MARGIN) > 0  # soglia usata sopra, documentata qui per leggibilita'
    finally:
        await adapter.close()


@pytest.mark.asyncio
async def test_no_belief_update_recorded_when_nothing_actually_changes(writer, db_path):
    """Due agenti QUANT (strategy hint sempre neutro) con belief gia' a 0.5 e nessun evento: nessuna
    fonte di cambiamento e' attiva, quindi zero BeliefUpdate devono essere generati o persistiti —
    verifica diretta della regola dello schema "old_belief == new_belief non e' un aggiornamento"."""
    agents = [make_profile("quant-000", AgentArchetype.QUANT, belief=0.5)]
    adapter = OasisSimulationAdapter(agents, platform="reddit", seed=5, database_path=db_path)
    try:
        await adapter.initialize()
        loop = SimulationRoundLoop(agents, EventEngine(), adapter, ASSET, writer)
        outcome = await loop.run_round(0, NOW)
        assert outcome.belief_updates == []
        assert writer.read_jsonl("belief_updates.jsonl") == []
    finally:
        await adapter.close()


@pytest.mark.asyncio
async def test_peer_social_exposure_shifts_belief_across_rounds(writer, db_path):
    """Ciclo completo (docs/TRADING_ARCHITECTURE.md §12): un agente pubblica un evento fortemente
    rialzista, un secondo agente lo vede per davvero via la recsys reale di OASIS nel round successivo
    e la sua belief si sposta verso l'alto per herding — nessun mock in nessun punto della catena."""
    poster = make_profile("news-000", AgentArchetype.NEWS, belief=0.9)
    follower = make_profile("retail-000", AgentArchetype.RETAIL, belief=0.5)
    adapter = OasisSimulationAdapter([poster, follower], platform="reddit", seed=6, database_path=db_path)
    try:
        await adapter.initialize()
        loop = SimulationRoundLoop([poster, follower], EventEngine(), adapter, ASSET, writer)

        await loop.run_round(
            0, NOW, market_event_text="Bitcoin breaks resistance amid ETF inflow rally",
            market_data_point=make_data_point(),
        )
        outcome_1 = await loop.run_round(1, NOW)  # round vuoto: forza il refresh reale della recsys

        follower_decision = next(d for d in outcome_1.decisions if d.agent_id == "retail-000")
        assert follower_decision.belief_update[ASSET] > 0.5
        assert any("peer:news-000" in u.information_source for u in outcome_1.belief_updates)
    finally:
        await adapter.close()


def test_constructor_rejects_empty_agent_list(writer, tmp_path):
    with pytest.raises(ValueError):
        SimulationRoundLoop([], EventEngine(), None, ASSET, writer)  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_market_event_text_without_data_point_raises(writer, db_path):
    agent = make_profile("news-000", AgentArchetype.NEWS)
    adapter = OasisSimulationAdapter([agent], platform="reddit", seed=7, database_path=db_path)
    try:
        await adapter.initialize()
        loop = SimulationRoundLoop([agent], EventEngine(), adapter, ASSET, writer)
        with pytest.raises(ValueError):
            await loop.run_round(0, NOW, market_event_text="some text", market_data_point=None)
    finally:
        await adapter.close()
