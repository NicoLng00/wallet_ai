"""Limiti di rischio deterministici (docs/TRADING_ARCHITECTURE.md §16): max position, max exposure,
max leverage, max daily loss, max drawdown, correlazione, liquidita'. Ogni check e' una funzione pura
indipendente — nessuna dipende dalle altre — cosi' ognuna e' testabile isolatamente con un fixture
dedicato (docs/IMPLEMENTATION_PLAN.md, Fase 9).

OUR DESIGN DECISION sul limite di liquidita': l'architettura lo elenca insieme agli altri, ma nessuna
fonte di order-book/profondita' di mercato e' stata costruita finora (Fase 3 copre solo OHLC, §4).
`check_liquidity_limit` esiste con la firma corretta ma richiede esplicitamente un
`available_liquidity_fraction` fornito dal chiamante — se non fornito (None), il check e' saltato e
dichiarato tale nel risultato, mai finto con un valore inventato."""
from __future__ import annotations
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from serena.risk.portfolio.portfolio import PortfolioState, gross_exposure


class RiskLimits(BaseModel):
    model_config = ConfigDict(extra="forbid")

    max_position_fraction: float = Field(gt=0.0, le=1.0, default=0.2)
    max_portfolio_exposure: float = Field(gt=0.0, le=1.0, default=0.6)
    max_leverage: float = Field(ge=1.0, default=1.0)
    max_daily_loss_fraction: float = Field(gt=0.0, le=1.0, default=0.05)
    max_drawdown_fraction: float = Field(gt=0.0, le=1.0, default=0.2)
    correlation_limit: float = Field(gt=0.0, le=1.0, default=0.7)


class LimitCheckResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    passed: bool
    violated_limits: list[str] = Field(default_factory=list)


def check_max_position(candidate_fraction: float, limits: RiskLimits) -> Optional[str]:
    return "max_position" if abs(candidate_fraction) > limits.max_position_fraction else None


def check_max_portfolio_exposure(portfolio: PortfolioState, candidate_asset: str, candidate_fraction: float,
                                  limits: RiskLimits) -> Optional[str]:
    total = gross_exposure(portfolio, exclude_asset=candidate_asset) + abs(candidate_fraction)
    return "max_portfolio_exposure" if total > limits.max_portfolio_exposure else None


def check_max_leverage(portfolio: PortfolioState, candidate_asset: str, candidate_fraction: float,
                        limits: RiskLimits) -> Optional[str]:
    total = gross_exposure(portfolio, exclude_asset=candidate_asset) + abs(candidate_fraction)
    return "max_leverage" if total > limits.max_leverage else None


def check_max_daily_loss(portfolio: PortfolioState, limits: RiskLimits) -> Optional[str]:
    if portfolio.daily_pnl >= 0:
        return None
    loss_fraction = -portfolio.daily_pnl / portfolio.equity
    return "max_daily_loss" if loss_fraction > limits.max_daily_loss_fraction else None


def check_max_drawdown(portfolio: PortfolioState, limits: RiskLimits) -> Optional[str]:
    if portfolio.peak_equity <= 0:
        return None
    drawdown = (portfolio.peak_equity - portfolio.equity) / portfolio.peak_equity
    return "max_drawdown" if drawdown > limits.max_drawdown_fraction else None


def check_correlation_limit(portfolio: PortfolioState, candidate_asset: str, candidate_fraction: float,
                             asset_correlations: dict[frozenset, float], limits: RiskLimits) -> Optional[str]:
    """asset_correlations: {frozenset({asset_a, asset_b}): pearson_correlation}. Rifiuta una nuova
    posizione nella STESSA direzione di una posizione esistente su un asset fortemente correlato —
    stesso principio di AgentPredictionMatrix (Fase 8, §14) applicato agli asset invece che agli
    agenti, con la propria implementazione dedicata (la forma dei dati e' diversa: coppie di asset
    con una correlazione nota, non serie storiche di AgentDecision da correlare internamente)."""
    if candidate_fraction == 0.0:
        return None
    for other_asset, position in portfolio.positions.items():
        if other_asset == candidate_asset or position.size == 0.0:
            continue
        correlation = asset_correlations.get(frozenset({candidate_asset, other_asset}))
        if correlation is None:
            continue
        same_direction = (candidate_fraction > 0) == (position.size > 0)
        if same_direction and correlation >= limits.correlation_limit:
            return "correlation_limit"
    return None


def check_liquidity_limit(candidate_fraction: float, available_liquidity_fraction: Optional[float]) -> Optional[str]:
    if available_liquidity_fraction is None:
        return None  # nessuna fonte di liquidita' collegata (Fase 3 non copre order-book): non verificabile, non finto
    return "liquidity_limit" if abs(candidate_fraction) > available_liquidity_fraction else None


def evaluate_all_limits(
    portfolio: PortfolioState, candidate_asset: str, candidate_fraction: float, limits: RiskLimits,
    asset_correlations: Optional[dict[frozenset, float]] = None,
    available_liquidity_fraction: Optional[float] = None,
) -> LimitCheckResult:
    checks = [
        check_max_position(candidate_fraction, limits),
        check_max_portfolio_exposure(portfolio, candidate_asset, candidate_fraction, limits),
        check_max_leverage(portfolio, candidate_asset, candidate_fraction, limits),
        check_max_daily_loss(portfolio, limits),
        check_max_drawdown(portfolio, limits),
        check_correlation_limit(portfolio, candidate_asset, candidate_fraction, asset_correlations or {}, limits),
        check_liquidity_limit(candidate_fraction, available_liquidity_fraction),
    ]
    violations = [violation for violation in checks if violation is not None]
    return LimitCheckResult(passed=not violations, violated_limits=violations)
