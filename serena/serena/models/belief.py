"""BeliefUpdate (docs/TRADING_ARCHITECTURE.md §11). reason/information_source non hanno un default
vuoto per costruzione (min_length=1): un aggiornamento di belief senza provenienza e' rifiutato dallo
schema stesso, implementazione diretta della regola del brief #12 ("every belief update must have
provenance") — non lasciata alla disciplina di chi chiama il codice."""
from __future__ import annotations
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class BeliefUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    agent_id: str = Field(min_length=1)
    asset: str = Field(min_length=1)
    old_belief: float = Field(ge=0.0, le=1.0)
    new_belief: float = Field(ge=0.0, le=1.0)
    reason: str = Field(min_length=1)
    information_source: str = Field(min_length=1)
    timestamp: datetime

    @model_validator(mode="after")
    def _actually_changed(self) -> "BeliefUpdate":
        if self.old_belief == self.new_belief:
            raise ValueError("old_belief e new_belief sono identici: non e' un aggiornamento, non va registrato")
        return self
