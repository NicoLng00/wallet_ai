from datetime import datetime, timezone

import pytest

from serena.evaluation.agent_scoring.outcomes import AgentOutcome, compute_outcome
from serena.evaluation.agent_scoring.scoring import AgentScoreTracker
from serena.models.decision import AgentDecision

NOW = datetime(2026, 8, 22, 12, 0, tzinfo=timezone.utc)
ASSET = "BTC/USDT"


def make_outcome(agent_id: str, action: str, realized_return: float, confidence: float = 0.7, regime: str = "default") -> AgentOutcome:
    return AgentOutcome(
        agent_id=agent_id, asset=ASSET, decision_timestamp=NOW, action=action,
        predicted_expected_return=0.02, confidence=confidence, realized_return=realized_return, regime=regime,
    )


# --- AgentOutcome ------------------------------------------------------------------------------

def test_buy_is_correct_when_price_rises():
    assert make_outcome("a", "BUY", 0.05).direction_correct is True


def test_buy_is_wrong_when_price_falls():
    assert make_outcome("a", "BUY", -0.05).direction_correct is False


def test_sell_is_correct_when_price_falls():
    assert make_outcome("a", "SELL", -0.05).direction_correct is True


def test_sell_is_wrong_when_price_rises():
    assert make_outcome("a", "SELL", 0.05).direction_correct is False


def test_hold_has_no_directional_claim():
    outcome = make_outcome("a", "HOLD", 0.05)
    assert outcome.direction_correct is None
    assert outcome.brier_score is None


def test_pnl_contribution_matches_signed_action():
    assert make_outcome("a", "BUY", 0.05).pnl_contribution == pytest.approx(0.05)
    assert make_outcome("a", "SELL", 0.05).pnl_contribution == pytest.approx(-0.05)
    assert make_outcome("a", "HOLD", 0.05).pnl_contribution == 0.0


def test_brier_score_hand_computed():
    """BUY corretto con confidence 0.9: (0.9-1)^2 = 0.01. BUY sbagliato con confidence 0.9:
    (0.9-0)^2 = 0.81."""
    assert make_outcome("a", "BUY", 0.05, confidence=0.9).brier_score == pytest.approx(0.01)
    assert make_outcome("a", "BUY", -0.05, confidence=0.9).brier_score == pytest.approx(0.81)


def test_compute_outcome_derives_fields_from_a_real_agent_decision():
    decision = AgentDecision(
        agent_id="agent-1", timestamp=NOW, action="BUY", asset=ASSET, confidence=0.8,
        expected_return=0.03, time_horizon_hours=24, reasoning_summary="test", information_used=[], belief_update={},
    )
    outcome = compute_outcome(decision, realized_return=0.05, regime="bull")
    assert outcome.agent_id == "agent-1"
    assert outcome.predicted_expected_return == 0.03
    assert outcome.regime == "bull"
    assert outcome.direction_correct is True


# --- AgentScoreTracker ---------------------------------------------------------------------------

def test_accuracy_score_with_no_history_is_the_neutral_prior():
    tracker = AgentScoreTracker()
    assert tracker.accuracy_score("never-seen") == 0.5


def test_accuracy_score_hand_computed_shrinkage_with_one_observation():
    """1 osservazione corretta, prior_strength=5: (1 + 5*0.5) / (1 + 5) = 3.5/6 = 0.58333...
    — molto lontano da 1.0 nonostante l'unica osservazione sia corretta, esattamente lo shrinkage
    verso il prior neutro richiesto da §13 per campioni piccoli."""
    tracker = AgentScoreTracker(prior_strength=5.0)
    tracker.record(make_outcome("a", "BUY", 0.05))
    assert tracker.accuracy_score("a") == pytest.approx(3.5 / 6, abs=1e-9)


def test_accuracy_score_approaches_one_with_a_large_consistent_sample():
    tracker = AgentScoreTracker(prior_strength=5.0)
    for _ in range(100):
        tracker.record(make_outcome("a", "BUY", 0.05))
    assert tracker.accuracy_score("a") > 0.95


def test_accuracy_score_ignores_hold_decisions():
    tracker = AgentScoreTracker()
    tracker.record(make_outcome("a", "HOLD", 0.05))
    assert tracker.sample_size("a") == 0
    assert tracker.accuracy_score("a") == 0.5


def test_calibration_score_with_no_history_is_neutral():
    assert AgentScoreTracker().calibration_score("never-seen") == 0.5


def test_calibration_score_is_higher_for_well_calibrated_confident_correct_predictions():
    tracker = AgentScoreTracker(prior_strength=5.0)
    for _ in range(50):
        tracker.record(make_outcome("well_calibrated", "BUY", 0.05, confidence=0.95))
        tracker.record(make_outcome("poorly_calibrated", "BUY", -0.05, confidence=0.95))
    assert tracker.calibration_score("well_calibrated") > tracker.calibration_score("poorly_calibrated")


def test_regime_score_filters_by_regime():
    tracker = AgentScoreTracker(prior_strength=1.0)
    for _ in range(20):
        tracker.record(make_outcome("a", "BUY", 0.05, regime="bull"))
        tracker.record(make_outcome("a", "BUY", -0.05, regime="bear"))
    assert tracker.regime_score("a", "bull") > 0.8
    assert tracker.regime_score("a", "bear") < 0.2


def test_recency_weight_decays_after_a_losing_streak_then_recovers_after_wins():
    """La regola esplicita del brief (§17): "do not automatically delete losing agents" — il peso
    scende dopo una serie di perdite ma risale automaticamente dopo una serie di vittorie, perche' e'
    sempre ricalcolato dall'intero storico pesato per recency, mai bloccato al minimo raggiunto."""
    tracker = AgentScoreTracker(prior_strength=2.0, recency_halflife=5.0)
    for _ in range(15):
        tracker.record(make_outcome("a", "BUY", -0.05))
    weight_after_losses = tracker.recency_weight("a")
    assert weight_after_losses < 0.3

    for _ in range(15):
        tracker.record(make_outcome("a", "BUY", 0.05))
    weight_after_recovery = tracker.recency_weight("a")
    assert weight_after_recovery > 0.7
    assert weight_after_recovery > weight_after_losses


def test_recency_weight_never_reaches_exactly_zero_or_one_with_a_finite_sample():
    tracker = AgentScoreTracker(prior_strength=2.0)
    for _ in range(30):
        tracker.record(make_outcome("a", "BUY", -0.05))
    weight = tracker.recency_weight("a")
    assert 0.0 < weight < 1.0
