"""LLMClient — protocollo comune ai tre tier (docs/TRADING_ARCHITECTURE.md §7). Ogni chiamante passa
uno schema Pydantic e riceve un'istanza validata di quello schema, mai testo libero: e' la stessa
disciplina che nel reverse-engineering di MiroFish si e' rivelata l'unica cosa a tenere davvero
(§A.2, §A.8 in docs/MIROFISH_REVERSE_ENGINEERING.md).

OUR DESIGN DECISION: qui c'e' solo il protocollo, nessun backend di rete concreto. Il primo chiamante
reale nel piano (docs/IMPLEMENTATION_PLAN.md, Fase 5 — generazione popolazione agenti) e' anche il primo
punto in cui il piano richiede esplicitamente "chiamate LLM reali" con una chiave gia' configurata;
implementare qui un client Anthropic concreto senza una chiave disponibile in questo ambiente di sviluppo
locale (verificato: nessuna ANTHROPIC_API_KEY nell'ambiente) significherebbe scrivere codice di rete mai
eseguito per davvero, il tipo di lavoro non verificato che il progetto vieta esplicitamente. La Fase 3
(EventEngine) usa questo protocollo per il tipo, ma nella pratica gira con l'unico interprete davvero
eseguibile ora: HeuristicEventInterpreter (Tier 3, deterministico, nessuna rete) — vedi
simulation/events/engine.py."""
from __future__ import annotations
from typing import Literal, Optional, Protocol, TypeVar

from pydantic import BaseModel

LLMTier = Literal["opus", "fast", "deterministic"]

SchemaT = TypeVar("SchemaT", bound=BaseModel)


class LLMUnavailableError(RuntimeError):
    """Alzato da un LLMClient concreto quando la chiamata non puo' essere fatta (nessuna chiave,
    rete non disponibile, ecc.) — mai da inghiottire in silenzio: il chiamante decide se ritentare
    a temperatura piu' bassa o cadere sul fallback Tier 3 (docs/TRADING_ARCHITECTURE.md §7)."""


class LLMClient(Protocol):
    async def complete_json(
        self,
        prompt: str,
        schema: type[SchemaT],
        *,
        tier: LLMTier,
        temperature: float,
        seed: Optional[int] = None,
    ) -> SchemaT: ...
