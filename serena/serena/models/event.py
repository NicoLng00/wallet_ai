"""Event (docs/TRADING_ARCHITECTURE.md §5). timestamp/entities/novelty sono calcolati
deterministicamente (EventEngine, Fase 3); direction/importance/confidence richiedono
interpretazione semantica e passano da un LLMClient validato — mai testo libero non schematizzato,
stessa disciplina che si e' rivelata utile nell'ontology_generator.py di MiroFish (vedi
docs/MIROFISH_REVERSE_ENGINEERING.md §A.2)."""
from __future__ import annotations
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Event(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str = Field(min_length=1)
    timestamp: datetime
    type: str = Field(min_length=1)
    entities: list[str] = Field(min_length=1)
    direction: Literal["bullish", "bearish", "neutral"]
    importance: float = Field(ge=0.0, le=1.0)
    novelty: float = Field(ge=0.0, le=1.0)
    confidence: float = Field(ge=0.0, le=1.0)
    source_ids: list[str] = Field(min_length=1)
