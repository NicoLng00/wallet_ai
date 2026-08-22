"""Funzioni pure di aggiornamento belief (docs/TRADING_ARCHITECTURE.md §11): tre sorgenti di
cambiamento, ciascuna un semplice shift proporzionale verso un target, mai un salto diretto — cosi'
una singola fonte non puo' mai da sola portare una belief da un estremo all'altro in un round.
Nessuna di queste funzioni scrive un BeliefUpdate: l'orchestratore (simulation/round_loop.py) decide
se la differenza e' abbastanza grande da meritare un record (old_belief == new_belief e' un errore di
schema per BeliefUpdate, §11, quindi un non-cambiamento non deve mai arrivare a costruirne uno)."""
from __future__ import annotations
from typing import Literal

BELIEF_EVENT_STEP = 0.2
BELIEF_PEER_STEP = 0.15
BELIEF_HINT_STEP = 0.1

DIRECTION_SIGN: dict[str, float] = {"bullish": 1.0, "bearish": -1.0, "neutral": 0.0}


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def apply_event_update(old_belief: float, direction: Literal["bullish", "bearish", "neutral"],
                        importance: float, confidence: float, news_sensitivity: float) -> float:
    shift = DIRECTION_SIGN[direction] * importance * confidence * news_sensitivity * BELIEF_EVENT_STEP
    return _clamp01(old_belief + shift)


def apply_peer_exposure_update(old_belief: float, peer_belief: float, herding_coefficient: float,
                                social_influence: float) -> float:
    shift = (peer_belief - old_belief) * herding_coefficient * social_influence * BELIEF_PEER_STEP
    return _clamp01(old_belief + shift)


def apply_strategy_hint_update(old_belief: float, hint_belief: float, information_sensitivity: float) -> float:
    shift = (hint_belief - old_belief) * information_sensitivity * BELIEF_HINT_STEP
    return _clamp01(old_belief + shift)
