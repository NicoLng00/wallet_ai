"""Attribuzione del PnL (docs/TRADING_ARCHITECTURE.md §17): quali agenti/archetipi hanno guidato un
segnale, con una riconciliazione ESATTA (non approssimata) contro il PnL realizzato di portafoglio —
docs/IMPLEMENTATION_PLAN.md Fase 11 lo richiede esplicitamente come "reconciliation test, not just
unit-level". Il contributo grezzo per agente (AgentOutcome.pnl_contribution, un PnL "a peso pieno":
cosa avrebbe fatto seguire solo quell'agente) viene scalato proporzionalmente cosi' la somma torna
esattamente al rendimento di portafoglio realizzato per quel periodo."""
from __future__ import annotations

from serena.evaluation.agent_scoring.outcomes import AgentOutcome


def attribute_portfolio_pnl(outcomes: list[AgentOutcome], portfolio_realized_return: float) -> dict[str, float]:
    if not outcomes:
        return {}

    raw: dict[str, float] = {}
    for outcome in outcomes:
        raw[outcome.agent_id] = raw.get(outcome.agent_id, 0.0) + outcome.pnl_contribution

    total_raw = sum(raw.values())
    if total_raw == 0.0:
        share = portfolio_realized_return / len(raw)
        return {agent_id: share for agent_id in raw}

    scale = portfolio_realized_return / total_raw
    return {agent_id: value * scale for agent_id, value in raw.items()}


def attribute_by_archetype(outcomes: list[AgentOutcome], agent_archetypes: dict[str, str],
                            portfolio_realized_return: float) -> dict[str, float]:
    """Come attribute_portfolio_pnl, ma aggregato per archetipo invece che per agent_id — utile per
    il Report Agent (Fase 12) per rispondere a "quale STRATEGIA ha guidato il segnale", non solo
    quale singolo agente."""
    per_agent = attribute_portfolio_pnl(outcomes, portfolio_realized_return)
    per_archetype: dict[str, float] = {}
    for agent_id, value in per_agent.items():
        archetype = agent_archetypes.get(agent_id, "unknown")
        per_archetype[archetype] = per_archetype.get(archetype, 0.0) + value
    return per_archetype
