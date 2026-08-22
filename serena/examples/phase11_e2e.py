"""Esempio end-to-end reale per la Fase 11 (docs/IMPLEMENTATION_PLAN.md): fa girare il loop reale
(Fasi 5-9) su chiusure BTC/USD reali per piu' round, calcola per ogni AgentDecision il vero
AgentOutcome una volta che il rendimento realizzato del periodo successivo e' noto, li accumula in un
vero AgentScoreTracker, mostra un vero cambiamento di peso con provenienza, e attribuisce il PnL di
portafoglio realmente sizato (Fase 9) agli agenti che lo hanno guidato (Fase 11) — riconciliato
esattamente. Tutto persistito in agent_scores.jsonl.

Uso: .venv/Scripts/python.exe examples/phase11_e2e.py
"""
from __future__ import annotations
import asyncio
from datetime import datetime, timedelta, timezone

from pydantic import BaseModel, ConfigDict

from serena.agents.profiles.generator import generate_agent_population
from serena.artifacts import RunArtifactWriter
from serena.data.market.coingecko import CoinGeckoMarketAdapter
from serena.evaluation.agent_scoring.outcomes import compute_outcome
from serena.evaluation.agent_scoring.scoring import AgentScoreTracker
from serena.evaluation.attribution.attribution import attribute_by_archetype, attribute_portfolio_pnl
from serena.ids import new_run_id
from serena.models.agent import AgentArchetype
from serena.risk.limits.limits import RiskLimits
from serena.risk.portfolio.portfolio import apply_fill, fresh_portfolio
from serena.risk.sizing.sizing import size_position
from serena.signals.aggregation.pipeline import compute_risk_adjusted_signal
from serena.simulation.events.engine import EventEngine
from serena.simulation.oasis.adapter import OasisSimulationAdapter
from serena.simulation.round_loop import SimulationRoundLoop

NOW = datetime.now(timezone.utc)
ASSET = "BTC/USDT"


class AgentScoreSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    agent_id: str
    archetype: str
    sample_size: int
    accuracy_score: float
    calibration_score: float
    recency_weight: float


async def main() -> None:
    run_id = new_run_id()
    writer = RunArtifactWriter(run_id)
    db_path = writer.dir / "oasis_reddit.db"

    print("Chiamata live: CoinGecko OHLC BTC/USD (90 giorni, Fase 3)...")
    market_points = await CoinGeckoMarketAdapter().fetch_ohlc("bitcoin", days=90)
    closes = [point.normalized["close"] for point in market_points]
    periods = min(len(closes) - 1, 15)
    print(f"  -> {len(closes)} candele reali, uso {periods} round")

    agents = await generate_agent_population(
        {AgentArchetype.MOMENTUM: 2, AgentArchetype.CONTRARIAN: 2, AgentArchetype.RETAIL: 2,
         AgentArchetype.LONG_TERM_HOLDER: 1, AgentArchetype.QUANT: 1},
        seed=20260822, created_at=NOW, preferred_assets=[ASSET],
    )
    archetype_by_agent = {a.agent_id: a.archetype.value for a in agents}

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
        fraction, _ = size_position(signal, portfolio, limits, price=closes[round_index])
        portfolio_realized_return = fraction * realized_return
        portfolio = apply_fill(portfolio, ASSET, fraction, closes[round_index + 1], timestamp)
        portfolio = portfolio.model_copy(update={"equity": portfolio.equity * (1 + portfolio_realized_return)})

        agent_outcomes = [compute_outcome(decision, realized_return) for decision in outcome.decisions]
        for agent_outcome in agent_outcomes:
            tracker.record(agent_outcome)

        attribution = attribute_portfolio_pnl(agent_outcomes, portfolio_realized_return)
        writer.append_jsonl("pnl_attribution.jsonl", {"round_index": round_index, "attribution": attribution})

    await adapter.close()

    # Dimostra un vero cambiamento di peso: l'agente con piu' osservazioni direzionali, peso con solo
    # la prima meta' del suo storico reale contro il peso finale con lo storico intero.
    sample_agent_id = max(agents, key=lambda a: tracker.sample_size(a.agent_id)).agent_id
    sample_outcomes = tracker.all_outcomes(sample_agent_id)
    half = max(1, len(sample_outcomes) // 2)
    partial_tracker = AgentScoreTracker()
    for o in sample_outcomes[:half]:
        partial_tracker.record(o)
    weight_after_round_1 = partial_tracker.recency_weight(sample_agent_id)
    weight_final = tracker.recency_weight(sample_agent_id)
    snapshots = [
        AgentScoreSnapshot(
            agent_id=agent.agent_id, archetype=agent.archetype.value, sample_size=tracker.sample_size(agent.agent_id),
            accuracy_score=tracker.accuracy_score(agent.agent_id), calibration_score=tracker.calibration_score(agent.agent_id),
            recency_weight=tracker.recency_weight(agent.agent_id),
        )
        for agent in agents
    ]
    writer.write_once("agent_scores.json", snapshots)

    all_outcomes = [outcome for agent in agents for outcome in tracker.all_outcomes(agent.agent_id)]
    final_attribution_by_archetype = attribute_by_archetype(
        all_outcomes, archetype_by_agent, portfolio_realized_return=portfolio.equity / 100_000.0 - 1,
    )

    reloaded = [AgentScoreSnapshot.model_validate(row) for row in writer.read_json("agent_scores.json")]
    assert reloaded == snapshots

    print(f"\nOK — run_id={run_id}")
    print(f"Round eseguiti: {periods} | Agenti valutati: {len(snapshots)}")
    print(f"Cambiamento di peso reale per {sample_agent_id} ({len(sample_outcomes)} round totali, "
          f"{tracker.sample_size(sample_agent_id)} decisioni direzionali BUY/SELL): "
          f"con la prima meta' dello storico = {weight_after_round_1:.4f}, con lo storico intero = {weight_final:.4f} "
          f"(mai cancellato, sempre ricalcolato — §17)")
    for snapshot in snapshots:
        print(f"  - {snapshot.agent_id:<20} n={snapshot.sample_size:<3} "
              f"accuracy={snapshot.accuracy_score:.3f} calibration={snapshot.calibration_score:.3f} "
              f"recency_weight={snapshot.recency_weight:.3f}")
    print(f"Attribuzione PnL per archetipo (riconciliata al rendimento reale di portafoglio): {final_attribution_by_archetype}")
    print(f"Persistiti e riletti con fedelta' totale: {writer.dir / 'agent_scores.json'}")


if __name__ == "__main__":
    asyncio.run(main())
