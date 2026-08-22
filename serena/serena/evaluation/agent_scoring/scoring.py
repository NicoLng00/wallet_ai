"""AgentScoreTracker (docs/TRADING_ARCHITECTURE.md §13/§17): l'implementazione REALE di
`AgentScoreProvider` (signals/aggregation/score_provider.py, Fase 8) — sostituisce
`NeutralAgentScoreProvider` quando esiste un vero storico misurato, senza che signals/ debba cambiare
(stesso Protocol). Ogni punteggio e' shrinkato verso il prior neutro 0.5 in proporzione alla
numerosita' campionaria (architecture §13: "blends toward a neutral prior when [sample_size] is
small") — mai un punteggio 0 o 1 assoluto da un campione di 1 osservazione.

`recency_weight` implementa la regola esplicita del brief (§17): "do not automatically delete losing
agents" — un agente in perdita vede il proprio peso DECADERE (mai a zero, sempre shrinkato verso 0.5)
mai CANCELLATO; una serie vincente successiva lo fa risalire automaticamente, perche' il punteggio e'
sempre ricalcolato dall'intero storico pesato per recency, mai bloccato al valore piu' basso raggiunto."""
from __future__ import annotations
import math

from serena.evaluation.agent_scoring.outcomes import AgentOutcome

DEFAULT_PRIOR_STRENGTH = 5.0
DEFAULT_RECENCY_HALFLIFE = 10.0
NEUTRAL_SCORE = 0.5


class AgentScoreTracker:
    def __init__(self, prior_strength: float = DEFAULT_PRIOR_STRENGTH, recency_halflife: float = DEFAULT_RECENCY_HALFLIFE):
        self._prior_strength = prior_strength
        self._recency_halflife = recency_halflife
        self._outcomes: dict[str, list[AgentOutcome]] = {}

    def record(self, outcome: AgentOutcome) -> None:
        self._outcomes.setdefault(outcome.agent_id, []).append(outcome)

    def all_outcomes(self, agent_id: str) -> list[AgentOutcome]:
        return list(self._outcomes.get(agent_id, []))

    def sample_size(self, agent_id: str) -> int:
        return len(self._directional_outcomes(agent_id))

    def _directional_outcomes(self, agent_id: str) -> list[AgentOutcome]:
        return [o for o in self._outcomes.get(agent_id, []) if o.direction_correct is not None]

    def _shrunk_accuracy(self, outcomes: list[AgentOutcome]) -> float:
        correct = sum(1 for o in outcomes if o.direction_correct)
        total = len(outcomes)
        return (correct + self._prior_strength * NEUTRAL_SCORE) / (total + self._prior_strength)

    def accuracy_score(self, agent_id: str) -> float:
        return self._shrunk_accuracy(self._directional_outcomes(agent_id))

    def calibration_score(self, agent_id: str) -> float:
        directional = self._directional_outcomes(agent_id)
        if not directional:
            return NEUTRAL_SCORE
        mean_brier = sum(o.brier_score for o in directional) / len(directional)
        shrinkage = len(directional) / (len(directional) + self._prior_strength)
        return shrinkage * (1.0 - mean_brier) + (1 - shrinkage) * NEUTRAL_SCORE

    def regime_score(self, agent_id: str, regime: str) -> float:
        in_regime = [o for o in self._directional_outcomes(agent_id) if o.regime == regime]
        return self._shrunk_accuracy(in_regime)

    def recency_weight(self, agent_id: str) -> float:
        directional = self._directional_outcomes(agent_id)
        if not directional:
            return NEUTRAL_SCORE
        n = len(directional)
        decay = math.log(2) / self._recency_halflife
        weights = [math.exp(-decay * (n - 1 - i)) for i in range(n)]
        weighted_correct = sum(w * (1.0 if o.direction_correct else 0.0) for w, o in zip(weights, directional))
        weighted_total = sum(weights)
        raw = weighted_correct / weighted_total
        shrinkage = n / (n + self._prior_strength)
        return shrinkage * raw + (1 - shrinkage) * NEUTRAL_SCORE
