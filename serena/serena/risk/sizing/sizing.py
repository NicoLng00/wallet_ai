"""Position sizing (docs/TRADING_ARCHITECTURE.md §16): funzione pura
`(risk_adjusted_signal, portfolio_state, limits) -> Position` — stesso input produce sempre lo stesso
output, indipendente da qualunque LLM (risk/ non importa mai LLMClient, verificato da
tests/test_import_graph_lint.py, non solo dichiarato).

REFERENCE_SIGNAL_MAGNITUDE e' il valore massimo teorico di risk_adjusted_signal quando confidence=1.0
e expected_return e' al suo massimo (MAX_EXPECTED_RETURN=0.05 in simulation/round_loop.py, Fase 7) —
duplicato qui come costante locale invece di importato: risk/ non dipende da simulation/ per
costruzione (la size non deve mai sapere come e' stato calcolato l'expected_return, solo la sua
scala), coerente con la separazione a livello di package dell'architettura."""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from serena.risk.limits.limits import LimitCheckResult, RiskLimits, evaluate_all_limits
from serena.risk.portfolio.portfolio import PortfolioState, Position
from serena.signals.aggregation.pipeline import RiskAdjustedSignal

REFERENCE_SIGNAL_MAGNITUDE = 0.05


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def clamp_to_limits(
    candidate_fraction: float, asset: str, portfolio: PortfolioState, limits: RiskLimits,
    asset_correlations: Optional[dict[frozenset, float]] = None,
    available_liquidity_fraction: Optional[float] = None,
) -> tuple[float, LimitCheckResult]:
    """Punto unico condiviso da size_position() e dalle baseline del backtest (Fase 10): applica lo
    STESSO controllo limiti a qualunque frazione candidata, cosi' un confronto di profittabilita' fra
    varianti non e' truccato da regole di rischio diverse (docs/TRADING_ARCHITECTURE.md §15, regola
    #8 del brief). Ritorna 0.0 (mai una size parziale che aggira il limite) se qualcosa e' violato."""
    result = evaluate_all_limits(
        portfolio, asset, candidate_fraction, limits,
        asset_correlations=asset_correlations, available_liquidity_fraction=available_liquidity_fraction,
    )
    if not result.passed:
        return 0.0, result
    return candidate_fraction, result


def size_position(
    signal: RiskAdjustedSignal, portfolio: PortfolioState, limits: RiskLimits, price: float,
    asset_correlations: Optional[dict[frozenset, float]] = None,
    available_liquidity_fraction: Optional[float] = None,
) -> tuple[float, LimitCheckResult]:
    """Ritorna la frazione di posizione candidata (0.0 se un limite la rifiuta — mai una size
    parziale che aggira il limite) e il risultato dettagliato del controllo limiti."""
    scale = limits.max_position_fraction / REFERENCE_SIGNAL_MAGNITUDE
    candidate_fraction = _clamp(signal.risk_adjusted_signal * scale, -limits.max_position_fraction, limits.max_position_fraction)
    return clamp_to_limits(
        candidate_fraction, signal.asset, portfolio, limits,
        asset_correlations=asset_correlations, available_liquidity_fraction=available_liquidity_fraction,
    )


def build_position(asset: str, fraction: float, price: float, timestamp: datetime) -> Optional[Position]:
    if fraction == 0.0:
        return None
    return Position(asset=asset, size=fraction, entry_price=price, opened_at=timestamp)
