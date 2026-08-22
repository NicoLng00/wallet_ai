"""Motore di replay walk-forward (docs/TRADING_ARCHITECTURE.md §15): decidi con i dati fino al
periodo t, realizza il rendimento fra t e t+1, mai l'inverso — la stessa disciplina no-look-ahead di
PointInTimeDataView (Fase 3) applicata al ciclo di backtest. `assert_chronological` viene chiamato
prima di processare qualunque cosa: mai un dato mescolato in ingresso.

OUR DESIGN DECISION sui costi: §15 elenca transaction cost/slippage/spread/funding/liquidity come
funzioni deterministiche pluggable. Solo il transaction cost e' implementato qui (proporzionale alla
variazione di posizione, `DEFAULT_TRANSACTION_COST_BPS`) — slippage/spread/funding/liquidity
richiederebbero dati (order-book, funding rate) che la Fase 3 non copre (CoinGecko OHLC-only,
verificato li'); dichiarato esplicitamente come non ancora modellato, non finto a zero per omissione
silenziosa.

Mark-to-market semplificato: l'equity per periodo e' calcolata da fraction * rendimento del prezzo
(compounding diretto), non da un tracking di entry/exit price per-trade — sufficiente per la metrica
di portafoglio (docs/IMPLEMENTATION_PLAN.md Fase 10), rivedibile se un giorno servisse un ledger di
trade individuali."""
from __future__ import annotations
from datetime import datetime
from typing import Callable

from pydantic import BaseModel, ConfigDict, Field

from serena.backtest.metrics.metrics import BacktestMetrics, compute_all_metrics
from serena.backtest.walk_forward.split import assert_chronological
from serena.risk.limits.limits import RiskLimits
from serena.risk.portfolio.portfolio import PortfolioState, apply_fill, fresh_portfolio
from serena.simulation.round_loop import SimulationRoundLoop

DEFAULT_TRANSACTION_COST_BPS = 5.0

FractionFn = Callable[[list[float], PortfolioState], float]


def transaction_cost_fraction(previous_fraction: float, new_fraction: float,
                               cost_bps: float = DEFAULT_TRANSACTION_COST_BPS) -> float:
    return abs(new_fraction - previous_fraction) * (cost_bps / 10_000.0)


class VariantResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    variant_name: str = Field(min_length=1)
    equity_curve: list[float]
    position_fractions: list[float]
    metrics: BacktestMetrics


def run_price_variant(
    variant_name: str, asset: str, timestamps: list[datetime], closes: list[float],
    out_of_sample_start_index: int, fraction_fn: FractionFn, initial_equity: float,
    periods_per_year: float, transaction_cost_bps: float = DEFAULT_TRANSACTION_COST_BPS,
) -> VariantResult:
    if len(timestamps) != len(closes):
        raise ValueError("timestamps e closes devono avere la stessa lunghezza")
    if out_of_sample_start_index < 0 or out_of_sample_start_index >= len(closes) - 1:
        raise ValueError("out_of_sample_start_index fuori range: serve almeno un periodo da realizzare")
    assert_chronological(timestamps)

    equity = initial_equity
    peak_equity = initial_equity
    portfolio = fresh_portfolio(initial_equity, timestamps[out_of_sample_start_index])
    previous_fraction = 0.0

    equity_curve = [equity]
    fractions: list[float] = []
    trade_returns: list[float] = []

    for i in range(out_of_sample_start_index, len(closes) - 1):
        window = closes[: i + 1]  # mai oltre i: nessun dato futuro rispetto alla decisione di questo periodo
        fraction = fraction_fn(window, portfolio)
        period_return = (closes[i + 1] - closes[i]) / closes[i]
        cost = transaction_cost_fraction(previous_fraction, fraction, transaction_cost_bps)
        net_return = fraction * period_return - cost
        equity = equity * (1 + net_return)
        peak_equity = max(peak_equity, equity)

        portfolio = apply_fill(portfolio, asset, fraction, closes[i + 1], timestamps[i + 1])
        portfolio = portfolio.model_copy(update={"equity": equity, "peak_equity": peak_equity, "daily_pnl": equity * net_return})

        equity_curve.append(equity)
        fractions.append(fraction)
        trade_returns.append(net_return)
        previous_fraction = fraction

    metrics = compute_all_metrics(equity_curve, fractions, trade_returns, [], periods_per_year)
    return VariantResult(variant_name=variant_name, equity_curve=equity_curve, position_fractions=fractions, metrics=metrics)


async def run_full_system_variant(
    variant_name: str, asset: str, timestamps: list[datetime], closes: list[float],
    out_of_sample_start_index: int, loop: SimulationRoundLoop, initial_equity: float,
    periods_per_year: float, limits: RiskLimits, transaction_cost_bps: float = DEFAULT_TRANSACTION_COST_BPS,
) -> VariantResult:
    """Come run_price_variant, ma la frazione per periodo viene dal sistema completo reale (Fasi 5-9:
    agenti + OASIS + segnali + risk) invece che da una regola di prezzo — l'unica variante che fa
    girare per davvero SimulationRoundLoop, quindi la piu' lenta (overhead reale di OASIS/sqlite per
    periodo)."""
    from serena.risk.sizing.sizing import size_position
    from serena.signals.aggregation.pipeline import compute_risk_adjusted_signal

    if len(timestamps) != len(closes):
        raise ValueError("timestamps e closes devono avere la stessa lunghezza")
    assert_chronological(timestamps)

    equity = initial_equity
    peak_equity = initial_equity
    portfolio = fresh_portfolio(initial_equity, timestamps[out_of_sample_start_index])
    previous_fraction = 0.0

    equity_curve = [equity]
    fractions: list[float] = []
    trade_returns: list[float] = []
    history = []

    for round_index, i in enumerate(range(out_of_sample_start_index, len(closes) - 1)):
        window = closes[: i + 1]
        outcome = await loop.run_round(round_index, timestamps[i], recent_closes=window)
        history.extend(outcome.decisions)
        signal = compute_risk_adjusted_signal(history, outcome.decisions, asset, timestamps[i])
        fraction, _ = size_position(signal, portfolio, limits, price=closes[i])

        period_return = (closes[i + 1] - closes[i]) / closes[i]
        cost = transaction_cost_fraction(previous_fraction, fraction, transaction_cost_bps)
        net_return = fraction * period_return - cost
        equity = equity * (1 + net_return)
        peak_equity = max(peak_equity, equity)

        portfolio = apply_fill(portfolio, asset, fraction, closes[i + 1], timestamps[i + 1])
        portfolio = portfolio.model_copy(update={"equity": equity, "peak_equity": peak_equity, "daily_pnl": equity * net_return})

        equity_curve.append(equity)
        fractions.append(fraction)
        trade_returns.append(net_return)
        previous_fraction = fraction

    metrics = compute_all_metrics(equity_curve, fractions, trade_returns, [], periods_per_year)
    return VariantResult(variant_name=variant_name, equity_curve=equity_curve, position_fractions=fractions, metrics=metrics)
