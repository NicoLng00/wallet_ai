from datetime import datetime, timezone

from serena.risk.limits.limits import (
    RiskLimits,
    check_correlation_limit,
    check_liquidity_limit,
    check_max_daily_loss,
    check_max_drawdown,
    check_max_leverage,
    check_max_portfolio_exposure,
    check_max_position,
    evaluate_all_limits,
)
from serena.risk.portfolio.portfolio import apply_fill, fresh_portfolio

NOW = datetime(2026, 8, 22, 12, 0, tzinfo=timezone.utc)
DEFAULT_LIMITS = RiskLimits()


# --- un fixture dedicato per ciascun tipo di limite --------------------------------------------

def test_max_position_limit_triggers_above_threshold():
    assert check_max_position(0.25, RiskLimits(max_position_fraction=0.2)) == "max_position"


def test_max_position_limit_does_not_trigger_within_threshold():
    assert check_max_position(0.15, RiskLimits(max_position_fraction=0.2)) is None


def test_max_portfolio_exposure_triggers_when_combined_exposure_exceeds_cap():
    portfolio = apply_fill(fresh_portfolio(100_000.0, NOW), "ETH/USDT", 0.4, 3_000.0, NOW)
    limits = RiskLimits(max_portfolio_exposure=0.5)
    assert check_max_portfolio_exposure(portfolio, "BTC/USDT", 0.2, limits) == "max_portfolio_exposure"


def test_max_portfolio_exposure_ignores_the_asset_being_replaced():
    portfolio = apply_fill(fresh_portfolio(100_000.0, NOW), "BTC/USDT", 0.4, 60_000.0, NOW)
    limits = RiskLimits(max_portfolio_exposure=0.5)
    assert check_max_portfolio_exposure(portfolio, "BTC/USDT", 0.1, limits) is None


def test_max_leverage_triggers_beyond_the_leverage_cap():
    portfolio = apply_fill(fresh_portfolio(100_000.0, NOW), "ETH/USDT", 0.8, 3_000.0, NOW)
    limits = RiskLimits(max_leverage=1.0, max_portfolio_exposure=1.0)
    assert check_max_leverage(portfolio, "BTC/USDT", 0.3, limits) == "max_leverage"


def test_max_daily_loss_triggers_when_loss_exceeds_fraction():
    portfolio = fresh_portfolio(100_000.0, NOW).model_copy(update={"daily_pnl": -6_000.0})
    assert check_max_daily_loss(portfolio, RiskLimits(max_daily_loss_fraction=0.05)) == "max_daily_loss"


def test_max_daily_loss_does_not_trigger_on_a_profitable_day():
    portfolio = fresh_portfolio(100_000.0, NOW).model_copy(update={"daily_pnl": 6_000.0})
    assert check_max_daily_loss(portfolio, RiskLimits(max_daily_loss_fraction=0.05)) is None


def test_max_drawdown_triggers_when_equity_falls_far_enough_below_peak():
    portfolio = fresh_portfolio(100_000.0, NOW).model_copy(update={"equity": 75_000.0, "peak_equity": 100_000.0})
    assert check_max_drawdown(portfolio, RiskLimits(max_drawdown_fraction=0.2)) == "max_drawdown"


def test_max_drawdown_does_not_trigger_within_tolerance():
    portfolio = fresh_portfolio(100_000.0, NOW).model_copy(update={"equity": 90_000.0, "peak_equity": 100_000.0})
    assert check_max_drawdown(portfolio, RiskLimits(max_drawdown_fraction=0.2)) is None


def test_correlation_limit_triggers_for_same_direction_highly_correlated_assets():
    portfolio = apply_fill(fresh_portfolio(100_000.0, NOW), "ETH/USDT", 0.2, 3_000.0, NOW)
    correlations = {frozenset({"BTC/USDT", "ETH/USDT"}): 0.9}
    limits = RiskLimits(correlation_limit=0.7)
    assert check_correlation_limit(portfolio, "BTC/USDT", 0.2, correlations, limits) == "correlation_limit"


def test_correlation_limit_does_not_trigger_for_opposite_direction_positions():
    portfolio = apply_fill(fresh_portfolio(100_000.0, NOW), "ETH/USDT", 0.2, 3_000.0, NOW)
    correlations = {frozenset({"BTC/USDT", "ETH/USDT"}): 0.9}
    limits = RiskLimits(correlation_limit=0.7)
    assert check_correlation_limit(portfolio, "BTC/USDT", -0.2, correlations, limits) is None


def test_correlation_limit_does_not_trigger_without_a_known_correlation():
    portfolio = apply_fill(fresh_portfolio(100_000.0, NOW), "ETH/USDT", 0.2, 3_000.0, NOW)
    assert check_correlation_limit(portfolio, "BTC/USDT", 0.2, {}, RiskLimits()) is None


def test_liquidity_limit_is_skipped_when_no_liquidity_source_is_available():
    assert check_liquidity_limit(0.9, available_liquidity_fraction=None) is None


def test_liquidity_limit_triggers_when_size_exceeds_available_liquidity():
    assert check_liquidity_limit(0.3, available_liquidity_fraction=0.1) == "liquidity_limit"


# --- evaluate_all_limits: aggregazione -----------------------------------------------------------

def test_evaluate_all_limits_passes_cleanly_with_no_violations():
    portfolio = fresh_portfolio(100_000.0, NOW)
    result = evaluate_all_limits(portfolio, "BTC/USDT", 0.1, DEFAULT_LIMITS)
    assert result.passed is True
    assert result.violated_limits == []


def test_evaluate_all_limits_collects_every_violated_limit():
    portfolio = fresh_portfolio(100_000.0, NOW).model_copy(update={"equity": 70_000.0, "peak_equity": 100_000.0, "daily_pnl": -10_000.0})
    limits = RiskLimits(max_position_fraction=0.1, max_daily_loss_fraction=0.05, max_drawdown_fraction=0.2)
    result = evaluate_all_limits(portfolio, "BTC/USDT", 0.5, limits)
    assert result.passed is False
    assert "max_position" in result.violated_limits
    assert "max_daily_loss" in result.violated_limits
    assert "max_drawdown" in result.violated_limits
