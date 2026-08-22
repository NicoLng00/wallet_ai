"""Esempio end-to-end reale per la Fase 8 (docs/IMPLEMENTATION_PLAN.md): riesegue il loop reale di
Fase 7 (5 round, agenti reali, evento Cointelegraph reale, chiusure BTC/USD reali) e poi fa passare
le AgentDecision cosi' prodotte attraverso la pipeline segnale reale, producendo un vero
risk_adjusted_signal per round, persistito in signals.jsonl.

Uso: .venv/Scripts/python.exe examples/phase8_e2e.py
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
from serena.signals.aggregation.pipeline import RiskAdjustedSignal, compute_risk_adjusted_signal
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

    agents = await generate_agent_population(
        {AgentArchetype.NEWS: 1, AgentArchetype.MOMENTUM: 2, AgentArchetype.CONTRARIAN: 2,
         AgentArchetype.RETAIL: 3, AgentArchetype.LONG_TERM_HOLDER: 2},
        seed=20260822, created_at=NOW, preferred_assets=[ASSET],
    )
    print(f"Agenti reali (Fase 5): {len(agents)}")

    adapter = OasisSimulationAdapter(agents, platform="reddit", seed=20260822, database_path=db_path)
    await adapter.initialize()
    loop = SimulationRoundLoop(agents, EventEngine(), adapter, ASSET, writer)

    history: list[AgentDecision] = []
    signals: list[RiskAdjustedSignal] = []
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
        writer.append_jsonl("signals.jsonl", signal)
        signals.append(signal)
        print(f"Round {round_index}: consensus={signal.independent_consensus:+.4f} "
              f"confidence={signal.confidence:.4f} risk_adjusted_signal={signal.risk_adjusted_signal:+.6f} "
              f"ESS={signal.effective_sample_size:.2f}/{signal.contributing_agents}")

    await adapter.close()

    persisted_signals = [RiskAdjustedSignal.model_validate(row) for row in writer.read_jsonl("signals.jsonl")]
    assert persisted_signals == signals, "RiskAdjustedSignal non identici dopo il round-trip su disco"

    print(f"\nOK — run_id={run_id}")
    print(f"Round eseguiti: 5 | Segnali reali prodotti e persistiti: {len(signals)}")
    print(f"ESS sempre <= numero di agenti contribuenti (correzione di correlazione attiva): "
          f"{all(s.effective_sample_size <= s.contributing_agents + 1e-9 for s in signals)}")
    print(f"Persistiti e riletti con fedelta' totale: {writer.dir / 'signals.jsonl'}")


if __name__ == "__main__":
    asyncio.run(main())
