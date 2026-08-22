"""Adapter di news reale, feed RSS pubblico di Cointelegraph (docs/TRADING_ARCHITECTURE.md §4).

VERIFIED (fetch live, 2026-08-22): `https://cointelegraph.com/rss` risponde HTTP 200 senza API key,
XML RSS 2.0 standard, ~30 item per risposta con `title`/`link`/`pubDate`/`description`/`guid`.

OUR DESIGN DECISION: usiamo questa fonte (non NewsAPI/CryptoCompare) perche' e' l'unica fonte di news
crypto verificata raggiungibile senza API key da questo ambiente di sviluppo (CryptoCompare/coindesk.com
richiede ora una chiave, verificato con una chiamata live che ha risposto 401). In produzione, se una
chiave Finnhub e' disponibile (gia' usata dal progetto Node per lo stesso scopo), un secondo adapter
puo' essere aggiunto senza toccare questo — stessa interfaccia, sorgente diversa.

`raw_payload_hash` e' calcolato sull'intera risposta RSS (non per singolo item): un singolo fetch produce
piu' DataPoint che condividono lo stesso hash, tracciabile alla stessa chiamata HTTP."""
from __future__ import annotations
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Awaitable, Callable, Optional

from serena.data.hashing import hash_raw_payload
from serena.models.data import DataPoint

CointelegraphFetch = Callable[[], Awaitable[str]]

FEED_URL = "https://cointelegraph.com/rss"


async def _default_fetch() -> str:
    import httpx

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(FEED_URL, headers={"User-Agent": "SerenaResearch/0.1"})
        response.raise_for_status()
        return response.text


class CointelegraphNewsAdapter:
    SOURCE_NAME = "cointelegraph_rss"

    def __init__(self, fetch: Optional[CointelegraphFetch] = None):
        self._fetch = fetch or _default_fetch

    async def fetch_recent(self) -> list[DataPoint]:
        raw_text = await self._fetch()
        return self.parse_rss_response(raw_text)

    def parse_rss_response(self, raw_text: str) -> list[DataPoint]:
        payload_hash = hash_raw_payload(raw_text)
        root = ET.fromstring(raw_text)
        points: list[DataPoint] = []
        for item in root.findall("./channel/item"):
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            guid = (item.findtext("guid") or link).strip()
            description = (item.findtext("description") or "").strip()
            pub_date_raw = item.findtext("pubDate")
            timestamp = parsedate_to_datetime(pub_date_raw) if pub_date_raw else datetime.now(timezone.utc)
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=timezone.utc)
            points.append(DataPoint(
                timestamp=timestamp.astimezone(timezone.utc),
                source=self.SOURCE_NAME,
                asset=None,
                raw_payload_hash=payload_hash,
                normalized={"title": title, "link": link, "guid": guid, "description": description},
            ))
        return points
