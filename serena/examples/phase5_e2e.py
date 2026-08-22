"""Esempio end-to-end reale per la Fase 5 (docs/IMPLEMENTATION_PLAN.md): genera i 50 agenti dell'MVP
su 10 archetipi (market_maker/whale deferiti, come dichiarato nella definizione MVP del piano),
persiste agents.json in una vera cartella runs/{run_id}/, rilegge e verifica fedelta'.

Limite dichiarato: nessuna ANTHROPIC_API_KEY in questo ambiente, quindi la generazione gira per
intero sul percorso deterministico basato sui prior d'archetipo (mai su LLMBackedProfileBatchGenerator
dal vivo) — lo stesso limite gia' dichiarato per l'interpretazione degli eventi in Fase 3.

Uso: .venv/Scripts/python.exe examples/phase5_e2e.py
"""
from __future__ import annotations
import asyncio
from datetime import datetime, timezone

from serena.agents.profiles.generator import generate_agent_population
from serena.artifacts import RunArtifactWriter
from serena.ids import new_run_id
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

    population = await generate_agent_population(
        MVP_ARCHETYPE_COUNTS, seed=20260822, created_at=NOW, preferred_assets=["BTC/USDT"],
    )
    assert len(population) == 50

    writer.write_once("agents.json", population)
    reloaded = [AgentProfile.model_validate(row) for row in writer.read_json("agents.json")]
    assert reloaded == population, "AgentProfile non identici dopo il round-trip su disco"

    by_archetype: dict[str, int] = {}
    for profile in population:
        by_archetype[profile.archetype.value] = by_archetype.get(profile.archetype.value, 0) + 1

    print(f"OK — run_id={run_id}")
    print(f"Agenti generati: {len(population)} su {len(by_archetype)} archetipi")
    for archetype, count in sorted(by_archetype.items()):
        print(f"  - {archetype}: {count}")
    print(f"Persistiti e riletti da: {writer.dir / 'agents.json'}")
    print(f"Determinismo: stesso seed (20260822) -> stesso identico elenco (verificato in test_agent_factory.py)")


if __name__ == "__main__":
    asyncio.run(main())
