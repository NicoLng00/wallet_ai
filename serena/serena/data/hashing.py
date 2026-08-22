"""sha256 del payload grezzo per DataPoint.raw_payload_hash (docs/TRADING_ARCHITECTURE.md §4) —
usato sia per l'audit (da quale risposta esatta viene questo numero) sia per il dedup fra chiamate
ripetute allo stesso endpoint."""
from __future__ import annotations
import hashlib


def hash_raw_payload(raw: str | bytes) -> str:
    data = raw.encode("utf-8") if isinstance(raw, str) else raw
    return hashlib.sha256(data).hexdigest()
