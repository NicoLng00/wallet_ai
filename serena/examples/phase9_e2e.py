"""Esempio end-to-end reale per la Fase 9 (docs/IMPLEMENTATION_PLAN.md): riesegue il loop reale di
Fase 7/8 (5 round) e fa passare ogni risk_adjusted_signal reale attraverso il risk engine deterministico
contro un portafoglio paper fresco, producendo una Position reale per round (o nessuna, onestamente,
se il segnale non supera i limiti o e' troppo debole per generare size) — persistito in
positions.jsonl/portfolio.jsonl.

Uso: .venv/Scripts/python.exe examples/phase9_e2e.py
"""
from __future__ import annotations
import asyncio
from datetime import datetime, timedelta, timezone

from serena.agents.profiles.generator import generate_agent_population
from serena.artifacts import RunArtifactWriter
from serena.data.market.coingecko import CoinGeckoMarketAdapter
from serena.data.news.cointelegraph import CointelegraphNewsAdapter
from serena.ids import new_run_id
from serena.models.agent import AgentArchetype
from serena.models.decision import AgentDecision
from serena.risk.limits.limits import RiskLimits
from serena.risk.portfolio.portfolio import PortfolioState, apply_fill, fresh_portfolio
from serena.risk.sizing.sizing import build_position, size_position
from serena.signals.aggregation.pipeline import compute_risk_adjusted_signal
from serena.simulation.events.engine import EventEngine
from serena.simulation.oasis.adapter import OasisSimulationAdapter
from serena.simulation.round_loop import SimulationRoundLoop

NOW = datetime.now(timezone.utc)
ASSET = "BTC/USDT"


async def main() -> None:
    run_id = new_run_id()
    writer = RunArtifactWriter(run_id)
    db_path = writer.dir / "oasis_reddit.db"

    print("Chiamata live: Cointelegraph RSS + CoinGecko OHLC (Fase 3)...")
    news_points = await CointelegraphNewsAdapter().fetch_recent()
    market_event_text = f"{news_points[0].normalized['title']} — {news_points[0].normalized['description'][:200]}"
    market_data_point = news_points[0]
    market_points = await CoinGeckoMarketAdapter().fetch_ohlc("bitcoin", days=90)
    recent_closes = [point.normalized["close"] for point in market_points]
    latest_price = recent_closes[-1]

    agents = await generate_agent_population(
        {AgentArchetype.NEWS: 1, AgentArchetype.MOMENTUM: 2, AgentArchetype.CONTRARIAN: 2,
         AgentArchetype.RETAIL: 3, AgentArchetype.LONG_TERM_HOLDER: 2},
        seed=20260822, created_at=NOW, preferred_assets=[ASSET],
    )

    adapter = OasisSimulationAdapter(agents, platform="reddit", seed=20260822, database_path=db_path)
    await adapter.initialize()
    loop = SimulationRoundLoop(agents, EventEngine(), adapter, ASSET, writer)

    portfolio: PortfolioState = fresh_portfolio(100_000.0, NOW)
    limits = RiskLimits()
    history: list[AgentDecision] = []

    for round_index in range(5):
        timestamp = NOW + timedelta(hours=round_index)
        if round_index == 0:
            outcome = await loop.run_round(
                round_index, timestamp, recent_closes=recent_closes,
                market_event_text=market_event_text, market_data_point=market_data_point,
            )
        else:
            outcome = await loop.run_round(round_index, timestamp, recent_closes=recent_closes)
        history.extend(outcome.decisions)

        signal = compute_risk_adjusted_signal(history, outcome.decisions, ASSET, timestamp)
        fraction, limit_result = size_position(signal, portfolio, limits, price=latest_price)
        portfolio = apply_fill(portfolio, ASSET, fraction, latest_price, timestamp)
        position = build_position(ASSET, fraction, latest_price, timestamp)

        writer.append_jsonl("portfolio.jsonl", portfolio)
        if position is not None:
            writer.append_jsonl("positions.jsonl", position)

        print(f"Round {round_index}: risk_adjusted_signal={signal.risk_adjusted_signal:+.6f} "
              f"-> fraction={fraction:+.4f} (limiti ok={limit_result.passed}, violati={limit_result.violated_limits}) "
              f"| equity={portfolio.equity:.2f}")

    await adapter.close()

    persisted_portfolios = [PortfolioState.model_validate(row) for row in writer.read_jsonl("portfolio.jsonl")]
    assert len(persisted_portfolios) == 5
    assert persisted_portfolios[-1] == portfolio

    print(f"\nOK — run_id={run_id}")
    print(f"Round eseguiti: 5 | Stati di portafoglio persistiti: {len(persisted_portfolios)}")
    print(f"Posizione finale su {ASSET}: {portfolio.positions.get(ASSET)}")
    print(f"Persistiti e riletti con fedelta' totale: {writer.dir / 'portfolio.jsonl'}")


if __name__ == "__main__":
    asyncio.run(main())
