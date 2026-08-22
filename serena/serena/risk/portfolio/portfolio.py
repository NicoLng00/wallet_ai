"""Stato del portafoglio paper (docs/TRADING_ARCHITECTURE.md §16) — dimensioni delle posizioni come
frazione dell'equity (coerente con AgentProfile.maximum_position, gia' una frazione [0,1]), mai un
notional assoluto: rende i limiti di rischio comparabili indipendentemente dal capitale del run.
`apply_fill` e' una funzione pura, mai una mutazione in place — lo stesso principio del resto del
progetto (mai stato nascosto, ogni transizione e' un nuovo oggetto)."""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Position(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset: str = Field(min_length=1)
    size: float  # frazione dell'equity, con segno: positivo = long, negativo = short
    entry_price: float = Field(gt=0.0)
    opened_at: datetime


class PortfolioState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    equity: float = Field(gt=0.0)
    peak_equity: float = Field(gt=0.0)
    daily_pnl: float = 0.0
    positions: dict[str, Position] = Field(default_factory=dict)
    timestamp: datetime

    @model_validator(mode="after")
    def _peak_is_never_below_current_equity(self) -> "PortfolioState":
        if self.peak_equity < self.equity:
            raise ValueError("peak_equity non puo' essere inferiore all'equity corrente")
        return self


def fresh_portfolio(equity: float, timestamp: datetime) -> PortfolioState:
    return PortfolioState(equity=equity, peak_equity=equity, daily_pnl=0.0, positions={}, timestamp=timestamp)


def gross_exposure(portfolio: PortfolioState, exclude_asset: Optional[str] = None) -> float:
    return sum(abs(position.size) for asset, position in portfolio.positions.items() if asset != exclude_asset)


def apply_fill(portfolio: PortfolioState, asset: str, new_fraction: float, price: float, timestamp: datetime) -> PortfolioState:
    positions = dict(portfolio.positions)
    if new_fraction == 0.0:
        positions.pop(asset, None)
    else:
        positions[asset] = Position(asset=asset, size=new_fraction, entry_price=price, opened_at=timestamp)
    return portfolio.model_copy(update={"positions": positions, "timestamp": timestamp})
