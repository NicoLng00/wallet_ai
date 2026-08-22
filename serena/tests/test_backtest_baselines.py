from datetime import datetime, timezone

import numpy as np
import pytest

from serena.backtest.engine.baselines import (
    NoSocialAgentBacktester,
    buy_and_hold_fraction,
    mean_reversion_fraction,
    momentum_fraction,
    random_fraction,
)
from serena.models.agent import AgentArchetype, AgentProfile
from serena.risk.limits.limits import RiskLimits
from serena.risk.portfolio.portfolio import apply_fill, fresh_portfolio

NOW = datetime(2026, 8, 22, 12, 0, tzinfo=timezone.utc)
ASSET = "BTC/USDT"
UPTREND = [100.0 + i for i in range(15)]
DOWNTREND = [100.0 - i for i in range(15)]


def make_agent(agent_id: str, archetype: AgentArchetype) -> AgentProfile:
    return AgentProfile(
        agent_id=agent_id, archetype=archetype, identity=f"{archetype.value} {agent_id}", capital=100_000.0,
        risk_profile="moderate", time_horizon="6h-24h", strategy=f"{archetype.value}_v1",
        beliefs={ASSET: 0.5}, maximum_position=0.2, maximum_drawdown=0.15, created_at=NOW,
    )


def test_buy_and_hold_uses_the_full_max_position_fraction_when_unconstrained():
    portfolio = fresh_portfolio(100_000.0, NOW)
    limits = RiskLimits(max_position_fraction=0.3)
    assert buy_and_hold_fraction(ASSET, UPTREND, portfolio, limits) == pytest.approx(0.3)


def test_buy_and_hold_is_zeroed_out_when_it_would_violate_exposure():
    portfolio = apply_fill(fresh_portfolio(100_000.0, NOW), "ETH/USDT", 0.55, 3_000.0, NOW)
    limits = RiskLimits(max_position_fraction=0.3, max_portfolio_exposure=0.6)
    assert buy_and_hold_fraction(ASSET, UPTREND, portfolio, limits) == 0.0


def test_momentum_fraction_is_positive_after_an_uptrend():
    portfolio = fresh_portfolio(100_000.0, NOW)
    assert momentum_fraction(ASSET, UPTREND, portfolio, RiskLimits()) > 0.0


def test_momentum_fraction_is_negative_after_a_downtrend():
    portfolio = fresh_portfolio(100_000.0, NOW)
    assert momentum_fraction(ASSET, DOWNTREND, portfolio, RiskLimits()) < 0.0


def test_mean_reversion_fraction_is_opposite_sign_of_momentum_on_the_same_series():
    portfolio = fresh_portfolio(100_000.0, NOW)
    limits = RiskLimits()
    assert mean_reversion_fraction(ASSET, UPTREND, portfolio, limits) < 0.0 < momentum_fraction(ASSET, UPTREND, portfolio, limits)


def test_random_fraction_is_deterministic_for_the_same_seed():
    portfolio = fresh_portfolio(100_000.0, NOW)
    limits = RiskLimits(max_position_fraction=0.2)
    sequence_a = [random_fraction(ASSET, np.random.default_rng(7), portfolio, limits) for _ in range(5)]
    sequence_b = [random_fraction(ASSET, np.random.default_rng(7), portfolio, limits) for _ in range(5)]
    assert sequence_a == sequence_b


def test_random_fraction_stays_within_max_position_bounds():
    portfolio = fresh_portfolio(100_000.0, NOW)
    limits = RiskLimits(max_position_fraction=0.2)
    rng = np.random.default_rng(1)
    for _ in range(50):
        fraction = random_fraction(ASSET, rng, portfolio, limits)
        assert -0.2 <= fraction <= 0.2


# --- NoSocialAgentBacktester ----------------------------------------------------------------------

def test_no_social_backtester_rejects_empty_agents():
    with pytest.raises(ValueError):
        NoSocialAgentBacktester([], ASSET, RiskLimits())


def test_no_social_backtester_single_agent_produces_a_bounded_fraction():
    backtester = NoSocialAgentBacktester([make_agent("solo", AgentArchetype.MOMENTUM)], ASSET, RiskLimits(max_position_fraction=0.2))
    portfolio = fresh_portfolio(100_000.0, NOW)
    fraction = backtester.step(NOW, UPTREND, portfolio)
    assert -0.2 <= fraction <= 0.2


def test_no_social_backtester_multi_agent_is_deterministic_across_independent_runs():
    agents = [make_agent("a", AgentArchetype.MOMENTUM), make_agent("b", AgentArchetype.CONTRARIAN)]
    portfolio = fresh_portfolio(100_000.0, NOW)

    backtester_a = NoSocialAgentBacktester(agents, ASSET, RiskLimits())
    backtester_b = NoSocialAgentBacktester(agents, ASSET, RiskLimits())
    assert backtester_a.step(NOW, UPTREND, portfolio) == backtester_b.step(NOW, UPTREND, portfolio)


def test_no_social_backtester_reacts_to_a_trend_over_multiple_steps():
    agents = [make_agent("a", AgentArchetype.MOMENTUM)]
    backtester = NoSocialAgentBacktester(agents, ASSET, RiskLimits(max_position_fraction=0.3))
    portfolio = fresh_portfolio(100_000.0, NOW)
    fractions = [backtester.step(NOW, UPTREND[: 10 + i], portfolio) for i in range(5)]
    assert all(-0.3 <= f <= 0.3 for f in fractions)
