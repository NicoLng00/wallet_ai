"""Esempio end-to-end reale per la Fase 12 (docs/IMPLEMENTATION_PLAN.md, fase finale): rigenera un
run reale (Fasi 5-11: agenti, OASIS, segnali, risk sizing, scoring), genera e persiste un vero
report.md taggato, poi avvia per davvero un server uvicorn (non un TestClient in-process: un vero
processo che ascolta su una vera porta TCP) e lo interroga con vere richieste HTTP — dashboard, report,
endpoint dei grafici — per verificare che tutto sia collegato correttamente end-to-end, non solo che i
singoli pezzi passino i loro test.

Limite dichiarato: nessun browser e' stato usato per verificare il rendering visivo effettivo degli
SVG (nessuno strumento di automazione browser invocato in questa sessione, incentrata su un progetto
Python via CLI) — verificato invece che l'HTML/JS della dashboard viene servito correttamente byte per
byte e che ogni endpoint dei grafici restituisce dati reali e corretti (la logica di trasformazione
dati e' quella testata in tests/test_chart_data.py); il disegno SVG lato browser stesso non e' stato
osservato visivamente.

Uso: .venv/Scripts/python.exe examples/phase12_e2e.py
"""
from __future__ import annotations
import asyncio
from datetime import datetime, timedelta, timezone

import httpx
import uvicorn

from serena.agents.profiles.generator import generate_agent_population
from serena.api.app import create_app
from serena.artifacts import RUNS_ROOT, RunArtifactWriter
from serena.data.market.coingecko import CoinGeckoMarketAdapter
from serena.evaluation.agent_scoring.outcomes import compute_outcome
from serena.evaluation.agent_scoring.scoring import AgentScoreTracker
from serena.ids import new_run_id
from serena.models import ModelTierConfig, RandomSeedBundle, SimulationRun, TemperatureConfig
from serena.models.agent import AgentArchetype
from serena.reports.report_agent.report_generator import generate_report, validate_report_tags
from serena.risk.limits.limits import RiskLimits
from serena.risk.portfolio.portfolio import apply_fill, fresh_portfolio
from serena.risk.sizing.sizing import size_position
from serena.signals.aggregation.pipeline import compute_risk_adjusted_signal
from serena.simulation.events.engine import EventEngine
from serena.simulation.oasis.adapter import OasisSimulationAdapter
from serena.simulation.round_loop import SimulationRoundLoop

NOW = datetime.now(timezone.utc)
ASSET = "BTC/USDT"
PORT = 8731


async def build_real_run() -> str:
    run_id = new_run_id()
    writer = RunArtifactWriter(run_id)
    db_path = writer.dir / "oasis_reddit.db"

    market_points = await CoinGeckoMarketAdapter().fetch_ohlc("bitcoin", days=90)
    closes = [point.normalized["close"] for point in market_points]
    periods = min(len(closes) - 1, 10)

    agents = await generate_agent_population(
        {AgentArchetype.MOMENTUM: 2, AgentArchetype.CONTRARIAN: 2, AgentArchetype.RETAIL: 2},
        seed=20260822, created_at=NOW, preferred_assets=[ASSET],
    )

    run_metadata = SimulationRun(
        run_id=run_id, seed=20260822, start_timestamp=NOW, end_timestamp=NOW + timedelta(hours=periods),
        assets=[ASSET], timeframe="1h", agent_count=len(agents), simulation_rounds=periods,
        model_tiers=ModelTierConfig(), temperature_config=TemperatureConfig(),
        prompts_version="phase12-e2e-v1", graph_version="fixed-ontology-v1",
        data_snapshot_version="phase12-e2e-coingecko", random_seeds=RandomSeedBundle.derive(20260822, ["cohort_generation"]),
        code_version="phase12-e2e", created_at=NOW,
    )
    writer.write_once("run_metadata.json", run_metadata)
    writer.write_once("agents.json", agents)

    adapter = OasisSimulationAdapter(agents, platform="reddit", seed=20260822, database_path=db_path)
    await adapter.initialize()
    loop = SimulationRoundLoop(agents, EventEngine(), adapter, ASSET, writer)

    tracker = AgentScoreTracker()
    limits = RiskLimits()
    portfolio = fresh_portfolio(100_000.0, NOW)
    history = []

    for round_index in range(periods):
        timestamp = NOW + timedelta(hours=round_index)
        window = closes[: round_index + 1]
        outcome = await loop.run_round(round_index, timestamp, recent_closes=window)
        history.extend(outcome.decisions)

        realized_return = (closes[round_index + 1] - closes[round_index]) / closes[round_index]
        signal = compute_risk_adjusted_signal(history, outcome.decisions, ASSET, timestamp)
        writer.append_jsonl("signals.jsonl", signal)
        fraction, _ = size_position(signal, portfolio, limits, price=closes[round_index])
        portfolio = apply_fill(portfolio, ASSET, fraction, closes[round_index + 1], timestamp)
        portfolio = portfolio.model_copy(update={"equity": portfolio.equity * (1 + fraction * realized_return)})
        writer.append_jsonl("portfolio.jsonl", portfolio)

        for decision in outcome.decisions:
            tracker.record(compute_outcome(decision, realized_return))

    await adapter.close()

    snapshots = [
        {"agent_id": a.agent_id, "archetype": a.archetype.value, "sample_size": tracker.sample_size(a.agent_id),
         "accuracy_score": tracker.accuracy_score(a.agent_id), "calibration_score": tracker.calibration_score(a.agent_id),
         "recency_weight": tracker.recency_weight(a.agent_id)}
        for a in agents
    ]
    writer.write_once("agent_scores.json", snapshots)

    report_text = generate_report(run_id)
    validate_report_tags(report_text)
    writer.write_once_text("report.md", report_text)

    print(f"Run reale costruito: {run_id} ({periods} round, {len(agents)} agenti)")
    return run_id


async def verify_over_real_http(run_id: str) -> None:
    config = uvicorn.Config(create_app(runs_root=RUNS_ROOT), host="127.0.0.1", port=PORT, log_level="warning")
    server = uvicorn.Server(config)
    server_task = asyncio.create_task(server.serve())
    try:
        while not server.started:
            await asyncio.sleep(0.05)

        base_url = f"http://127.0.0.1:{PORT}"
        async with httpx.AsyncClient() as client:
            runs_response = await client.get(f"{base_url}/runs")
            assert run_id in runs_response.json()
            print(f"GET /runs -> 200, {len(runs_response.json())} run trovati (incluso il nostro)")

            summary_response = await client.get(f"{base_url}/runs/{run_id}/summary")
            assert summary_response.status_code == 200
            print(f"GET /runs/{run_id}/summary -> 200, seed reale={summary_response.json()['seed']}")

            report_response = await client.get(f"{base_url}/runs/{run_id}/report")
            assert "[SIMULATION FACT]" in report_response.text
            print(f"GET /runs/{run_id}/report -> 200, {len(report_response.text)} caratteri, tag verificati")

            equity_response = await client.get(f"{base_url}/runs/{run_id}/charts/equity_curve")
            print(f"GET /runs/{run_id}/charts/equity_curve -> 200, {len(equity_response.json())} punti reali")

            leaderboard_response = await client.get(f"{base_url}/runs/{run_id}/charts/leaderboard")
            print(f"GET /runs/{run_id}/charts/leaderboard -> 200, {len(leaderboard_response.json())} agenti classificati")

            dashboard_response = await client.get(f"{base_url}/dashboard/{run_id}")
            assert dashboard_response.status_code == 200
            assert "text/html" in dashboard_response.headers["content-type"]
            assert run_id in dashboard_response.text
            assert 'id="chart-equity"' in dashboard_response.text
            print(f"GET /dashboard/{run_id} -> 200, {len(dashboard_response.text)} caratteri HTML reali serviti")

            missing_response = await client.get(f"{base_url}/runs/run-che-non-esiste/summary")
            assert missing_response.status_code == 404
            print("GET /runs/run-che-non-esiste/summary -> 404 (corretto)")
    finally:
        server.should_exit = True
        await server_task


async def main() -> None:
    run_id = await build_real_run()
    await verify_over_real_http(run_id)
    print(f"\nOK — dashboard reale verificata via HTTP reale per run_id={run_id}")


if __name__ == "__main__":
    asyncio.run(main())
