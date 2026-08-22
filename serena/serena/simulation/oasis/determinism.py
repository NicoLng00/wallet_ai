"""Seeding mirato del modulo `random` globale attorno a una chiamata OASIS (docs/TRADING_ARCHITECTURE.md
§9): VERIFIED FROM SOURCE (docs/MIROFISH_REVERSE_ENGINEERING.md §B.11) che ne' `platform.py' ne'
`recsys.py` di OASIS seedano mai `random` — e non esiste alcun hook di seeding nella libreria stessa.
Non possiamo fixare OASIS (niente fork), quindi seediamo `random` per la sola durata della chiamata e
ripristiniamo lo stato precedente all'uscita, cosi' non inquiniamo il seeding di nient'altro nel
processo (es. il resolver di entita' della Fase 3 non usa `random`, ma un futuro modulo potrebbe)."""
from __future__ import annotations
import random
from contextlib import contextmanager


@contextmanager
def seeded_random(seed: int):
    previous_state = random.getstate()
    random.seed(seed)
    try:
        yield
    finally:
        random.setstate(previous_state)
