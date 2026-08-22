from datetime import datetime, timedelta, timezone

import pytest

from serena.models.decision import AgentDecision
from serena.signals.independence.matrix import AgentPredictionMatrix

NOW = datetime(2026, 8, 22, 12, 0, tzinfo=timezone.utc)


def make_decisions(agent_id: str, returns: list[float]) -> list[AgentDecision]:
    return [
        AgentDecision(
            agent_id=agent_id, timestamp=NOW + timedelta(hours=i), action="BUY" if r >= 0 else "SELL",
            asset="BTC/USDT", confidence=0.6, expected_return=r, time_horizon_hours=24,
            reasoning_summary="test fixture", information_used=[], belief_update={},
        )
        for i, r in enumerate(returns)
    ]


def test_rejects_empty_decisions():
    with pytest.raises(ValueError):
        AgentPredictionMatrix([])


def test_identical_return_series_are_perfectly_correlated_and_clustered_together():
    series = [0.01, 0.02, -0.01, 0.03, 0.0, 0.02, -0.02, 0.01]
    decisions = make_decisions("agent-a", series) + make_decisions("agent-b", series)
    matrix = AgentPredictionMatrix(decisions)
    clusters = matrix.cluster_correlation(threshold=0.7)
    assert {"agent-a", "agent-b"} in clusters


def test_uncorrelated_agents_land_in_separate_clusters():
    decisions = (
        make_decisions("agent-a", [0.01, 0.02, -0.01, 0.03, 0.0, 0.02, -0.02, 0.01])
        + make_decisions("agent-b", [-0.02, 0.01, 0.03, -0.01, 0.02, -0.03, 0.01, -0.01])
    )
    matrix = AgentPredictionMatrix(decisions)
    clusters = matrix.cluster_correlation(threshold=0.7)
    assert {"agent-a"} in clusters or any("agent-a" in c and len(c) == 1 for c in clusters)


def test_independence_score_is_one_for_an_isolated_agent():
    decisions = make_decisions("solo", [0.01, 0.02, -0.01])
    matrix = AgentPredictionMatrix(decisions)
    assert matrix.independence_score("solo") == 1.0


def test_independence_score_is_diluted_for_a_perfectly_correlated_pair():
    series = [0.01, 0.02, -0.01, 0.03, 0.0]
    decisions = make_decisions("agent-a", series) + make_decisions("agent-b", series)
    matrix = AgentPredictionMatrix(decisions)
    assert matrix.independence_score("agent-a") == pytest.approx(0.5, abs=1e-9)
    assert matrix.independence_score("agent-b") == pytest.approx(0.5, abs=1e-9)


def test_independence_score_raises_for_unknown_agent():
    matrix = AgentPredictionMatrix(make_decisions("solo", [0.01, 0.02]))
    with pytest.raises(KeyError):
        matrix.independence_score("never-seen")


def test_single_observation_per_agent_is_treated_as_uncorrelated():
    decisions = make_decisions("agent-a", [0.01]) + make_decisions("agent-b", [0.01])
    matrix = AgentPredictionMatrix(decisions)
    assert matrix.independence_score("agent-a") == 1.0
    assert matrix.effective_sample_size() == pytest.approx(2.0)


def test_effective_sample_size_of_100_perfect_copies_is_approximately_one_not_one_hundred():
    """La regola centrale del brief (docs/TRADING_ARCHITECTURE.md §14): 100 agenti che copiano
    un'unica fonte non devono contare come 100 voti indipendenti."""
    series = [0.01, 0.02, -0.01, 0.03, 0.0, 0.02, -0.02, 0.01, 0.015, -0.005]
    decisions = []
    for i in range(100):
        decisions += make_decisions(f"copy-{i:03d}", series)
    matrix = AgentPredictionMatrix(decisions)
    ess = matrix.effective_sample_size()
    assert ess == pytest.approx(1.0, abs=0.05)
    assert ess < 2.0


def test_effective_sample_size_of_fully_independent_agents_equals_their_count():
    import random

    rng = random.Random(42)
    decisions = []
    for i in range(10):
        series = [rng.uniform(-0.05, 0.05) for _ in range(20)]
        decisions += make_decisions(f"indep-{i}", series)
    matrix = AgentPredictionMatrix(decisions)
    assert matrix.effective_sample_size() == pytest.approx(10.0, abs=1.5)


def test_mixed_population_effective_sample_size_reflects_both_the_cluster_and_the_independent_agent():
    correlated_series = [0.01, 0.02, -0.01, 0.03, 0.0, 0.02, -0.02, 0.01]
    independent_series = [0.05, -0.04, 0.03, -0.02, 0.01, -0.05, 0.04, -0.03]
    decisions = (
        make_decisions("copy-0", correlated_series) + make_decisions("copy-1", correlated_series)
        + make_decisions("copy-2", correlated_series) + make_decisions("solo", independent_series)
    )
    matrix = AgentPredictionMatrix(decisions)
    ess = matrix.effective_sample_size()
    assert 1.5 <= ess <= 3.0  # ~1 dal cluster di 3 copie + 1 dall'agente indipendente
