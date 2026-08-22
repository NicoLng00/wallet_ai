"""Verifica dal vivo dell'infrastruttura LLM (docs/TRADING_ARCHITECTURE.md §7), ora che una vera
GEMINI_API_KEY e' configurata in serena/.env: il percorso Tier 1/2 viene esercitato con una chiamata
di rete reale, non solo testato con un client finto.

Due percorsi, ENTRAMBI ora compatibili con lo schema strutturato di Gemini (dopo la ricostruzione di
Fase 5 — vedi docs/IMPLEMENTATION_PLAN.md, sezione "Phase 5 rebuild"):
1. EventEngine (Fase 3) + LLMBackedEventInterpreter: schema piatto (EventInterpretation).
2. LLMBackedPersonaGenerator (Fase 5, ricostruita): schema AgentPersonaDraftBatch — solo i campi
   qualitativi, mai i coefficienti numerici ne' le beliefs.

LIMITE REALE VERIFICATO DAL VIVO: la chiave configurata e' sul piano gratuito, con una quota fissa di
20 richieste/giorno per gemini-3.5-flash (dal corpo reale di una risposta 429 RESOURCE_EXHAUSTED, non
assunta). Se la quota e' esaurita per oggi, questo script lo dichiara esplicitamente invece di fallire
con uno stack trace generico o, peggio, ricadere in silenzio su un valore finto."""
from __future__ import annotations
import asyncio
from datetime import datetime, timezone

from serena.agents.profiles.generator import LLMBackedPersonaGenerator
from serena.data.news.cointelegraph import CointelegraphNewsAdapter
from serena.llm.client import LLMQuotaExceededError
from serena.llm.config import build_default_llm_client
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
    try:
        llm_result = await llm_interpreter.interpret(text)
        print(f"Tier 1/2 (Gemini reale, CHIAMATA DI RETE VERA): direction={llm_result.direction} "
              f"importance={llm_result.importance:.2f} confidence={llm_result.confidence:.2f}")
        print("OK — Tier 1/2 esercitato con successo su una chiamata di rete reale.\n")
    except LLMQuotaExceededError as exc:
        print(f"Quota Gemini esaurita per oggi (limite reale: 20 richieste/giorno per "
              f"gemini-3.5-flash): {exc}")
        print("Non e' un bug: EventEngine ricadrebbe comunque su HeuristicEventInterpreter (Tier 3) "
              "in un run reale, mai un crash.\n")


async def check_agent_persona_generation(llm_client) -> None:
    print("=== 2. LLMBackedPersonaGenerator (schema compatibile dopo la ricostruzione di Fase 5) ===")
    generator = LLMBackedPersonaGenerator(llm_client, tier="opus", temperature=0.0)
    agent_ids = [f"momentum-{i:03d}" for i in range(3)]
    try:
        personas = await generator.generate_batch(AgentArchetype.MOMENTUM, agent_ids)
        print(f"OK — {len(personas)} persone reali generate da Gemini:")
        for persona in personas:
            print(f"  - {persona.agent_id}: {persona.identity[:100]}...")
    except LLMQuotaExceededError as exc:
        print(f"Quota Gemini esaurita per oggi: {exc}")
        print("generate_agent_population() ricadrebbe correttamente sul percorso deterministico "
              "(identity generica ma valida) per questo batch, mai un crash del run.\n")


async def main() -> None:
    llm_client = build_default_llm_client()
    if llm_client is None:
        print("Nessuna GEMINI_API_KEY configurata in serena/.env — niente da verificare dal vivo.")
        return

    print(f"Client LLM reale configurato: {type(llm_client).__name__} (modello: {llm_client.model})\n")
    await check_event_interpretation(llm_client)
    await check_agent_persona_generation(llm_client)
    print("\nVerifica infrastruttura LLM completata: entrambi i percorsi Tier 1/2 sono ora "
          "compatibili con lo schema strutturato di Gemini; se la quota giornaliera e' esaurita, "
          "questo script lo dichiara esplicitamente invece di fallire in silenzio.")


if __name__ == "__main__":
    asyncio.run(main())
