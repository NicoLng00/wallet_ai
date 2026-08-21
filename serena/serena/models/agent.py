"""AgentProfile (docs/TRADING_ARCHITECTURE.md §6) — a differenza di MiroFish, dove i profili sono
rigenerati da zero (e non deterministicamente, vedi docs/MIROFISH_REVERSE_ENGINEERING.md §A.4/A.12)
ad ogni simulazione, qui agent_id e' un'identita' persistente tra run diversi (regola esplicita del
brief: "every agent must have a persistent identity")."""
from __future__ import annotations
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AgentArchetype(str, Enum):
    MOMENTUM = "momentum"
    MEAN_REVERSION = "mean_reversion"
    MACRO = "macro"
    FUNDAMENTAL = "fundamental"
    NEWS = "news"
    CONTRARIAN = "contrarian"
    RETAIL = "retail"
    WHALE = "whale"
    MARKET_MAKER = "market_maker"
    QUANT = "quant"
    TREND_FOLLOWER = "trend_follower"
    LONG_TERM_HOLDER = "long_term_holder"


class AgentProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    agent_id: str = Field(min_length=1)
    archetype: AgentArchetype
    identity: str = Field(min_length=1)
    capital: float = Field(gt=0)
    risk_profile: str = Field(min_length=1)
    time_horizon: str = Field(min_length=1)
    strategy: str = Field(min_length=1)
    beliefs: dict[str, float] = Field(default_factory=dict)
    information_sources: list[str] = Field(default_factory=list)
    behavioral_biases: list[str] = Field(default_factory=list)
    social_influence: float = Field(ge=0.0, le=1.0, default=0.5)
    information_sensitivity: float = Field(ge=0.0, le=1.0, default=0.5)
    herding_coefficient: float = Field(ge=0.0, le=1.0, default=0.5)
    contrarian_coefficient: float = Field(ge=0.0, le=1.0, default=0.5)
    news_sensitivity: float = Field(ge=0.0, le=1.0, default=0.5)
    risk_aversion: float = Field(ge=0.0, le=1.0, default=0.5)
    maximum_position: float = Field(gt=0.0, le=1.0)
    maximum_drawdown: float = Field(gt=0.0, le=1.0)
    preferred_assets: list[str] = Field(default_factory=list)
    created_at: datetime

    @field_validator("beliefs")
    @classmethod
    def _beliefs_in_range(cls, v: dict[str, float]) -> dict[str, float]:
        for asset, belief in v.items():
            if not 0.0 <= belief <= 1.0:
                raise ValueError(f"belief per {asset} fuori range [0,1]: {belief}")
        return v
