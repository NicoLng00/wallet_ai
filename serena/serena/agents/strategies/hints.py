"""Strategy hint deterministici per archetipo (docs/TRADING_ARCHITECTURE.md §6, punto 2): un'euristica
economica e NON-LLM che seed la belief iniziale di un agente su un asset, sempre calcolabile anche se
la chiamata LLM per quel round fallisce o e' saltata (Tier 3). Ogni hint prende la stessa firma
(closes: list[float]) -> float e ritorna una belief in [0,1] (0.5 = neutro), cosi' generator.py puo'
comporle in modo uniforme indipendentemente dall'archetipo."""
from __future__ import annotations
from typing import Callable

from serena.models.agent import AgentArchetype

NEUTRAL_BELIEF = 0.5


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _return_over(closes: list[float], window: int) -> float | None:
    if len(closes) <= window:
        return None
    start, end = closes[-window - 1], closes[-1]
    if start == 0:
        return None
    return (end - start) / start


def _return_to_belief(ret: float, sensitivity: float = 8.0) -> float:
    """Mappa un rendimento (tipicamente in [-0.2, 0.2]) su una belief in [0,1] con una sigmoide
    centrata su 0.5 — nessuna libreria esterna, solo `math.exp` dalla stdlib."""
    import math

    return _clamp01(1.0 / (1.0 + math.exp(-sensitivity * ret)))


def momentum_hint(closes: list[float]) -> float:
    ret = _return_over(closes, 10)
    return NEUTRAL_BELIEF if ret is None else _return_to_belief(ret)


def trend_follower_hint(closes: list[float]) -> float:
    ret = _return_over(closes, 20)
    return NEUTRAL_BELIEF if ret is None else _return_to_belief(ret, sensitivity=5.0)


def mean_reversion_hint(closes: list[float]) -> float:
    ret = _return_over(closes, 10)
    return NEUTRAL_BELIEF if ret is None else _return_to_belief(-ret)


def contrarian_hint(closes: list[float]) -> float:
    ret = _return_over(closes, 5)
    return NEUTRAL_BELIEF if ret is None else _return_to_belief(-ret, sensitivity=10.0)


def long_term_holder_hint(closes: list[float]) -> float:
    ret = _return_over(closes, min(len(closes) - 1, 90)) if len(closes) > 1 else None
    return NEUTRAL_BELIEF if ret is None else _return_to_belief(ret, sensitivity=3.0)


def _neutral_hint(_closes: list[float]) -> float:
    """Per gli archetipi la cui belief iniziale dipende da fonti che questo modulo non possiede
    (news/macro/fundamental: eventi reali della Fase 3; retail/whale/market_maker/quant: comportamento
    sociale o microstruttura, non un pattern nel solo prezzo) — 0.5 e' l'unica scelta onesta finche'
    quella fonte non e' collegata, mai un valore inventato per sembrare piu' informativo."""
    return NEUTRAL_BELIEF


STRATEGY_HINTS: dict[AgentArchetype, Callable[[list[float]], float]] = {
    AgentArchetype.MOMENTUM: momentum_hint,
    AgentArchetype.TREND_FOLLOWER: trend_follower_hint,
    AgentArchetype.MEAN_REVERSION: mean_reversion_hint,
    AgentArchetype.CONTRARIAN: contrarian_hint,
    AgentArchetype.LONG_TERM_HOLDER: long_term_holder_hint,
    AgentArchetype.MACRO: _neutral_hint,
    AgentArchetype.FUNDAMENTAL: _neutral_hint,
    AgentArchetype.NEWS: _neutral_hint,
    AgentArchetype.RETAIL: _neutral_hint,
    AgentArchetype.WHALE: _neutral_hint,
    AgentArchetype.MARKET_MAKER: _neutral_hint,
    AgentArchetype.QUANT: _neutral_hint,
}

assert set(STRATEGY_HINTS.keys()) == set(AgentArchetype), "ogni archetipo deve avere uno strategy hint, anche se neutro"
