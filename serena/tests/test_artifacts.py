from datetime import datetime, timedelta, timezone

import pytest

from serena.artifacts import RunArtifactWriter
from serena.models import Event, ModelTierConfig, RandomSeedBundle, SimulationRun, TemperatureConfig

NOW = datetime(2026, 8, 21, 12, 0, tzinfo=timezone.utc)


def make_run(run_id: str) -> SimulationRun:
    return SimulationRun(
        run_id=run_id, seed=42, start_timestamp=NOW, end_timestamp=NOW + timedelta(days=1),
        assets=["BTC/USDT"], timeframe="1h", agent_count=50, simulation_rounds=20,
        model_tiers=ModelTierConfig(), temperature_config=TemperatureConfig(),
        prompts_version="v1", graph_version="v1", data_snapshot_version="abc123",
        random_seeds=RandomSeedBundle.derive(42, ["cohort"]), code_version="deadbeef", created_at=NOW
    )


def test_write_once_creates_readable_file(tmp_path):
    writer = RunArtifactWriter("run-1", root=tmp_path)
    run = make_run("run-1")
    writer.write_once("run_metadata.json", run)
    assert writer.exists("run_metadata.json")
    loaded = writer.read_json("run_metadata.json")
    assert loaded["run_id"] == "run-1"
    assert loaded["seed"] == 42


def test_write_once_never_overwrites_existing_artifact(tmp_path):
    writer = RunArtifactWriter("run-1", root=tmp_path)
    writer.write_once("run_metadata.json", make_run("run-1"))
    with pytest.raises(FileExistsError):
        writer.write_once("run_metadata.json", make_run("run-1"))


def test_append_jsonl_accumulates_records_in_order(tmp_path):
    writer = RunArtifactWriter("run-1", root=tmp_path)
    events = [
        Event(event_id=f"evt-{i}", timestamp=NOW, type="ETF_FLOW", entities=["BTC"],
              direction="bullish", importance=0.5, novelty=0.5, confidence=0.5, source_ids=["dp-1"])
        for i in range(3)
    ]
    for event in events:
        writer.append_jsonl("events.jsonl", event)
    loaded = writer.read_jsonl("events.jsonl")
    assert [row["event_id"] for row in loaded] == ["evt-0", "evt-1", "evt-2"]


def test_append_jsonl_requires_jsonl_extension(tmp_path):
    writer = RunArtifactWriter("run-1", root=tmp_path)
    with pytest.raises(ValueError):
        writer.append_jsonl("events.json", {"a": 1})


def test_read_jsonl_on_missing_file_returns_empty_list_not_error(tmp_path):
    writer = RunArtifactWriter("run-1", root=tmp_path)
    assert writer.read_jsonl("never_written.jsonl") == []


def test_resuming_a_run_does_not_recreate_or_clear_the_directory(tmp_path):
    writer = RunArtifactWriter("run-1", root=tmp_path)
    writer.append_jsonl("events.jsonl", {"a": 1})
    resumed_writer = RunArtifactWriter("run-1", root=tmp_path)
    assert resumed_writer.read_jsonl("events.jsonl") == [{"a": 1}]


def test_write_once_serializes_a_dict_of_pydantic_models_recursively(tmp_path):
    """Bug reale trovato in Fase 10: un dict[str, BaseModel] non veniva ricorsivamente serializzato
    (_serialize si fermava su list/BaseModel, lasciava i dict intatti con oggetti Pydantic dentro),
    facendo fallire json.dumps al primo uso reale con un dizionario di metriche di backtest."""
    from serena.backtest.metrics.metrics import compute_all_metrics

    writer = RunArtifactWriter("run-1", root=tmp_path)
    metrics_by_variant = {
        "buy_and_hold": compute_all_metrics([100.0, 110.0], [1.0], [0.1], [], periods_per_year=365),
        "momentum": compute_all_metrics([100.0, 95.0], [-0.5], [-0.05], [], periods_per_year=365),
    }
    writer.write_once("metrics.json", metrics_by_variant)
    loaded = writer.read_json("metrics.json")
    assert loaded["buy_and_hold"]["final_equity"] == 110.0
    assert loaded["momentum"]["final_equity"] == 95.0


def test_write_once_text_writes_and_reads_back_plain_text(tmp_path):
    writer = RunArtifactWriter("run-1", root=tmp_path)
    writer.write_once_text("report.md", "# Report\n\n- [SIMULATION FACT] ok\n")
    assert writer.read_text("report.md") == "# Report\n\n- [SIMULATION FACT] ok\n"


def test_write_once_text_never_overwrites_an_existing_file(tmp_path):
    writer = RunArtifactWriter("run-1", root=tmp_path)
    writer.write_once_text("report.md", "prima versione")
    with pytest.raises(FileExistsError):
        writer.write_once_text("report.md", "seconda versione")
    assert writer.read_text("report.md") == "prima versione"


def test_different_run_ids_are_fully_isolated(tmp_path):
    writer_a = RunArtifactWriter("run-a", root=tmp_path)
    writer_b = RunArtifactWriter("run-b", root=tmp_path)
    writer_a.append_jsonl("events.jsonl", {"who": "a"})
    writer_b.append_jsonl("events.jsonl", {"who": "b"})
    assert writer_a.read_jsonl("events.jsonl") == [{"who": "a"}]
    assert writer_b.read_jsonl("events.jsonl") == [{"who": "b"}]


def test_round_trip_fidelity_for_a_full_simulation_run(tmp_path):
    """Esempio end-to-end minimo richiesto dalla Fase 2: costruisce un SimulationRun finto, scrive
    metadata + eventi in una vera cartella runs/{run_id}/, rilegge, verifica fedelta'."""
    run = make_run("run-e2e")
    writer = RunArtifactWriter(run.run_id, root=tmp_path)
    writer.write_once("run_metadata.json", run)

    events = [
        Event(event_id="evt-1", timestamp=NOW, type="ETF_FLOW", entities=["BTC", "BlackRock"],
              direction="bullish", importance=0.87, novelty=0.71, confidence=0.82, source_ids=["dp-1"]),
        Event(event_id="evt-2", timestamp=NOW, type="MACRO_RELEASE", entities=["BTC"],
              direction="bearish", importance=0.4, novelty=0.2, confidence=0.6, source_ids=["dp-2"]),
    ]
    for event in events:
        writer.append_jsonl("events.jsonl", event)

    reloaded_run = SimulationRun.model_validate(writer.read_json("run_metadata.json"))
    reloaded_events = [Event.model_validate(row) for row in writer.read_jsonl("events.jsonl")]

    assert reloaded_run == run
    assert reloaded_events == events
    assert (tmp_path / "run-e2e" / "run_metadata.json").exists()
    assert (tmp_path / "run-e2e" / "events.jsonl").exists()
