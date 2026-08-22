"""Metriche di backtest (docs/TRADING_ARCHITECTURE.md §15) — tutte Tier 3 (Python deterministico),
mai chieste a un LLM. Ogni funzione e' pura e prende in input solo numeri gia' calcolati altrove
(curva di equity o rendimenti periodali) — nessuna dipendenza da agenti, segnali o simulazione."""
from __future__ import annotations
import math

import numpy as np
from pydantic import BaseModel, ConfigDict


def periodic_returns(equity_curve: list[float]) -> list[float]:
    if len(equity_curve) < 2:
        return []
    return [(equity_curve[i] - equity_curve[i - 1]) / equity_curve[i - 1] for i in range(1, len(equity_curve))]


def cagr(equity_curve: list[float], periods_per_year: float) -> float:
    if len(equity_curve) < 2 or equity_curve[0] <= 0:
        return 0.0
    total_return = equity_curve[-1] / equity_curve[0]
    years = (len(equity_curve) - 1) / periods_per_year
    if years <= 0:
        return 0.0
    if total_return <= 0:
        return -1.0
    return total_return ** (1 / years) - 1


def sharpe_ratio(returns: list[float], periods_per_year: float, risk_free_rate_annual: float = 0.0) -> float:
    if len(returns) < 2:
        return 0.0
    rf_per_period = risk_free_rate_annual / periods_per_year
    excess = [r - rf_per_period for r in returns]
    std = float(np.std(excess, ddof=1))
    if std == 0.0:
        return 0.0
    return float(np.mean(excess) / std * math.sqrt(periods_per_year))


def sortino_ratio(returns: list[float], periods_per_year: float, risk_free_rate_annual: float = 0.0) -> float:
    if len(returns) < 2:
        return 0.0
    rf_per_period = risk_free_rate_annual / periods_per_year
    excess = [r - rf_per_period for r in returns]
    downside = [min(0.0, r) for r in excess]
    downside_std = math.sqrt(sum(d * d for d in downside) / len(downside))
    if downside_std == 0.0:
        return 0.0
    return float(np.mean(excess) / downside_std * math.sqrt(periods_per_year))


def max_drawdown(equity_curve: list[float]) -> float:
    if not equity_curve:
        return 0.0
    peak = equity_curve[0]
    worst = 0.0
    for value in equity_curve:
        peak = max(peak, value)
        drawdown = (peak - value) / peak if peak > 0 else 0.0
        worst = max(worst, drawdown)
    return worst


def calmar_ratio(cagr_value: float, max_drawdown_value: float) -> float:
    if max_drawdown_value == 0.0:
        return 0.0
    return cagr_value / max_drawdown_value


def win_rate(trade_returns: list[float]) -> float:
    if not trade_returns:
        return 0.0
    return sum(1 for r in trade_returns if r > 0) / len(trade_returns)


def profit_factor(trade_returns: list[float]) -> float:
    gains = sum(r for r in trade_returns if r > 0)
    losses = -sum(r for r in trade_returns if r < 0)
    if losses == 0.0:
        return float("inf") if gains > 0 else 0.0
    return gains / losses


def turnover(position_fractions: list[float]) -> float:
    if len(position_fractions) < 2:
        return 0.0
    return sum(abs(position_fractions[i] - position_fractions[i - 1]) for i in range(1, len(position_fractions)))


def exposure(position_fractions: list[float]) -> float:
    if not position_fractions:
        return 0.0
    return float(np.mean([abs(f) for f in position_fractions]))


def average_holding_period_hours(holding_periods_hours: list[float]) -> float:
    if not holding_periods_hours:
        return 0.0
    return float(np.mean(holding_periods_hours))


def value_at_risk(returns: list[float], confidence: float = 0.95) -> float:
    """Indice storico: floor((1-confidence)*n), con un epsilon prima del troncamento per evitare che
    un caso "esatto" come confidence=0.9/n=10 atterri a 0.999999999... per arrotondamento in virgola
    mobile di (1-0.9) e tronchi all'indice sbagliato (trovato con un test hand-computed, non ipotetico)."""
    if not returns:
        return 0.0
    sorted_returns = sorted(returns)
    index = min(max(int((1 - confidence) * len(sorted_returns) + 1e-9), 0), len(sorted_returns) - 1)
    return -sorted_returns[index]


def conditional_value_at_risk(returns: list[float], confidence: float = 0.95) -> float:
    if not returns:
        return 0.0
    threshold = value_at_risk(returns, confidence)
    tail = [r for r in returns if r <= -threshold]
    if not tail:
        return threshold
    return -float(np.mean(tail))


class BacktestMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cagr: float
    sharpe_ratio: float
    sortino_ratio: float
    max_drawdown: float
    calmar_ratio: float
    win_rate: float
    profit_factor: float
    turnover: float
    exposure: float
    average_holding_period_hours: float
    value_at_risk_95: float
    conditional_value_at_risk_95: float
    final_equity: float
    periods: int


def compute_all_metrics(equity_curve: list[float], position_fractions: list[float],
                         trade_returns: list[float], holding_periods_hours: list[float],
                         periods_per_year: float) -> BacktestMetrics:
    returns = periodic_returns(equity_curve)
    cagr_value = cagr(equity_curve, periods_per_year)
    drawdown_value = max_drawdown(equity_curve)
    return BacktestMetrics(
        cagr=cagr_value,
        sharpe_ratio=sharpe_ratio(returns, periods_per_year),
        sortino_ratio=sortino_ratio(returns, periods_per_year),
        max_drawdown=drawdown_value,
        calmar_ratio=calmar_ratio(cagr_value, drawdown_value),
        win_rate=win_rate(trade_returns),
        profit_factor=profit_factor(trade_returns),
        turnover=turnover(position_fractions),
        exposure=exposure(position_fractions),
        average_holding_period_hours=average_holding_period_hours(holding_periods_hours),
        value_at_risk_95=value_at_risk(returns),
        conditional_value_at_risk_95=conditional_value_at_risk(returns),
        final_equity=equity_curve[-1] if equity_curve else 0.0,
        periods=len(equity_curve),
    )
