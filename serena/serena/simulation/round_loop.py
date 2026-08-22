"""Il loop del ciclo di feedback sociale (docs/TRADING_ARCHITECTURE.md §12), interamente sulla
macchina di OASIS gia' verificata (execute_round/collect_social_exposure, Fase 6) per la parte
"gli agenti osservano/pubblicano/vengono raccomandati" — questo modulo possiede solo i due estremi
del loop: iniettare un evento di mercato ed elaborare le AgentDecision in uscita, esattamente come
richiesto da §12 ("we do not reimplement social recommendation").

Tre fonti di belief update per round, applicate in ordine e registrate SOLO se cambiano davvero la
belief (agents/beliefs/updater.py, mai un salto diretto): un evento di mercato reale (Tier 1/2/3 via
EventEngine, Fase 3), l'esposizione sociale reale ai post di altri agenti (Fase 6), e lo strategy
hint deterministico dell'archetipo (Fase 5). Ogni AgentDecision e' Tier 3 puro — nessuna chiamata LLM
qui: la belief aggiornata sopra e' gia' il risultato dell'interpretazione, `_decide()` applica solo
una soglia deterministica, mai un giudizio nuovo."""
from __future__ import annotations
import math
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from serena.agents.beliefs.decision import DECISION_MARGIN, decide_from_belief  # noqa: F401 (re-esportata per compatibilita')
from serena.agents.beliefs.updater import apply_event_update, apply_peer_exposure_update, apply_strategy_hint_update
from serena.agents.strategies.hints import STRATEGY_HINTS
from serena.artifacts import RunArtifactWriter
from serena.models.agent import AgentArchetype, AgentProfile
from serena.models.belief import BeliefUpdate
from serena.models.data import DataPoint
from serena.models.decision import AgentDecision
from serena.models.event import Event
from serena.simulation.events.engine import EventEngine
from serena.simulation.oasis.adapter import OasisSimulationAdapter


class RoundOutcome(BaseModel):
    model_config = ConfigDict(extra="forbid")

    round_index: int
    events: list[Event]
    decisions: list[AgentDecision]
    belief_updates: list[BeliefUpdate]


class SimulationRoundLoop:
    def __init__(self, agents: list[AgentProfile], event_engine: EventEngine, oasis_adapter: OasisSimulationAdapter,
                 asset: str, writer: RunArtifactWriter, time_horizon_hours: int = 24):
        if not agents:
            raise ValueError("agents non puo' essere vuoto")
        self._agents = {agent.agent_id: agent for agent in agents}
        self._beliefs: dict[str, float] = {agent.agent_id: agent.beliefs.get(asset, 0.5) for agent in agents}
        self._event_engine = event_engine
        self._oasis = oasis_adapter
        self._asset = asset
        self._writer = writer
        self._time_horizon_hours = time_horizon_hours
        news_agents = [agent.agent_id for agent in agents if agent.archetype == AgentArchetype.NEWS]
        self._default_poster_id = news_agents[0] if news_agents else next(iter(self._agents))

    async def run_round(self, round_index: int, timestamp: datetime, recent_closes: Optional[list[float]] = None,
                         market_event_text: Optional[str] = None, market_data_point: Optional[DataPoint] = None) -> RoundOutcome:
        recent_closes = recent_closes or []
        events: list[Event] = []
        manual_actions: dict[str, tuple[str, dict]] = {}

        if market_event_text is not None:
            if market_data_point is None:
                raise ValueError("market_data_point e' richiesto quando si fornisce market_event_text")
            event = await self._event_engine.build_event(
                market_data_point, market_event_text, f"evt-round-{round_index}", "SOCIAL_SPIKE",
            )
            self._writer.append_jsonl("events.jsonl", event)
            events.append(event)
            manual_actions[self._default_poster_id] = ("create_post", {"content": market_event_text})

        await self._oasis.execute_round(round_index, manual_actions)

        belief_updates: list[BeliefUpdate] = []
        decisions: list[AgentDecision] = []
        for agent_id, agent in self._agents.items():
            belief = self._beliefs[agent_id]
            information_used: list[str] = []

            for event in events:
                candidate = apply_event_update(belief, event.direction, event.importance, event.confidence, agent.news_sensitivity)
                belief, recorded = self._maybe_record(
                    belief_updates, agent_id, belief, candidate,
                    f"Evento {event.type} ({event.direction}, importanza {event.importance:.2f})",
                    event.event_id, timestamp,
                )
                if recorded:
                    information_used.append(event.event_id)

            for post in await self._oasis.collect_social_exposure(agent_id):
                author_id = post["author_agent_id"]
                if author_id == agent_id or author_id not in self._beliefs:
                    continue
                candidate = apply_peer_exposure_update(belief, self._beliefs[author_id], agent.herding_coefficient, agent.social_influence)
                belief, recorded = self._maybe_record(
                    belief_updates, agent_id, belief, candidate,
                    f"Esposizione sociale reale al post di {author_id}", f"peer:{author_id}", timestamp,
                )
                if recorded:
                    information_used.append(f"peer:{author_id}")

            hint = STRATEGY_HINTS[agent.archetype](recent_closes)
            candidate = apply_strategy_hint_update(belief, hint, agent.information_sensitivity)
            belief, recorded = self._maybe_record(
                belief_updates, agent_id, belief, candidate,
                f"Strategy hint deterministico dell'archetipo {agent.archetype.value}", "strategy-hint", timestamp,
            )
            if recorded:
                information_used.append("strategy-hint")

            self._beliefs[agent_id] = belief
            decision = self._decide(agent, belief, timestamp, information_used)
            self._writer.append_jsonl("actions.jsonl", decision)
            decisions.append(decision)

        for belief_update in belief_updates:
            self._writer.append_jsonl("belief_updates.jsonl", belief_update)

        return RoundOutcome(round_index=round_index, events=events, decisions=decisions, belief_updates=belief_updates)

    def _maybe_record(self, sink: list[BeliefUpdate], agent_id: str, old_belief: float, new_belief: float,
                       reason: str, information_source: str, timestamp: datetime) -> tuple[float, bool]:
        if math.isclose(old_belief, new_belief, abs_tol=1e-9):
            return old_belief, False
        sink.append(BeliefUpdate(
            agent_id=agent_id, asset=self._asset, old_belief=old_belief, new_belief=new_belief,
            reason=reason, information_source=information_source, timestamp=timestamp,
        ))
        return new_belief, True

    def _decide(self, agent: AgentProfile, belief: float, timestamp: datetime, information_used: list[str]) -> AgentDecision:
        return decide_from_belief(
            agent.agent_id, self._asset, belief, timestamp,
            time_horizon_hours=self._time_horizon_hours, information_used=information_used,
        )
