"""PointInTimeDataView (docs/TRADING_ARCHITECTURE.md §4) — la barriera anti-look-ahead. Non e' una
convenzione ("non guardare oltre now") ma un vincolo strutturale: l'oggetto e' costruito una sola
volta con un current_time fisso, scarta ogni DataPoint con timestamp futuro alla costruzione, e
nessuno dei suoi metodi pubblici accetta un timestamp come parametro — quindi non esiste letteralmente
una chiamata che un agente/LLM possa fare per leggere t > now. Vedi test_point_in_time.py per la
verifica che questo vincolo regge anche quando la vista viene costruita con dati futuri "per errore"
a monte (l'adapter ha sbagliato, l'orologio di sistema e' sballato, ecc.)."""
from __future__ import annotations
from datetime import datetime, timedelta

from serena.models.data import DataPoint


class PointInTimeDataView:
    def __init__(self, points: list[DataPoint], current_time: datetime):
        self._current_time = current_time
        self._points: tuple[DataPoint, ...] = tuple(
            sorted((p for p in points if p.timestamp <= current_time), key=lambda p: p.timestamp)
        )

    @property
    def current_time(self) -> datetime:
        return self._current_time

    def all(self) -> tuple[DataPoint, ...]:
        return self._points

    def latest(self) -> DataPoint | None:
        return self._points[-1] if self._points else None

    def window(self, lookback: timedelta) -> tuple[DataPoint, ...]:
        cutoff = self._current_time - lookback
        return tuple(p for p in self._points if p.timestamp >= cutoff)

    def by_source(self, source: str) -> tuple[DataPoint, ...]:
        return tuple(p for p in self._points if p.source == source)

    def __len__(self) -> int:
        return len(self._points)
