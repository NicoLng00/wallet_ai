"""Esempio end-to-end reale per la Fase 3 (docs/IMPLEMENTATION_PLAN.md): chiamate live vere a
CoinGecko (OHLC BTC/USD) e Cointelegraph (RSS news), costruzione di una PointInTimeDataView reale,
produzione di Event reali via EventEngine, persistenza in una vera cartella runs/{run_id}/, rilettura
da disco e verifica di fedelta'. Nessun mock, nessuna fixture: dati reali da internet in questo run.

Limite dichiarato: nessuna ANTHROPIC_API_KEY e' configurata in questo ambiente, quindi l'interpretazione
semantica (direction/importance/confidence) gira sul Tier 3 deterministico
(HeuristicEventInterpreter), non su un vero LLM Tier 1/2 — vedi serena/llm/client.py per la
motivazione di questa scelta. Il layer LLM (LLMBackedEventInterpreter) e' implementato e testato con
un client finto in tests/test_event_engine.py, ma non eseguito qui contro un vero backend di rete.

Uso: .venv/Scripts/python.exe examples/phase3_e2e.py
"""
from __future__ import annotations
import asyncio
import subprocess
from datetime import datetime, timedelta, timezone

from serena.artifacts import RUNS_ROOT, RunArtifactWriter
from serena.data.market.coingecko import CoinGeckoMarketAdapter
from serena.data.news.cointelegraph import CointelegraphNewsAdapter
from serena.data.point_in_time import PointInTimeDataView
from serena.ids import new_run_id
from serena.models import Event
from serena.models.data import DataPoint
from serena.simulation.events.engine import EventEngine

NOW = datetime.now(timezone.utc)


def _git_commit() -> str:
    try:
        result = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, cwd=RUNS_ROOT.parent.parent, check=True)
        return result.stdout.strip()
    except Exception:
        return "unknown"


async def main() -> None:
    run_id = new_run_id()
    writer = RunArtifactWriter(run_id)

    market_adapter = CoinGeckoMarketAdapter()
    news_adapter = CointelegraphNewsAdapter()

    print("Chiamata live: CoinGecko OHLC BTC/USD (90 giorni)...")
    market_points = await market_adapter.fetch_ohlc("bitcoin", days=90)
    print(f"  -> {len(market_points)} candele reali ricevute")

    print("Chiamata live: Cointelegraph RSS...")
    news_points = await news_adapter.fetch_recent()
    print(f"  -> {len(news_points)} articoli reali ricevuti")

    all_points = list(market_points) + list(news_points)
    view = PointInTimeDataView(all_points, current_time=NOW)
    assert len(view) == len(all_points), "nessun punto dovrebbe essere nel futuro rispetto a now"
    future_probe = DataPoint(
        timestamp=NOW + timedelta(days=365), source="synthetic_future_probe", asset=None,
        raw_payload_hash="probe", normalized={},
    )
    future_check = PointInTimeDataView(all_points + [future_probe], current_time=NOW)
    assert len(future_check) == len(all_points), "un punto futuro iniettato di proposito deve restare escluso"

    writer.write_once("market_data_points.json", list(market_points))
    writer.write_once("news_data_points.json", list(news_points))

    engine = EventEngine()  # Tier 3 deterministico: vedi limite dichiarato in cima al file
    events: list[Event] = []
    for i, point in enumerate(news_points):
        text = f"{point.normalized['title']} {point.normalized['description']}"
        event = await engine.build_event(point, text=text, event_id=f"evt-phase3-{i}", event_type="SOCIAL_SPIKE")
        events.append(event)
        writer.append_jsonl("events.jsonl", event)

    reloaded_market = writer.read_json("market_data_points.json")
    reloaded_news = writer.read_json("news_data_points.json")
    reloaded_events = [Event.model_validate(row) for row in writer.read_jsonl("events.jsonl")]

    assert len(reloaded_market) == len(market_points)
    assert len(reloaded_news) == len(news_points)
    assert reloaded_events == events, "Event non identici dopo il round-trip su disco"

    print(f"\nOK — run_id={run_id}")
    print(f"Cartella reale su disco: {writer.dir}")
    print(f"Candele di mercato reali persistite: {len(market_points)}")
    print(f"Articoli di news reali persistiti: {len(news_points)}")
    print(f"Event reali costruiti (Tier 3 deterministico, no LLM key in questo ambiente): {len(events)}")
    for event in events[:3]:
        print(f"  - [{event.direction:8s}] importance={event.importance:.2f} novelty={event.novelty:.2f} entities={event.entities}")
    print("Round-trip verificato per: market_data_points.json, news_data_points.json, events.jsonl")
    print("Verificato: PointInTimeDataView esclude strutturalmente un DataPoint futuro iniettato di proposito.")


if __name__ == "__main__":
    asyncio.run(main())
