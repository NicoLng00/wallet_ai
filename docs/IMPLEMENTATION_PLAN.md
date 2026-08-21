# MiroFish Trading — Implementation Plan

Status: Phase 0 deliverable (branch `Serena`). This plan stages the architecture in
`docs/TRADING_ARCHITECTURE.md` into buildable increments. **No implementation code is written until this
plan, the architecture doc, and the reverse-engineering doc have been reviewed** — this is the explicit
checkpoint the brief's "FIRST TASK" section calls for.

Each phase below ends with the same four gates before moving to the next phase (brief's "Implementation
Strategy" section, applied literally):

1. Run tests (new tests for this phase + the full existing suite).
2. Run a minimal end-to-end example exercising this phase's new code with real (not mocked) local
   execution where feasible.
3. Persist artifacts (whatever this phase produces gets written to `runs/` or the graph backend for real,
   not just asserted in a unit test).
4. Document assumptions (anything inferred rather than verified gets written down, same tagging
   discipline as the reverse-engineering doc).

---

## Dependency choices (decided now, revisited only if a phase finds a concrete blocker)

| Concern | Choice | Why |
|---|---|---|
| Language/runtime | Python 3.11 | Matches MiroFish's own constraint (`>=3.11,<3.13`, §A.9) and OASIS's `camel-oasis` supports it; keeps us on the same interpreter family as both reference projects for easiest dependency alignment |
| Package/dependency manager | `uv` | MiroFish already uses `uv.lock` (§A.1) — proven to work with this exact dependency set (including `camel-oasis`) |
| Schema validation | `pydantic` v2 | Already the validation library MiroFish uses (§A.9) and OASIS's `camel-ai` ecosystem is Pydantic-native |
| Graph backend (default) | **Kuzu** (embedded) | Zero external service required — matches "local-first" in the brief's title; the MVP must run with nothing but a Python process |
| Graph backend (alternative) | **Neo4j** | For anyone who wants a server-based graph they can inspect with existing Neo4j tooling; implemented against the same `GraphBackend` protocol (§3.1 of the architecture doc) so it's a config swap, not a rewrite |
| Social simulation | `camel-oasis` (pinned, exact version TBD at Phase 6 start — pin to whatever is current then, re-verify against §Part B before pinning, since OASIS's API surface is release-specific per §A.9's finding about MiroFish's own exact-pin fragility) | Reuse per the brief; do not rewrite a working social-simulation engine |
| LLM SDK | Provider-agnostic `LLMClient` (architecture doc §7); initial concrete backend uses the Anthropic SDK for Tier 1 (Claude Opus) and a configurable OpenAI-compatible client for Tier 2, matching MiroFish's own pattern of routing agent-profile/config LLM calls through an OpenAI-compatible surface (§A.4) while keeping ontology/report calls swappable | Matches the brief's explicit "Claude Opus for Tier 1" requirement while keeping Tier 2 swappable for cost |
| API layer | FastAPI | Async-native (matches OASIS's own asyncio-based `step()`, §B.2 — no event-loop impedance mismatch), Pydantic-native |
| Backtest/metrics math | `numpy` / `pandas` | Same stack already used by the existing Aurora Markets project's research sandbox (`research/`) for the same class of problem, and by OASIS itself (`pandas==2.2.2`, §B.13) |
| Tests | `pytest` + `pytest-asyncio` | Same as both reference projects (§A.9, §B.13) — no new test-runner convention to learn |

---

## Phase 1 — Reverse engineering + architecture document (THIS PHASE — COMPLETE)

Deliverables: `docs/MIROFISH_REVERSE_ENGINEERING.md`, `docs/TRADING_ARCHITECTURE.md`,
`docs/IMPLEMENTATION_PLAN.md` (this file). No code. Gate: user review (see "First task" summary delivered
alongside this plan).

## Phase 2 — Project skeleton + schemas + persistence

- Create the `serena/` package tree exactly as laid out in architecture doc §1, with `__init__.py`s and
  no logic yet beyond Pydantic model definitions.
- Implement `SimulationRun`, `RandomSeedBundle`, `TemperatureConfig` (architecture §2), `Entity`,
  `Relationship`, `EntityType`, `RelationType` (architecture §3.2), `DataPoint` (architecture §4),
  `Event` (architecture §5), `AgentProfile` (architecture §6), `AgentDecision` (architecture §8),
  `BeliefUpdate` (architecture §11).
- Implement the append-only, never-overwrite artifact writer (`runs/{run_id}/...`) that every later phase
  will reuse — this is infrastructure, built once, correctly, early.
- Tests: schema validation (valid/invalid payloads for every model above), artifact writer
  (never-overwrite guarantee, append-only JSONL correctness).
- Minimal end-to-end example: construct a fake `SimulationRun`, write it and a handful of fake
  `Event`/`AgentDecision` records to a real `runs/{run_id}/` directory, read them back, assert
  round-trip fidelity.

## Phase 3 — Data ingestion + event engine

- Implement `data/market/` adapters for OHLCV/volume/volatility/mcap at minimum (funding/OI/liquidations/
  order-book as available per exchange; document which are genuinely available for the MVP's chosen asset
  rather than stubbing them silently — matches the existing Aurora Markets project's own honesty
  discipline about data-source limits, e.g. its documented Finnhub/Stooq findings).
- Implement `data/news/` for at least one real free source.
- Implement `PointInTimeDataView` (architecture §4) with a test that specifically tries to read `t >
  now` and confirms it structurally cannot.
- Implement `EventEngine` (architecture §5): deterministic timestamp/entity-resolution/novelty, LLM-based
  direction/importance/confidence via Tier 1/2 `LLMClient`.
- Tests: no-look-ahead (the load-bearing test for the brief's rule #1/#2), event schema validation,
  adapter normalization correctness against recorded fixture responses (not live API calls in CI).
- Minimal end-to-end example: pull a real recent slice of BTC/USDT OHLCV + real recent news, produce a
  handful of real `Event` records, persist them.

## Phase 4 — Knowledge graph

- Implement `GraphBackend` protocol + `KuzuGraphBackend` (default) + `Neo4jGraphBackend` (architecture
  §3.1).
- Seed the fixed ontology (architecture §3.2) into both backends; implement the
  `OntologyChangeProposal` validation path (hard cap, no duplicates, no dangling edges — the specific
  MiroFish validation behaviors worth keeping, §A.2) even though the MVP won't exercise it live.
- Tests: entity/relationship CRUD against both backends with the **same test suite** (parametrized over
  backend) to guarantee they're truly interchangeable; ontology-proposal validation (valid/invalid cases
  mirroring §A.2's guardrails: too many types, duplicate names, dangling edge, reserved attribute name).
- Minimal end-to-end example: ingest the BTC entity + a handful of real news-derived entities (exchanges,
  companies mentioned) from Phase 3's output into the graph, query the neighborhood back out.

## Phase 5 — Agent factory

- Implement the 10-archetype library the MVP needs (of the 12 in the brief; 2 may be deferred past MVP,
  see MVP section below) with profile priors + deterministic strategy hints (architecture §6).
- Implement batched, staged LLM-assisted profile generation at `cohort_temperature` (default 0.0), with
  the deterministic archetype prior as fallback on validation failure — never a `random`-based fallback
  (the specific MiroFish/OASIS failure mode being deliberately avoided, §A.12/B.11).
- Tests: profile schema validation, archetype-prior fallback triggers correctly on injected LLM failure,
  determinism (same seed + temperature=0 → identical population across two runs).
- Minimal end-to-end example: generate 50 real agent profiles (real LLM calls, Tier 1/2) across 10
  archetypes, persist `agents.json`.

## Phase 6 — OASIS adapter

- Add `camel-oasis` dependency; implement `OasisSimulationAdapter` exactly as scoped in architecture §9
  (tool-based decision collection, `ManualAction` event injection, targeted RNG seeding around the OASIS
  call, no `Platform` forking).
- Tests: adapter initializes a real (small, e.g. 5-agent) OASIS environment locally, executes a round,
  collects real actions; a determinism test that seeds twice and compares the *sequence of agents
  activated* (guards against the exact non-determinism source found in §A.6/B.11).
- Minimal end-to-end example: run 3 real rounds of a 5-agent OASIS Reddit simulation seeded with one
  Phase-3-derived market event, inspect the resulting posts/actions.

## Phase 7 — Belief / social simulation

- Wire the full loop from architecture §12: `EventEngine` → `OasisSimulationAdapter.execute_round` →
  belief updates (architecture §11) → persisted `belief_updates.jsonl`.
- Tests: every belief change has a non-empty `reason` and `information_source` (brief rule #12, enforced
  as a schema constraint, not just tested); belief updates are append-only.
- Minimal end-to-end example: run 5 rounds end-to-end (real event → real OASIS round → real belief
  updates from at least one real LLM-interpreted trigger and one deterministic market-data trigger).

## Phase 8 — Signal engine

- Implement `AgentPredictionMatrix` (architecture §14) and the weighting pipeline (architecture §13).
- Tests: weight-formula unit tests with hand-constructed inputs/expected outputs; a synthetic
  "100 correlated copies" fixture that asserts `independent_consensus` does **not** scale linearly with
  copy count (the specific brief requirement, directly testable).
- Minimal end-to-end example: feed Phase 7's real `AgentDecision`s through the signal engine, produce one
  real `risk_adjusted_signal`, persist `signals.jsonl`.

## Phase 9 — Risk engine

- Implement `risk/portfolio`, `risk/sizing`, `risk/limits` (architecture §16) as pure functions with zero
  imports from `agents/` or any `LLMClient` — enforced by an import-graph lint rule in CI (a real,
  automated check, not just a code-review convention), directly testing the brief's most-repeated
  constraint.
- Tests: position sizing determinism (same input → same output, property-based test over many random
  inputs); every limit type individually triggers correctly (max position, exposure, leverage, daily
  loss, drawdown, correlation, liquidity) with a fixture per limit.
- Minimal end-to-end example: feed Phase 8's real signal through risk sizing against a fresh paper
  portfolio, produce one real `Position`, persist `positions.jsonl`/`portfolio.jsonl`.

## Phase 10 — Historical replay / backtest

- Implement `backtest/engine` (walk-forward driver), `backtest/walk_forward` (split logic),
  `backtest/metrics`.
- Implement the 7 baselines from architecture §15, run alongside the full system on the same data slice.
- Tests: known-answer metric tests (hand-computed Sharpe/Sortino/CAGR/etc. on a small synthetic series);
  a shuffle-detection test that asserts feeding shuffled timestamps raises rather than silently running
  (guards the brief's "never randomly shuffle time-series data" rule).
- Minimal end-to-end example: run the full MVP (below) as a real walk-forward backtest over a real
  historical BTC/USDT slice, produce real `metrics.json` for all 7 variants (system + 6 baselines).

## Phase 11 — Agent scoring / evolution

- Implement `evaluation/agent_scoring`, `evaluation/calibration`, `evaluation/attribution`.
- Implement weight decay/recovery (architecture §17) — explicitly **not** deletion.
- Defer agent mutation / new-strategy generation past the MVP gate (flagged in the architecture doc as
  Phase 11 work; a real feature, just not required for the MVP to run end-to-end).
- Tests: a synthetic winning/losing trade sequence correctly decays and recovers an agent's weight; PnL
  attribution sums correctly back to portfolio-level PnL (a reconciliation test, not just unit-level).
- Minimal end-to-end example: score the real agents from the Phase-10 backtest run, persist
  `agent_scores.jsonl`, show at least one real weight change with full provenance.

## Phase 12 — Reporting / dashboard

- Implement the Report Agent (architecture §20) with its 10 tools reading real Phase-2-through-11
  artifacts; implement the fact/interpretation/outcome tagging validator.
- Implement the FastAPI `api/` read endpoints and the minimal `frontend/` dashboard (architecture §21).
- Tests: report-tag validator rejects an untagged claim (a deliberately-broken fixture report); API
  endpoint tests against a real persisted run's artifacts.
- Minimal end-to-end example: generate a real `report.md` for the full MVP backtest run, and view it (plus
  the equity curve, agent leaderboard, correlation matrix) in the dashboard.

---

## MVP definition (exact scope, per the brief)

- **1 asset**: BTC/USDT.
- **50 agents across 10 archetypes** (of the 12 listed in architecture §6 — `market_maker` and `whale`
  are the two most plausible to defer past the MVP if time-constrained, since they require the most
  bespoke behavior to be meaningfully differentiated from `quant`/`long_term_holder`; final selection
  made at Phase 5 based on what's actually useful for BTC/USDT specifically).
- **1h timeframe**, **6-24 hour prediction horizon** (`AgentDecision.time_horizon_hours`).
- **20 simulation rounds**, historical replay (walk-forward, real data).
- Real news/event input (Phase 3), real OASIS social simulation (Phase 6-7), real agent scoring
  (Phase 11), real signal aggregation (Phase 8), real backtesting against the 6 baselines (Phase 10), a
  real paper portfolio (Phase 9's sizing feeding `PaperExecutionAdapter`), and a real generated report
  (Phase 12).
- **Runs entirely locally** — Kuzu (embedded graph, no external service), local artifact files, no cloud
  dependency of any kind (the direct, deliberate contrast with MiroFish's Zep Cloud requirement, §A.3).
- Exit criterion: the MVP command runs start-to-finish without a human in the loop, produces a complete
  `runs/{run_id}/` artifact set (architecture §19), and the generated `report.md` correctly distinguishes
  SIMULATION FACT / MODEL INTERPRETATION / REAL MARKET OUTCOME throughout.

---

## Known upstream bugs/limitations we are actively designing around

(Full detail in `docs/MIROFISH_REVERSE_ENGINEERING.md`; summarized here as a standing checklist to
re-verify at the relevant phase.)

| Upstream issue | Verified in | Where we guard against it |
|---|---|---|
| Zep Cloud hard lock-in, no graph abstraction | §A.3, §A.7 | Phase 4 — `GraphBackend` protocol, Kuzu default |
| Non-zero LLM temperatures at every generation stage (0.3-0.7) | §A.12 | Phase 2 — `TemperatureConfig` defaults to 0.0 |
| Unseeded `random` in profile fallback + per-round agent activation | §A.12, §B.11 | Phase 2/5/6 — `RandomSeedBundle`, explicit `Generator` instances, targeted seeding around the OASIS call |
| State files overwritten in place, destructive restart | §A.10 | Phase 2 — never-overwrite artifact writer, `resumed_from_run_id` |
| `report_agent.py` docstring falsely claims LangChain | §A.8 | N/A — just a documentation-accuracy lesson: verify claims against source, which is the entire point of Phase 1 |
| OASIS `AgentGraph`/DB `follow` table drift | §B.3 | Phase 6 — we don't rely on `AgentGraph` edge state for anything trading-relevant; social graph structure is informational only |
| OASIS has zero seeding mechanism | §B.11 | Phase 6 — adapter-level targeted seeding of the global `random` module for the duration of each OASIS call only |
| OASIS action methods capped at 3 params; no plugin/callback system | §B.12, §B.14 | Phase 6 — tool-based decision collection instead of forking `Platform` |
| OASIS `trace` table composite-PK collision risk | §B.8 | Phase 2 — our own artifact writer uses a generated UUID per record, not a composite business key |
| No financial concepts anywhere in OASIS | §B.9 | Phase 9/10 — `risk/`/`backtest/` built entirely new, not extending OASIS |

---

## What happens after this document set is reviewed

Nothing further is implemented until the user confirms this plan. The next action, if confirmed, is
Phase 2 exactly as scoped above — skeleton, schemas, persistence — with its own PR/commit boundary
separate from this documentation-only change.
