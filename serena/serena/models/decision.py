"""AgentDecision (docs/TRADING_ARCHITECTURE.md §8) — l'UNICA cosa che la chiamata LLM di un agente
puo' produrre per un round di trading. Mai interpretata come ordine direttamente: signals/ combina
molte AgentDecision in un segnale, risk/ decide la size — l'agente non tocca mai la posizione.

agent_id e timestamp non erano nello schema letterale del brief ma sono aggiunti qui deliberatamente
(OUR DESIGN DECISION): senza agent_id una decisione non e' attribuibile a nessuno (necessario per
evaluation/agent_scoring), e senza timestamp non rispetta la regola esplicita del brief "every
prediction must have a timestamp"."""
from __future__ import annotations
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class AgentDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    agent_id: str = Field(min_length=1)
    timestamp: datetime
    action: Literal["BUY", "SELL", "HOLD"]
    asset: str = Field(min_length=1)
    confidence: float = Field(ge=0.0, le=1.0)
    expected_return: float
    time_horizon_hours: int = Field(gt=0)
    reasoning_summary: str = Field(min_length=1)
    information_used: list[str] = Field(default_factory=list)
    belief_update: dict[str, float] = Field(default_factory=dict)
