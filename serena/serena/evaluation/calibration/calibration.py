"""Diagnostica di calibrazione (docs/TRADING_ARCHITECTURE.md §17): Brier score gia' disponibile per
outcome su AgentOutcome (evaluation/agent_scoring/outcomes.py); qui la reliability curve — quanto la
confidence dichiarata da un agente corrisponde davvero alla sua accuracy — usata dal Report Agent
(Fase 12) per un grafico di calibrazione reale, non solo un numero riassuntivo."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from serena.evaluation.agent_scoring.outcomes import AgentOutcome


class ReliabilityBucket(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bucket_index: int = Field(ge=0)
    mean_predicted_confidence: float = Field(ge=0.0, le=1.0)
    mean_actual_accuracy: float = Field(ge=0.0, le=1.0)
    count: int = Field(gt=0)


def reliability_curve(outcomes: list[AgentOutcome], num_buckets: int = 5) -> list[ReliabilityBucket]:
    directional = [o for o in outcomes if o.direction_correct is not None]
    if not directional or num_buckets <= 0:
        return []

    buckets: list[list[AgentOutcome]] = [[] for _ in range(num_buckets)]
    for outcome in directional:
        index = min(int(outcome.confidence * num_buckets), num_buckets - 1)
        buckets[index].append(outcome)

    result: list[ReliabilityBucket] = []
    for index, bucket in enumerate(buckets):
        if not bucket:
            continue
        mean_confidence = sum(o.confidence for o in bucket) / len(bucket)
        mean_accuracy = sum(1.0 for o in bucket if o.direction_correct) / len(bucket)
        result.append(ReliabilityBucket(
            bucket_index=index, mean_predicted_confidence=mean_confidence,
            mean_actual_accuracy=mean_accuracy, count=len(bucket),
        ))
    return result
