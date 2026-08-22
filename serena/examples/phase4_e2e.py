"""Esempio end-to-end reale per la Fase 4 (docs/IMPLEMENTATION_PLAN.md): ingerisce gli Event reali
prodotti dalla Fase 3 (stessa chiamata live a Cointelegraph, stesso EventEngine), promuove le loro
entita' risolte deterministicamente in nodi di un vero grafo Kuzu su disco (non :memory:, un file
reale sotto runs/{run_id}/graph.kuzu), collega ogni entita' menzionata in un articolo alla notizia
stessa con relazioni REPORTS_ON, interroga il vicinato di BTC per davvero, e persiste un riassunto
verificabile in runs/{run_id}/graph_summary.json.

Uso: .venv/Scripts/python.exe examples/phase4_e2e.py
"""
from __future__ import annotations
import asyncio
from datetime import datetime, timezone

from serena.artifacts import RunArtifactWriter
from serena.data.news.cointelegraph import CointelegraphNewsAdapter
from serena.ids import new_run_id
from serena.knowledge.graph.kuzu_backend import KuzuGraphBackend
from serena.models.graph import Entity, EntityType, RelationType, Relationship
from serena.simulation.events.engine import EventEngine

NOW = datetime.now(timezone.utc)

# Le entita' che il resolver deterministico della Fase 3 puo' produrre (simulation/events/engine.py,
# ENTITY_KEYWORDS) mappate sul tipo dell'ontologia fissa (architettura §3.2) — l'unico punto in cui
# questo esempio conosce sia il vocabolario dell'EventEngine sia l'ontologia del grafo.
KNOWN_ENTITY_TYPES = {
    "BTC": EntityType.ASSET, "ETH": EntityType.ASSET,
    "MACRO_FED": EntityType.CENTRAL_BANK, "REG_SEC": EntityType.GOVERNMENT,
    "PRODUCT_ETF": EntityType.ETF, "ENTITY_BLACKROCK": EntityType.FINANCIAL_INSTITUTION,
    "EXCHANGE_BINANCE": EntityType.EXCHANGE, "EXCHANGE_COINBASE": EntityType.EXCHANGE,
}


async def main() -> None:
    run_id = new_run_id()
    writer = RunArtifactWriter(run_id)
    graph_path = writer.dir / "graph.kuzu"

    print("Chiamata live: Cointelegraph RSS...")
    news_points = await CointelegraphNewsAdapter().fetch_recent()
    print(f"  -> {len(news_points)} articoli reali ricevuti")

    engine = EventEngine()  # Tier 3 deterministico: vedi limite dichiarato in Fase 3
    backend = KuzuGraphBackend(graph_path)
    print(f"Grafo Kuzu reale su disco: {graph_path}")
    assert backend.health_check()

    entities_created = 0
    relationships_created = 0
    for i, point in enumerate(news_points):
        text = f"{point.normalized['title']} {point.normalized['description']}"
        event = await engine.build_event(point, text=text, event_id=f"evt-phase4-{i}", event_type="SOCIAL_SPIKE")
        if event.entities == ["UNRESOLVED"]:
            continue

        news_entity_id = event.event_id
        backend.upsert_entities([Entity(
            entity_id=news_entity_id, entity_type=EntityType.NEWS_SOURCE,
            name=point.normalized["title"][:120],
            attributes={"direction": event.direction, "importance": event.importance},
        )])
        entities_created += 1

        for resolved_id in event.entities:
            entity_type = KNOWN_ENTITY_TYPES.get(resolved_id)
            if entity_type is None:
                continue
            backend.upsert_entities([Entity(entity_id=resolved_id, entity_type=entity_type, name=resolved_id)])
            entities_created += 1
            backend.upsert_relationships([Relationship(
                source_id=news_entity_id, target_id=resolved_id, relation_type=RelationType.REPORTS_ON,
                valid_from=event.timestamp,
            )])
            relationships_created += 1

    btc_neighborhood = backend.query_neighborhood("BTC", depth=2)
    assets = backend.query_by_type(EntityType.ASSET)

    summary = {
        "run_id": run_id,
        "news_articles_ingested": len(news_points),
        "entities_upserted": entities_created,
        "relationships_upserted": relationships_created,
        "btc_neighborhood_entity_count": len(btc_neighborhood.entities),
        "btc_neighborhood_entities": sorted(e.entity_id for e in btc_neighborhood.entities),
        "asset_entities_in_graph": sorted(e.entity_id for e in assets),
    }
    writer.write_once("graph_summary.json", summary)

    reloaded_summary = writer.read_json("graph_summary.json")
    assert reloaded_summary == summary, "graph_summary.json non identico dopo il round-trip su disco"

    print(f"\nOK — run_id={run_id}")
    print(f"Entita' upsertate: {entities_created} | Relazioni upsertate: {relationships_created}")
    print(f"Vicinato reale di BTC (depth=2): {summary['btc_neighborhood_entities']}")
    print(f"Asset nel grafo: {summary['asset_entities_in_graph']}")
    print(f"File grafo reale su disco: {graph_path}")
    print(f"Riassunto persistito e riletto: {writer.dir / 'graph_summary.json'}")


if __name__ == "__main__":
    asyncio.run(main())
