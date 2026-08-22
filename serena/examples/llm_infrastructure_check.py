"""Verifica dal vivo dell'infrastruttura LLM (docs/TRADING_ARCHITECTURE.md §7), ora che una vera
GEMINI_API_KEY e' configurata in serena/.env: per la prima volta in questo progetto, il percorso
Tier 1/2 viene esercitato con una chiamata di rete reale, non solo testato con un client finto.

Due percorsi verificati separatamente, con esito onesto per ciascuno:
1. EventEngine (Fase 3) + LLMBackedEventInterpreter: schema piatto (EventInterpretation), COMPATIBILE
   con lo schema strutturato di Gemini — interpretazione reale attesa con successo.
2. LLMBackedProfileBatchGenerator (Fase 5): schema con AgentProfile.beliefs (dict a proprieta' libere),
   NON COMPATIBILE con il dialetto di schema documentato da Gemini (verificato in
   tests/test_schema_conversion.py) — atteso un fallimento esplicito (UnsupportedSchemaError), non un
   funzionamento silenzioso ne' un crash generico.

Uso: .venv/Scripts/python.exe examples/llm_infrastructure_check.py
"""
from __future__ import annotations
import asyncio
from datetime import datetime, timezone

from serena.agents.profiles.generator import LLMBackedProfileBatchGenerator
from serena.data.news.cointelegraph import CointelegraphNewsAdapter
from serena.llm.config import build_default_llm_client
from serena.llm.schema_conversion import UnsupportedSchemaError
from serena.models.agent import AgentArchetype
from serena.simulation.events.engine import EventEngine, HeuristicEventInterpreter, LLMBackedEventInterpreter

NOW = datetime.now(timezone.utc)


async def check_event_interpretation(llm_client) -> None:
    print("=== 1. EventEngine + LLMBackedEventInterpreter (schema compatibile) ===")
    news_points = await CointelegraphNewsAdapter().fetch_recent()
    article = news_points[0]
    text = f"{article.normalized['title']} {article.normalized['description']}"
    print(f"Articolo reale: {article.normalized['title']!r}")

    heuristic_result = await HeuristicEventInterpreter().interpret(text)
    print(f"Tier 3 (euristica, per confronto): direction={heuristic_result.direction} "
          f"importance={heuristic_result.importance:.2f} confidence={heuristic_result.confidence:.2f}")

    llm_interpreter = LLMBackedEventInterpreter(llm_client, tier="fast", temperature=0.0)
    llm_result = await llm_interpreter.interpret(text)
    print(f"Tier 1/2 (Gemini reale, CHIAMATA DI RETE VERA): direction={llm_result.direction} "
          f"importance={llm_result.importance:.2f} confidence={llm_result.confidence:.2f}")

    engine = EventEngine(interpreter=llm_interpreter)
    event = await engine.build_event(article, text, "evt-llm-check-1", "SOCIAL_SPIKE")
    print(f"Event completo costruito con interpretazione LLM reale: entities={event.entities}, "
          f"direction={event.direction}, confidence={event.confidence}")
    print("OK — Tier 1/2 esercitato con successo su una chiamata di rete reale.\n")


async def check_agent_profile_generation(llm_client) -> None:
    print("=== 2. LLMBackedProfileBatchGenerator (schema NON compatibile, atteso) ===")
    generator = LLMBackedProfileBatchGenerator(llm_client, tier="opus", temperature=0.0)
    try:
        await generator.generate_batch(AgentArchetype.MOMENTUM, count=3, start_index=0, created_at=NOW,
                                        preferred_assets=["BTC/USDT"])
        print("INATTESO: la generazione ha avuto successo nonostante lo schema con dict aperto.")
    except UnsupportedSchemaError as exc:
        print(f"Fallito come atteso, esplicitamente, PRIMA di qualunque chiamata di rete: {exc}")
        print("Limite reale e dichiarato: AgentProfile.beliefs e' un dict[str, float] a proprieta' "
              "libere, non rappresentabile nel dialetto di schema strutturato documentato da Gemini. "
              "generate_agent_population() continua a funzionare per davvero: ricade correttamente sul "
              "percorso deterministico (Fase 5) per l'intero batch, mai un crash del run.")
    print()


async def main() -> None:
    llm_client = build_default_llm_client()
    if llm_client is None:
        print("Nessuna GEMINI_API_KEY configurata in serena/.env — niente da verificare dal vivo.")
        return

    print(f"Client LLM reale configurato: {type(llm_client).__name__} (modello: {llm_client.model})\n")
    await check_event_interpretation(llm_client)
    await check_agent_profile_generation(llm_client)
    print("Verifica infrastruttura LLM completata: il percorso Tier 1/2 funziona per davvero dove lo "
          "schema lo permette, e fallisce esplicitamente (non in silenzio) dove non lo permette.")


if __name__ == "__main__":
    asyncio.run(main())
