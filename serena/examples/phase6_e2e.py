"""Esempio end-to-end reale per la Fase 6 (docs/IMPLEMENTATION_PLAN.md): 5 agenti reali (dalla Fase 5)
in una vera simulazione OASIS Reddit, per 3 round reali, innescata da un vero articolo Cointelegraph
(stessa chiamata live della Fase 3) iniettato come ManualAction(CREATE_POST, ...) — esattamente come
descritto in docs/TRADING_ARCHITECTURE.md §9. Nessun mock di OASIS: sqlite reale, recsys reale.

Uso: .venv/Scripts/python.exe examples/phase6_e2e.py
"""
from __future__ import annotations
import asyncio
from datetime import datetime, timezone

from serena.agents.profiles.generator import generate_agent_population
from serena.artifacts import RunArtifactWriter
from serena.data.news.cointelegraph import CointelegraphNewsAdapter
from serena.ids import new_run_id
from serena.models.agent import AgentArchetype
from serena.simulation.oasis.adapter import OasisSimulationAdapter

NOW = datetime.now(timezone.utc)


async def main() -> None:
    run_id = new_run_id()
    writer = RunArtifactWriter(run_id)
    db_path = writer.dir / "oasis_reddit.db"

    print("Chiamata live: Cointelegraph RSS (stesso adapter della Fase 3)...")
    news_points = await CointelegraphNewsAdapter().fetch_recent()
    market_event_text = f"{news_points[0].normalized['title']} — {news_points[0].normalized['description'][:200]}"
    print(f"  -> evento di mercato reale scelto: {news_points[0].normalized['title']!r}")

    agents = await generate_agent_population(
        {AgentArchetype.NEWS: 1, AgentArchetype.MOMENTUM: 1, AgentArchetype.CONTRARIAN: 1,
         AgentArchetype.RETAIL: 1, AgentArchetype.LONG_TERM_HOLDER: 1},
        seed=20260822, created_at=NOW, preferred_assets=["BTC/USDT"],
    )
    print(f"Agenti reali (Fase 5) usati in questa simulazione: {[a.agent_id for a in agents]}")

    adapter = OasisSimulationAdapter(agents, platform="reddit", seed=20260822, database_path=db_path)
    await adapter.initialize()
    print(f"OASIS Reddit env reale inizializzato, db su disco: {db_path}")

    news_agent_id = next(a.agent_id for a in agents if a.archetype == AgentArchetype.NEWS)
    result_0 = await adapter.execute_round(0, {news_agent_id: ("create_post", {"content": market_event_text})})
    print(f"Round 0: {news_agent_id} pubblica l'evento di mercato reale ({result_0.actions_performed} azione)")

    result_1 = await adapter.execute_round(1, {})  # refresh recsys reale prima che gli altri reagiscano
    exposure_by_agent = {}
    reactions = {}
    for agent in agents:
        if agent.agent_id == news_agent_id:
            continue
        exposure = await adapter.collect_social_exposure(agent.agent_id)
        exposure_by_agent[agent.agent_id] = len(exposure)
        if exposure:
            reactions[agent.agent_id] = ("like_post", {"post_id": exposure[0]["post_id"]})
    result_2 = await adapter.execute_round(2, reactions)
    print(f"Round 1: refresh recsys reale — esposizione per agente: {exposure_by_agent}")
    print(f"Round 2: {result_2.actions_performed} agenti reagiscono al post con like_post")

    actions = await adapter.collect_actions()
    summary_path = writer.dir / "oasis_summary.json"
    await adapter.persist_state(summary_path)
    await adapter.close()

    summary = writer.read_json("oasis_summary.json") if writer.exists("oasis_summary.json") else None
    # persist_state scrive direttamente (non passa da RunArtifactWriter.write_once, il contenuto e'
    # un dump di tabelle sqlite non un artefatto Pydantic) — lo rileggiamo per il round-trip reale.
    import json
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    assert len(summary["post"]) == 1
    assert summary["post"][0]["content"] == market_event_text

    print(f"\nOK — run_id={run_id}")
    print(f"Azioni social reali tracciate: {len(actions)}")
    for action in actions:
        print(f"  - {action.agent_id}: {action.action} {action.info}")
    print(f"Post reali nel db: {len(summary['post'])} | Like reali: {len(summary['like'])}")
    print(f"Database sqlite reale: {db_path}")
    print(f"Riassunto persistito e riletto: {summary_path}")


if __name__ == "__main__":
    asyncio.run(main())
