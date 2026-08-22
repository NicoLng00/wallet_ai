from datetime import datetime, timedelta, timezone

import pytest

from serena.artifacts import RunArtifactWriter
from serena.backtest.engine.baselines import buy_and_hold_fraction
from serena.backtest.engine.engine import run_full_system_variant, run_price_variant, transaction_cost_fraction
from serena.backtest.walk_forward.split import NonChronologicalDataError
from serena.models.agent import AgentArchetype, AgentProfile
from serena.risk.limits.limits import RiskLimits
from serena.simulation.events.engine import EventEngine
from serena.simulation.oasis.adapter import OasisSimulationAdapter
from serena.simulation.round_loop import SimulationRoundLoop

NOW = datetime(2026, 8, 22, 12, 0, tzinfo=timezone.utc)
ASSET = "BTC/USDT"


def timestamps(n: int) -> list:
    return [NOW + timedelta(days=i) for i in range(n)]


def test_transaction_cost_hand_computed():
    """|0.3-0.1| * (5/10000) = 0.2*0.0005 = 0.0001."""
    assert transaction_cost_fraction(0.1, 0.3, cost_bps=5.0) == pytest.approx(0.0001)


def test_transaction_cost_is_zero_when_position_does_not_change():
    assert transaction_cost_fraction(0.2, 0.2) == 0.0


def test_run_price_variant_buy_and_hold_hand_computed_equity_curve():
    """closes=[100,110,121] (+10% ogni periodo), fully invested (max_position_fraction=1.0), costi
    azzerati per isolare l'aritmetica: equity attesa = 1000 * 1.10 * 1.10 = 1210.0."""
    closes = [100.0, 110.0, 121.0]
    limits = RiskLimits(max_position_fraction=1.0, max_portfolio_exposure=1.0, max_leverage=1.0)
    result = run_price_variant(
        "buy_and_hold", ASSET, timestamps(3), closes, out_of_sample_start_index=0,
        fraction_fn=lambda window, portfolio: buy_and_hold_fraction(ASSET, window, portfolio, limits),
        initial_equity=1000.0, periods_per_year=365, transaction_cost_bps=0.0,
    )
    assert result.equity_curve[0] == 1000.0
    assert result.equity_curve[-1] == pytest.approx(1210.0, rel=1e-9)
    assert result.position_fractions == [pytest.approx(1.0), pytest.approx(1.0)]


def test_run_price_variant_applies_transaction_costs():
    closes = [100.0, 110.0]
    limits = RiskLimits(max_position_fraction=1.0, max_portfolio_exposure=1.0, max_leverage=1.0)
    with_cost = run_price_variant(
        "bh", ASSET, timestamps(2), closes, 0,
        lambda window, portfolio: buy_and_hold_fraction(ASSET, window, portfolio, limits),
        1000.0, 365, transaction_cost_bps=100.0,
    )
    without_cost = run_price_variant(
        "bh", ASSET, timestamps(2), closes, 0,
        lambda window, portfolio: buy_and_hold_fraction(ASSET, window, portfolio, limits),
        1000.0, 365, transaction_cost_bps=0.0,
    )
    assert with_cost.equity_curve[-1] < without_cost.equity_curve[-1]


def test_run_price_variant_rejects_mismatched_lengths():
    with pytest.raises(ValueError):
        run_price_variant("x", ASSET, timestamps(3), [100.0, 101.0], 0, lambda w, p: 0.0, 1000.0, 365)


def test_run_price_variant_rejects_out_of_range_start_index():
    with pytest.raises(ValueError):
        run_price_variant("x", ASSET, timestamps(3), [100.0, 101.0, 102.0], 5, lambda w, p: 0.0, 1000.0, 365)


def test_run_price_variant_rejects_shuffled_timestamps():
    shuffled = timestamps(4)
    shuffled[1], shuffled[2] = shuffled[2], shuffled[1]
    with pytest.raises(NonChronologicalDataError):
        run_price_variant("x", ASSET, shuffled, [100.0, 101.0, 99.0, 103.0], 0, lambda w, p: 0.0, 1000.0, 365)


def test_run_price_variant_a_losing_short_against_an_uptrend_produces_a_metrics_object():
    closes = [100.0, 105.0, 110.0, 108.0, 115.0]
    limits = RiskLimits(max_position_fraction=0.5)
    result = run_price_variant(
        "always_short", ASSET, timestamps(5), closes, 0,
        lambda window, portfolio: -0.5, 10_000.0, 365, transaction_cost_bps=0.0,
    )
    assert result.metrics.periods == len(result.equity_curve)
    assert result.equity_curve[-1] < result.equity_curve[0]  # short costante contro un uptrend perde


# --- run_full_system_variant: nessun mock di OASIS, integrazione reale ma breve (3 periodi) --------

@pytest.mark.asyncio
async def test_run_full_system_variant_produces_a_real_equity_curve_of_the_right_length(tmp_path):
    agents = [
        AgentProfile(
            agent_id="momentum-000", archetype=AgentArchetype.MOMENTUM, identity="momentum trader",
            capital=100_000.0, risk_profile="moderate", time_horizon="6h-24h", strategy="momentum_v1",
            beliefs={ASSET: 0.5}, maximum_position=0.2, maximum_drawdown=0.15, created_at=NOW,
        ),
        AgentProfile(
            agent_id="contrarian-000", archetype=AgentArchetype.CONTRARIAN, identity="contrarian trader",
            capital=100_000.0, risk_profile="moderate", time_horizon="6h-24h", strategy="contrarian_v1",
            beliefs={ASSET: 0.5}, maximum_position=0.2, maximum_drawdown=0.15, created_at=NOW,
        ),
    ]
    closes = [100.0, 102.0, 101.0, 105.0]
    adapter = OasisSimulationAdapter(agents, platform="reddit", seed=1, database_path=tmp_path / "oasis.db")
    try:
        await adapter.initialize()
        writer = RunArtifactWriter("backtest-engine-test", root=tmp_path)
        loop = SimulationRoundLoop(agents, EventEngine(), adapter, ASSET, writer=writer)
        result = await run_full_system_variant(
            "full_system", ASSET, timestamps(4), closes, out_of_sample_start_index=0,
            loop=loop, initial_equity=10_000.0, periods_per_year=365, limits=RiskLimits(),
        )
        assert len(result.equity_curve) == 4  # equity iniziale + 3 periodi realizzati
        assert result.metrics.periods == 4
    finally:
        await adapter.close()
