"""decide_from_belief: la soglia deterministica Tier 3 che trasforma una belief aggiornata in un
AgentDecision (docs/TRADING_ARCHITECTURE.md §8) — estratta come funzione pura condivisa da
simulation/round_loop.py (Fase 7, il sistema completo con OASIS) e backtest/engine/baselines.py
(Fase 10, le baseline "single agent"/"multi-agent senza social" che non toccano OASIS): stessa
soglia di decisione per tutte le varianti confrontate nel backtest, altrimenti un confronto di
profittabilita' fra varianti sarebbe truccato da regole di decisione diverse, non solo da input
diversi."""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from serena.models.decision import AgentDecision

DECISION_MARGIN = 0.05
MAX_EXPECTED_RETURN = 0.05


def decide_from_belief(agent_id: str, asset: str, belief: float, timestamp: datetime,
                        time_horizon_hours: int = 24, information_used: Optional[list[str]] = None) -> AgentDecision:
    if belief > 0.5 + DECISION_MARGIN:
        action = "BUY"
    elif belief < 0.5 - DECISION_MARGIN:
        action = "SELL"
    else:
        action = "HOLD"
    confidence = min(1.0, abs(belief - 0.5) * 2)
    expected_return = (belief - 0.5) * 2 * MAX_EXPECTED_RETURN
    return AgentDecision(
        agent_id=agent_id, timestamp=timestamp, action=action, asset=asset, confidence=confidence,
        expected_return=expected_return, time_horizon_hours=time_horizon_hours,
        reasoning_summary=f"Belief Tier 3 deterministica = {belief:.3f} (soglia decisione ±{DECISION_MARGIN})",
        information_used=information_used or [], belief_update={asset: belief},
    )
