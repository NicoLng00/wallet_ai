"""Nessuna chiamata live in questa suite: il payload usato e' una vera risposta di
https://api.coingecko.com/api/v3/coins/bitcoin/ohlc catturata il 2026-08-22 (vedi
tests/fixtures/coingecko_ohlc_btc_sample.json), riprodotta via client iniettato — stessa disciplina
di server/tests/emailSender.test.js nel progetto Node."""
from datetime import datetime, timezone
from pathlib import Path

import pytest

from serena.data.market.coingecko import CoinGeckoMarketAdapter, CoinGeckoUnavailableFieldError

FIXTURE = Path(__file__).parent / "fixtures" / "coingecko_ohlc_btc_sample.json"


@pytest.mark.asyncio
async def test_fetch_ohlc_parses_real_recorded_payload():
    raw = FIXTURE.read_text(encoding="utf-8")

    async def fake_fetch(url: str) -> str:
        assert "bitcoin" in url
        assert "vs_currency=usd" in url
        return raw

    adapter = CoinGeckoMarketAdapter(fetch=fake_fetch)
    points = await adapter.fetch_ohlc("bitcoin")

    assert len(points) == 10
    assert all(p.source == "coingecko_ohlc" for p in points)
    assert all(p.asset == "BITCOIN" for p in points)
    assert all(set(p.normalized.keys()) == {"open", "high", "low", "close"} for p in points)
    assert all(isinstance(p.timestamp, datetime) and p.timestamp.tzinfo == timezone.utc for p in points)


def test_parse_ohlc_response_is_sorted_by_source_order_and_hashes_the_whole_payload():
    raw = FIXTURE.read_text(encoding="utf-8")
    adapter = CoinGeckoMarketAdapter()
    points = adapter.parse_ohlc_response(raw, asset="BTC")
    hashes = {p.raw_payload_hash for p in points}
    assert len(hashes) == 1, "tutti i punti dello stesso fetch devono condividere lo stesso raw_payload_hash"


def test_unavailable_fields_raise_explicitly_instead_of_faking_data():
    adapter = CoinGeckoMarketAdapter()
    with pytest.raises(CoinGeckoUnavailableFieldError):
        adapter.require_unimplemented_field("volume")
    with pytest.raises(CoinGeckoUnavailableFieldError):
        adapter.require_unimplemented_field("funding_rate")
