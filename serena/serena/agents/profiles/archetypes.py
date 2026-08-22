"""Profile prior per archetipo (docs/TRADING_ARCHITECTURE.md §6, punto 1): range ragionevoli di
default per i coefficienti comportamentali di ogni AgentProfile, usati sia come base per la
generazione deterministica (agents/profiles/generator.py) sia come fallback quando una chiamata LLM
fallisce dopo il retry (mai un fallback a `random`, per costruzione: si campiona sempre da QUESTI
range noti, mai da un intervallo arbitrario)."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from serena.models.agent import AgentArchetype


class Range(BaseModel):
    model_config = ConfigDict(extra="forbid")

    low: float = Field(ge=0.0, le=1.0)
    high: float = Field(ge=0.0, le=1.0)


class ArchetypePrior(BaseModel):
    model_config = ConfigDict(extra="forbid")

    risk_profile: str
    time_horizon: str
    capital_low: float = Field(gt=0.0)
    capital_high: float = Field(gt=0.0)
    social_influence: Range
    information_sensitivity: Range
    herding_coefficient: Range
    contrarian_coefficient: Range
    news_sensitivity: Range
    risk_aversion: Range
    maximum_position: Range
    maximum_drawdown: Range


ARCHETYPE_PRIORS: dict[AgentArchetype, ArchetypePrior] = {
    AgentArchetype.MOMENTUM: ArchetypePrior(
        risk_profile="moderate", time_horizon="6h-24h", capital_low=50_000, capital_high=500_000,
        social_influence=Range(low=0.3, high=0.6), information_sensitivity=Range(low=0.5, high=0.8),
        herding_coefficient=Range(low=0.4, high=0.7), contrarian_coefficient=Range(low=0.0, high=0.2),
        news_sensitivity=Range(low=0.4, high=0.7), risk_aversion=Range(low=0.3, high=0.5),
        maximum_position=Range(low=0.15, high=0.3), maximum_drawdown=Range(low=0.1, high=0.2),
    ),
    AgentArchetype.MEAN_REVERSION: ArchetypePrior(
        risk_profile="moderate", time_horizon="1h-6h", capital_low=50_000, capital_high=400_000,
        social_influence=Range(low=0.2, high=0.4), information_sensitivity=Range(low=0.4, high=0.6),
        herding_coefficient=Range(low=0.1, high=0.3), contrarian_coefficient=Range(low=0.5, high=0.8),
        news_sensitivity=Range(low=0.2, high=0.4), risk_aversion=Range(low=0.4, high=0.6),
        maximum_position=Range(low=0.1, high=0.25), maximum_drawdown=Range(low=0.1, high=0.15),
    ),
    AgentArchetype.MACRO: ArchetypePrior(
        risk_profile="conservative", time_horizon="1d-7d", capital_low=200_000, capital_high=2_000_000,
        social_influence=Range(low=0.1, high=0.3), information_sensitivity=Range(low=0.6, high=0.9),
        herding_coefficient=Range(low=0.1, high=0.3), contrarian_coefficient=Range(low=0.2, high=0.4),
        news_sensitivity=Range(low=0.6, high=0.9), risk_aversion=Range(low=0.5, high=0.7),
        maximum_position=Range(low=0.1, high=0.2), maximum_drawdown=Range(low=0.05, high=0.15),
    ),
    AgentArchetype.FUNDAMENTAL: ArchetypePrior(
        risk_profile="conservative", time_horizon="1d-7d", capital_low=150_000, capital_high=1_500_000,
        social_influence=Range(low=0.1, high=0.3), information_sensitivity=Range(low=0.6, high=0.9),
        herding_coefficient=Range(low=0.1, high=0.3), contrarian_coefficient=Range(low=0.2, high=0.4),
        news_sensitivity=Range(low=0.5, high=0.8), risk_aversion=Range(low=0.4, high=0.6),
        maximum_position=Range(low=0.15, high=0.3), maximum_drawdown=Range(low=0.1, high=0.2),
    ),
    AgentArchetype.NEWS: ArchetypePrior(
        risk_profile="aggressive", time_horizon="1h-6h", capital_low=30_000, capital_high=300_000,
        social_influence=Range(low=0.4, high=0.7), information_sensitivity=Range(low=0.7, high=1.0),
        herding_coefficient=Range(low=0.3, high=0.5), contrarian_coefficient=Range(low=0.0, high=0.2),
        news_sensitivity=Range(low=0.8, high=1.0), risk_aversion=Range(low=0.2, high=0.4),
        maximum_position=Range(low=0.1, high=0.25), maximum_drawdown=Range(low=0.15, high=0.25),
    ),
    AgentArchetype.CONTRARIAN: ArchetypePrior(
        risk_profile="aggressive", time_horizon="1h-6h", capital_low=40_000, capital_high=350_000,
        social_influence=Range(low=0.1, high=0.3), information_sensitivity=Range(low=0.4, high=0.6),
        herding_coefficient=Range(low=0.0, high=0.2), contrarian_coefficient=Range(low=0.7, high=1.0),
        news_sensitivity=Range(low=0.3, high=0.5), risk_aversion=Range(low=0.3, high=0.5),
        maximum_position=Range(low=0.1, high=0.2), maximum_drawdown=Range(low=0.15, high=0.25),
    ),
    AgentArchetype.RETAIL: ArchetypePrior(
        risk_profile="aggressive", time_horizon="1h-24h", capital_low=1_000, capital_high=20_000,
        social_influence=Range(low=0.6, high=0.9), information_sensitivity=Range(low=0.3, high=0.5),
        herding_coefficient=Range(low=0.6, high=0.9), contrarian_coefficient=Range(low=0.0, high=0.2),
        news_sensitivity=Range(low=0.6, high=0.9), risk_aversion=Range(low=0.1, high=0.3),
        maximum_position=Range(low=0.2, high=0.4), maximum_drawdown=Range(low=0.2, high=0.4),
    ),
    AgentArchetype.WHALE: ArchetypePrior(
        risk_profile="conservative", time_horizon="1d-30d", capital_low=5_000_000, capital_high=50_000_000,
        social_influence=Range(low=0.0, high=0.1), information_sensitivity=Range(low=0.5, high=0.7),
        herding_coefficient=Range(low=0.0, high=0.1), contrarian_coefficient=Range(low=0.2, high=0.4),
        news_sensitivity=Range(low=0.2, high=0.4), risk_aversion=Range(low=0.5, high=0.7),
        maximum_position=Range(low=0.05, high=0.15), maximum_drawdown=Range(low=0.05, high=0.1),
    ),
    AgentArchetype.MARKET_MAKER: ArchetypePrior(
        risk_profile="conservative", time_horizon="1m-1h", capital_low=500_000, capital_high=5_000_000,
        social_influence=Range(low=0.0, high=0.1), information_sensitivity=Range(low=0.7, high=0.9),
        herding_coefficient=Range(low=0.0, high=0.1), contrarian_coefficient=Range(low=0.4, high=0.6),
        news_sensitivity=Range(low=0.1, high=0.3), risk_aversion=Range(low=0.6, high=0.8),
        maximum_position=Range(low=0.02, high=0.08), maximum_drawdown=Range(low=0.03, high=0.08),
    ),
    AgentArchetype.QUANT: ArchetypePrior(
        risk_profile="moderate", time_horizon="1h-24h", capital_low=300_000, capital_high=3_000_000,
        social_influence=Range(low=0.0, high=0.1), information_sensitivity=Range(low=0.6, high=0.9),
        herding_coefficient=Range(low=0.0, high=0.2), contrarian_coefficient=Range(low=0.3, high=0.5),
        news_sensitivity=Range(low=0.3, high=0.5), risk_aversion=Range(low=0.4, high=0.6),
        maximum_position=Range(low=0.1, high=0.2), maximum_drawdown=Range(low=0.08, high=0.15),
    ),
    AgentArchetype.TREND_FOLLOWER: ArchetypePrior(
        risk_profile="moderate", time_horizon="6h-7d", capital_low=100_000, capital_high=800_000,
        social_influence=Range(low=0.3, high=0.6), information_sensitivity=Range(low=0.4, high=0.6),
        herding_coefficient=Range(low=0.5, high=0.8), contrarian_coefficient=Range(low=0.0, high=0.15),
        news_sensitivity=Range(low=0.3, high=0.5), risk_aversion=Range(low=0.3, high=0.5),
        maximum_position=Range(low=0.15, high=0.3), maximum_drawdown=Range(low=0.1, high=0.2),
    ),
    AgentArchetype.LONG_TERM_HOLDER: ArchetypePrior(
        risk_profile="conservative", time_horizon="30d-365d", capital_low=50_000, capital_high=1_000_000,
        social_influence=Range(low=0.1, high=0.3), information_sensitivity=Range(low=0.2, high=0.4),
        herding_coefficient=Range(low=0.1, high=0.3), contrarian_coefficient=Range(low=0.3, high=0.5),
        news_sensitivity=Range(low=0.1, high=0.3), risk_aversion=Range(low=0.6, high=0.8),
        maximum_position=Range(low=0.2, high=0.4), maximum_drawdown=Range(low=0.15, high=0.3),
    ),
}

assert set(ARCHETYPE_PRIORS.keys()) == set(AgentArchetype), "ogni archetipo del brief deve avere un prior"
