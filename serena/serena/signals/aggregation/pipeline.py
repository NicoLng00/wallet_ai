"""Pipeline segnale (docs/TRADING_ARCHITECTURE.md §13): raw_agent_signal -> weighted_signal ->
independent_consensus -> confidence -> expected_return -> risk_adjusted_signal.

OUR DESIGN DECISION su come le fasi si compongono per davvero: il fattore `independence_score` della
formula peso (§13) e la correzione di §14 sono la STESSA correzione (design-effect da
AgentPredictionMatrix, matrix.py) — includerla gia' nel peso per-agente rende `weighted_signal` gia'
corretto per la correlazione, quindi qui `independent_consensus` non e' un ricalcolo separato per
cluster ma la stessa combinazione pesata, con `effective_sample_size` riportato accanto come
diagnostica (il "perche'" richiesto da §14, non un secondo numero scollegato). Confidence combina
l'accordo pesato fra gli agenti con la confidence media (dal campo schema AgentDecision.confidence,
reale e disponibile oggi) — la componente di calibrazione vera e propria (Brier score) e' Fase 11 e
oggi e' 1.0 per costruzione via NeutralAgentScoreProvider, non finta."""
from __future__ import annotations
import math
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from serena.models.decision import AgentDecision
from serena.signals.aggregation.score_provider import AgentScoreProvider, NeutralAgentScoreProvider
from serena.signals.independence.matrix import AgentPredictionMatrix

SIGNED_ACTION = {"BUY": 1.0, "SELL": -1.0, "HOLD": 0.0}


class RiskAdjustedSignal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset: str = Field(min_length=1)
    timestamp: datetime
    contributing_agents: int = Field(gt=0)
    effective_sample_size: float = Field(gt=0.0)
    independent_consensus: float = Field(ge=-1.0, le=1.0)
    confidence: float = Field(ge=0.0, le=1.0)
    expected_return: float
    risk_adjusted_signal: float


def _minmax_normalize(values: dict[str, float]) -> dict[str, float]:
    if not values:
        return {}
    lowest, highest = min(values.values()), max(values.values())
    if math.isclose(lowest, highest):
        return {agent_id: 1.0 for agent_id in values}  # nessuna informazione discriminante: nessuna penalizzazione
    return {agent_id: (value - lowest) / (highest - lowest) for agent_id, value in values.items()}


def compute_risk_adjusted_signal(
    history_decisions: list[AgentDecision], current_round_decisions: list[AgentDecision],
    asset: str, timestamp: datetime, regime: str = "default",
    score_provider: Optional[AgentScoreProvider] = None,
) -> RiskAdjustedSignal:
    if not current_round_decisions:
        raise ValueError("current_round_decisions non puo' essere vuoto")
    if any(decision.asset != asset for decision in current_round_decisions):
        raise ValueError(f"tutte le decisioni devono riguardare l'asset '{asset}'")

    score_provider = score_provider or NeutralAgentScoreProvider()
    matrix = AgentPredictionMatrix(history_decisions)
    active_agent_ids = [decision.agent_id for decision in current_round_decisions]

    accuracy = _minmax_normalize({a: score_provider.accuracy_score(a) for a in active_agent_ids})
    calibration = _minmax_normalize({a: score_provider.calibration_score(a) for a in active_agent_ids})
    regime_scores = _minmax_normalize({a: score_provider.regime_score(a, regime) for a in active_agent_ids})
    recency = _minmax_normalize({a: score_provider.recency_weight(a) for a in active_agent_ids})

    weights: dict[str, float] = {}
    for decision in current_round_decisions:
        agent_id = decision.agent_id
        weights[agent_id] = (
            accuracy[agent_id] * calibration[agent_id] * regime_scores[agent_id]
            * matrix.independence_score(agent_id) * decision.confidence * recency[agent_id]
        )

    total_weight = sum(weights.values())
    if total_weight <= 0.0:
        # tutti i pesi sono collassati a zero (es. ogni AgentDecision.confidence == 0): degrada a
        # pesi uniformi piuttosto che dividere per zero o restituire un segnale silenziosamente nullo.
        weights = {agent_id: 1.0 for agent_id in weights}
        total_weight = float(len(weights))

    independent_consensus = sum(weights[d.agent_id] * SIGNED_ACTION[d.action] for d in current_round_decisions) / total_weight
    expected_return = sum(weights[d.agent_id] * d.expected_return for d in current_round_decisions) / total_weight

    consensus_sign = 0.0 if math.isclose(independent_consensus, 0.0, abs_tol=1e-9) else math.copysign(1.0, independent_consensus)
    agreement_weight = sum(
        weights[d.agent_id] for d in current_round_decisions
        if SIGNED_ACTION[d.action] == consensus_sign or (consensus_sign == 0.0 and d.action == "HOLD")
    )
    agreement_ratio = agreement_weight / total_weight
    mean_agent_confidence = sum(weights[d.agent_id] * d.confidence for d in current_round_decisions) / total_weight
    confidence = agreement_ratio * mean_agent_confidence

    risk_adjusted_signal = expected_return * confidence

    return RiskAdjustedSignal(
        asset=asset, timestamp=timestamp, contributing_agents=len(current_round_decisions),
        effective_sample_size=matrix.effective_sample_size(), independent_consensus=independent_consensus,
        confidence=confidence, expected_return=expected_return, risk_adjusted_signal=risk_adjusted_signal,
    )
