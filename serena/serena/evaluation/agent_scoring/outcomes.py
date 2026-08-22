"""AgentOutcome (docs/TRADING_ARCHITECTURE.md §17): cosa e' successo per davvero dopo che
`AgentDecision.time_horizon_hours` e' trascorso e il prezzo reale/ripetuto ha confermato o smentito
la previsione. HOLD non e' una scommessa direzionale falsificabile — `direction_correct`/`brier_score`
sono None per una decisione HOLD (esclusa da accuracy/calibrazione, non forzata a "sempre giusta" o
"sempre sbagliata" con una soglia arbitraria), ma `pnl_contribution` resta 0.0 per costruzione
(nessuna posizione presa, nessun PnL da attribuire)."""
from __future__ import annotations
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from serena.models.decision import AgentDecision

_SIGNED_ACTION: dict[str, float] = {"BUY": 1.0, "SELL": -1.0, "HOLD": 0.0}


class AgentOutcome(BaseModel):
    model_config = ConfigDict(extra="forbid")

    agent_id: str = Field(min_length=1)
    asset: str = Field(min_length=1)
    decision_timestamp: datetime
    action: Literal["BUY", "SELL", "HOLD"]
    predicted_expected_return: float
    confidence: float = Field(ge=0.0, le=1.0)
    realized_return: float
    regime: str = "default"

    @property
    def direction_correct(self) -> Optional[bool]:
        if self.action == "BUY":
            return self.realized_return > 0
        if self.action == "SELL":
            return self.realized_return < 0
        return None

    @property
    def brier_score(self) -> Optional[float]:
        correct = self.direction_correct
        if correct is None:
            return None
        return (self.confidence - (1.0 if correct else 0.0)) ** 2

    @property
    def pnl_contribution(self) -> float:
        return _SIGNED_ACTION[self.action] * self.realized_return


def compute_outcome(decision: AgentDecision, realized_return: float, regime: str = "default") -> AgentOutcome:
    return AgentOutcome(
        agent_id=decision.agent_id, asset=decision.asset, decision_timestamp=decision.timestamp,
        action=decision.action, predicted_expected_return=decision.expected_return,
        confidence=decision.confidence, realized_return=realized_return, regime=regime,
    )
