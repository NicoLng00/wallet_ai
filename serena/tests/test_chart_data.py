from serena.api.chart_data import (
    agent_leaderboard,
    archetype_distribution,
    belief_distribution,
    equity_curve_series,
    signal_timeline,
    variant_comparison,
)


def test_equity_curve_series_extracts_equity_in_order():
    rows = [{"equity": 100.0}, {"equity": 105.0}, {"equity": 103.0}]
    assert equity_curve_series(rows) == [100.0, 105.0, 103.0]


def test_equity_curve_series_ignores_rows_without_equity():
    assert equity_curve_series([{"other": 1}, {"equity": 50.0}]) == [50.0]


def test_archetype_distribution_counts_and_sorts_alphabetically():
    agents = [{"archetype": "momentum"}, {"archetype": "retail"}, {"archetype": "momentum"}]
    assert archetype_distribution(agents) == {"momentum": 2, "retail": 1}


def test_archetype_distribution_labels_missing_archetype_as_unknown():
    assert archetype_distribution([{}]) == {"unknown": 1}


def test_agent_leaderboard_sorts_descending_by_recency_weight():
    scores = [
        {"agent_id": "a", "recency_weight": 0.4, "accuracy_score": 0.5},
        {"agent_id": "b", "recency_weight": 0.9, "accuracy_score": 0.6},
        {"agent_id": "c", "recency_weight": 0.6, "accuracy_score": 0.5},
    ]
    leaderboard = agent_leaderboard(scores)
    assert [entry["agent_id"] for entry in leaderboard] == ["b", "c", "a"]


def test_agent_leaderboard_respects_top_n():
    scores = [{"agent_id": str(i), "recency_weight": i / 10, "accuracy_score": 0.5} for i in range(20)]
    assert len(agent_leaderboard(scores, top_n=5)) == 5


def test_signal_timeline_extracts_the_relevant_fields_in_order():
    signals = [
        {"timestamp": "t1", "independent_consensus": 0.1, "confidence": 0.5, "extra": "ignored"},
        {"timestamp": "t2", "independent_consensus": -0.2, "confidence": 0.7, "extra": "ignored"},
    ]
    timeline = signal_timeline(signals)
    assert timeline == [
        {"timestamp": "t1", "independent_consensus": 0.1, "confidence": 0.5},
        {"timestamp": "t2", "independent_consensus": -0.2, "confidence": 0.7},
    ]


def test_belief_distribution_keeps_the_last_update_per_agent():
    updates = [
        {"agent_id": "a", "new_belief": 0.6},
        {"agent_id": "b", "new_belief": 0.4},
        {"agent_id": "a", "new_belief": 0.7},
    ]
    assert belief_distribution(updates) == {"a": 0.7, "b": 0.4}


def test_variant_comparison_extracts_the_requested_metric_sorted_by_name():
    metrics = {"momentum": {"sharpe_ratio": 1.2}, "buy_and_hold": {"sharpe_ratio": 0.8}}
    result = variant_comparison(metrics)
    assert result == [{"variant": "buy_and_hold", "value": 0.8}, {"variant": "momentum", "value": 1.2}]


def test_variant_comparison_defaults_missing_metric_to_zero():
    result = variant_comparison({"x": {}}, metric_name="cagr")
    assert result == [{"variant": "x", "value": 0.0}]
