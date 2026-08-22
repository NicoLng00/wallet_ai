"""Esempio end-to-end reale per la Fase 7 (docs/IMPLEMENTATION_PLAN.md): 5 round reali del loop
completo (docs/TRADING_ARCHITECTURE.md §12) — un vero evento di mercato (Cointelegraph, Fase 3) al
round 0, propagazione sociale reale via OASIS (Fase 6) nei round successivi, aggiornamenti di belief
con provenienza reale, AgentDecision Tier 3 per ogni round, tutto persistito in runs/{run_id}/.

Uso: .venv/Scripts/python.exe examples/phase7_e2e.py
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
from serena.models.belief import BeliefUpdate
from serena.models.decision import AgentDecision
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
    print(f"  -> {len(recent_closes)} chiusure reali BTC/USD (alimentano gli strategy hint Tier 3 di Fase 5)")

    agents = await generate_agent_population(
        {AgentArchetype.NEWS: 1, AgentArchetype.MOMENTUM: 1, AgentArchetype.CONTRARIAN: 1,
         AgentArchetype.RETAIL: 2, AgentArchetype.LONG_TERM_HOLDER: 1},
        seed=20260822, created_at=NOW, preferred_assets=[ASSET],
    )
    print(f"Agenti reali (Fase 5): {[a.agent_id for a in agents]}")

    adapter = OasisSimulationAdapter(agents, platform="reddit", seed=20260822, database_path=db_path)
    await adapter.initialize()
    loop = SimulationRoundLoop(agents, EventEngine(), adapter, ASSET, writer)

    all_decisions: list[AgentDecision] = []
    all_belief_updates: list[BeliefUpdate] = []
    for round_index in range(5):
        timestamp = NOW + timedelta(hours=round_index)
        if round_index == 0:
            outcome = await loop.run_round(
                round_index, timestamp, recent_closes=recent_closes,
                market_event_text=market_event_text, market_data_point=market_data_point,
            )
        else:
            outcome = await loop.run_round(round_index, timestamp, recent_closes=recent_closes)
        all_decisions.extend(outcome.decisions)
        all_belief_updates.extend(outcome.belief_updates)
        print(f"Round {round_index}: {len(outcome.events)} evento/i, {len(outcome.belief_updates)} belief update, "
              f"decisioni={[d.action for d in outcome.decisions]}")

    await adapter.close()

    persisted_decisions = [AgentDecision.model_validate(row) for row in writer.read_jsonl("actions.jsonl")]
    persisted_beliefs = [BeliefUpdate.model_validate(row) for row in writer.read_jsonl("belief_updates.jsonl")]
    assert persisted_decisions == all_decisions
    assert persisted_beliefs == all_belief_updates

    final_beliefs = {d.agent_id: d.belief_update[ASSET] for d in all_decisions if d.timestamp == NOW + timedelta(hours=4)}
    print(f"\nOK — run_id={run_id}")
    print(f"Round eseguiti: 5 | Decisioni totali: {len(all_decisions)} | Belief update totali: {len(all_belief_updates)}")
    print(f"Belief finali (round 4): {final_beliefs}")
    print(f"Persistiti e riletti con fedelta' totale: actions.jsonl ({len(persisted_decisions)}), "
          f"belief_updates.jsonl ({len(persisted_beliefs)}), events.jsonl")
    print(f"Database OASIS reale: {db_path}")


if __name__ == "__main__":
    asyncio.run(main())
