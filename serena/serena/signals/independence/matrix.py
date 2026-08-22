"""AgentPredictionMatrix (docs/TRADING_ARCHITECTURE.md §14) — implementazione diretta della regola
del brief "100 agenti che copiano un'unica fonte non devono contare come 100 voti indipendenti".

OUR DESIGN DECISION sul significato preciso di "Kish's effective sample size" citato nel brief: la
formula pura di Kish (n_eff = (sum w)^2 / sum w^2) e' invariante di scala nei pesi — se tutti i 100
agenti copiati ricevono lo STESSO peso (anche piccolo), l'ESS di Kish resta 100, non 1: non cattura
la correlazione, solo la disuguaglianza dei pesi. Usiamo invece la formula del "design effect" per
dati con correlazione intra-cluster (design_effect = 1 + (n-1)*rho_medio, n_eff = n/design_effect;
n_eff -> 1 quando rho -> 1 su un intero cluster, n_eff -> n quando rho -> 0), la stessa usata in
statistica per correggere la numerosita' campionaria di dati clusterizzati — e' lo strumento giusto
per l'esatto problema descritto, anche se il nome "Kish" nel brief non e' letteralmente questa
formula. `independence_score(agent)` discende dalla stessa correzione (1/design_effect del proprio
cluster), cosi' il fattore usato nel peso di §13 e la diagnosi riportata da effective_sample_size()
sono la stessa correzione, non due numeri scollegati."""
from __future__ import annotations
import math

import numpy as np

from serena.models.decision import AgentDecision


def _design_effect(cluster_size: int, mean_correlation: float) -> float:
    return 1.0 + (cluster_size - 1) * max(0.0, mean_correlation)


class AgentPredictionMatrix:
    def __init__(self, decisions: list[AgentDecision]):
        if not decisions:
            raise ValueError("decisions non puo' essere vuoto")
        by_agent: dict[str, list[float]] = {}
        for decision in decisions:
            by_agent.setdefault(decision.agent_id, []).append(decision.expected_return)
        self._agent_ids: list[str] = sorted(by_agent)
        self._returns_by_agent = by_agent
        self._clusters_cache: list[set[str]] | None = None
        self._design_effect_by_agent: dict[str, float] | None = None

    @property
    def agent_ids(self) -> list[str]:
        return list(self._agent_ids)

    def _aligned_returns(self, agent_a: str, agent_b: str) -> tuple[list[float], list[float]]:
        series_a, series_b = self._returns_by_agent[agent_a], self._returns_by_agent[agent_b]
        n = min(len(series_a), len(series_b))
        return series_a[-n:], series_b[-n:]

    def _pairwise_correlation_value(self, agent_a: str, agent_b: str) -> float:
        if agent_a == agent_b:
            return 1.0
        series_a, series_b = self._aligned_returns(agent_a, agent_b)
        if len(series_a) < 2 or np.std(series_a) == 0 or np.std(series_b) == 0:
            return 0.0  # campione insufficiente o nessuna varianza: nessuna evidenza di correlazione, non penalizzare
        correlation = float(np.corrcoef(series_a, series_b)[0, 1])
        return 0.0 if math.isnan(correlation) else correlation

    def pairwise_correlation(self) -> np.ndarray:
        n = len(self._agent_ids)
        matrix = np.zeros((n, n))
        for i, agent_a in enumerate(self._agent_ids):
            for j, agent_b in enumerate(self._agent_ids):
                matrix[i, j] = self._pairwise_correlation_value(agent_a, agent_b)
        return matrix

    def cluster_correlation(self, threshold: float = 0.7) -> list[set[str]]:
        if self._clusters_cache is not None:
            return self._clusters_cache

        parent = {agent_id: agent_id for agent_id in self._agent_ids}

        def find(x: str) -> str:
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(x: str, y: str) -> None:
            root_x, root_y = find(x), find(y)
            if root_x != root_y:
                parent[root_x] = root_y

        for i, agent_a in enumerate(self._agent_ids):
            for agent_b in self._agent_ids[i + 1:]:
                if self._pairwise_correlation_value(agent_a, agent_b) >= threshold:
                    union(agent_a, agent_b)

        clusters: dict[str, set[str]] = {}
        for agent_id in self._agent_ids:
            clusters.setdefault(find(agent_id), set()).add(agent_id)
        self._clusters_cache = list(clusters.values())
        return self._clusters_cache

    def _mean_intra_cluster_correlation(self, cluster: set[str]) -> float:
        members = sorted(cluster)
        if len(members) < 2:
            return 0.0
        pairs = [self._pairwise_correlation_value(a, b) for i, a in enumerate(members) for b in members[i + 1:]]
        return float(np.mean(pairs)) if pairs else 0.0

    def _design_effects(self) -> dict[str, float]:
        if self._design_effect_by_agent is not None:
            return self._design_effect_by_agent
        result: dict[str, float] = {}
        for cluster in self.cluster_correlation():
            mean_rho = self._mean_intra_cluster_correlation(cluster)
            effect = _design_effect(len(cluster), mean_rho)
            for agent_id in cluster:
                result[agent_id] = effect
        self._design_effect_by_agent = result
        return result

    def independence_score(self, agent_id: str) -> float:
        if agent_id not in self._agent_ids:
            raise KeyError(f"agent_id sconosciuto: {agent_id}")
        return 1.0 / self._design_effects()[agent_id]

    def effective_sample_size(self) -> float:
        design_effects = self._design_effects()
        return sum(1.0 / design_effects[agent_id] for agent_id in self._agent_ids)
