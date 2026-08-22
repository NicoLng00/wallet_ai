"""Le 6 baseline confrontate col sistema completo (docs/TRADING_ARCHITECTURE.md §15): Buy & Hold,
Momentum, Mean Reversion, Random, un singolo agente Tier 3 (l'analogo raggiungibile in questo
ambiente di "singolo agente LLM", §7 — nessuna ANTHROPIC_API_KEY qui, stesso limite dichiarato di
ogni fase precedente), e multi-agente senza interazione sociale (OASIS disattivato — un'ablazione
diretta di §12). Ogni baseline passa attraverso `risk.sizing.clamp_to_limits` — lo STESSO controllo
limiti del sistema completo — cosi' un confronto di profittabilita' e' onesto (brief regola #8): la
differenza fra varianti e' nella strategia, mai nelle regole di rischio."""
from __future__ import annotations
from datetime import datetime

import numpy as np

from serena.agents.beliefs.decision import decide_from_belief
from serena.agents.beliefs.updater import apply_strategy_hint_update
from serena.agents.strategies.hints import STRATEGY_HINTS, mean_reversion_hint, momentum_hint
from serena.models.agent import AgentProfile
from serena.models.decision import AgentDecision
from serena.risk.limits.limits import RiskLimits
from serena.risk.portfolio.portfolio import PortfolioState
from serena.risk.sizing.sizing import clamp_to_limits, size_position
from serena.signals.aggregation.pipeline import compute_risk_adjusted_signal


def buy_and_hold_fraction(asset: str, closes_window: list[float], portfolio: PortfolioState, limits: RiskLimits) -> float:
    fraction, _ = clamp_to_limits(limits.max_position_fraction, asset, portfolio, limits)
    return fraction


def momentum_fraction(asset: str, closes_window: list[float], portfolio: PortfolioState, limits: RiskLimits) -> float:
    candidate = (momentum_hint(closes_window) - 0.5) * 2 * limits.max_position_fraction
    fraction, _ = clamp_to_limits(candidate, asset, portfolio, limits)
    return fraction


def mean_reversion_fraction(asset: str, closes_window: list[float], portfolio: PortfolioState, limits: RiskLimits) -> float:
    candidate = (mean_reversion_hint(closes_window) - 0.5) * 2 * limits.max_position_fraction
    fraction, _ = clamp_to_limits(candidate, asset, portfolio, limits)
    return fraction


def random_fraction(asset: str, rng: np.random.Generator, portfolio: PortfolioState, limits: RiskLimits) -> float:
    candidate = float(rng.uniform(-limits.max_position_fraction, limits.max_position_fraction))
    fraction, _ = clamp_to_limits(candidate, asset, portfolio, limits)
    return fraction


class NoSocialAgentBacktester:
    """Motore comune per le baseline "singolo agente" e "multi-agente senza social": stesso
    aggiornamento di belief (solo strategy hint, Fase 5/7 — nessuna esposizione sociale perche' non
    c'e' alcun OasisSimulationAdapter qui, per costruzione), stessa soglia di decisione
    (decide_from_belief), stessa pipeline segnale (Fase 8) e lo stesso risk engine (Fase 9) del
    sistema completo. L'UNICA differenza reale col sistema completo e' l'assenza del loop sociale —
    esattamente l'ablazione che l'architettura richiede."""

    def __init__(self, agents: list[AgentProfile], asset: str, limits: RiskLimits):
        if not agents:
            raise ValueError("agents non puo' essere vuoto")
        self._agents = agents
        self._asset = asset
        self._limits = limits
        self._beliefs: dict[str, float] = {agent.agent_id: agent.beliefs.get(asset, 0.5) for agent in agents}
        self._history: list[AgentDecision] = []

    def step(self, timestamp: datetime, closes_window: list[float], portfolio: PortfolioState) -> float:
        decisions: list[AgentDecision] = []
        for agent in self._agents:
            hint = STRATEGY_HINTS[agent.archetype](closes_window)
            belief = apply_strategy_hint_update(self._beliefs[agent.agent_id], hint, agent.information_sensitivity)
            self._beliefs[agent.agent_id] = belief
            decisions.append(decide_from_belief(agent.agent_id, self._asset, belief, timestamp))
        self._history.extend(decisions)

        signal = compute_risk_adjusted_signal(self._history, decisions, self._asset, timestamp)
        fraction, _ = size_position(signal, portfolio, self._limits, price=closes_window[-1])
        return fraction
