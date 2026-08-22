"""Metriche verificate a mano (docs/IMPLEMENTATION_PLAN.md Fase 10: "known-answer metric tests, hand-
computed su una piccola serie sintetica") — i numeri nei commenti sono calcolati indipendentemente
dalla funzione testata, non semplicemente rieseguendo la stessa formula."""
import math

import pytest

from serena.backtest.metrics.metrics import (
    average_holding_period_hours,
    cagr,
    calmar_ratio,
    conditional_value_at_risk,
    compute_all_metrics,
    max_drawdown,
    profit_factor,
    sharpe_ratio,
    sortino_ratio,
    turnover,
    value_at_risk,
    win_rate,
)


def test_sharpe_ratio_hand_computed():
    """returns=[0.1,-0.05,0.05,0.1], periods_per_year=4: media=0.05, std campionaria (ddof=1)=
    sqrt(0.015/3)=sqrt(0.005)=0.070710678. Sharpe = 0.05/0.070710678 * sqrt(4) = sqrt(2) = 1.41421356."""
    sharpe = sharpe_ratio([0.1, -0.05, 0.05, 0.1], periods_per_year=4)
    assert sharpe == pytest.approx(math.sqrt(2), abs=1e-6)


def test_sortino_ratio_hand_computed():
    """Stessa serie: downside = [0,-0.05,0,0] (rf=0, solo il rendimento negativo conta),
    downside_std = sqrt(0.0025/4) = 0.025. media(excess) = 0.05.
    Sortino = 0.05/0.025 * sqrt(4) = 4.0."""
    sortino = sortino_ratio([0.1, -0.05, 0.05, 0.1], periods_per_year=4)
    assert sortino == pytest.approx(4.0, abs=1e-9)


def test_max_drawdown_hand_computed():
    """equity=[100,120,90,150]: picco 120 poi minimo 90 -> drawdown (120-90)/120 = 0.25; nuovo
    massimo 150 dopo, non peggiora il worst-case."""
    assert max_drawdown([100, 120, 90, 150]) == pytest.approx(0.25)


def test_cagr_hand_computed():
    """equity=[100,100,121], periods_per_year=2 -> 2 periodi = 1 anno esatto. total_return=1.21.
    CAGR = 1.21^(1/1) - 1 = 0.21."""
    assert cagr([100, 100, 121], periods_per_year=2) == pytest.approx(0.21, abs=1e-9)


def test_calmar_ratio_hand_computed():
    assert calmar_ratio(0.30, 0.25) == pytest.approx(1.2)


def test_calmar_ratio_is_zero_when_there_is_no_drawdown():
    assert calmar_ratio(0.30, 0.0) == 0.0


def test_win_rate_hand_computed():
    assert win_rate([0.05, -0.02, 0.03, -0.01, 0.04]) == pytest.approx(0.6)


def test_profit_factor_hand_computed():
    """guadagni=0.05+0.03+0.04=0.12, perdite=0.02+0.01=0.03 -> profit factor = 4.0."""
    assert profit_factor([0.05, -0.02, 0.03, -0.01, 0.04]) == pytest.approx(4.0)


def test_profit_factor_is_infinite_with_no_losses():
    assert profit_factor([0.05, 0.03]) == float("inf")


def test_profit_factor_is_zero_with_no_trades_at_all():
    assert profit_factor([]) == 0.0


def test_turnover_hand_computed():
    """fractions=[0.1,0.3,0.3,-0.2]: |0.3-0.1|+|0.3-0.3|+|-0.2-0.3| = 0.2+0+0.5 = 0.7."""
    assert turnover([0.1, 0.3, 0.3, -0.2]) == pytest.approx(0.7)


def test_value_at_risk_hand_computed():
    """returns gia' ordinati con 10 valori, confidence=0.9 -> indice = int(0.1*10) = 1 ->
    sorted[1] = -0.08 -> VaR = 0.08."""
    returns = [-0.10, -0.08, -0.06, -0.04, -0.02, 0.0, 0.02, 0.04, 0.06, 0.08]
    assert value_at_risk(returns, confidence=0.9) == pytest.approx(0.08)


def test_conditional_value_at_risk_hand_computed():
    """coda (r <= -0.08): [-0.10,-0.08], media=-0.09 -> CVaR = 0.09."""
    returns = [-0.10, -0.08, -0.06, -0.04, -0.02, 0.0, 0.02, 0.04, 0.06, 0.08]
    assert conditional_value_at_risk(returns, confidence=0.9) == pytest.approx(0.09)


def test_average_holding_period_hand_computed():
    assert average_holding_period_hours([12.0, 24.0, 36.0]) == pytest.approx(24.0)


def test_average_holding_period_of_empty_list_is_zero():
    assert average_holding_period_hours([]) == 0.0


def test_metrics_are_stable_with_fewer_than_two_returns():
    assert sharpe_ratio([0.1], periods_per_year=252) == 0.0
    assert sortino_ratio([], periods_per_year=252) == 0.0


def test_compute_all_metrics_bundles_every_metric_and_round_trips_through_json():
    metrics = compute_all_metrics(
        equity_curve=[100_000, 101_000, 99_500, 102_000],
        position_fractions=[0.1, 0.15, 0.15, -0.1],
        trade_returns=[0.02, -0.015, 0.03],
        holding_periods_hours=[24.0, 48.0],
        periods_per_year=252,
    )
    reloaded = metrics.__class__.model_validate_json(metrics.model_dump_json())
    assert reloaded == metrics
    assert metrics.final_equity == 102_000
    assert metrics.periods == 4
