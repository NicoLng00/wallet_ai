from datetime import datetime, timezone

import pytest

from serena.evaluation.agent_scoring.outcomes import AgentOutcome
from serena.evaluation.calibration.calibration import reliability_curve

NOW = datetime(2026, 8, 22, 12, 0, tzinfo=timezone.utc)
ASSET = "BTC/USDT"


def make_outcome(action: str, realized_return: float, confidence: float) -> AgentOutcome:
    return AgentOutcome(
        agent_id="a", asset=ASSET, decision_timestamp=NOW, action=action,
        predicted_expected_return=0.0, confidence=confidence, realized_return=realized_return,
    )


def test_reliability_curve_is_empty_with_no_directional_outcomes():
    assert reliability_curve([make_outcome("HOLD", 0.0, 0.5)]) == []


def test_reliability_curve_groups_by_confidence_bucket():
    outcomes = [
        make_outcome("BUY", 0.05, 0.1),   # bucket basso, corretto
        make_outcome("BUY", 0.05, 0.9),   # bucket alto, corretto
        make_outcome("BUY", -0.05, 0.9),  # bucket alto, sbagliato
    ]
    curve = reliability_curve(outcomes, num_buckets=5)
    high_bucket = next(b for b in curve if b.mean_predicted_confidence > 0.8)
    assert high_bucket.count == 2
    assert high_bucket.mean_actual_accuracy == pytest.approx(0.5)


def test_reliability_curve_perfect_calibration_has_matching_confidence_and_accuracy():
    outcomes = [make_outcome("BUY", 0.05, 0.9) for _ in range(9)] + [make_outcome("BUY", -0.05, 0.9)]
    curve = reliability_curve(outcomes, num_buckets=5)
    assert len(curve) == 1
    assert curve[0].mean_actual_accuracy == pytest.approx(0.9, abs=1e-9)
    assert curve[0].mean_predicted_confidence == pytest.approx(0.9, abs=1e-9)


def test_reliability_curve_respects_num_buckets():
    outcomes = [make_outcome("BUY", 0.05, c) for c in [0.1, 0.3, 0.5, 0.7, 0.9]]
    curve = reliability_curve(outcomes, num_buckets=5)
    assert len(curve) == 5
    assert all(bucket.count == 1 for bucket in curve)
