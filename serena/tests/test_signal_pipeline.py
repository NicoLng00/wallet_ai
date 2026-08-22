from datetime import datetime, timezone

import pytest

from serena.models.decision import AgentDecision
from serena.signals.aggregation.pipeline import compute_risk_adjusted_signal

NOW = datetime(2026, 8, 22, 12, 0, tzinfo=timezone.utc)
ASSET = "BTC/USDT"


def decision(agent_id: str, action: str, confidence: float, expected_return: float) -> AgentDecision:
    return AgentDecision(
        agent_id=agent_id, timestamp=NOW, action=action, asset=ASSET, confidence=confidence,
        expected_return=expected_return, time_horizon_hours=24, reasoning_summary="test fixture",
        information_used=[], belief_update={},
    )


def test_hand_constructed_two_agent_signal_matches_expected_values():
    """Calcolo a mano (nessun altro agente storico, campione singolo -> independence_score=1 per
    entrambi, NeutralAgentScoreProvider -> gli altri 4 fattori sono 1 per costruzione):
    peso_buy = 0.8, peso_sell = 0.2, totale = 1.0
    consensus = (0.8*1 + 0.2*-1) / 1.0 = 0.6
    expected_return = (0.8*0.05 + 0.2*-0.02) / 1.0 = 0.036
    accordo (segno consensus=+1): solo l'agente BUY concorda -> agreement_ratio = 0.8
    confidence media pesata = (0.8*0.8 + 0.2*0.2) / 1.0 = 0.68
    confidence = 0.8 * 0.68 = 0.544
    risk_adjusted_signal = 0.036 * 0.544 = 0.019584
    """
    decisions = [decision("buyer", "BUY", 0.8, 0.05), decision("seller", "SELL", 0.2, -0.02)]
    signal = compute_risk_adjusted_signal(decisions, decisions, ASSET, NOW)

    assert signal.independent_consensus == pytest.approx(0.6, abs=1e-9)
    assert signal.expected_return == pytest.approx(0.036, abs=1e-9)
    assert signal.confidence == pytest.approx(0.544, abs=1e-9)
    assert signal.risk_adjusted_signal == pytest.approx(0.019584, abs=1e-9)
    assert signal.contributing_agents == 2
    assert signal.effective_sample_size == pytest.approx(2.0)


def test_unanimous_hold_yields_zero_consensus_and_zero_expected_return():
    decisions = [decision("a", "HOLD", 0.5, 0.0), decision("b", "HOLD", 0.5, 0.0)]
    signal = compute_risk_adjusted_signal(decisions, decisions, ASSET, NOW)
    assert signal.independent_consensus == 0.0
    assert signal.expected_return == 0.0
    assert signal.risk_adjusted_signal == 0.0


def test_rejects_empty_current_round_decisions():
    with pytest.raises(ValueError):
        compute_risk_adjusted_signal([decision("a", "BUY", 0.5, 0.01)], [], ASSET, NOW)


def test_rejects_decisions_for_a_different_asset():
    wrong_asset_decision = decision("a", "BUY", 0.5, 0.01).model_copy(update={"asset": "ETH/USDT"})
    with pytest.raises(ValueError):
        compute_risk_adjusted_signal([wrong_asset_decision], [wrong_asset_decision], ASSET, NOW)


def test_all_zero_confidence_falls_back_to_uniform_weights_instead_of_crashing():
    decisions = [decision("a", "BUY", 0.0, 0.02), decision("b", "SELL", 0.0, -0.02)]
    signal = compute_risk_adjusted_signal(decisions, decisions, ASSET, NOW)
    assert signal.independent_consensus == pytest.approx(0.0, abs=1e-9)  # si annullano, pesi uguali
    assert signal.confidence == 0.0  # confidence media reale e' comunque zero, correttamente riportato


def test_independent_consensus_does_not_scale_with_the_number_of_correlated_copies():
    """La regola centrale del brief (docs/TRADING_ARCHITECTURE.md §13/§14): l'aggiunta di copie
    correlate non deve rafforzare artificialmente il consensus rispetto a poche copie piu' un
    dissenziente indipendente con lo stesso peso relativo."""
    correlated_series = [0.03, 0.04, 0.02, 0.05, 0.03, 0.04, 0.02, 0.05]  # tutte BUY, expected_return positivo

    def build(num_copies: int):
        history = []
        for i in range(num_copies):
            history += [decision(f"copy-{i}", "BUY", 0.7, r) for r in correlated_series]
        dissenter_series = [-0.05, -0.04, -0.06, -0.05, -0.04, -0.06, -0.05, -0.04]
        history += [decision("dissenter", "SELL", 0.7, r) for r in dissenter_series]
        current_round = [decision(f"copy-{i}", "BUY", 0.7, correlated_series[-1]) for i in range(num_copies)]
        current_round.append(decision("dissenter", "SELL", 0.7, dissenter_series[-1]))
        return history, current_round

    history_few, current_few = build(2)
    history_many, current_many = build(100)

    signal_few = compute_risk_adjusted_signal(history_few, current_few, ASSET, NOW)
    signal_many = compute_risk_adjusted_signal(history_many, current_many, ASSET, NOW)

    assert signal_many.independent_consensus == pytest.approx(signal_few.independent_consensus, abs=0.1)
    assert signal_many.effective_sample_size < 5.0  # non ~101


def test_risk_adjusted_signal_confidence_and_consensus_stay_within_declared_schema_bounds():
    decisions = [decision("a", "BUY", 1.0, 0.1), decision("b", "BUY", 1.0, 0.1), decision("c", "SELL", 1.0, -0.1)]
    signal = compute_risk_adjusted_signal(decisions, decisions, ASSET, NOW)
    assert -1.0 <= signal.independent_consensus <= 1.0
    assert 0.0 <= signal.confidence <= 1.0
