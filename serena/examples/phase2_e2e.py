"""Esempio end-to-end minimo per la Fase 2 (docs/IMPLEMENTATION_PLAN.md): costruisce un
SimulationRun/AgentDecision/Event finti ma schema-validi, li scrive in una vera cartella
runs/{run_id}/ (non tmp_path di un test), li rilegge da disco e verifica la fedelta' del
round-trip. Nessun mock: file reali sul filesystem reale del progetto.

Uso: .venv/Scripts/python.exe examples/phase2_e2e.py
"""
from __future__ import annotations
import subprocess
from datetime import datetime, timedelta, timezone

from serena.artifacts import RUNS_ROOT, RunArtifactWriter
from serena.ids import new_run_id
from serena.models import (
    AgentArchetype,
    AgentDecision,
    AgentProfile,
    BeliefUpdate,
    Event,
    ModelTierConfig,
    RandomSeedBundle,
    SimulationRun,
    TemperatureConfig,
)

NOW = datetime.now(timezone.utc)


def _git_commit() -> str:
    try:
        result = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, cwd=RUNS_ROOT.parent.parent, check=True)
        return result.stdout.strip()
    except Exception:
        return "unknown"


def main() -> None:
    seed = 20260821
    random_seeds = RandomSeedBundle.derive(seed, ["cohort_generation", "oasis_round_activation"])

    run = SimulationRun(
        run_id=new_run_id(),
        seed=seed,
        start_timestamp=NOW - timedelta(days=1),
        end_timestamp=NOW,
        assets=["BTC/USDT"],
        timeframe="1h",
        agent_count=2,
        simulation_rounds=1,
        model_tiers=ModelTierConfig(),
        temperature_config=TemperatureConfig(),
        prompts_version="phase2-e2e-v1",
        graph_version="fixed-ontology-v1",
        data_snapshot_version="phase2-e2e-fixture",
        random_seeds=random_seeds,
        code_version=_git_commit(),
        simulation_config={"note": "Fase 2 project skeleton — nessun dato di mercato reale ancora, solo verifica di persistenza"},
        created_at=NOW,
    )

    writer = RunArtifactWriter(run.run_id)
    writer.write_once("run_metadata.json", run)

    agents = [
        AgentProfile(
            agent_id="agent-momentum-001", archetype=AgentArchetype.MOMENTUM,
            identity="Momentum trader, orizzonte 6-24h su BTC/USDT",
            capital=1_000_000.0, risk_profile="moderate", time_horizon="6h-24h", strategy="momentum_breakout_v1",
            beliefs={"BTC/USDT": 0.62}, information_sources=["binance_ohlcv"], maximum_position=0.2,
            maximum_drawdown=0.15, preferred_assets=["BTC/USDT"], created_at=NOW,
        ),
        AgentProfile(
            agent_id="agent-contrarian-001", archetype=AgentArchetype.CONTRARIAN,
            identity="Contrarian trader, fade degli estremi di sentiment",
            capital=500_000.0, risk_profile="aggressive", time_horizon="1h-6h", strategy="contrarian_fade_v1",
            beliefs={"BTC/USDT": 0.38}, information_sources=["social_sentiment"], maximum_position=0.1,
            maximum_drawdown=0.25, preferred_assets=["BTC/USDT"], created_at=NOW,
        ),
    ]
    writer.write_once("agents.json", agents)

    event = Event(
        event_id="evt-phase2-e2e-1", timestamp=NOW - timedelta(hours=2), type="ETF_FLOW",
        entities=["BTC", "BlackRock"], direction="bullish", importance=0.8, novelty=0.6,
        confidence=0.75, source_ids=["dp-phase2-e2e-1"],
    )
    writer.append_jsonl("events.jsonl", event)

    decision = AgentDecision(
        agent_id="agent-momentum-001", timestamp=NOW - timedelta(hours=1), action="BUY", asset="BTC/USDT",
        confidence=0.7, expected_return=0.03, time_horizon_hours=24,
        reasoning_summary="Breakout confermato sopra la resistenza a 4h dopo il flusso ETF positivo",
        information_used=["evt-phase2-e2e-1"], belief_update={"BTC/USDT": 0.08},
    )
    writer.append_jsonl("actions.jsonl", decision)

    belief_update = BeliefUpdate(
        agent_id="agent-momentum-001", asset="BTC/USDT", old_belief=0.62, new_belief=0.70,
        reason="Flusso ETF positivo di BlackRock, breakout tecnico confermato",
        information_source="evt-phase2-e2e-1", timestamp=NOW - timedelta(hours=1),
    )
    writer.append_jsonl("belief_updates.jsonl", belief_update)

    # Round-trip: rilegge tutto da disco (non dagli oggetti Python ancora in memoria) e verifica.
    reloaded_run = SimulationRun.model_validate(writer.read_json("run_metadata.json"))
    reloaded_agents = [AgentProfile.model_validate(row) for row in writer.read_json("agents.json")]
    reloaded_events = [Event.model_validate(row) for row in writer.read_jsonl("events.jsonl")]
    reloaded_decisions = [AgentDecision.model_validate(row) for row in writer.read_jsonl("actions.jsonl")]
    reloaded_beliefs = [BeliefUpdate.model_validate(row) for row in writer.read_jsonl("belief_updates.jsonl")]

    assert reloaded_run == run, "SimulationRun non identico dopo il round-trip su disco"
    assert reloaded_agents == agents, "AgentProfile non identici dopo il round-trip su disco"
    assert reloaded_events == [event], "Event non identico dopo il round-trip su disco"
    assert reloaded_decisions == [decision], "AgentDecision non identico dopo il round-trip su disco"
    assert reloaded_beliefs == [belief_update], "BeliefUpdate non identico dopo il round-trip su disco"

    try:
        writer.write_once("run_metadata.json", run)
        raise SystemExit("BUG: write_once ha sovrascritto un artefatto esistente, non doveva succedere")
    except FileExistsError:
        pass  # atteso: mai sovrascrivere

    print(f"OK — run_id={run.run_id}")
    print(f"Cartella reale su disco: {writer.dir}")
    print(f"Seed derivati: {run.random_seeds.component_seeds}")
    print(f"File scritti: {sorted(p.name for p in writer.dir.iterdir())}")
    print("Round-trip verificato per: run_metadata.json, agents.json, events.jsonl, actions.jsonl, belief_updates.jsonl")
    print("Verificato: write_once rifiuta una seconda scrittura sullo stesso file (mai sovrascritto).")


if __name__ == "__main__":
    main()
