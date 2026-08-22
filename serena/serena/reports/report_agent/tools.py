"""Tool del Report Agent (docs/TRADING_ARCHITECTURE.md §20): funzioni pure di sola lettura sugli
artefatti di QUESTO sistema (runs/{run_id}/*.jsonl e knowledge/graph/, mai OASIS o Zep direttamente).

Guardia esplicita: RunArtifactWriter crea la cartella del run se non esiste (idempotente per il
resume di un run REALE, Fase 2) — un tool di sola lettura non deve pero' creare una cartella vuota
come effetto collaterale di una ricerca su un run_id sbagliato o inesistente. `_existing_writer`
verifica l'esistenza PRIMA di costruire il writer, cosi' un run_id sconosciuto alza un errore chiaro
invece di materializzare silenziosamente una cartella vuota."""
from __future__ import annotations
from pathlib import Path
from typing import Optional

from serena.artifacts import RUNS_ROOT, RunArtifactWriter


def _existing_writer(run_id: str, root: Optional[Path] = None) -> RunArtifactWriter:
    root = root or RUNS_ROOT
    if not (root / run_id).exists():
        raise FileNotFoundError(f"run_id sconosciuto (nessuna cartella trovata): {run_id}")
    return RunArtifactWriter(run_id, root=root)


class RunReportTools:
    def __init__(self, run_id: str, root: Optional[Path] = None):
        self._writer = _existing_writer(run_id, root)
        self._run_id = run_id
        self._root = root

    def search_events(self, event_type: Optional[str] = None) -> list[dict]:
        events = self._writer.read_jsonl("events.jsonl")
        return events if event_type is None else [e for e in events if e.get("type") == event_type]

    def search_agent_actions(self, agent_id: Optional[str] = None, action: Optional[str] = None) -> list[dict]:
        actions = self._writer.read_jsonl("actions.jsonl")
        if agent_id is not None:
            actions = [a for a in actions if a.get("agent_id") == agent_id]
        if action is not None:
            actions = [a for a in actions if a.get("action") == action]
        return actions

    def search_agent(self, agent_id: str) -> Optional[dict]:
        agents = self._writer.read_json("agents.json") if self._writer.exists("agents.json") else []
        return next((a for a in agents if a.get("agent_id") == agent_id), None)

    def search_belief_changes(self, agent_id: Optional[str] = None) -> list[dict]:
        updates = self._writer.read_jsonl("belief_updates.jsonl")
        return updates if agent_id is None else [u for u in updates if u.get("agent_id") == agent_id]

    def search_signals(self) -> list[dict]:
        return self._writer.read_jsonl("signals.jsonl")

    def search_portfolio(self) -> list[dict]:
        return self._writer.read_jsonl("portfolio.jsonl")

    def search_market_state(self) -> dict:
        """Placeholder onesto: EnvironmentSnapshot (architettura §10) non e' ancora persistito come
        artefatto separato in nessuna fase — dichiarato non disponibile, mai un valore inventato."""
        return {"available": False, "reason": "EnvironmentSnapshot non e' persistito come artefatto in questa versione"}

    def compare_agents(self, agent_id_a: str, agent_id_b: str) -> dict:
        scores = self._writer.read_json("agent_scores.json") if self._writer.exists("agent_scores.json") else []
        by_id = {score["agent_id"]: score for score in scores}
        return {agent_id_a: by_id.get(agent_id_a), agent_id_b: by_id.get(agent_id_b)}

    def compare_runs(self, other_run_id: str) -> dict:
        other = _existing_writer(other_run_id, self._root)
        this_metrics = self._writer.read_json("metrics.json") if self._writer.exists("metrics.json") else {}
        other_metrics = other.read_json("metrics.json") if other.exists("metrics.json") else {}
        return {self._run_id: this_metrics, other_run_id: other_metrics}

    def calculate_metrics(self) -> dict:
        return self._writer.read_json("metrics.json") if self._writer.exists("metrics.json") else {}

    def search_run_metadata(self) -> dict:
        return self._writer.read_json("run_metadata.json") if self._writer.exists("run_metadata.json") else {}

    def search_agents(self) -> list[dict]:
        return self._writer.read_json("agents.json") if self._writer.exists("agents.json") else []

    def search_agent_scores(self) -> list[dict]:
        return self._writer.read_json("agent_scores.json") if self._writer.exists("agent_scores.json") else []
