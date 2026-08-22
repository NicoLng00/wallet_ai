from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from serena.risk.portfolio.portfolio import PortfolioState, Position, apply_fill, fresh_portfolio, gross_exposure

NOW = datetime(2026, 8, 22, 12, 0, tzinfo=timezone.utc)


def test_fresh_portfolio_has_no_positions_and_equal_peak_and_equity():
    portfolio = fresh_portfolio(100_000.0, NOW)
    assert portfolio.equity == 100_000.0
    assert portfolio.peak_equity == 100_000.0
    assert portfolio.positions == {}


def test_portfolio_rejects_peak_equity_below_current_equity():
    with pytest.raises(ValidationError):
        PortfolioState(equity=100_000.0, peak_equity=50_000.0, daily_pnl=0.0, positions={}, timestamp=NOW)


def test_apply_fill_adds_a_new_position_without_mutating_the_original():
    portfolio = fresh_portfolio(100_000.0, NOW)
    updated = apply_fill(portfolio, "BTC/USDT", 0.15, price=60_000.0, timestamp=NOW)
    assert portfolio.positions == {}  # originale invariato
    assert updated.positions["BTC/USDT"].size == 0.15
    assert updated.positions["BTC/USDT"].entry_price == 60_000.0


def test_apply_fill_with_zero_fraction_removes_an_existing_position():
    portfolio = fresh_portfolio(100_000.0, NOW)
    with_position = apply_fill(portfolio, "BTC/USDT", 0.15, price=60_000.0, timestamp=NOW)
    closed = apply_fill(with_position, "BTC/USDT", 0.0, price=61_000.0, timestamp=NOW)
    assert "BTC/USDT" not in closed.positions


def test_apply_fill_replaces_an_existing_position_on_the_same_asset():
    portfolio = fresh_portfolio(100_000.0, NOW)
    first = apply_fill(portfolio, "BTC/USDT", 0.1, price=60_000.0, timestamp=NOW)
    second = apply_fill(first, "BTC/USDT", -0.2, price=62_000.0, timestamp=NOW)
    assert second.positions["BTC/USDT"].size == -0.2
    assert second.positions["BTC/USDT"].entry_price == 62_000.0


def test_gross_exposure_sums_absolute_position_sizes():
    portfolio = fresh_portfolio(100_000.0, NOW)
    portfolio = apply_fill(portfolio, "BTC/USDT", 0.15, 60_000.0, NOW)
    portfolio = apply_fill(portfolio, "ETH/USDT", -0.1, 3_000.0, NOW)
    assert gross_exposure(portfolio) == pytest.approx(0.25)


def test_gross_exposure_excludes_the_given_asset():
    portfolio = fresh_portfolio(100_000.0, NOW)
    portfolio = apply_fill(portfolio, "BTC/USDT", 0.15, 60_000.0, NOW)
    portfolio = apply_fill(portfolio, "ETH/USDT", -0.1, 3_000.0, NOW)
    assert gross_exposure(portfolio, exclude_asset="BTC/USDT") == pytest.approx(0.1)


def test_position_requires_a_positive_entry_price():
    with pytest.raises(ValidationError):
        Position(asset="BTC/USDT", size=0.1, entry_price=0.0, opened_at=NOW)
