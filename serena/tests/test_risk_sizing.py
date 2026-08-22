from datetime import datetime, timezone

import pytest

from serena.risk.limits.limits import RiskLimits
from serena.risk.portfolio.portfolio import apply_fill, fresh_portfolio
from serena.risk.sizing.sizing import REFERENCE_SIGNAL_MAGNITUDE, build_position, size_position
from serena.signals.aggregation.pipeline import RiskAdjustedSignal

NOW = datetime(2026, 8, 22, 12, 0, tzinfo=timezone.utc)
ASSET = "BTC/USDT"


def make_signal(risk_adjusted_signal: float) -> RiskAdjustedSignal:
    return RiskAdjustedSignal(
        asset=ASSET, timestamp=NOW, contributing_agents=5, effective_sample_size=3.0,
        independent_consensus=0.5, confidence=0.5, expected_return=0.02,
        risk_adjusted_signal=risk_adjusted_signal,
    )


def test_size_position_is_deterministic_for_identical_inputs():
    signal = make_signal(0.02)
    portfolio = fresh_portfolio(100_000.0, NOW)
    limits = RiskLimits()
    result_a = size_position(signal, portfolio, limits, price=60_000.0)
    result_b = size_position(signal, portfolio, limits, price=60_000.0)
    assert result_a == result_b


def test_max_conviction_signal_uses_the_full_max_position_fraction():
    signal = make_signal(REFERENCE_SIGNAL_MAGNITUDE)  # segnale al valore massimo teorico
    portfolio = fresh_portfolio(100_000.0, NOW)
    limits = RiskLimits(max_position_fraction=0.2)
    fraction, result = size_position(signal, portfolio, limits, price=60_000.0)
    assert fraction == pytest.approx(0.2)
    assert result.passed is True


def test_negative_signal_produces_a_negative_short_fraction():
    signal = make_signal(-REFERENCE_SIGNAL_MAGNITUDE / 2)
    portfolio = fresh_portfolio(100_000.0, NOW)
    limits = RiskLimits(max_position_fraction=0.2)
    fraction, _ = size_position(signal, portfolio, limits, price=60_000.0)
    assert fraction < 0.0


def test_size_position_returns_zero_when_a_limit_is_violated():
    signal = make_signal(REFERENCE_SIGNAL_MAGNITUDE)
    portfolio = apply_fill(fresh_portfolio(100_000.0, NOW), "ETH/USDT", 0.55, 3_000.0, NOW)
    limits = RiskLimits(max_position_fraction=0.2, max_portfolio_exposure=0.6)
    fraction, result = size_position(signal, portfolio, limits, price=60_000.0)
    assert fraction == 0.0
    assert result.passed is False
    assert "max_portfolio_exposure" in result.violated_limits


def test_zero_signal_produces_zero_size():
    signal = make_signal(0.0)
    portfolio = fresh_portfolio(100_000.0, NOW)
    fraction, result = size_position(signal, portfolio, RiskLimits(), price=60_000.0)
    assert fraction == 0.0
    assert result.passed is True  # zero non e' un limite violato, e' semplicemente nessuna posizione


def test_build_position_returns_none_for_zero_fraction():
    assert build_position(ASSET, 0.0, 60_000.0, NOW) is None


def test_build_position_returns_a_real_position_for_a_nonzero_fraction():
    position = build_position(ASSET, 0.15, 60_000.0, NOW)
    assert position is not None
    assert position.asset == ASSET
    assert position.size == 0.15
    assert position.entry_price == 60_000.0
