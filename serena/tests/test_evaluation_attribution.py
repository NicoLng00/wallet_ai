from datetime import datetime, timezone

import pytest

from serena.evaluation.agent_scoring.outcomes import AgentOutcome
from serena.evaluation.attribution.attribution import attribute_by_archetype, attribute_portfolio_pnl

NOW = datetime(2026, 8, 22, 12, 0, tzinfo=timezone.utc)
ASSET = "BTC/USDT"


def make_outcome(agent_id: str, action: str, realized_return: float) -> AgentOutcome:
    return AgentOutcome(
        agent_id=agent_id, asset=ASSET, decision_timestamp=NOW, action=action,
        predicted_expected_return=0.0, confidence=0.6, realized_return=realized_return,
    )


def test_attribution_is_empty_for_no_outcomes():
    assert attribute_portfolio_pnl([], 0.05) == {}


def test_attribution_reconciles_exactly_to_the_portfolio_realized_return():
    """La riconciliazione richiesta esplicitamente da docs/IMPLEMENTATION_PLAN.md Fase 11: la somma
    delle attribuzioni per agente deve tornare ESATTAMENTE al PnL di portafoglio, non approssimarlo."""
    outcomes = [
        make_outcome("a", "BUY", 0.05),
        make_outcome("b", "SELL", -0.02),
        make_outcome("c", "BUY", 0.01),
    ]
    result = attribute_portfolio_pnl(outcomes, portfolio_realized_return=0.034)
    assert sum(result.values()) == pytest.approx(0.034, abs=1e-12)


def test_attribution_is_proportional_to_raw_contribution():
    outcomes = [make_outcome("big", "BUY", 0.10), make_outcome("small", "BUY", 0.05)]
    result = attribute_portfolio_pnl(outcomes, portfolio_realized_return=0.03)
    assert result["big"] == pytest.approx(result["small"] * 2, rel=1e-9)


def test_attribution_sums_multiple_outcomes_per_agent_before_scaling():
    outcomes = [make_outcome("a", "BUY", 0.05), make_outcome("a", "BUY", 0.05), make_outcome("b", "SELL", -0.02)]
    result = attribute_portfolio_pnl(outcomes, portfolio_realized_return=0.08)
    assert set(result.keys()) == {"a", "b"}
    assert sum(result.values()) == pytest.approx(0.08, abs=1e-12)


def test_attribution_falls_back_to_uniform_split_when_raw_contributions_cancel_out():
    """agent 'long' e 'short' si annullano esattamente (contributo grezzo totale = 0) ma il
    portafoglio ha comunque realizzato un rendimento non nullo (es. per i costi di transazione) —
    l'attribuzione deve comunque riconciliare, non dividere per zero."""
    outcomes = [make_outcome("long", "BUY", 0.05), make_outcome("short", "SELL", 0.05)]
    result = attribute_portfolio_pnl(outcomes, portfolio_realized_return=-0.001)
    assert sum(result.values()) == pytest.approx(-0.001, abs=1e-12)
    assert result["long"] == pytest.approx(result["short"])


def test_attribute_by_archetype_aggregates_agents_of_the_same_archetype():
    outcomes = [
        make_outcome("momentum-000", "BUY", 0.05),
        make_outcome("momentum-001", "BUY", 0.03),
        make_outcome("contrarian-000", "SELL", -0.02),
    ]
    archetypes = {"momentum-000": "momentum", "momentum-001": "momentum", "contrarian-000": "contrarian"}
    result = attribute_by_archetype(outcomes, archetypes, portfolio_realized_return=0.06)
    assert set(result.keys()) == {"momentum", "contrarian"}
    assert sum(result.values()) == pytest.approx(0.06, abs=1e-12)


def test_attribute_by_archetype_uses_unknown_for_unmapped_agents():
    outcomes = [make_outcome("mystery-agent", "BUY", 0.05)]
    result = attribute_by_archetype(outcomes, {}, portfolio_realized_return=0.05)
    assert "unknown" in result
