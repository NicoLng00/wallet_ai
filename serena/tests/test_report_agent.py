from datetime import datetime, timedelta, timezone

import pytest

from serena.artifacts import RunArtifactWriter
from serena.backtest.metrics.metrics import compute_all_metrics
from serena.models import ModelTierConfig, RandomSeedBundle, SimulationRun, TemperatureConfig
from serena.models.agent import AgentArchetype, AgentProfile
from serena.models.decision import AgentDecision
from serena.reports.report_agent.report_generator import UntaggedClaimError, generate_report, validate_report_tags
from serena.reports.report_agent.tools import RunReportTools

NOW = datetime(2026, 8, 22, 12, 0, tzinfo=timezone.utc)
ASSET = "BTC/USDT"


def make_run(run_id: str) -> SimulationRun:
    return SimulationRun(
        run_id=run_id, seed=42, start_timestamp=NOW, end_timestamp=NOW + timedelta(days=1),
        assets=[ASSET], timeframe="1h", agent_count=2, simulation_rounds=3,
        model_tiers=ModelTierConfig(), temperature_config=TemperatureConfig(),
        prompts_version="v1", graph_version="v1", data_snapshot_version="abc123",
        random_seeds=RandomSeedBundle.derive(42, ["cohort"]), code_version="deadbeef", created_at=NOW,
    )


def make_agent(agent_id: str) -> AgentProfile:
    return AgentProfile(
        agent_id=agent_id, archetype=AgentArchetype.MOMENTUM, identity="test agent", capital=100_000.0,
        risk_profile="moderate", time_horizon="6h-24h", strategy="momentum_v1",
        maximum_position=0.2, maximum_drawdown=0.15, created_at=NOW,
    )


def populate_run(tmp_path, run_id: str) -> RunArtifactWriter:
    writer = RunArtifactWriter(run_id, root=tmp_path)
    writer.write_once("run_metadata.json", make_run(run_id))
    writer.write_once("agents.json", [make_agent("agent-1"), make_agent("agent-2")])
    writer.append_jsonl("actions.jsonl", AgentDecision(
        agent_id="agent-1", timestamp=NOW, action="BUY", asset=ASSET, confidence=0.7,
        expected_return=0.02, time_horizon_hours=24, reasoning_summary="test", information_used=[], belief_update={},
    ))
    writer.append_jsonl("actions.jsonl", AgentDecision(
        agent_id="agent-2", timestamp=NOW, action="HOLD", asset=ASSET, confidence=0.5,
        expected_return=0.0, time_horizon_hours=24, reasoning_summary="test", information_used=[], belief_update={},
    ))
    writer.write_once("metrics.json", {"buy_and_hold": compute_all_metrics([100.0, 105.0], [1.0], [0.05], [], 365)})
    writer.write_once("agent_scores.json", [
        {"agent_id": "agent-1", "archetype": "momentum", "sample_size": 5, "accuracy_score": 0.7, "calibration_score": 0.6, "recency_weight": 0.65},
        {"agent_id": "agent-2", "archetype": "momentum", "sample_size": 0, "accuracy_score": 0.5, "calibration_score": 0.5, "recency_weight": 0.5},
    ])
    return writer


# --- RunReportTools ------------------------------------------------------------------------------

def test_tools_reject_an_unknown_run_id_without_creating_a_directory(tmp_path):
    with pytest.raises(FileNotFoundError):
        RunReportTools("never-existed", root=tmp_path)
    assert not (tmp_path / "never-existed").exists()


def test_search_agent_actions_filters_by_agent_and_action(tmp_path):
    populate_run(tmp_path, "run-1")
    tools = RunReportTools("run-1", root=tmp_path)
    assert len(tools.search_agent_actions()) == 2
    assert len(tools.search_agent_actions(agent_id="agent-1")) == 1
    assert len(tools.search_agent_actions(action="HOLD")) == 1


def test_search_agent_finds_by_id_and_returns_none_when_missing(tmp_path):
    populate_run(tmp_path, "run-1")
    tools = RunReportTools("run-1", root=tmp_path)
    assert tools.search_agent("agent-1")["agent_id"] == "agent-1"
    assert tools.search_agent("never-seen") is None


def test_search_market_state_declares_unavailability_honestly(tmp_path):
    populate_run(tmp_path, "run-1")
    tools = RunReportTools("run-1", root=tmp_path)
    state = tools.search_market_state()
    assert state["available"] is False


def test_compare_agents_returns_both_score_records(tmp_path):
    populate_run(tmp_path, "run-1")
    tools = RunReportTools("run-1", root=tmp_path)
    result = tools.compare_agents("agent-1", "agent-2")
    assert result["agent-1"]["recency_weight"] == 0.65
    assert result["agent-2"]["recency_weight"] == 0.5


def test_compare_runs_rejects_an_unknown_other_run_id_without_creating_it(tmp_path):
    populate_run(tmp_path, "run-1")
    tools = RunReportTools("run-1", root=tmp_path)
    with pytest.raises(FileNotFoundError):
        tools.compare_runs("run-that-does-not-exist")
    assert not (tmp_path / "run-that-does-not-exist").exists()


def test_calculate_metrics_returns_empty_dict_when_absent(tmp_path):
    writer = RunArtifactWriter("run-empty", root=tmp_path)
    writer.write_once("run_metadata.json", make_run("run-empty"))
    tools = RunReportTools("run-empty", root=tmp_path)
    assert tools.calculate_metrics() == {}


# --- validate_report_tags -------------------------------------------------------------------------

def test_validate_report_tags_accepts_a_properly_tagged_report():
    validate_report_tags("# Titolo\n\n- [SIMULATION FACT] 5 agenti\n- [MODEL INTERPRETATION] probabilmente rialzista\n")


def test_validate_report_tags_ignores_headers_tables_and_blank_lines():
    validate_report_tags("# Titolo\n\n## Sezione\n\n|a|b|\n|---|---|\n- [SIMULATION FACT] ok\n")


def test_validate_report_tags_rejects_an_untagged_claim():
    with pytest.raises(UntaggedClaimError):
        validate_report_tags("# Titolo\n\n- Il sistema ha sicuramente guadagnato molto\n")


# --- generate_report -------------------------------------------------------------------------------

def test_generate_report_raises_for_an_unknown_run(tmp_path):
    with pytest.raises(FileNotFoundError):
        generate_report("never-existed", root=tmp_path)


def test_generate_report_produces_a_fully_tagged_report_from_real_artifacts(tmp_path):
    populate_run(tmp_path, "run-1")
    report = generate_report("run-1", root=tmp_path)
    validate_report_tags(report)  # non deve sollevare: gia' verificato dentro generate_report, riverificato qui
    assert "Agenti nella popolazione: 2" in report
    assert "Decisioni totali registrate: 2" in report
    assert "Decisioni 'BUY': 1" in report
    assert "Decisioni 'HOLD': 1" in report
    assert "agent-1" in report  # in classifica, primo per recency_weight
    assert "[MODEL INTERPRETATION]" in report
    assert "ANTHROPIC_API_KEY" in report  # limite dichiarato esplicitamente nel report stesso
