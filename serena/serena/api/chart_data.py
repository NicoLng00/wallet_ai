"""Preparazione dati per i grafici della dashboard (docs/TRADING_ARCHITECTURE.md §21) — funzioni pure
e testabili in Python; il browser disegna soltanto SVG a partire da numeri gia' pronti (dashboard.py),
cosi' l'unica logica non testabile in pytest e' il rendering, non la trasformazione dei dati."""
from __future__ import annotations


def equity_curve_series(portfolio_rows: list[dict]) -> list[float]:
    return [row["equity"] for row in portfolio_rows if "equity" in row]


def archetype_distribution(agents: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for agent in agents:
        archetype = agent.get("archetype", "unknown")
        counts[archetype] = counts.get(archetype, 0) + 1
    return dict(sorted(counts.items()))


def agent_leaderboard(scores: list[dict], top_n: int = 10) -> list[dict]:
    ranked = sorted(scores, key=lambda s: s.get("recency_weight", 0.5), reverse=True)
    return [
        {"agent_id": s["agent_id"], "recency_weight": s["recency_weight"], "accuracy_score": s["accuracy_score"]}
        for s in ranked[:top_n]
    ]


def signal_timeline(signals: list[dict]) -> list[dict]:
    return [
        {"timestamp": s["timestamp"], "independent_consensus": s["independent_consensus"], "confidence": s["confidence"]}
        for s in signals
    ]


def belief_distribution(belief_updates: list[dict]) -> dict[str, float]:
    """L'ultima belief conosciuta per agente (l'ultimo BeliefUpdate.new_belief in ordine di apparizione
    nel file — append-only per costruzione, Fase 2, quindi l'ordine nel file E' l'ordine temporale)."""
    latest: dict[str, float] = {}
    for update in belief_updates:
        latest[update["agent_id"]] = update["new_belief"]
    return latest


def variant_comparison(metrics_by_variant: dict[str, dict], metric_name: str = "sharpe_ratio") -> list[dict]:
    return [
        {"variant": variant, "value": variant_metrics.get(metric_name, 0.0)}
        for variant, variant_metrics in sorted(metrics_by_variant.items())
    ]
