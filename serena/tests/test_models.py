from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from serena.models import (
    AgentArchetype,
    AgentDecision,
    AgentProfile,
    BeliefUpdate,
    DataPoint,
    Entity,
    EntityType,
    Event,
    ModelTierConfig,
    OntologyChangeProposal,
    RandomSeedBundle,
    RelationType,
    Relationship,
    SimulationRun,
    TemperatureConfig,
)

NOW = datetime(2026, 8, 21, 12, 0, tzinfo=timezone.utc)


def test_temperature_config_defaults_to_zero_not_mirofish_07():
    config = TemperatureConfig()
    assert config.cohort_temperature == 0.0
    assert config.agent_temperature == 0.0
    assert config.decision_temperature == 0.0


def test_temperature_config_rejects_out_of_range():
    with pytest.raises(ValidationError):
        TemperatureConfig(cohort_temperature=-0.1)
    with pytest.raises(ValidationError):
        TemperatureConfig(agent_temperature=2.1)


def test_random_seed_bundle_deterministic_for_same_root_seed():
    a = RandomSeedBundle.derive(42, ["cohort", "oasis_activation"])
    b = RandomSeedBundle.derive(42, ["cohort", "oasis_activation"])
    assert a.component_seeds == b.component_seeds
    assert a.seed_for("cohort") == b.seed_for("cohort")


def test_random_seed_bundle_different_root_seed_gives_different_seeds():
    a = RandomSeedBundle.derive(1, ["cohort"])
    b = RandomSeedBundle.derive(2, ["cohort"])
    assert a.seed_for("cohort") != b.seed_for("cohort")


def test_random_seed_bundle_rejects_duplicate_component_names():
    with pytest.raises(ValueError):
        RandomSeedBundle.derive(1, ["cohort", "cohort"])


def test_random_seed_bundle_missing_component_raises_explicit_error():
    bundle = RandomSeedBundle.derive(1, ["cohort"])
    with pytest.raises(KeyError):
        bundle.seed_for("never_derived")


def make_simulation_run(**overrides) -> SimulationRun:
    defaults = dict(
        run_id="test-run-1",
        seed=42,
        start_timestamp=NOW,
        end_timestamp=NOW + timedelta(days=1),
        assets=["BTC/USDT"],
        timeframe="1h",
        agent_count=50,
        simulation_rounds=20,
        model_tiers=ModelTierConfig(),
        temperature_config=TemperatureConfig(),
        prompts_version="v1",
        graph_version="v1",
        data_snapshot_version="abc123",
        random_seeds=RandomSeedBundle.derive(42, ["cohort"]),
        code_version="deadbeef",
        created_at=NOW,
    )
    defaults.update(overrides)
    return SimulationRun(**defaults)


def test_simulation_run_valid_construction():
    run = make_simulation_run()
    assert run.run_id == "test-run-1"
    assert run.resumed_from_run_id is None


def test_simulation_run_rejects_end_before_start():
    with pytest.raises(ValidationError):
        make_simulation_run(end_timestamp=NOW - timedelta(hours=1))


def test_simulation_run_rejects_empty_assets():
    with pytest.raises(ValidationError):
        make_simulation_run(assets=[])


def test_simulation_run_rejects_unknown_fields():
    with pytest.raises(ValidationError):
        make_simulation_run(some_made_up_field=True)


def test_simulation_run_resumed_from_is_a_reference_not_a_deletion():
    original = make_simulation_run()
    resumed = make_simulation_run(run_id="test-run-2", resumed_from_run_id=original.run_id)
    assert resumed.resumed_from_run_id == "test-run-1"


def test_entity_valid():
    entity = Entity(entity_id="btc", entity_type=EntityType.ASSET, name="Bitcoin", attributes={"ticker": "BTC"})
    assert entity.entity_type == EntityType.ASSET


def test_entity_rejects_invalid_type():
    with pytest.raises(ValidationError):
        Entity(entity_id="btc", entity_type="NotARealType", name="Bitcoin")


def test_entity_rejects_empty_name():
    with pytest.raises(ValidationError):
        Entity(entity_id="btc", entity_type=EntityType.ASSET, name="")


def test_relationship_valid_temporal_window():
    rel = Relationship(
        source_id="blackrock", target_id="btc", relation_type=RelationType.FLOWS_INTO,
        valid_from=NOW, valid_until=NOW + timedelta(days=1)
    )
    assert rel.valid_until > rel.valid_from


def test_relationship_rejects_valid_until_before_valid_from():
    with pytest.raises(ValidationError):
        Relationship(
            source_id="blackrock", target_id="btc", relation_type=RelationType.FLOWS_INTO,
            valid_from=NOW, valid_until=NOW - timedelta(days=1)
        )


def test_ontology_change_proposal_valid():
    proposal = OntologyChangeProposal(
        proposed_by="research-agent", reason="nuovo tipo di strumento derivato osservato",
        new_entity_types=["Derivative"], new_relation_types=["HEDGES"], created_at=NOW
    )
    assert proposal.new_entity_types == ["Derivative"]


def test_ontology_change_proposal_rejects_existing_type_as_new():
    with pytest.raises(ValidationError):
        OntologyChangeProposal(
            proposed_by="research-agent", reason="duplicato",
            new_entity_types=["Asset"], created_at=NOW
        )


def test_ontology_change_proposal_rejects_duplicate_within_proposal():
    with pytest.raises(ValidationError):
        OntologyChangeProposal(
            proposed_by="research-agent", reason="duplicato interno",
            new_entity_types=["Derivative", "Derivative"], created_at=NOW
        )


def test_data_point_valid():
    dp = DataPoint(timestamp=NOW, source="binance_ohlcv", asset="BTC/USDT", raw_payload_hash="abc", normalized={"close": 65000.0})
    assert dp.asset == "BTC/USDT"


def test_data_point_asset_optional_for_macro_data():
    dp = DataPoint(timestamp=NOW, source="fred_cpi", asset=None, raw_payload_hash="abc", normalized={"cpi": 3.1})
    assert dp.asset is None


def test_event_valid():
    event = Event(
        event_id="evt-1", timestamp=NOW, type="ETF_FLOW", entities=["BTC", "BlackRock"],
        direction="bullish", importance=0.87, novelty=0.71, confidence=0.82, source_ids=["dp-1"]
    )
    assert event.direction == "bullish"


def test_event_rejects_invalid_direction():
    with pytest.raises(ValidationError):
        Event(
            event_id="evt-1", timestamp=NOW, type="ETF_FLOW", entities=["BTC"],
            direction="mega_bullish", importance=0.5, novelty=0.5, confidence=0.5, source_ids=["dp-1"]
        )


def test_event_rejects_confidence_out_of_range():
    with pytest.raises(ValidationError):
        Event(
            event_id="evt-1", timestamp=NOW, type="ETF_FLOW", entities=["BTC"],
            direction="neutral", importance=0.5, novelty=0.5, confidence=1.5, source_ids=["dp-1"]
        )


def make_agent_profile(**overrides) -> AgentProfile:
    defaults = dict(
        agent_id="agent-001", archetype=AgentArchetype.MOMENTUM, identity="Momentum trader, 6-24h horizon",
        capital=1_000_000.0, risk_profile="moderate", time_horizon="6h-24h", strategy="momentum_v1",
        beliefs={"BTC/USDT": 0.71}, maximum_position=0.2, maximum_drawdown=0.15, created_at=NOW
    )
    defaults.update(overrides)
    return AgentProfile(**defaults)


def test_agent_profile_valid():
    profile = make_agent_profile()
    assert profile.archetype == AgentArchetype.MOMENTUM


def test_agent_profile_rejects_belief_out_of_range():
    with pytest.raises(ValidationError):
        make_agent_profile(beliefs={"BTC/USDT": 1.5})


def test_agent_profile_rejects_zero_capital():
    with pytest.raises(ValidationError):
        make_agent_profile(capital=0)


def test_agent_profile_rejects_unknown_archetype():
    with pytest.raises(ValidationError):
        make_agent_profile(archetype="day_trader_extreme")


def test_agent_decision_valid():
    decision = AgentDecision(
        agent_id="agent-001", timestamp=NOW, action="BUY", asset="BTC/USDT", confidence=0.8,
        expected_return=0.05, time_horizon_hours=24, reasoning_summary="momentum breakout confirmed",
        information_used=["evt-1"], belief_update={"BTC/USDT": 0.05}
    )
    assert decision.action == "BUY"


def test_agent_decision_rejects_invalid_action():
    with pytest.raises(ValidationError):
        AgentDecision(
            agent_id="agent-001", timestamp=NOW, action="SHORT_HEAVILY", asset="BTC/USDT", confidence=0.8,
            expected_return=0.05, time_horizon_hours=24, reasoning_summary="x"
        )


def test_agent_decision_rejects_zero_time_horizon():
    with pytest.raises(ValidationError):
        AgentDecision(
            agent_id="agent-001", timestamp=NOW, action="HOLD", asset="BTC/USDT", confidence=0.5,
            expected_return=0.0, time_horizon_hours=0, reasoning_summary="x"
        )


def test_belief_update_valid():
    update = BeliefUpdate(
        agent_id="agent-001", asset="BTC/USDT", old_belief=0.6, new_belief=0.71,
        reason="ETF inflow surprise", information_source="evt-1", timestamp=NOW
    )
    assert update.new_belief == 0.71


def test_belief_update_rejects_empty_reason():
    with pytest.raises(ValidationError):
        BeliefUpdate(
            agent_id="agent-001", asset="BTC/USDT", old_belief=0.6, new_belief=0.71,
            reason="", information_source="evt-1", timestamp=NOW
        )


def test_belief_update_rejects_empty_information_source():
    with pytest.raises(ValidationError):
        BeliefUpdate(
            agent_id="agent-001", asset="BTC/USDT", old_belief=0.6, new_belief=0.71,
            reason="ETF inflow surprise", information_source="", timestamp=NOW
        )


def test_belief_update_rejects_no_actual_change():
    with pytest.raises(ValidationError):
        BeliefUpdate(
            agent_id="agent-001", asset="BTC/USDT", old_belief=0.6, new_belief=0.6,
            reason="ETF inflow surprise", information_source="evt-1", timestamp=NOW
        )
