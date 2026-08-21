# MiroFish / OASIS — Reverse-Engineering Report

Status: Phase 0 deliverable for the "MiroFish Trading" research platform (branch `Serena`).

Method: both repositories were cloned locally and inspected directly (`git ls-files`, `Read`, `Grep`) —
not summarized from READMEs or blog posts. Every claim below is tagged:

- **VERIFIED FROM SOURCE** — read directly in the cloned code, file path + line/function cited.
- **INFERRED** — reasoned from code structure but not explicitly stated anywhere.
- **OUR DESIGN DECISION** — not a fact about upstream code; a choice we are making for "MiroFish Trading."
- **UNKNOWN / NOT FOUND** — searched for, not located; stated explicitly rather than guessed.

Repos inspected:

| Repo | URL | Commit | Package version |
|---|---|---|---|
| MiroFish | `https://github.com/666ghj/MiroFish.git` | `117ed37758cdc96f73b7d5e0d22713c50439695f` (2026-08-17) | n/a (app, not a package) |
| OASIS | `https://github.com/camel-ai/oasis.git` | `372bd70e5849224aacbb2464a3e079db4cde2bbc` (2026-08-20) | `0.2.5` (`camel-oasis`) |

---

## PART A — MiroFish

### A.1 Repo structure (VERIFIED FROM SOURCE)

```
backend/
  app/
    api/            graph.py, report.py, simulation.py        (Flask REST endpoints)
    models/         project.py, task.py                       (TaskManager, file/in-memory task state)
    services/       ontology_generator.py, graph_builder.py, oasis_profile_generator.py,
                     simulation_config_generator.py, simulation_manager.py, simulation_runner.py,
                     simulation_ipc.py, zep_graph_memory_updater.py, zep_entity_reader.py,
                     zep_tools.py, report_agent.py, text_processor.py
    utils/          llm_client.py, openai_chat_compat.py, zep.py, zep_paging.py, zep_lifecycle.py,
                     ontology.py, file_parser.py, locale.py, retry.py, logger.py
    config.py       Flask Config — single source of truth for env vars
  scripts/          run_twitter_simulation.py, run_reddit_simulation.py, run_parallel_simulation.py,
                     action_logger.py, test_profile_format.py, validate_zep_cloud_integration.py
  tests/            18 pytest files
  pyproject.toml, requirements.txt, uv.lock
frontend/           Vue 3 SPA (Step1GraphBuild.vue … Step5Interaction.vue)
```

Every file named in the original task prompt exists essentially as named under `backend/app/services/` — no guessing/renaming was required.

### A.2 Ontology generation — `backend/app/services/ontology_generator.py`

**VERIFIED FROM SOURCE.** Class `OntologyGenerator` (line 194). `generate()` (line 203) calls
`llm_client.chat_json(...)` (lines 235-243) at **temperature 0.3**, `max_attempts=2`.

- Prompt hard-constrains the LLM: exactly **10 entity types**, of which the **last 2 are always the
  fallback types `Person`/`Organization`**; 6-10 edge types; attribute names may not collide with Zep
  reserved words (lines 109-191).
- `_validate_and_process()` (line 432) is defensive: normalizes casing (PascalCase entities,
  UPPER_SNAKE_CASE edges), de-duplicates, force-injects the two fallback types if the LLM omitted them,
  truncates to respect `MAX_ONTOLOGY_TYPES = 10` (`utils/ontology.py:6`), and drops edges whose endpoints
  no longer exist after truncation (lines 500-621).
- Long documents (>50,000 chars) are **not truncated** — chunked (8,000 chars, 200 overlap), up to 60
  chunks sampled evenly across the whole document (`_select_representative_chunks`, line 354).
- `generate_python_code()` (line 627) converts the ontology into literal Python `EntityModel`/`EdgeModel`
  subclasses **compatible only with `zep_cloud.external_clients.ontology`** — the ontology's only
  consumer is the Zep SDK's dynamic type system, not a generic graph schema.

**Reusable concept (OUR DESIGN DECISION target):** the *validation discipline* (hard cap, forced
fallback types, casing normalization, dangling-edge pruning, chunked long-document sampling) is a good
pattern to keep. The *output format* (Zep-specific Pydantic subclasses) is not — it must be replaced
with a backend-agnostic schema (see Part C).

### A.3 Graph backend — `backend/app/services/graph_builder.py`

**VERIFIED FROM SOURCE: hard-locked to Zep Cloud, no abstraction.** Imports `zep_cloud` directly (line
13), instantiates `get_zep_client(Config.ZEP_API_KEY)` (line 72). `Config.validate()`
(`config.py:71-72`) **actively rejects** a self-hosted Zep endpoint:

```python
if os.environ.get("ZEP_API_URL"):
    errors.append("ZEP_API_URL 不受支持；MiroFish 仅连接 Zep Cloud")
    # "ZEP_API_URL is not supported; MiroFish only connects to Zep Cloud."
```

Schema is dynamically-generated Pydantic classes registered via `client.graph.set_ontology(...)` (line
399) — no schema exists independent of what Zep's ontology API accepts. Ingestion uses Zep's Batch API
with real engineering care: hard-limit validation before mutation (`validate_batch_chunks`, line 566:
batch size 1-350, ≤50,000 chunks/batch, ≤10,000 chars/chunk), a deterministic idempotency key
(`build_operation_id`, SHA-256 of graph_id + payload hash, line 264) with reconciliation logic for lost
responses — but mutating calls are **explicitly not auto-retried** because create/add aren't documented
as idempotent (comment, lines 417-420).

**This is the single most consequential finding for our architecture**: every graph-touching MiroFish
service (`graph_builder.py`, `oasis_profile_generator.py`'s enrichment step, `zep_graph_memory_updater.py`,
`zep_tools.py`, `zep_entity_reader.py`) directly instantiates the Zep client — there is no
interface/protocol class anywhere in `backend/app/utils/zep.py` (a single-provider client factory, not a
plugin system). We must NOT reproduce this. See Part C §"Graph backend abstraction."

### A.4 Agent profile generation — `backend/app/services/oasis_profile_generator.py`

**VERIFIED FROM SOURCE.** Class `OasisProfileGenerator` (line 205), output `OasisAgentProfile` (line 79)
with fields: `user_id, user_name, name, bio, persona, karma, friend_count, follower_count,
statuses_count, age, gender, mbti, country, profession, interested_topics, source_entity_uuid,
source_entity_type, created_at`.

- Uses a **second, independent** LLM client (raw `openai.OpenAI`, line 258) — not Zep's LLM.
- Before generating a persona, does a hybrid edges+nodes search against the graph
  (`_search_zep_for_entity`, line 348, `ThreadPoolExecutor(max_workers=2)`) to build extra context —
  persona generation is not purely from the entity's own attributes.
- **Temperature: `0.7 - (attempt * 0.1)`** (line 581) — 0.7 on the first attempt, decreasing only on
  retry. `max_attempts=3`.
- On full LLM exhaustion, falls back to **rule-based generation using Python's unseeded `random`**
  (`_generate_profile_rule_based`, line 818: `random.randint`, `random.choice` for
  age/gender/MBTI/country) — a non-determinism source independent of LLM temperature.
- `generate_username()` (lines 338-346) appends `random.randint(100, 999)` to every username — another
  unseeded source.
- Parallel generation via `ThreadPoolExecutor(max_workers=5)` with lock-protected incremental writes.
- Output format is platform-specific by direct requirement of OASIS's own loaders: Reddit → JSON array;
  Twitter → CSV with columns `user_id,name,username,user_char,description` (matches OASIS's
  `generate_agents`/`generate_reddit_agents` CSV/JSON readers — see Part B §4).

### A.5 Simulation config generation — `backend/app/services/simulation_config_generator.py`

**VERIFIED FROM SOURCE.** Class `SimulationConfigGenerator` (line 201). Staged generation (module
docstring, lines 6-10) specifically to avoid one giant LLM call:

1. Time config (line 537) — total hours, minutes/round, activation-rate bounds, time-of-day multipliers.
2. Event config (line 648) — hot topics, narrative direction, `initial_posts[]` tagged with a
   `poster_type` resolved against the ontology.
3. Agent activity configs, **batched 15 entities per LLM call** (`AGENTS_PER_BATCH=15`, line 217).
4. Platform config (Twitter/Reddit recency/popularity weights) — **not LLM-generated**, hardcoded
   (lines 342-360).

Same **temperature `0.7 - (attempt * 0.1)`** pattern (line 452) as the profile generator, same
`max_attempts=3`. Non-LLM rule-based fallback exists per entity type (`_generate_agent_config_by_rule`,
line 910) — fully deterministic, used only when the LLM path fails.

### A.6 Simulation runner / manager / IPC (VERIFIED FROM SOURCE — this answers "how does MiroFish talk to OASIS")

**Process model**: `SimulationRunner.start_simulation()` (`simulation_runner.py:371`) launches OASIS as a
**separate OS process** via `subprocess.Popen([sys.executable, script_path, "--config",
config_path], ..., start_new_session=True)` (lines 539-549), where `script_path` is one of
`run_twitter_simulation.py` / `run_reddit_simulation.py` / `run_parallel_simulation.py`.

**No sockets, no message queue, no shared memory.** Communication is entirely file-based:

1. A monitor thread polls `twitter/actions.jsonl` and `reddit/actions.jsonl` every 2 seconds
   (`_monitor_simulation`, line 619), tracking a byte offset and re-reading only the new tail — a
   "tail -f"-style poller, not `inotify`/`watchdog`.
2. Interview/close-env commands go through `simulation_ipc.py`'s `SimulationIPCClient`/`Server`: Flask
   writes a JSON command file to `{sim_dir}/ipc_commands/{uuid}.json`, then polls
   `{sim_dir}/ipc_responses/{uuid}.json` every 0.5s up to a timeout (60-120s). The subprocess-side
   `ParallelIPCHandler` (in `run_parallel_simulation.py`, lines 217-601) polls the same directory sorted
   by mtime. The module docstring calls this exactly what it is: *"a simple command/response pattern
   implemented via the filesystem."*
3. Process liveness is an `env_status.json` file, not a heartbeat.
4. Cross-platform termination: Windows `taskkill /PID {pid} /T` then `/F`; Unix `SIGTERM` then `SIGKILL`
   via process group (`_terminate_process`, line 909).
5. A per-simulation `threading.Lock` (`_finalization_lock`, line 242) guards state transitions between
   the monitor thread, `stop_simulation()`, and shutdown cleanup — explicitly to avoid duplicate/lost
   Zep ingestion.

**`run_parallel_simulation.py`** (VERIFIED — the actual OASIS integration point):

- Imports real `camel`/`oasis`: `from camel.models import ModelFactory`; `import oasis`; `from oasis
  import ActionType, LLMAction, ManualAction, generate_twitter_agent_graph, generate_reddit_agent_graph`
  (lines 161-170).
- Twitter and Reddit run **concurrently in one process** via `asyncio.gather()` (lines 1585-1588), each
  with its own `oasis.make(agent_graph=..., platform=..., database_path=..., semaphore=30)`. **Not**
  multiprocessing — only the Flask↔script boundary is a separate OS process.
- Per-round agent activation is a probabilistic sample using Python's **un-seeded** `random` module
  (`get_active_agents_for_round`, line 1040) — `random.uniform`/`random.random()` with no `random.seed()`
  call anywhere in the file. **A second, independent non-determinism source beyond LLM temperature.**
- After each `env.step(actions)`, results are pulled back out of OASIS's own SQLite DBs via raw
  `sqlite3` queries (`fetch_new_actions_from_db`, line 657) and re-serialized as `actions.jsonl` events —
  this is the producer side of what `simulation_runner.py`'s monitor thread tails.
- Supports a dual-LLM "boost" config: Twitter uses the primary API key/model; Reddit prefers a separate
  `LLM_BOOST_*` key/model if configured, purely for throughput (line 984).
- The process does **not exit** after the round loop — it enters an IPC-command polling loop to keep
  serving Interview/BatchInterview requests until `close_env` or SIGTERM/SIGINT (graceful shutdown via
  `asyncio.Event`, not `sys.exit()`).

### A.7 Zep graph memory updater — `backend/app/services/zep_graph_memory_updater.py`

**VERIFIED FROM SOURCE: hard-coded to Zep Cloud, same as `graph_builder.py`** — no strategy pattern.
Streams simulation activity (posts, likes, follows, comments) back into the graph in near-real-time:
batches of 5 activities (`BATCH_SIZE=5`), 0.5s between sends, episodes capped at 9,500 chars.
`AgentActivity.to_episode_text()` (line 36) converts structured actions into **natural-language Chinese
sentences** per action type — because simulation events re-enter the graph through Zep's own LLM-based
extraction, not a direct structured write. `DO_NOTHING` actions are explicitly filtered out (line 372).

**Failure semantics are fail-closed and not auto-recoverable**: `graph.add` has no idempotency key, so a
failed batch is recorded and never automatically replayed (comment, lines 533-536); `stop()` raises
`RuntimeError` if any batch failed. A transient Cloud error during a live simulation can leave the
graph-memory path permanently incomplete, requiring manual intervention.

### A.8 Report agent — `backend/app/services/report_agent.py`

**VERIFIED FROM SOURCE.** Class `ReportAgent` (line 871). **Module docstring claims "LangChain + Zep
ReACT" — this is stale/incorrect**: there is no LangChain dependency anywhere in
`requirements.txt`/`pyproject.toml`, and the ReACT loop is a **hand-rolled `while` loop** with
regex-based tool-call parsing (`_parse_tool_calls`, line 1073), not `langchain.agents.AgentExecutor`.

- Two-phase: `plan_outline()` (temp 0.3, 2-5 sections, hardcoded 3-section fallback on failure) →
  `_generate_section_react()` per section (temp 0.5, max 5 tool-call iterations, min 3, max 5 tool calls
  per section).
- **Four tools** (VERIFIED, `_define_tools()` line 925): `insight_forge` (deep multi-hop retrieval),
  `panorama_search` (breadth search with temporal awareness — current vs. expired facts),
  `quick_search` (direct fact lookup), `interview_agents` (calls the **live OASIS process's** interview
  API — requires the simulation to still be running; reports generated after teardown cannot get fresh
  interviews).
- **Anti-hallucination guardrails are enforced in code, not just prompted**: `_strip_fake_tool_results()`
  (line 1143) strips any `<tool_result>` tags the LLM invents before appending to history; explicit
  prohibition in the prompt on fabricating usernames/quotes/statistics (lines 667-671).
- Each completed section is truncated to 4,000 chars when fed back as context for later sections.
- Two parallel log streams: structured `agent_log.jsonl` (untruncated) and plain-text `console_log.txt`.

**Reusable concept:** the ReACT-with-typed-tools pattern, the fact/interpretation separation discipline,
and the anti-hallucination code-level guardrail (strip fake tool results) are all directly applicable to
our own Report Agent (Part C).

### A.9 Dependency versions (VERIFIED FROM SOURCE — `pyproject.toml` / `requirements.txt`)

| Package | Version |
|---|---|
| Python | `>=3.11,<3.13` |
| flask | `>=3.0.0` |
| openai (SDK) | `>=1.0.0`, unpinned |
| **zep-cloud** | **`==3.25.0`**, exact-pinned |
| **camel-oasis** | **`==0.2.5`**, exact-pinned |
| **camel-ai** | **`==0.2.78`**, exact-pinned |
| pydantic | `>=2.0.0` |

No LangChain anywhere (contradicts the `report_agent.py` docstring — see A.8).

### A.10 Persistence model (VERIFIED FROM SOURCE)

No relational/document DB of MiroFish's own. Mix of:

1. **Zep Cloud** (external, hosted) — the only knowledge graph.
2. **Flat JSON files** per simulation, `backend/uploads/simulations/{simulation_id}/`: `state.json`,
   `run_state.json` (both **overwritten in place**, no history), `simulation_config.json`,
   `reddit_profiles.json`/`twitter_profiles.csv`, append-only `twitter/actions.jsonl` /
   `reddit/actions.jsonl`, ephemeral `env_status.json`/`ipc_commands/`/`ipc_responses/`.
3. **SQLite** `twitter_simulation.db`/`reddit_simulation.db` — these are **OASIS's own** internal DBs
   (see Part B §8), read by MiroFish via raw `sqlite3` queries, not authored by MiroFish.
4. Report artifacts under `uploads/reports/{report_id}/`: `meta.json`, `outline.json`, `progress.json`,
   `section_NN.md`, `full_report.md`, `agent_log.jsonl`, `console_log.txt`.

**Does it version runs?** Each *simulation* gets a fresh UUID directory (`sim_{uuid4().hex[:12]}`) — so
distinct simulation attempts are namespace-isolated. But `cleanup_simulation_logs()`
(`simulation_runner.py:1365`) deletes `run_state.json`, both `actions.jsonl`, both `.db` files, and
`env_status.json` to force-restart a simulation **within the same simulation_id**, while preserving
config/profiles — i.e. a re-run of the same simulation destructively replaces its own action log/DB. This
is the opposite of what we need (§ "No overwriting simulation runs" is a hard requirement for us).

### A.11 Prompt examples (VERIFIED FROM SOURCE)

Ontology system prompt (`ontology_generator.py:48-74`, condensed from Chinese): *"You are a professional
knowledge-graph ontology design expert... we are building a social-media opinion simulation system...
entities must be real-world subjects that can actually speak and interact on social media."* Explicitly
excludes abstract concepts/topics/stances as entity types.

Report Agent framing (`report_agent.py:552-568`, `PLAN_SYSTEM_PROMPT`): *"You are an expert author of
'future prediction reports,' with a 'god's-eye view' of the simulated world... The outcome of the
simulated world's evolution is the prediction of what may happen in the future."* This "simulation as
oracle" framing recurs through the section prompt template, which explicitly forbids the LLM from
writing about the real world's actual current state.

Temperature-lowering retry comment (`oasis_profile_generator.py:581`, `simulation_config_generator.py:452`,
identical): `temperature=0.7 - (attempt * 0.1),  # lower the temperature on each retry`.

### A.12 Temperature / determinism finding — direct verification of the user's stated concern

**CLAIM: "MiroFish cohort generation currently uses non-zero temperatures and therefore can produce
different populations from the same input." VERDICT: CONFIRMED, and understated.**

| Generation step | File:Line | Temperature |
|---|---|---|
| Ontology | `ontology_generator.py:237` | `0.3` (constant) |
| Agent persona/profile | `oasis_profile_generator.py:581` | `0.7 − 0.1×attempt` → **0.7 first try** |
| Simulation config (population behavior) | `simulation_config_generator.py:452` | `0.7 − 0.1×attempt` → **0.7 first try** |
| Report outline | `report_agent.py:1221` | `0.3` |
| Report section ReACT | `report_agent.py:1346,1552` | `0.5` |
| `LLMClient.chat()` default | `llm_client.py:134` | `0.7` |
| `LLMClient.chat_json()` default | `llm_client.py:162` | `0.3` |

No call site passes `temperature=0`; no `seed=` parameter appears anywhere in the codebase.

**Two additional, independent, unseeded non-determinism sources** (beyond temperature):

1. Rule-based fallback profiles use bare `random.randint`/`random.choice` when the LLM path exhausts
   retries (`oasis_profile_generator.py:834-991`).
2. Per-round agent activation sampling in `run_parallel_simulation.py:1063-1080` uses
   `random.uniform`/`random.sample`/`random.random()` with **no `random.seed()` call anywhere in the
   file** — this directly determines which agents act in which round.

**Conclusion for our architecture**: pinning LLM temperature to 0 is necessary but not sufficient for
reproducibility. We must also seed every stdlib `random`/`numpy` RNG used in population generation and
round-level sampling. See Part C, `SIMULATION_SEED` design.

### A.13 Known limitations (VERIFIED FROM SOURCE unless marked)

- No `TODO`/`FIXME`/`XXX` comments anywhere in the Python backend (VERIFIED via grep) — either unusually
  clean, or work tracking happens outside the code.
- `report_agent.py`'s module docstring claiming LangChain is **factually wrong** (A.8) — a real
  documentation/implementation drift.
- **Hard architectural lock-in to Zep Cloud**, not an abstraction (A.3, A.7) — the single biggest
  reusability blocker for us.
- State files overwritten, not versioned (A.10) — directly conflicts with our reproducibility
  requirement.
- `interview_agents` requires a live OASIS process — real coupling between report generation and a still-
  running simulation.
- Zep ingestion failures fail closed, not auto-recoverable (A.7).
- Unseeded `random` for round-level agent activation (A.12).
- `camel-ai`/`camel-oasis` are exact-pinned (`==0.2.78`/`==0.2.5`), not range-pinned — MiroFish's own
  OASIS integration is release-specific and would need rework on an OASIS upgrade.
- README limitations/roadmap section: **UNKNOWN / NOT FOUND** — searched (`grep -i
  "limitation|不足|已知问题|TODO|roadmap|局限"` against `README.md`), found only marketing-copy usage of
  the word "limitations," no dedicated section in the portion inspected.

---

## PART B — OASIS (camel-ai)

### B.1 Repo structure (VERIFIED FROM SOURCE, `git ls-files`, 462 tracked files)

```
oasis/                          # the installable package ("camel-oasis")
  __init__.py                   # public API: oasis.make, ActionType, etc.
  clock/clock.py                # sandbox Clock
  environment/
    env.py                      # OasisEnv — the main env class
    env_action.py               # ManualAction / LLMAction dataclasses
    make.py                     # oasis.make() factory
  social_agent/
    agent.py                    # SocialAgent (subclasses camel ChatAgent)
    agent_action.py             # SocialAction — per-agent tool/function wrappers
    agent_environment.py        # SocialEnvironment / Environment(ABC) — prompt building
    agent_graph.py               # AgentGraph (igraph or neo4j backend)
    agents_generator.py          # bulk agent creation from CSV/JSON
  social_platform/
    platform.py                  # Platform — the dispatcher + all SQL logic
    channel.py                   # asyncio.Queue-based agent<->platform bus
    database.py                  # sqlite3 schema loader
    recsys.py                    # 4 recommendation algorithms
    process_recsys_posts.py      # embedding generation (HF transformers / OpenAI)
    typing.py                    # ActionType, RecsysType, DefaultPlatformType
    config/user.py                # UserInfo (agent profile) + prompt builders
    config/neo4j.py               # Neo4jConfig
    schema/*.sql                  # 16 SQLite DDL files
examples/                        # ~30 runnable scripts
generator/                       # offline agent-population generators
test/                            # pytest suite
```

No `src/` layout — `oasis/` is the package root.

### B.2 Environment lifecycle — `oasis/environment/env.py`

**Class `OasisEnv`** (lines 48-209). `oasis.make(agent_graph, platform, database_path=None,
semaphore=128)` is a thin wrapper (`environment/make.py:17-19`).

- Constructor: `DefaultPlatformType.TWITTER` → `Platform(db_path, channel, recsys_type="twhin-bert",
  refresh_rec_post_count=2, max_rec_post_len=2, following_post_count=3)`; `.REDDIT` →
  `Platform(db_path, channel, recsys_type="reddit", allow_self_rating=True, show_score=True,
  max_rec_post_len=100, refresh_rec_post_count=5)`. `self.llm_semaphore =
  asyncio.Semaphore(semaphore)` caps concurrent LLM calls (default 128).
- `async reset()`: starts the platform's message-processing loop as a background task, signs up all
  agents.
- **`async step(actions: dict[SocialAgent, Union[ManualAction, LLMAction, List[...]]])`** — the main
  loop: (1) `platform.update_rec_table()` recomputes recs for **all** users; (2) builds one asyncio task
  per `(agent, action)` pair — `ManualAction` calls `agent.perform_action_by_data(...)` directly,
  `LLMAction` calls `agent.perform_action_by_llm()` gated by the semaphore; (3) `asyncio.gather(*tasks)`
  — **all agents' actions in a step run concurrently**, no turn order; (4) Twitter-only:
  `platform.sandbox_clock.time_step += 1`. Returns `None` — no gym-style `(obs, reward, done, info)`.
- `async close()`: sends `ActionType.EXIT`, awaits the platform task (closes the sqlite connection).

### B.3 Agent graph — `oasis/social_agent/agent_graph.py`

**Class `AgentGraph`** (lines 175-293). Backend `Literal["igraph","neo4j"]`, default igraph (directed
`ig.Graph`). Neo4j backend is a hand-rolled Cypher wrapper requiring a live Neo4j instance.

**Important gotcha (VERIFIED)**: the follow graph is a **separate structure from the SQLite `follow`
table**. `platform.follow()` only writes the DB table; `AgentGraph` edges are updated only via
`SocialAgent.perform_agent_graph_action()`, which is **commented out in the live LLM action path**
(`agent.py:150`). At runtime, the in-memory graph and DB table can silently diverge unless an integrator
wires that call back in. For 1M-agent runs, `agents_generator.generate_agents_100w()` abandons
`AgentGraph` entirely for a plain Python list (explicit comment: "the agentgraph class is too slow").

### B.4 Agent profiles — `oasis/social_platform/config/user.py`

**`UserInfo` dataclass** (lines 22-42): `user_name, name, description, profile: dict, recsys_type,
is_controllable`. `profile` conventionally has shape `{"nodes": [], "edges": [], "other_info": {...}}`.
`to_system_message()` dispatches on `recsys_type` to fixed Twitter/Reddit prompt templates
(`# OBJECTIVE / # SELF-DESCRIPTION / # RESPONSE METHOD`); Reddit's additionally appends
gender/age/mbti/country. A fully custom template path exists (`to_custom_system_message`).

Loading paths (`agents_generator.py`): `generate_agents` (Twitter CSV:
`username,name,description,user_char,following_agentid_list,previous_tweets`),
`generate_reddit_agents` (JSON: `persona,mbti,gender,age,country,username,realname,bio`),
`generate_agents_100w` (vectorized for scale), `generate_controllable_agents` (human-in-the-loop, prompts
via `input()`).

### B.5 `ActionType` — the exact enum (VERIFIED FROM SOURCE, `oasis/social_platform/typing.py:17-49`)

30 members: `EXIT, REFRESH, SEARCH_USER, SEARCH_POSTS, CREATE_POST, LIKE_POST, UNLIKE_POST,
DISLIKE_POST, UNDO_DISLIKE_POST, REPORT_POST, FOLLOW, UNFOLLOW, MUTE, UNMUTE, TREND, SIGNUP, REPOST,
QUOTE_POST, UPDATE_REC_TABLE, CREATE_COMMENT, LIKE_COMMENT, UNLIKE_COMMENT, DISLIKE_COMMENT,
UNDO_DISLIKE_COMMENT, DO_NOTHING, PURCHASE_PRODUCT, INTERVIEW, JOIN_GROUP, LEAVE_GROUP, SEND_TO_GROUP,
CREATE_GROUP, LISTEN_FROM_GROUP`.

Two **opt-in-only** default subsets exist (`get_default_twitter_actions()` / `get_default_reddit_actions()`)
but are used only by 3 example scripts, never applied automatically. **If `available_actions` is not
passed, all 28 agent-invokable actions are exposed to the LLM's tool-calling loop** (excludes `SIGNUP`
and `EXIT`/`UPDATE_REC_TABLE`, which are platform-internal).

Each action is a thin async wrapper (`SocialAction`, `agent_action.py`) that packages args and writes
`(agent_id, message, type)` onto the `Channel` queue — the real business logic and SQL lives platform-side
(`Platform`).

### B.6 Twitter vs. Reddit — what actually differs (VERIFIED FROM SOURCE)

**There is one `Platform` class, not two.** Differentiation is entirely constructor parameters plus one
recurring `if self.recsys_type == RecsysType.REDDIT:` branch (~20 occurrences in `platform.py`):

| Aspect | Twitter | Reddit |
|---|---|---|
| `recsys_type` | `"twhin-bert"` | `"reddit"` |
| `refresh_rec_post_count` | 2 | 5 |
| `max_rec_post_len` | 2 | 100 |
| `following_post_count` | 3 (pulls followee posts too) | n/a |
| `show_score` | `False` (raw likes/dislikes) | `True` (single `score = likes − dislikes`) |
| Time | `sandbox_clock.time_step` — integer counter, advanced once per `env.step()` | real `datetime`, scaled by clock factor `k` |
| `refresh()` | joins followee posts + rec-table posts | rec-table only |

Every other action (post, like, follow, comment, groups, purchase) is identical code for both.

### B.7 Recommendation system — `oasis/social_platform/recsys.py`

Dispatched from `Platform.update_rec_table()` via a hardcoded `if/elif` on `RecsysType`
(`platform.py:336-381`) — **not a plugin interface**:

- `RANDOM` → `rec_sys_random()`: `random.sample` if over capacity, else everyone gets everything.
- `REDDIT` → `rec_sys_reddit()`: classic Reddit "hot score" (`sign(s)*log10(|s|) +
  epoch_seconds/45000`); **the same top-K list for every user** — not personalized.
- `TWITTER` → `rec_sys_personalized_with_trace()`: per-user cosine similarity (sentence-transformer)
  between bio and post content, adjusted by like/dislike trace, 10% randomly swapped for diversity.
- `TWHIN` (`"twhin-bert"`, OASIS's Twitter default) → `rec_sys_personalized_twh()`: HuggingFace
  `Twitter/twhin-bert-base` or OpenAI embeddings for cosine similarity, weighted by recency.

`Platform.rec_prob = 0.7` is set but **never read anywhere else** — dead/vestigial config (a known,
verified inconsistency, not a design pattern to imitate).

**To add a custom ranker** (e.g. trading-relevance): fork/subclass `Platform.update_rec_table()`, or add
a new `RecsysType` branch. There is no callback/strategy-object injection point.

### B.8 Database / persistence (VERIFIED FROM SOURCE)

**SQLite only**, single file, `PRAGMA synchronous = OFF`. 16 tables loaded from `.sql` DDL files:
`user, post, follow, mute, like, dislike, comment, comment_like, comment_dislike, report, rec, trace,
product, chat_group, group_members, group_messages`.

- `post` — reposts/quotes are rows in the same table (`original_post_id` links them, `quote_content`
  NULL distinguishes repost from quote).
- `trace(user_id, created_at, action, info, PRIMARY KEY(user_id, created_at, action, info))` — the full
  audit log of every action; `info` is JSON. **Composite PK can collide** if two identical actions
  (same JSON `info`) by the same user land at the same timestamp resolution — a real edge case, worth
  avoiding in our own event log design.
- `rec(user_id, post_id)` — fully rebuilt (`DELETE` + bulk insert) every `update_rec_table()` call.
- `product(product_id, product_name, sales)` — **no price column** (see B.9).
- No thread/process parallelism — one asyncio event loop, one sqlite3 connection, cooperative scheduling.

### B.9 Financial/trading concepts — confirmed absent (VERIFIED)

`grep -rniE "price|stock|trading|market|portfolio|ticker|financ" oasis/ --include="*.py"` → **zero
matches** in the core package. The only adjacent feature is a toy `PURCHASE_PRODUCT` action that
increments a `sales` counter on a `product` table with **no price field, no wallet, no currency, no
transaction ledger**. "Price" only ever appears as marketing-copy free text in a sample dataset
(`data/emall/product.json`), never as a structured value.

**Conclusion**: OASIS is purely a social-simulation substrate. A trading system built on it is layering
entirely new domain concepts (price feeds, orders, positions, wallets) — nothing to repurpose beyond a
non-functional counter.

### B.10 Agent memory / state (VERIFIED FROM SOURCE where noted; camel-ai internals out of scope)

`SocialAgent` subclasses `camel.agents.ChatAgent` — the actual memory *implementation*
(`MemoryRecord`, context windowing) lives in the external `camel-ai==0.2.90` package, not in this repo
(**INFERRED/OUT OF SCOPE** for this clone).

What's verified in-repo: after a manual action, the agent appends a system-role memory record describing
what happened (`agent.py:286-291`). Interview Q&A is written to memory only if `interview_record=True`
was set at construction; otherwise it's recorded to the DB `trace` table but bypasses LLM context.
**Per-step "observation" is not memory** — `SocialEnvironment.to_text_prompt()` rebuilds it fresh every
call (fresh SQL queries for follower/following counts, a full `refresh()` DB round-trip for posts) — no
caching or diffing. **There is no separate agent-state table for beliefs/goals** — anything beyond the
ChatAgent's own conversation memory must be bolted on by the integrator.

### B.11 Simulation stepping, time, determinism (VERIFIED FROM SOURCE)

- Async, not turn-based: all agents in one `step()` call run concurrently via `asyncio.gather`, gated
  only by a semaphore.
- Round structure is caller-defined — `step()` is called once per round by the integrator's own loop.
- **Clock inconsistency**: Reddit timestamps derive from real wall-clock time × a magnification factor
  `k` (non-deterministic across runs of different execution speed); Twitter timestamps are a plain
  incrementing integer bumped once per `step()` call by `OasisEnv` itself, not by the `Clock` object.
- **No RNG seeding mechanism exists anywhere in `oasis/`** (VERIFIED via grep). A docstring parameter
  `model_random_seed` is documented in two places (`agents_generator.py:53,197`) but **does not actually
  exist** in either function's signature — a stale/incorrect docstring. `recsys.py` and
  `platform.refresh()` call bare `random.sample`/`random.random()`/`random.shuffle` with no seeding.
  Reproducibility is not supported out of the box.

### B.12 Realistic extension points for a trading integration (VERIFIED FROM SOURCE)

No formal plugin SDK exists. Concretely available, in order of how invasive they are:

1. **Custom `tools=` on `SocialAgent`** (`agent.py:68`) — attach arbitrary `camel.toolkits.FunctionTool`
   callables (e.g. `get_price(ticker)`) alongside platform actions. **Lowest friction**, but these calls
   bypass the `Channel`/`Platform` dispatch entirely — not automatically written to the `trace` table; we
   must persist them ourselves.
2. **`ManualAction`/`LLMAction` step dict** (`env.py:136-139`) — mix scripted and autonomous actions per
   round, including lists per agent. Clean seam for injecting deterministic "world events" (e.g. a price
   shock as a `ManualAction(CREATE_POST, ...)`) without touching OASIS internals.
3. **Custom `Platform` instance/subclass** — `OasisEnv.__init__` accepts a pre-built `Platform` object
   instead of a `DefaultPlatformType` enum (demonstrated in `examples/custom_platform_simulation.py`).
   Because `Platform.running()` dispatches via `getattr(self, action.value, None)`, adding a new
   platform-level action (e.g. `place_trade`) is mechanically simple: new `ActionType` member + a
   same-named method. **Caveat**: action methods are hard-capped at 3 parameters
   (`platform.py:154-158`) — payload must be packed into one tuple/dict argument.
4. **Custom `Environment(ABC)` subclass** (`agent_environment.py:25-30`) — override `to_text_prompt()` to
   inject market data into the LLM's context. No constructor injection point exists — `SocialAgent.env`
   is hardcoded at construction, so this requires reassigning `agent.env` post-construction.
5. **Custom recommendation system** — no injection point; must subclass/fork
   `Platform.update_rec_table()` or add a new `RecsysType` branch.
6. **No pub/sub, webhook, or callback system exists anywhere** — verified by structural review of
   `env.py`, `platform.py`, `agent.py`. Any "notify me when X happens" behavior requires polling `trace`,
   wrapping `Platform` methods, or wrapping `OasisEnv.step()` in our own loop.

**Bottom line**: the cleanest, zero-fork integration points are (1) custom tools and (2) the
`ManualAction`/`LLMAction` step API. Anything requiring new persisted state (order book, positions,
wallets) requires forking `Platform` and adding new SQL schema files, since the schema loader statically
enumerates its 16 `.sql` files with no extension hook.

### B.13 Dependency versions (VERIFIED FROM SOURCE, `pyproject.toml`, Poetry)

| Package | Version |
|---|---|
| python | `>=3.10.0,<3.12` |
| pandas | `2.2.2` |
| igraph | `0.11.6` |
| sentence-transformers | `3.0.0` |
| neo4j | `5.23.0` |
| **camel-ai** | **`0.2.90`** |
| mcp | `1.29.0` (present as a dependency; no direct usage found inside `oasis/` core) |

Transitive, observed in source but not declared directly: `torch`, `transformers` (twhin-bert),
`scikit-learn`, `numpy`, `tqdm`.

### B.14 Known limitations (VERIFIED FROM SOURCE)

- Platform action methods hard-capped at 3 parameters (`platform.py:154-158`).
- 1M-agent scale explicitly breaks `AgentGraph` — falls back to a plain list (`agents_generator.py:206-208`,
  explicit `TODO` comment).
- Follow-graph/DB drift: `AgentGraph` edges are not updated by the live LLM action path (`agent.py:150`).
- Stale docstrings reference a non-existent `model_random_seed` parameter.
- `trace` table composite PK can collide on identical same-timestamp actions.
- `Platform.rec_prob = 0.7` dead/vestigial config.
- Explicit code-comment TODOs acknowledging `perform_test`/`perform_interview` duplication and
  placeholder-quality follower/following prompt text (`agent_environment.py`, `agent.py:158-161`).
- `Channel.read_from_send_queue()` polls every 100ms (`asyncio.sleep(0.1)`) rather than using a proper
  future/event — a latency tax relevant if we need fast round trips for a price feed.
- No multi-process/multi-node execution model; large runs shard by data file, not by distributing the DB.

---

## PART C — Synthesis: what we reuse, what we rewrite, what we build new

### C.1 MiroFish components reused (concept, not code — see rationale per item)

| Concept | Source | Why reuse | What changes |
|---|---|---|---|
| Ontology validation discipline (hard cap, forced fallback types, casing normalization, dangling-edge pruning, chunked long-doc sampling) | `ontology_generator.py` §A.2 | Genuinely good defensive engineering, backend-agnostic in spirit | Output becomes Pydantic models we own, not Zep-specific classes |
| Staged/decomposed LLM generation (time → events → agent batches, 15/batch) to avoid one giant call | `simulation_config_generator.py` §A.5 | Avoids context-window/JSON-truncation failure modes | Batch size and stages adapted to trading agent archetypes |
| ReACT report agent with typed tools + fact/interpretation separation + anti-hallucination code guardrail (strip fake tool results) | `report_agent.py` §A.8 | Directly matches our own Report Agent requirement | Tools point at our own signal/portfolio/backtest stores, not Zep/OASIS |
| File-based JSONL event/action logs as the audit trail | `actions.jsonl`, `zep_graph_memory_updater.py` §A.6/A.10 | Simple, inspectable, matches our "every artifact persisted" requirement | We append-version by run_id instead of overwriting in place |
| subprocess isolation for the OASIS-running process | `simulation_runner.py` §A.6 | Keeps a crashing/long-running simulation from taking down our API process | We prefer `asyncio` in-process with a `multiprocessing.Process` fallback only if isolation is truly needed — see IMPLEMENTATION_PLAN |

### C.2 OASIS components reused directly (as a library dependency, not rewritten)

- `OasisEnv` / `oasis.make()` (§B.2) — used as-is for the social-simulation loop.
- `AgentGraph` (§B.3), `UserInfo`/profile generation plumbing (§B.4) — used as-is; we generate our own
  profiles (Part C.4) but feed them through OASIS's existing loaders.
- The full `ActionType` enum (§B.5) — used as-is for social actions (`CREATE_POST`, `LIKE_POST`, etc.).
- `Platform` for Twitter/Reddit environments (§B.6/B.7) — used as-is where we want generic social noise;
  **not** used for trading-specific state (see C.3).
- `ManualAction`/`LLMAction` step API (§B.2, B.12) — our primary integration seam for injecting market
  events and collecting agent actions per round.

### C.3 Components we explicitly rewrite (obsolete/broken/unsuitable for trading)

- **Graph backend**: MiroFish's Zep Cloud lock-in (§A.3, A.7) → we build a `GraphBackend` abstraction
  (Protocol) with Neo4j and Kuzu implementations, no cloud dependency (per user's explicit requirement).
- **Determinism**: MiroFish's non-zero temperatures + unseeded `random` (§A.12) and OASIS's complete
  absence of seeding (§B.11) → we introduce `SIMULATION_SEED`, `COHORT_TEMPERATURE`, `AGENT_TEMPERATURE`,
  `DECISION_TEMPERATURE` as first-class, logged config, and seed every stdlib/numpy RNG we control.
- **Run persistence**: MiroFish overwrites `state.json`/`run_state.json` in place (§A.10) → every
  `SimulationRun` gets an immutable, versioned artifact directory; nothing is ever overwritten.
- **Financial state**: OASIS has no price/portfolio/order concept (§B.9) → the `TradingEnvironment`,
  `signals/`, `risk/`, and `backtest/` layers are entirely new, sitting alongside (not inside) the OASIS
  social substrate.
- **Recommendation system for trading relevance**: OASIS's recsys is a hardcoded if/elif with no plugin
  point (§B.7) → we do not attempt to make OASIS content-recommendation trading-relevant; instead, market
  events and news reach agents through our own `EventEngine` → `TradingEnvironment`, independent of
  OASIS's post-recommendation mechanism, which we keep purely for social noise/emergent belief dynamics.

### C.4 Components newly created (do not exist in either upstream repo)

- `TradingEnvironment` (price/returns/volume/volatility/funding/OI/news/macro/social-sentiment/consensus,
  point-in-time only — §B.9 confirms nothing like this exists upstream).
- Agent decision schema + validation (structured BUY/SELL/HOLD JSON — neither repo has anything like
  this; MiroFish's agents post social content, they don't trade).
- Signal aggregation engine (weighted consensus, independence-adjusted, correlation-aware — no analog
  upstream).
- Deterministic risk engine (position sizing, exposure/drawdown/leverage limits — no analog upstream).
- Backtest engine (walk-forward, transaction costs, baselines — no analog upstream; OASIS has no concept
  of historical replay against real market data).
- Agent performance/scoring loop with weight decay/recovery — MiroFish never scores agents against
  ground truth (it has no ground truth; it's a narrative generator), OASIS never scores agents at all.
- `ExecutionAdapter` (Paper/Live, live disabled by default) — no analog upstream.

See `docs/TRADING_ARCHITECTURE.md` for the full design of every item in this section, and
`docs/IMPLEMENTATION_PLAN.md` for staging.
