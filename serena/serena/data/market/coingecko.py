"""Adapter di mercato reale, CoinGecko `/coins/{id}/ohlc` (docs/TRADING_ARCHITECTURE.md §4).

VERIFIED (chiamata live, 2026-08-22): l'endpoint pubblico gratuito risponde senza API key, formato
`[[timestamp_ms, open, high, low, close], ...]` — nessun volume nella risposta OHLC di CoinGecko
(serve l'endpoint separato `/market_chart` per quello, non implementato in questa fase).

OUR DESIGN DECISION — limiti dichiarati esplicitamente (stessa disciplina di onesta' sui dati gia'
in uso nel progetto Node esistente, es. i limiti documentati di Finnhub/Stooq): questo adapter copre
SOLO OHLC. Volume, volatility, market cap, funding rate, open interest, liquidations e order-book —
elencati nell'architettura come "dove disponibili" — NON sono implementati in Fase 3: CoinGecko free
tier non li espone tutti in un endpoint compatibile con questo adapter, e implementarli con fonti
diverse senza verificarle prima sarebbe esattamente il tipo di "fabbricazione silenziosa" che il
progetto vieta. Rimangono un `NotImplementedError` esplicito, non un valore finto.

Il client HTTP e' iniettabile (`fetch`) per gli stessi motivi di server/lib/emailSender.js nel
progetto Node: i test devono girare su fixture registrate, mai su chiamate live in CI."""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Awaitable, Callable, Optional

from serena.data.hashing import hash_raw_payload
from serena.models.data import DataPoint

CoinGeckoFetch = Callable[[str], Awaitable[str]]

UNAVAILABLE_FIELDS = ("volume", "volatility", "market_cap", "funding_rate", "open_interest", "liquidations", "orderbook")


class CoinGeckoUnavailableFieldError(NotImplementedError):
    pass


async def _default_fetch(url: str) -> str:
    import httpx

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.text


class CoinGeckoMarketAdapter:
    SOURCE_NAME = "coingecko_ohlc"

    def __init__(self, fetch: Optional[CoinGeckoFetch] = None):
        self._fetch = fetch or _default_fetch

    def require_unimplemented_field(self, field: str) -> None:
        if field in UNAVAILABLE_FIELDS:
            raise CoinGeckoUnavailableFieldError(
                f"'{field}' non e' disponibile tramite questo adapter (Fase 3, CoinGecko OHLC-only). "
                f"Nessun valore finto: aggiungere una fonte verificata prima di esporre questo campo."
            )

    async def fetch_ohlc(self, coin_id: str, vs_currency: str = "usd", days: int = 90) -> list[DataPoint]:
        url = f"https://api.coingecko.com/api/v3/coins/{coin_id}/ohlc?vs_currency={vs_currency}&days={days}"
        raw_text = await self._fetch(url)
        return self.parse_ohlc_response(raw_text, asset=coin_id.upper())

    def parse_ohlc_response(self, raw_text: str, asset: str) -> list[DataPoint]:
        import json

        payload_hash = hash_raw_payload(raw_text)
        rows = json.loads(raw_text)
        points: list[DataPoint] = []
        for row in rows:
            timestamp_ms, open_, high, low, close = row
            points.append(DataPoint(
                timestamp=datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc),
                source=self.SOURCE_NAME,
                asset=asset,
                raw_payload_hash=payload_hash,
                normalized={"open": open_, "high": high, "low": low, "close": close},
            ))
        return points
