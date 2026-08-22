"""Esempio end-to-end reale per la Fase 5 (docs/IMPLEMENTATION_PLAN.md, ricostruita dopo aver
collegato una vera GEMINI_API_KEY): genera i 50 agenti dell'MVP su 10 archetipi (market_maker/whale
deferiti, come dichiarato nella definizione MVP del piano), con le persone (identity/strategy/
information_sources/behavioral_biases) generate DAVVERO da Gemini quando la chiave e' configurata —
i coefficienti di rischio numerici e le beliefs restano sempre campionati dal prior seedato (mai
inventati da un LLM). Persiste agents.json in una vera cartella runs/{run_id}/, rilegge e verifica
fedelta'.

Se nessuna GEMINI_API_KEY e' configurata, la generazione ricade onestamente sul percorso
deterministico (identity generiche "Momentum agent #0") — dichiarato a schermo, non nascosto.

OTTIMIZZAZIONE dimostrata qui con un tempo reale misurato: i 10 archetipi vengono generati in
PARALLELO (asyncio.gather in generate_agent_population), non in sequenza — ogni chiamata Gemini e'
un vero round-trip di rete.

Uso: .venv/Scripts/python.exe examples/phase5_e2e.py
"""
from __future__ import annotations
import asyncio
import time
from datetime import datetime, timezone

from serena.agents.profiles.generator import LLMBackedPersonaGenerator, generate_agent_population
from serena.artifacts import RunArtifactWriter
from serena.ids import new_run_id
from serena.llm.config import build_default_llm_client
from serena.models.agent import AgentArchetype, AgentProfile

NOW = datetime.now(timezone.utc)

MVP_ARCHETYPE_COUNTS = {
    AgentArchetype.MOMENTUM: 5, AgentArchetype.MEAN_REVERSION: 5, AgentArchetype.MACRO: 5,
    AgentArchetype.FUNDAMENTAL: 5, AgentArchetype.NEWS: 5, AgentArchetype.CONTRARIAN: 5,
    AgentArchetype.RETAIL: 5, AgentArchetype.QUANT: 5, AgentArchetype.TREND_FOLLOWER: 5,
    AgentArchetype.LONG_TERM_HOLDER: 5,
}


async def main() -> None:
    run_id = new_run_id()
    writer = RunArtifactWriter(run_id)

    llm_client = build_default_llm_client()
    persona_generator = LLMBackedPersonaGenerator(llm_client, tier="opus", temperature=0.0) if llm_client else None
    if persona_generator:
        print(f"GEMINI_API_KEY configurata: le persone verranno generate dal vivo (modello {llm_client.model}).")
    else:
        print("Nessuna GEMINI_API_KEY configurata: percorso deterministico (identity generiche).")

    started_at = time.monotonic()
    population = await generate_agent_population(
        MVP_ARCHETYPE_COUNTS, seed=20260822, created_at=NOW, preferred_assets=["BTC/USDT"],
        persona_generator=persona_generator,
    )
    elapsed = time.monotonic() - started_at
    assert len(population) == 50

    writer.write_once("agents.json", population)
    reloaded = [AgentProfile.model_validate(row) for row in writer.read_json("agents.json")]
    assert reloaded == population, "AgentProfile non identici dopo il round-trip su disco"

    generic_identity_count = sum(1 for p in population if p.identity.startswith(f"{p.archetype.value.replace('_', ' ').title()} agent #"))
    llm_identity_count = len(population) - generic_identity_count

    by_archetype: dict[str, int] = {}
    for profile in population:
        by_archetype[profile.archetype.value] = by_archetype.get(profile.archetype.value, 0) + 1

    print(f"\nOK — run_id={run_id}")
    print(f"Agenti generati: {len(population)} su {len(by_archetype)} archetipi in {elapsed:.2f}s "
          f"(10 chiamate Gemini in parallelo, se una chiave e' configurata)")
    print(f"Persone reali da Gemini: {llm_identity_count}/{len(population)} — "
          f"ricadute sul deterministico: {generic_identity_count}/{len(population)}")
    for archetype, count in sorted(by_archetype.items()):
        print(f"  - {archetype}: {count}")
    if llm_identity_count:
        sample = next(p for p in population if not p.identity.startswith(f"{p.archetype.value.replace('_', ' ').title()} agent #"))
        print(f"\nEsempio di persona reale generata da Gemini ({sample.agent_id}):")
        print(f"  identity: {sample.identity}")
        print(f"  strategy: {sample.strategy}")
        print(f"  information_sources: {sample.information_sources}")
        print(f"  behavioral_biases: {sample.behavioral_biases}")
    print(f"\nPersistiti e riletti da: {writer.dir / 'agents.json'}")
    print("Determinismo dei coefficienti numerici/beliefs: stesso seed (20260822) -> stessi valori "
          "indipendentemente dalla persona LLM (verificato in test_agent_factory.py).")


if __name__ == "__main__":
    asyncio.run(main())
