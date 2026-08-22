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

## Phase 3 — Data ingestion + event engine (COMPLETE)

- `data/market/coingecko.py`: real, no-key CoinGecko OHLC adapter. **Declared limitation**: covers OHLC
  only — volume/volatility/mcap/funding/OI/liquidations/order-book are not implemented (CoinGecko's free
  tier does not expose all of them in a compatible shape); requesting one raises
  `CoinGeckoUnavailableFieldError` explicitly rather than returning a faked value.
- `data/news/cointelegraph.py`: real, no-key Cointelegraph RSS adapter. **Verified at this phase, not
  assumed**: CryptoCompare/coindesk.com now requires an API key (live call returned 401) and Reddit's
  public JSON endpoint rejects unauthenticated requests (live call returned 403) — Cointelegraph's RSS
  feed was the source actually reachable from this dev environment without new credentials.
- `data/point_in_time.py`: `PointInTimeDataView` — no-look-ahead enforced structurally. Built once with a
  fixed `current_time`; filters out any future point at construction; no public method accepts a
  timestamp parameter, so there is no call that could read `t > now`. A test inspects every method
  signature to enforce this, not just behavioral tests.
- `simulation/events/engine.py`: `EventEngine` composing deterministic `resolve_entities()` and
  `compute_novelty()` with an `EventInterpreter` for the LLM-judged fields. Two interpreters:
  `HeuristicEventInterpreter` (Tier 3, deterministic, no network, always available) and
  `LLMBackedEventInterpreter` (Tier 1/2, one retry at reduced temperature per §7). `EventEngine` always
  falls through to the Tier 3 heuristic if the LLM path raises, so no event is ever left uninterpreted.
- **Declared limitation, inherited from Phase 1/2's "no real Python/LLM key in this dev machine" finding**:
  no `ANTHROPIC_API_KEY` is available in this environment, so `LLMBackedEventInterpreter` is implemented
  and unit-tested against an injected fake client (same pattern as `server/tests/emailSender.test.js` in
  the existing Node project) but has never made a real network call. Only the Tier 3 deterministic path
  has been exercised end-to-end against real data. A concrete Anthropic backend is deferred to Phase 5,
  the first phase this plan requires making real LLM calls.
- **Design decisions flagged as pre-Phase-4 placeholders, not final**: `resolve_entities()` uses a fixed
  keyword→entity_id dictionary rather than the real knowledge-graph lookup (Phase 4 doesn't exist yet);
  `compute_novelty()` uses Jaccard text-overlap rather than the embedding-distance approach the
  architecture doc specifies (`knowledge/embeddings/` doesn't exist yet). Both are deterministic, tested,
  and documented in-code as temporary — replaced when their real Phase 4 dependencies land.
- Tests: 29 new (`tests/test_point_in_time.py`, `tests/test_data_market.py`, `tests/test_data_news.py`,
  `tests/test_event_engine.py`) — 72 total, all passing. Market/news adapter tests replay real payloads
  captured live on 2026-08-22 (`tests/fixtures/coingecko_ohlc_btc_sample.json`,
  `tests/fixtures/cointelegraph_rss_sample.xml`); no live network calls inside the test suite itself.
- Minimal end-to-end example (`examples/phase3_e2e.py`, actually run — real output, not asserted-only):
  pulled 23 real BTC/USD OHLC candles from CoinGecko and 30 real Cointelegraph articles live, built a
  real `PointInTimeDataView` (including a synthetic future probe proven structurally excluded), produced
  30 real `Event` records via `EventEngine` (Tier 3 heuristic interpretation), persisted and reloaded all
  of it from a real `runs/{run_id}/` directory with full round-trip fidelity.

## Phase 4 — Knowledge graph (COMPLETE)

- `knowledge/graph/backend.py`: `GraphBackend` Protocol (exactly as specified in §3.1) plus
  `GraphBackendBase`, an ABC that centralizes the behavior that MUST be identical across every backend
  — otherwise "interchangeable backends" would be an unverified claim, not a fact. It rejects reserved
  attribute keys and dangling relationships (source/target never upserted as an entity) before any
  native storage call, and implements `query_neighborhood`'s BFS traversal once, generically, against
  five small storage hooks each backend implements natively.
- `knowledge/graph/kuzu_backend.py`: `KuzuGraphBackend` — the default, embedded, zero-infrastructure
  backend. **Verified live in this environment**: opens a real Kuzu database (file-backed or
  `:memory:`), `MERGE` on both nodes and relationships is idempotent by construction (confirmed with a
  real query before writing the adapter). One generic `RELATES` relationship table carries
  `relation_type` as a property rather than 13 separate Cypher-native relationship types — a documented
  design simplification, not a limitation (selectivity by type is still a `WHERE`/property match away).
- `knowledge/graph/neo4j_backend.py`: `Neo4jGraphBackend` — real Cypher against the official `neo4j`
  driver (optional extra, `pip install "serena[neo4j]"`), same schema and same `GraphBackendBase`
  contract as Kuzu. **Declared limitation**: no Neo4j server exists in this local dev environment, and
  standing one up was out of this phase's scope without asking first — so unlike Kuzu, this backend has
  never actually been executed against a live database. Its test cases are included in the same
  parametrized suite as Kuzu's but are skipped (not deleted, not faked) unless `SERENA_NEO4J_URI` points
  at a reachable server.
- `OntologyChangeProposal` (already schema-complete since Phase 2) extended with `relation_type_endpoints:
  dict[str, RelationEndpoints]` to give "no dangling edges" (§A.2) a real, testable meaning for our
  system: a proposal that declares a new/existing relation type's allowed source/target entity types is
  rejected if any of those entity types don't exist — neither in the fixed ontology nor among the
  proposal's own `new_entity_types` — exactly the ontology-level analogue of MiroFish's edge-type pruning
  after truncation. "Reserved attribute name" (the other §A.2 guardrail MiroFish enforces against Zep's
  reserved words) was implemented at the `GraphBackend` level instead of the proposal level, since it's
  an instance-data concern (an `attributes` dict value shadowing a structural field like `entity_id`),
  not a type-naming concern — documented as this explicit reinterpretation, not silently relocated.
- Tests: 21 new (`tests/test_graph_backend.py` — the shared, backend-parametrized CRUD/dangling-edge/
  reserved-key/neighborhood-BFS suite; `tests/test_graph_models.py` — `OntologyChangeProposal` dangling-
  edge cases, `Subgraph` round-trip). 93 passing + 11 skipped (all 11 are the Neo4j parametrized cases,
  per the declared limitation above) — 0 unexplained skips.
- Minimal end-to-end example (`examples/phase4_e2e.py`, actually run): re-used Phase 3's real live
  Cointelegraph fetch + `EventEngine`, promoted the resolved entities from 30 real articles into a real
  Kuzu database file under `runs/{run_id}/graph.kuzu` (not `:memory:`), linked each article to its
  resolved entities with real `REPORTS_ON` relationships, queried BTC's real 2-hop neighborhood back out
  (18 entities: BTC, ETH, the ETF product type, and 15 real news items that mentioned them), and
  persisted a verifiable `graph_summary.json` with full round-trip fidelity.

## Phase 5 — Agent factory (COMPLETE)

- `agents/profiles/archetypes.py`: `ArchetypePrior` per all 12 archetypes from the brief (behavioral
  coefficient ranges, capital range, risk profile, time horizon) — the profile-prior library architecture
  §6 point 1 calls for.
- `agents/strategies/hints.py`: deterministic, non-LLM starting-belief heuristics per archetype (§6 point
  2) — `momentum`/`trend_follower`/`mean_reversion`/`contrarian`/`long_term_holder` compute a real
  sigmoid-mapped return-based belief from recent closes; the other 6 archetypes (macro, fundamental, news,
  retail, whale, market_maker, quant) return a neutral 0.5 — **declared honestly** as "no non-price
  signal wired up yet" rather than fabricating a plausible-looking number.
- `agents/profiles/generator.py`: `generate_agent_population()` orchestrates batched generation
  (`DEFAULT_BATCH_SIZE = 12`, matching MiroFish's own useful batching pattern, §A.5) at
  `cohort_temperature` (0.0), deriving its RNG from `RandomSeedBundle.derive(seed, ["cohort_generation"])`
  — never Python's unseeded global `random`. `LLMBackedProfileBatchGenerator` (Tier 1) does one retry at
  reduced temperature (§7) before the orchestrator falls through to
  `generate_archetype_batch_deterministic()` for that batch only — never the whole population, and never
  a `random`-based fallback (the exact MiroFish/OASIS failure mode from §A.12/§B.11).
- **Declared limitation**: no `ANTHROPIC_API_KEY` in this environment — `LLMBackedProfileBatchGenerator`
  is implemented and unit-tested against an injected fake client (same pattern as Phase 3's
  `LLMBackedEventInterpreter`) but has never made a real network call.
- Tests: 17 new (`tests/test_agent_factory.py`) — schema validation via `AgentProfile` itself, every hint
  bounded to `[0,1]`, determinism (same seed → byte-identical population across two independent calls,
  different seed → different population), persistent/collision-free `agent_id` assignment across multiple
  batches, LLM-batch success/retry/wrong-count-rejection, and the deterministic-fallback composition.
- Minimal end-to-end example (`examples/phase5_e2e.py`, actually run): generated the real MVP population
  — 50 agents across the 10 archetypes the MVP section below selects — persisted and reloaded
  `agents.json` with full round-trip fidelity.

## Phase 6 — OASIS adapter (COMPLETE)

- Added `camel-oasis==0.2.5` (exact-pinned, per the brief's own caution about this library's
  release-specific API surface, §A.9) plus an explicit `mcp<2.0` pin — **newly verified in this phase**:
  `camel-ai==0.2.78` (pulled in by `camel-oasis`) under-constrains its own `mcp` dependency, so an
  unpinned resolve picks `mcp==2.0.0`, which removed `FastMCP` from `mcp.server` and breaks `import oasis`
  outright. Confirmed by actually hitting the `ImportError` before adding the pin.
- **Two more upstream bugs/constraints verified by actually running a minimal simulation**, not read from
  a docstring:
  1. `UserInfo.to_reddit_system_message()`/`to_twitter_system_message()` (`social_platform/config/user.py`)
     raise `UnboundLocalError` unless `profile["other_info"]` contains ALL of `user_profile` (non-None),
     `gender`, `age`, `mbti`, `country` — undocumented, found only via a real stack trace. Worked around
     by always populating all five (only `user_profile`, derived from `AgentProfile.identity`, carries
     real information for our domain; the other four are inert placeholders forced by this bug).
  2. `SocialAgent(model=None, ...)` does **not** mean "no model": `ChatAgent._resolve_models` resolves
     `None` to `ModelFactory.create(DEFAULT, DEFAULT)`, which raises `ValueError` for a missing
     `OPENAI_API_KEY` at agent-construction time — even for an agent that will only ever receive
     `ManualAction`s, never an `LLMAction`. Worked around with `simulation/oasis/null_model.py`'s
     `NullModelBackend`, a real (not mocked) `BaseModelBackend` subclass whose `_run`/`_arun` raise loudly
     instead of fabricating a response — verified never invoked across every real simulation run in this
     phase (confirmed: zero exceptions raised from it).
- `simulation/oasis/adapter.py`: `OasisSimulationAdapter` exactly as scoped in architecture §9 —
  `initialize()`/`execute_round()`/`collect_actions()`/`collect_social_exposure()`/`persist_state()`/
  `close()`. Every call that touches OASIS is wrapped in `seeded_random()` (`determinism.py`) — targeted
  seeding of Python's global `random` for the call's duration only, restored after, per the verified
  finding that neither `platform.py` nor `recsys.py` seed it themselves (§B.11). Trading decisions are
  never sent as `LLMAction`/`INTERVIEW` — only `ManualAction`, so the adapter's own persisted
  `SocialAction` log (read from the real sqlite `trace` table) is what downstream phases consume, not
  OASIS's own audit trail (§B.12).
- **Real behavioral finding, not a bug**: `OasisEnv.step()` refreshes the recommendation table at the
  *start* of the step, before that step's own actions are applied — so a post created in round N only
  appears in another agent's `rec` table starting at round N+1's refresh, not within round N itself. First
  written as a test that assumed same-round visibility; the test was wrong, not OASIS — fixed to match
  the real, verified sequencing.
- Tests: 11 new (`tests/test_oasis_adapter.py`), all against a **real** `OasisEnv` (Reddit platform, real
  sqlite database per test, no mocking of OASIS itself) — construction, `create_post`/`like_post` via
  `ManualAction`, real recsys-driven exposure, non-repeating action collection, `persist_state` round-trip,
  and `NullModelBackend`/`seeded_random` unit behavior. 121 passing + 11 skipped (unchanged Neo4j skips).
- Minimal end-to-end example (`examples/phase6_e2e.py`, actually run): 5 real agents from Phase 5, a real
  Cointelegraph article (Phase 3's live adapter) injected as a `ManualAction(CREATE_POST, ...)`, a real
  recsys refresh round, 4 of the 5 agents genuinely seeing the post via the real `rec` table and reacting
  with real `like_post` actions — 10 real trace rows, 1 real post, 4 real likes, all persisted to a real
  sqlite file plus a JSON summary under `runs/{run_id}/`.

## Phase 7 — Belief / social simulation (COMPLETE)

- `agents/beliefs/updater.py`: three pure, deterministic belief-shift functions (`apply_event_update`,
  `apply_peer_exposure_update`, `apply_strategy_hint_update`) — each a proportional pull toward a target,
  never a direct jump, so no single source can move a belief from one extreme to the other in one round.
- `simulation/round_loop.py`: `SimulationRoundLoop` wires the full §12 loop — injects a market event as a
  real `ManualAction(CREATE_POST, ...)` via Phase 6's adapter, reads real social exposure back via the
  real `rec` table, applies the three belief sources in order (recording a `BeliefUpdate` only when a
  source actually changes the value — `old_belief == new_belief` is a schema-level error by design, §11,
  so a no-op is never even attempted), then emits one Tier-3 deterministic `AgentDecision` per agent per
  round (a fixed-margin threshold on the updated belief — no LLM call in this phase's decision step: the
  interpretation already happened inside the event/hint sources).
- Tests: 24 new (`tests/test_belief_updater.py` — 13 pure-function cases including clamping and
  zero-sensitivity no-ops; `tests/test_round_loop.py` — 11 cases against a **real** `OasisSimulationAdapter`,
  zero mocking, including a full round-trip proof that a bullish event posted by one agent genuinely
  shifts a second agent's belief upward one round later via OASIS's real recommendation table, and a
  negative case proving zero `BeliefUpdate`s are written when nothing actually changes). 145 passing + 11
  skipped (Neo4j, unchanged).
- Minimal end-to-end example (`examples/phase7_e2e.py`, actually run): 6 real Phase-5 agents, 5 real
  rounds — round 0 injects a real Cointelegraph article as the market event, every round feeds real
  90-day BTC/USD closes (Phase 3's CoinGecko adapter) into the Phase-5 strategy hints. Result, reported
  honestly rather than dramatized: 27 real belief updates recorded with full provenance, small real
  shifts (BTC's recent trend was close to flat), all decisions correctly stayed `HOLD` given how small
  those shifts were relative to the decision margin — the system did the right thing with genuinely
  unexciting real data, which is the point.

## Phase 8 — Signal engine (COMPLETE)

- `signals/independence/matrix.py`: `AgentPredictionMatrix`. **OUR DESIGN DECISION on "Kish's effective
  sample size"**: literal Kish ESS (`(Σw)²/Σw²`) is scale-invariant in the weights and does NOT collapse
  when N agents share an *equal* weight — it only detects unevenness, not correlation. We use the
  design-effect formula from clustered-sampling statistics instead (`design_effect = 1 + (n-1)·mean_ρ`,
  `n_eff = n/design_effect`), which correctly goes to 1 as intra-cluster correlation goes to 1 and to n as
  it goes to 0 — the actual tool for the actual stated requirement, even though it isn't literally the
  named formula. `independence_score(agent) = 1/design_effect(agent's cluster)` feeds directly into §13's
  weight formula, so the correlation correction and the diagnostic reported alongside a signal
  (`effective_sample_size`) are the *same* correction, not two disconnected numbers.
- `signals/aggregation/score_provider.py`: `AgentScoreProvider` Protocol for the three historical factors
  (`accuracy_score`/`calibration_score`/`regime_score`) plus `recency_weight` — all of which depend on a
  measured track record that doesn't exist until Phase 11's `evaluation/agent_scoring`.
  **Declared honestly**: `NeutralAgentScoreProvider` (what Phase 8 actually uses) returns `1.0` for every
  agent on every factor — no preference until a real track record exists — rather than a plausible-looking
  fabricated score.
- `signals/aggregation/pipeline.py`: `compute_risk_adjusted_signal()` implements §13's full multiplicative
  weight formula (min-max normalized per-round, with a constant-vector fallback to avoid a division by
  zero when every agent scores identically — which is always true today under the neutral provider), then
  `independent_consensus` → `confidence` (weighted agreement × mean weighted `AgentDecision.confidence`,
  since real calibration is Phase 11 and is `1.0` by construction until then) → `expected_return` →
  `risk_adjusted_signal = expected_return × confidence`.
- Tests: 26 new (`tests/test_agent_prediction_matrix.py`, `tests/test_signal_pipeline.py`) — hand-computed
  weight-formula arithmetic checked to `1e-9`; the exact brief scenario (100 correlated copies +
  independent dissenters) proving `effective_sample_size ≈ 1` (not ~100) and `independent_consensus`
  barely moves between 2 and 100 copies; degenerate all-zero-confidence fallback; schema-bound checks.
  162 passing + 11 skipped (Neo4j, unchanged).
- Minimal end-to-end example (`examples/phase8_e2e.py`, actually run): re-ran Phase 7's real 5-round loop
  and fed every round's real `AgentDecision`s through the real pipeline — 5 real `RiskAdjustedSignal`s
  persisted and reloaded with full fidelity. Reported honestly: consensus was exactly 0 every round
  because Phase 7's real data produced all-`HOLD` decisions — the pipeline correctly propagates "no
  signal" from "no real disagreement or conviction" rather than manufacturing one.

## Phase 9 — Risk engine (COMPLETE)

- `risk/portfolio/portfolio.py`: `PortfolioState`/`Position` (position sizes as a signed fraction of
  equity, comparable across runs regardless of starting capital), `apply_fill()` a pure state-transition
  function (never mutates, always returns a new `PortfolioState` — verified by a test that the original
  object is untouched after a fill).
- `risk/limits/limits.py`: seven independent, individually-testable limit checks — max position, max
  portfolio exposure, max leverage, max daily loss, max drawdown, asset-correlation concentration, and
  liquidity. **OUR DESIGN DECISION on liquidity**: no order-book/depth data source exists (Phase 3 covers
  OHLC only, §4), so `check_liquidity_limit` requires an explicit `available_liquidity_fraction` and is
  honestly skipped (not faked) when the caller doesn't have one. **Correlation limit** reuses §14's
  "don't implicitly concentrate in a correlated cluster" principle applied to *assets* instead of
  *agents* — its own small implementation (a direct pairwise lookup against a caller-supplied correlation
  map), not a forced reuse of `AgentPredictionMatrix`, since the input shape genuinely differs (asset-pair
  correlations vs. per-agent decision histories to correlate internally).
- `risk/sizing/sizing.py`: `size_position()` — the literal `(risk_adjusted_signal, portfolio_state,
  limits) -> Position` pure function architecture §16 specifies. Scales the signal into a position
  fraction (bounded by `max_position_fraction`), runs every limit check, and returns exactly `0.0` — never
  a partial size that quietly dodges a violated limit — if any limit fails.
- `tests/test_import_graph_lint.py`: the **real, automated** enforcement the plan calls for — parses the
  actual AST of every file in `risk/` and `backtest/` (not a text grep, which a comment or string could
  fool) and asserts none imports `serena.llm`/`anthropic`/`openai`. Includes a test of the checker itself
  (a synthetic offending file must actually be caught), so the lint isn't just vacuously passing on an
  empty package.
- Tests: 42 new (`tests/test_risk_portfolio.py`, `tests/test_risk_limits.py`, `tests/test_risk_sizing.py`,
  `tests/test_import_graph_lint.py`) — one dedicated fixture per limit type as specified, determinism
  (identical inputs → identical outputs), max-conviction and zero-signal boundary cases, and the
  size-collapses-to-zero-on-violation behavior. 197 passing + 11 skipped (Neo4j, unchanged).
- Minimal end-to-end example (`examples/phase9_e2e.py`, actually run): re-ran Phases 7/8's real 5-round
  loop and pipeline, sized a real position each round against a fresh $100,000 paper portfolio, persisted
  `portfolio.jsonl`/`positions.jsonl` with full round-trip fidelity. Reported honestly: the resulting
  fraction was effectively zero every round, a direct and correct consequence of Phase 8's near-zero real
  signal — the risk engine did not manufacture a position out of a signal that wasn't there.

## Phase 10 — Historical replay / backtest (COMPLETE)

- `backtest/metrics/metrics.py`: CAGR, Sharpe, Sortino, max drawdown, Calmar, win rate, profit factor,
  turnover, exposure, average holding period, VaR, CVaR — all Tier 3, all pure functions. **A real
  floating-point bug was found and fixed via the hand-computed test discipline itself**: `value_at_risk`'s
  `int((1-confidence)*n)` truncated to the wrong index when `(1-0.9)` evaluates to `0.09999999999999998`
  in floating point, landing just under an integer boundary — fixed with a small epsilon before
  truncation, not by changing the test's expected value to match the bug.
- `backtest/walk_forward/split.py`: `WalkForwardSplit` + `make_walk_forward_split()` (chronological,
  contiguous train/validation/out-of-sample) + `assert_chronological()` — the actual structural guard
  against the brief's "never shuffle time-series data" rule, called before any replay, not just documented
  as a convention.
- `backtest/engine/baselines.py`: the 6 baselines — Buy & Hold, Momentum, Mean Reversion, Random (seeded,
  reproducible), and `NoSocialAgentBacktester` (shared engine for "single agent" and "multi-agent without
  social interaction", differing only in agent count) — reusing the exact same decision threshold
  (`agents/beliefs/decision.py`, extracted from Phase 7's `SimulationRoundLoop` in this phase precisely so
  every variant compared is held to one decision rule) and the exact same risk engine
  (`risk.sizing.clamp_to_limits`, extracted from `size_position` for the same reason) as the full system —
  a profitability comparison is only honest if the variants differ in strategy, not in risk discipline
  (brief rule #8).
- `backtest/engine/engine.py`: `run_price_variant()` (fast, price-only baselines) and
  `run_full_system_variant()` (drives the real `SimulationRoundLoop` + OASIS). Both decide using data up
  to period `t` and realize the return from `t` to `t+1` — never the reverse. A simple deterministic
  transaction cost (proportional to position-fraction change) is modeled; slippage/spread/funding/
  liquidity are declared as **not yet modeled** (Phase 3 has no order-book source), not silently zeroed.
- **Corrected during this phase, found by actually running a transitive-import check (not just the direct
  one)**: `backtest/engine/` legitimately imports `SimulationRoundLoop` → ... → `serena.llm.client` to
  run the full-system variant the brief itself requires comparing against — the Phase 9 lint test's
  blanket "all of `backtest/`" scope was too strict. Narrowed to `backtest/metrics/` and
  `backtest/walk_forward/` (the actual calculations), with the exception to `backtest/engine/` documented
  and asserted explicitly (a test proves the exception is real and current, not a silently stale gap).
- **Found and fixed en route**: `RunArtifactWriter._serialize()` didn't recurse into `dict` values (only
  `list`/`BaseModel`), so `write_once("metrics.json", {name: metrics_model, ...})` — the exact shape this
  phase's own end-to-end example needs — would have serialized raw Pydantic objects into `json.dumps` and
  crashed. Fixed with a regression test in `tests/test_artifacts.py` (Phase 2 code, fixed in Phase 10
  because that's when a real usage exposed the gap).
- Tests: 55 new (`tests/test_backtest_metrics.py`, `tests/test_walk_forward_split.py`,
  `tests/test_backtest_baselines.py`, `tests/test_backtest_engine.py`, plus the import-lint corrections
  and the artifacts regression test) — hand-computed metric arithmetic, shuffle-detection, a real (not
  mocked) integration test of `run_full_system_variant` against a live `OasisSimulationAdapter`.
  245 passing + 11 skipped (Neo4j, unchanged).
- Minimal end-to-end example (`examples/phase10_e2e.py`, actually run): a real walk-forward split over 23
  real CoinGecko BTC/USD candles, all 7 variants run on the identical out-of-sample slice, real metrics
  persisted to `metrics.json`. Reported honestly: `multi_agent_no_social` and `full_system` produced
  identical numbers in this specific run because no market event was injected per period (Cointelegraph is
  a live feed with no historical archive to align to arbitrary past dates) — with nothing to post, OASIS's
  social layer had nothing to expose, so the full system degenerated to exactly the no-social mechanism.
  Phase 7 already proved the social channel does move beliefs differently when a real event is injected;
  this backtest simply doesn't exercise that path, which is stated plainly rather than glossed over.

## Phase 11 — Agent scoring / evolution (COMPLETE)

- `evaluation/agent_scoring/outcomes.py`: `AgentOutcome` — derives `direction_correct`/`brier_score` from
  a decision plus its realized return. **OUR DESIGN DECISION**: `HOLD` decisions carry no falsifiable
  directional claim, so both are `None` for `HOLD` (excluded from accuracy/calibration, not forced to
  "always right" or "always wrong" via an arbitrary no-move threshold) — `pnl_contribution` is still
  correctly `0.0` for `HOLD` (no position, no PnL).
- `evaluation/agent_scoring/scoring.py`: `AgentScoreTracker` — a **real** implementation of Phase 8's
  `AgentScoreProvider` Protocol (drop-in replacement for `NeutralAgentScoreProvider` once real history
  exists, no changes needed to `signals/`). Every score is Bayesian-shrunk toward the neutral 0.5 prior in
  proportion to sample size (§13's explicit requirement), and `recency_weight` implements §17's "do not
  automatically delete losing agents" literally: always recomputed from exponentially-recency-weighted
  history, so a losing streak lowers it but a later winning streak recovers it automatically — there is no
  deletion path and no permanent floor lower than what current evidence supports.
- `evaluation/calibration/calibration.py`: `reliability_curve()` — buckets outcomes by predicted
  confidence and compares to actual accuracy per bucket, a real diagnostic for Phase 12's report/dashboard.
- `evaluation/attribution/attribution.py`: `attribute_portfolio_pnl()` — proportionally scales each
  agent's raw (full-weight) PnL contribution so the sum reconciles **exactly** to the realized portfolio
  return for that period (the plan's explicit reconciliation requirement, not an approximation); handles
  the zero-raw-total edge case (offsetting long/short bets) with a uniform fallback that still reconciles.
  `attribute_by_archetype()` aggregates the same reconciled attribution by archetype.
- Agent mutation / new-strategy generation confirmed still deferred past the MVP, per the architecture
  doc's own explicit note — not implemented here, not silently dropped.
- Tests: 28 new evaluation tests + 7 attribution tests + 4 calibration tests — hand-computed Bayesian
  shrinkage arithmetic, the exact §17 scenario (losing streak lowers `recency_weight`, winning streak
  recovers it, never reaching exactly 0 or 1 with a finite sample), and the PnL reconciliation test summing
  attributions back to the exact portfolio return to `1e-12`. 273 passing + 11 skipped (Neo4j, unchanged).
- Minimal end-to-end example (`examples/phase11_e2e.py`, actually run): 15 real rounds (real BTC/USD
  closes, real OASIS, real Phase 8/9 signal+sizing) scored into a real `AgentScoreTracker`, a real weight
  change shown for the agent with the most directional evidence (0.5000 with half its real history →
  0.5438 with the full history), real per-round PnL attribution reconciled to the real realized portfolio
  return, persisted to `agent_scores.json`. Reported honestly: most agents in this window never made a
  directional call (`HOLD` throughout, consistent with every earlier phase's finding that this BTC slice
  is fairly quiet), so their scores stayed at the neutral prior — correctly, not a bug.
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
