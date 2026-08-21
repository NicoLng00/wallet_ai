"""ID generator: sortabile per creazione (prefisso timestamp in millisecondi) + suffisso casuale
per l'unicita'. Niente dipendenza esterna (python-ulid) per una singola funzione. run_id non deve
essere di per se' riproducibile — la riproducibilita' di un run e' garantita da SimulationRun.seed
e da RandomSeedBundle, non dal nome della directory."""
from __future__ import annotations
import time
import uuid


def new_run_id() -> str:
    millis = int(time.time() * 1000)
    return f"{millis:013d}-{uuid.uuid4().hex[:12]}"
