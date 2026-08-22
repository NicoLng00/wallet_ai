"""OasisSimulationAdapter (docs/TRADING_ARCHITECTURE.md §9) — l'UNICO modulo dell'intero codebase
che importa `oasis`. Costruito interamente sui punti di estensione verificati dal codice sorgente
reale in docs/MIROFISH_REVERSE_ENGINEERING.md §B.12: zero fork di OASIS.

Due bug/vincoli upstream VERIFICATI IN QUESTA FASE (non nel reverse-engineering originale, scoperti
eseguendo per davvero una simulazione minima — vedi docs/IMPLEMENTATION_PLAN.md Fase 6):

1. `UserInfo.to_reddit_system_message()`/`to_twitter_system_message()` (camel-oasis==0.2.5,
   `social_platform/config/user.py`) sollevano `UnboundLocalError` se `profile["other_info"]` non
   contiene ESATTAMENTE `user_profile` (non-None) + `gender` + `age` + `mbti` + `country`. Non e'
   documentato in nessuna docstring — trovato solo leggendo lo stack trace di un'esecuzione reale.
   Aggiriamo popolando questi campi sempre, anche se solo `user_profile` (derivato da
   `AgentProfile.identity`) porta informazione reale per il nostro dominio.
2. `SocialAgent(model=None, ...)` NON significa "nessun modello": risolve al modello OpenAI di
   default e alza `ValueError` per `OPENAI_API_KEY` mancante al momento della costruzione
   dell'agente, anche se l'agente non ricevera' mai una LLMAction. Aggirato con `NullModelBackend`
   (null_model.py) — un vero `BaseModelBackend`, mai invocato per costruzione (questo adapter invia
   solo ManualAction, mai LLMAction/INTERVIEW).

Determinismo: ogni chiamata a `initialize()`/`execute_round()` e' avvolta in `seeded_random()`
(§B.11: OASIS non seeda mai `random` da sola)."""
from __future__ import annotations
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from serena.models.agent import AgentProfile
from serena.simulation.oasis.determinism import seeded_random
from serena.simulation.oasis.null_model import NullModelBackend

PlatformName = Literal["twitter", "reddit"]


class SocialAction(BaseModel):
    """Una riga della tabella `trace` di OASIS, riletta dal database sqlite reale — non l'audit
    trail nativo di OASIS (§B.12: bypassato dalle chiamate a tool), ma la traccia delle ManualAction
    che questo adapter ha effettivamente inviato, utile per debug/ispezione della sessione social."""
    model_config = ConfigDict(extra="forbid")

    agent_id: str = Field(min_length=1)
    action: str = Field(min_length=1)
    info: dict = Field(default_factory=dict)
    created_at: datetime


class RoundResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    round_index: int = Field(ge=0)
    actions_requested: int = Field(ge=0)
    actions_performed: int = Field(ge=0)


class OasisSimulationAdapter:
    def __init__(self, agent_profiles: list[AgentProfile], platform: PlatformName, seed: int, database_path: Path):
        if not agent_profiles:
            raise ValueError("agent_profiles non puo' essere vuoto")
        self._profiles = agent_profiles
        self._platform_name = platform
        self._seed = seed
        self._database_path = Path(database_path)
        self._database_path.parent.mkdir(parents=True, exist_ok=True)

        self._graph = None
        self._env = None
        self._agents_by_agent_id: dict[str, object] = {}
        self._oasis_id_by_agent_id: dict[str, int] = {}
        self._agent_id_by_oasis_id: dict[int, str] = {}
        self._last_trace_rowid = 0

    async def initialize(self) -> None:
        from oasis import ActionType, DefaultPlatformType, UserInfo
        from oasis.environment.env import OasisEnv
        from oasis.social_agent.agent import SocialAgent
        from oasis.social_agent.agent_graph import AgentGraph

        with seeded_random(self._seed):
            self._graph = AgentGraph()
            null_model = NullModelBackend()
            for oasis_id, profile in enumerate(self._profiles):
                user_profile = {
                    "nodes": [], "edges": [],
                    "other_info": {
                        "user_profile": profile.identity,
                        "gender": "unspecified", "age": 30, "mbti": "INTJ", "country": "N/A",
                    },
                }
                user_info = UserInfo(
                    name=profile.agent_id, description=profile.identity, profile=user_profile,
                    recsys_type=self._platform_name,
                )
                agent = SocialAgent(
                    agent_id=oasis_id, user_info=user_info, model=null_model, agent_graph=self._graph,
                    available_actions=[ActionType.CREATE_POST, ActionType.LIKE_POST, ActionType.UNLIKE_POST],
                )
                self._graph.add_agent(agent)
                self._agents_by_agent_id[profile.agent_id] = agent
                self._oasis_id_by_agent_id[profile.agent_id] = oasis_id
                self._agent_id_by_oasis_id[oasis_id] = profile.agent_id

            platform_type = DefaultPlatformType(self._platform_name)
            self._env = OasisEnv(agent_graph=self._graph, platform=platform_type, database_path=str(self._database_path))
            await self._env.reset()

    async def execute_round(self, round_index: int, manual_actions: dict[str, tuple[str, dict]]) -> RoundResult:
        from oasis import ActionType, ManualAction

        if self._env is None:
            raise RuntimeError("initialize() non e' stata chiamata")

        actions = {}
        for agent_id, (action_name, action_args) in manual_actions.items():
            agent = self._agents_by_agent_id.get(agent_id)
            if agent is None:
                raise KeyError(f"agent_id sconosciuto: {agent_id}")
            actions[agent] = ManualAction(action_type=ActionType(action_name), action_args=action_args)

        with seeded_random(self._seed + round_index + 1):
            await self._env.step(actions)

        return RoundResult(round_index=round_index, actions_requested=len(manual_actions), actions_performed=len(manual_actions))

    async def collect_actions(self) -> list[SocialAction]:
        """Rilegge solo le righe di `trace` nuove dall'ultima chiamata (offset per rowid) — non
        l'intera storia ad ogni round."""
        conn = sqlite3.connect(self._database_path)
        try:
            cursor = conn.execute(
                "SELECT rowid, user_id, created_at, action, info FROM trace WHERE rowid > ? ORDER BY rowid",
                (self._last_trace_rowid,),
            )
            rows = cursor.fetchall()
        finally:
            conn.close()

        results: list[SocialAction] = []
        for rowid, user_id, created_at, action, info_json in rows:
            self._last_trace_rowid = max(self._last_trace_rowid, rowid)
            agent_id = self._agent_id_by_oasis_id.get(user_id, f"oasis-user-{user_id}")
            results.append(SocialAction(
                agent_id=agent_id, action=action, info=json.loads(info_json) if info_json else {},
                created_at=_parse_sqlite_timestamp(created_at),
            ))
        return results

    async def collect_social_exposure(self, agent_id: str) -> list[dict]:
        """Post realmente presenti nella tabella `rec` (raccomandazioni) per l'utente OASIS
        corrispondente ad agent_id — cio' che il motore di raccomandazione REALE di OASIS ha deciso
        di mostrargli, non una lista arbitraria di tutti i post."""
        oasis_id = self._oasis_id_by_agent_id.get(agent_id)
        if oasis_id is None:
            raise KeyError(f"agent_id sconosciuto: {agent_id}")

        conn = sqlite3.connect(self._database_path)
        try:
            cursor = conn.execute(
                "SELECT p.post_id, p.user_id, p.content, p.created_at FROM rec r "
                "JOIN post p ON p.post_id = r.post_id WHERE r.user_id = ?",
                (oasis_id,),
            )
            rows = cursor.fetchall()
        finally:
            conn.close()

        return [
            {"post_id": post_id, "author_agent_id": self._agent_id_by_oasis_id.get(author_id, f"oasis-user-{author_id}"),
             "content": content, "created_at": created_at}
            for post_id, author_id, content, created_at in rows
        ]

    async def persist_state(self, path: Path) -> None:
        """Dump generico di tutte le tabelle del database sqlite reale in un JSON leggibile — il
        database sqlite stesso (self._database_path) e' gia' lo stato persistito e autorevole; questo
        e' un riassunto ispezionabile senza dover aprire il file .db con un client sqlite."""
        path = Path(path)
        conn = sqlite3.connect(self._database_path)
        try:
            tables = [row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")]
            dump: dict[str, list[dict]] = {}
            for table in tables:
                cursor = conn.execute(f"SELECT * FROM '{table}'")
                columns = [description[0] for description in cursor.description]
                dump[table] = [dict(zip(columns, row)) for row in cursor.fetchall()]
        finally:
            conn.close()
        path.write_text(json.dumps(dump, indent=2, default=str), encoding="utf-8")

    async def close(self) -> None:
        if self._env is not None:
            await self._env.close()


def _parse_sqlite_timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
