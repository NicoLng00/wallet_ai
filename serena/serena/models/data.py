"""DataPoint (docs/TRADING_ARCHITECTURE.md §4) — l'unita' base di ogni adapter in data/. Ogni punto
dato porta la propria provenienza (source, raw_payload_hash) cosi' un run e' auditabile a
posteriori: da dove viene esattamente ogni numero che ha influenzato una decisione."""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class DataPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    timestamp: datetime
    source: str = Field(min_length=1)
    asset: Optional[str] = None
    raw_payload_hash: str = Field(min_length=1)
    normalized: dict
