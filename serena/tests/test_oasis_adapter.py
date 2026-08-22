"""Nessun mock di OASIS: ogni test qui costruisce un vero OasisEnv (Reddit, sqlite reale su
tmp_path) e lo esegue per davvero — la stessa disciplina "esecuzione reale, non asserita" del resto
del progetto. Runtime piu' lento delle altre suite (asyncio + sqlite reali, ~1-2s per test),
accettato deliberatamente."""
from __future__ import annotations
from datetime import datetime, timezone

import pytest

from serena.models.agent import AgentArchetype, AgentProfile
from serena.simulation.oasis.adapter import OasisSimulationAdapter
from serena.simulation.oasis.determinism import seeded_random
from serena.simulation.oasis.null_model import NullModelBackend

NOW = datetime(2026, 8, 22, 12, 0, tzinfo=timezone.utc)


def make_profile(agent_id: str, archetype: AgentArchetype = AgentArchetype.MOMENTUM) -> AgentProfile:
    return AgentProfile(
        agent_id=agent_id, archetype=archetype, identity=f"{archetype.value} trader {agent_id}",
        capital=100_000.0, risk_profile="moderate", time_horizon="6h-24h", strategy=f"{archetype.value}_v1",
        maximum_position=0.2, maximum_drawdown=0.15, created_at=NOW,
    )


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "oasis_test.db"


@pytest.mark.asyncio
async def test_initialize_registers_every_agent(db_path):
    profiles = [make_profile("agent-1"), make_profile("agent-2")]
    adapter = OasisSimulationAdapter(profiles, platform="reddit", seed=1, database_path=db_path)
    try:
        await adapter.initialize()
        assert db_path.exists()
    finally:
        await adapter.close()


@pytest.mark.asyncio
async def test_execute_round_create_post_is_persisted_and_collectible(db_path):
    profiles = [make_profile("agent-1"), make_profile("agent-2")]
    adapter = OasisSimulationAdapter(profiles, platform="reddit", seed=2, database_path=db_path)
    try:
        await adapter.initialize()
        result = await adapter.execute_round(0, {"agent-1": ("create_post", {"content": "BTC ETF inflow news"})})
        assert result.round_index == 0
        assert result.actions_performed == 1

        actions = await adapter.collect_actions()
        create_post_actions = [a for a in actions if a.action == "create_post"]
        assert len(create_post_actions) == 1
        assert create_post_actions[0].agent_id == "agent-1"
        assert create_post_actions[0].info["content"] == "BTC ETF inflow news"
    finally:
        await adapter.close()


@pytest.mark.asyncio
async def test_collect_actions_does_not_repeat_already_collected_rows(db_path):
    profiles = [make_profile("agent-1")]
    adapter = OasisSimulationAdapter(profiles, platform="reddit", seed=3, database_path=db_path)
    try:
        await adapter.initialize()
        await adapter.execute_round(0, {"agent-1": ("create_post", {"content": "first"})})
        first_batch = await adapter.collect_actions()
        second_batch = await adapter.collect_actions()
        assert len(first_batch) >= 1
        assert second_batch == []
    finally:
        await adapter.close()


@pytest.mark.asyncio
async def test_like_post_action_and_social_exposure_via_real_recsys(db_path):
    """VERIFICATO leggendo OasisEnv.step() (oasis/environment/env.py): `update_rec_table()` gira
    all'INIZIO dello step, prima di eseguire le azioni di quello stesso round — quindi un post creato
    nel round N entra nella tabella `rec` solo al refresh del round N+1, non all'interno dello stesso
    round in cui e' stato pubblicato. Il test rispetta questa sequenza reale invece di assumerne una
    diversa (trovato empiricamente: un primo tentativo che verificava l'esposizione nello stesso
    round falliva contro il vero OasisEnv)."""
    profiles = [make_profile("agent-1"), make_profile("agent-2")]
    adapter = OasisSimulationAdapter(profiles, platform="reddit", seed=4, database_path=db_path)
    try:
        await adapter.initialize()
        await adapter.execute_round(0, {"agent-1": ("create_post", {"content": "BTC breaks resistance"})})
        await adapter.execute_round(1, {})  # forza un secondo refresh reale della recsys
        exposure = await adapter.collect_social_exposure("agent-2")
        assert any(post["content"] == "BTC breaks resistance" for post in exposure)

        like_result = await adapter.execute_round(2, {"agent-2": ("like_post", {"post_id": 1})})
        assert like_result.actions_performed == 1
        actions = await adapter.collect_actions()
        assert any(a.action == "like_post" and a.agent_id == "agent-2" for a in actions)
    finally:
        await adapter.close()


@pytest.mark.asyncio
async def test_execute_round_raises_on_unknown_agent_id(db_path):
    adapter = OasisSimulationAdapter([make_profile("agent-1")], platform="reddit", seed=5, database_path=db_path)
    try:
        await adapter.initialize()
        with pytest.raises(KeyError):
            await adapter.execute_round(0, {"never-registered": ("create_post", {"content": "x"})})
    finally:
        await adapter.close()


@pytest.mark.asyncio
async def test_persist_state_writes_a_readable_json_dump_of_every_table(db_path, tmp_path):
    adapter = OasisSimulationAdapter([make_profile("agent-1")], platform="reddit", seed=6, database_path=db_path)
    try:
        await adapter.initialize()
        await adapter.execute_round(0, {"agent-1": ("create_post", {"content": "hello"})})
        summary_path = tmp_path / "summary.json"
        await adapter.persist_state(summary_path)

        import json
        dump = json.loads(summary_path.read_text(encoding="utf-8"))
        assert "post" in dump
        assert dump["post"][0]["content"] == "hello"
    finally:
        await adapter.close()


def test_constructor_rejects_empty_agent_profiles(tmp_path):
    with pytest.raises(ValueError):
        OasisSimulationAdapter([], platform="reddit", seed=1, database_path=tmp_path / "x.db")


def test_null_model_backend_raises_loudly_instead_of_fabricating_a_response():
    backend = NullModelBackend()
    with pytest.raises(RuntimeError):
        backend._run(messages=[])


@pytest.mark.asyncio
async def test_null_model_backend_arun_also_raises_loudly():
    backend = NullModelBackend()
    with pytest.raises(RuntimeError):
        await backend._arun(messages=[])


def test_seeded_random_restores_previous_state_on_exit():
    import random

    random.seed(999)
    state_before = random.getstate()
    with seeded_random(42):
        random.random()
    assert random.getstate() == state_before


def test_seeded_random_restores_state_even_on_exception():
    import random

    random.seed(999)
    state_before = random.getstate()
    with pytest.raises(ValueError):
        with seeded_random(42):
            raise ValueError("boom")
    assert random.getstate() == state_before
