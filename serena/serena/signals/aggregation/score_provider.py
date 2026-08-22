"""AgentScoreProvider — i tre fattori storici della formula peso di §13 (accuracy/calibration/regime)
piu' recency_weight dipendono da un track record misurato che non esiste ancora: `evaluation/
agent_scoring` e' Fase 11. Questo Protocol e' il punto di estensione: NeutralAgentScoreProvider
(quello che la Fase 8 usa davvero, dichiarato onestamente) restituisce 1.0 per ogni agente su ogni
fattore — nessuna preferenza finche' non esiste un vero storico misurato — mentre la Fase 11
implementera' una versione reale conforme allo stesso Protocol, cosi' signals/ non deve cambiare
quando arriva."""
from __future__ import annotations
from typing import Protocol


class AgentScoreProvider(Protocol):
    def accuracy_score(self, agent_id: str) -> float: ...
    def calibration_score(self, agent_id: str) -> float: ...
    def regime_score(self, agent_id: str, regime: str) -> float: ...
    def recency_weight(self, agent_id: str) -> float: ...


class NeutralAgentScoreProvider:
    def accuracy_score(self, agent_id: str) -> float:
        return 1.0

    def calibration_score(self, agent_id: str) -> float:
        return 1.0

    def regime_score(self, agent_id: str, regime: str) -> float:
        return 1.0

    def recency_weight(self, agent_id: str) -> float:
        return 1.0
