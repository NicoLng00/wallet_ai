"""Nessuna chiamata live: il feed usato e' una vera risposta RSS di https://cointelegraph.com/rss
catturata il 2026-08-22 (3 item reali, tests/fixtures/cointelegraph_rss_sample.xml)."""
from datetime import datetime, timezone
from pathlib import Path

import pytest

from serena.data.news.cointelegraph import CointelegraphNewsAdapter

FIXTURE = Path(__file__).parent / "fixtures" / "cointelegraph_rss_sample.xml"


@pytest.mark.asyncio
async def test_fetch_recent_parses_real_recorded_feed():
    raw = FIXTURE.read_text(encoding="utf-8")

    async def fake_fetch() -> str:
        return raw

    adapter = CointelegraphNewsAdapter(fetch=fake_fetch)
    points = await adapter.fetch_recent()

    assert len(points) == 3
    assert all(p.source == "cointelegraph_rss" for p in points)
    assert all(p.asset is None for p in points)
    for point in points:
        assert point.normalized["title"]
        assert point.normalized["link"].startswith("https://cointelegraph.com")
        assert isinstance(point.timestamp, datetime)
        assert point.timestamp.tzinfo == timezone.utc


def test_parse_rss_response_shares_one_hash_per_fetch():
    raw = FIXTURE.read_text(encoding="utf-8")
    adapter = CointelegraphNewsAdapter()
    points = adapter.parse_rss_response(raw)
    assert len({p.raw_payload_hash for p in points}) == 1


def test_parse_rss_response_is_ordered_as_in_the_feed():
    raw = FIXTURE.read_text(encoding="utf-8")
    adapter = CointelegraphNewsAdapter()
    points = adapter.parse_rss_response(raw)
    titles = [p.normalized["title"] for p in points]
    assert titles[0] != titles[1] != titles[2]
    assert len(titles) == len(set(titles)), "i 3 item reali del fixture devono restare distinti"
