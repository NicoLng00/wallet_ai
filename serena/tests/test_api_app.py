from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from serena.api.app import create_app
from serena.artifacts import RunArtifactWriter
from serena.backtest.metrics.metrics import compute_all_metrics
from serena.models import ModelTierConfig, RandomSeedBundle, SimulationRun, TemperatureConfig
from serena.models.agent import AgentArchetype, AgentProfile
from serena.models.decision import AgentDecision

NOW = datetime(2026, 8, 22, 12, 0, tzinfo=timezone.utc)
ASSET = "BTC/USDT"


def make_run(run_id: str) -> SimulationRun:
    return SimulationRun(
        run_id=run_id, seed=42, start_timestamp=NOW, end_timestamp=NOW + timedelta(days=1),
        assets=[ASSET], timeframe="1h", agent_count=1, simulation_rounds=2,
        model_tiers=ModelTierConfig(), temperature_config=TemperatureConfig(),
        prompts_version="v1", graph_version="v1", data_snapshot_version="abc123",
        random_seeds=RandomSeedBundle.derive(42, ["cohort"]), code_version="deadbeef", created_at=NOW,
    )


def populate_run(tmp_path, run_id: str) -> RunArtifactWriter:
    writer = RunArtifactWriter(run_id, root=tmp_path)
    writer.write_once("run_metadata.json", make_run(run_id))
    writer.write_once("agents.json", [AgentProfile(
        agent_id="agent-1", archetype=AgentArchetype.MOMENTUM, identity="test", capital=100_000.0,
        risk_profile="moderate", time_horizon="6h-24h", strategy="momentum_v1",
        maximum_position=0.2, maximum_drawdown=0.15, created_at=NOW,
    )])
    writer.append_jsonl("actions.jsonl", AgentDecision(
        agent_id="agent-1", timestamp=NOW, action="BUY", asset=ASSET, confidence=0.7,
        expected_return=0.02, time_horizon_hours=24, reasoning_summary="test", information_used=[], belief_update={},
    ))
    writer.append_jsonl("portfolio.jsonl", {"equity": 100_000.0})
    writer.append_jsonl("portfolio.jsonl", {"equity": 101_000.0})
    writer.write_once("metrics.json", {"buy_and_hold": compute_all_metrics([100.0, 105.0], [1.0], [0.05], [], 365)})
    writer.write_once("agent_scores.json", [
        {"agent_id": "agent-1", "archetype": "momentum", "sample_size": 3, "accuracy_score": 0.6, "calibration_score": 0.55, "recency_weight": 0.6},
    ])
    return writer


@pytest.fixture
def client(tmp_path):
    app = create_app(runs_root=tmp_path)
    return TestClient(app), tmp_path


def test_list_runs_returns_empty_list_when_no_runs_exist(client):
    test_client, _ = client
    assert test_client.get("/runs").json() == []


def test_list_runs_lists_real_run_directories(client):
    test_client, tmp_path = client
    populate_run(tmp_path, "run-1")
    populate_run(tmp_path, "run-2")
    assert test_client.get("/runs").json() == ["run-1", "run-2"]


def test_summary_returns_real_run_metadata(client):
    test_client, tmp_path = client
    populate_run(tmp_path, "run-1")
    response = test_client.get("/runs/run-1/summary")
    assert response.status_code == 200
    assert response.json()["seed"] == 42


def test_summary_404_for_unknown_run(client):
    test_client, _ = client
    assert test_client.get("/runs/never-existed/summary").status_code == 404


def test_agents_endpoint_returns_real_agent_list(client):
    test_client, tmp_path = client
    populate_run(tmp_path, "run-1")
    response = test_client.get("/runs/run-1/agents")
    assert response.json()[0]["agent_id"] == "agent-1"


def test_actions_endpoint_returns_real_jsonl_content(client):
    test_client, tmp_path = client
    populate_run(tmp_path, "run-1")
    response = test_client.get("/runs/run-1/actions")
    assert len(response.json()) == 1
    assert response.json()[0]["action"] == "BUY"


def test_metrics_404_when_absent_but_run_exists(client):
    test_client, tmp_path = client
    writer = RunArtifactWriter("run-bare", root=tmp_path)
    writer.write_once("run_metadata.json", make_run("run-bare"))
    assert test_client.get("/runs/run-bare/metrics").status_code == 404


def test_report_falls_back_to_generated_report_when_report_md_absent(client):
    test_client, tmp_path = client
    populate_run(tmp_path, "run-1")
    response = test_client.get("/runs/run-1/report")
    assert response.status_code == 200
    assert "[SIMULATION FACT]" in response.text


def test_report_returns_the_persisted_file_verbatim_when_present(client):
    test_client, tmp_path = client
    writer = populate_run(tmp_path, "run-1")
    (writer.dir / "report.md").write_text("# Report scritto a mano\n\n- [SIMULATION FACT] valore fisso\n", encoding="utf-8")
    response = test_client.get("/runs/run-1/report")
    assert "Report scritto a mano" in response.text


def test_chart_equity_curve_returns_real_derived_series(client):
    test_client, tmp_path = client
    populate_run(tmp_path, "run-1")
    assert test_client.get("/runs/run-1/charts/equity_curve").json() == [100_000.0, 101_000.0]


def test_chart_archetype_distribution_returns_real_counts(client):
    test_client, tmp_path = client
    populate_run(tmp_path, "run-1")
    assert test_client.get("/runs/run-1/charts/archetype_distribution").json() == {"momentum": 1}


def test_chart_leaderboard_returns_real_ranked_scores(client):
    test_client, tmp_path = client
    populate_run(tmp_path, "run-1")
    result = test_client.get("/runs/run-1/charts/leaderboard").json()
    assert result[0]["agent_id"] == "agent-1"


def test_dashboard_returns_html_containing_the_run_id_and_chart_containers(client):
    test_client, tmp_path = client
    populate_run(tmp_path, "run-1")
    response = test_client.get("/dashboard/run-1")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "run-1" in response.text
    assert 'id="chart-equity"' in response.text
    assert 'id="chart-leaderboard"' in response.text


def test_dashboard_404_for_unknown_run(client):
    test_client, _ = client
    assert test_client.get("/dashboard/never-existed").status_code == 404
