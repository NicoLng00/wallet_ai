# Serena — MiroFish Trading

Research-grade, local-first financial multi-agent simulation. Phase 1: research/backtesting/paper
trading only — live execution is disabled by default (`docs/TRADING_ARCHITECTURE.md` §22).

Full design docs live in `../docs/`:

- [`MIROFISH_REVERSE_ENGINEERING.md`](../docs/MIROFISH_REVERSE_ENGINEERING.md) — direct source
  inspection of MiroFish and OASIS, tagged VERIFIED FROM SOURCE / INFERRED / OUR DESIGN DECISION.
- [`TRADING_ARCHITECTURE.md`](../docs/TRADING_ARCHITECTURE.md) — this system's design.
- [`IMPLEMENTATION_PLAN.md`](../docs/IMPLEMENTATION_PLAN.md) — the 12-phase staged build plan.

## Status

**Phase 5 rebuilt with real Gemini-generated agent personas.**

`AgentProfile.beliefs` (an open dict) is incompatible with Gemini's structured schema (see below) — fixed
by having the LLM generate only a narrow, schema-compatible `AgentPersonaDraft` (identity/strategy/
information_sources/behavioral_biases), never the numeric risk coefficients or beliefs, which always
come from the same seeded archetype-prior sampling as before. `apply_persona_overlay()` merges the two.

- **Real bug found and fixed**: the first version derived per-archetype RNG seeds from a list ordered by
  the caller's dict iteration order — since `RandomSeedBundle.derive()` assigns seeds positionally,
  `{MOMENTUM:3, CONTRARIAN:3}` and `{CONTRARIAN:3, MOMENTUM:3}` produced different populations for the
  same seed. Caught by a test comparing both orderings; fixed by deriving from the full, fixed, canonical
  list of all 12 archetypes every time, so an archetype's seed depends only on itself, never on what else
  was requested alongside it.
- **Optimization**: archetypes now generate in **parallel** (`asyncio.gather`) instead of sequentially —
  safe specifically because of the independent-seeding fix above.
- **A second real constraint found live**: the configured Gemini key is free-tier, capped at a **hard 20
  requests/day** for `gemini-3.5-flash` (read from the real 429 `RESOURCE_EXHAUSTED` body) — not a short
  burst limit. Retrying a quota-exhausted call wastes another request against the same daily cap for
  nothing, so a new `LLMQuotaExceededError` is now explicitly excluded from the retry-at-reduced-
  temperature logic everywhere it's used.
- **Real live verification, captured before the daily cap hit**: a full 50-agent run produced 10 genuine
  Gemini-authored personas (one per archetype) — e.g. a real `momentum-000`: *"Trader retail iperattivo
  che passa ore davanti ai grafici a caccia di trend esplosivi... behavioral_biases: FOMO, Herding"* — the
  rest correctly fell back to the deterministic generic identity once the quota was exhausted, never a
  crash. Confirmed afterward the cap is a genuine full-day lock, not a short cooldown.
- Tests updated for the new API (`AgentProfileBatch`/`LLMBackedProfileBatchGenerator` removed, nothing
  else used them), plus new tests for the seed-independence fix, the persona overlay, and the
  quota-no-retry behavior. 335 passing + 11 skipped (Neo4j, unchanged).

<details>
<summary>Post-MVP: real Gemini LLM infrastructure — live and verified.</summary>

A real `GEMINI_API_KEY` is now configured (`serena/.env`, gitignored). `llm/gemini_client.py`'s
`GeminiLLMClient` is a real `LLMClient` implementation (public `generateContent` endpoint,
`responseSchema`-structured output) — verified with two live smoke-test calls before any production
code was written around it, then wired into `llm/config.py::build_default_llm_client()`.

- `llm/schema_conversion.py` converts our Pydantic schemas into Gemini's dialect. **Real compatibility
  gap found by actually converting our own schemas**: `AgentProfile.beliefs` is an open
  `dict[str, float]`, which Gemini's structured-output schema doesn't support — raises
  `UnsupportedSchemaError` explicitly, verified against `AgentProfile` (the schema that later drove the
  Phase 5 rebuild above).
- `examples/llm_infrastructure_check.py` (actually run): `EventInterpretation` (Phase 3, flat schema) is
  fully live-compatible — a real call classified a real Cointelegraph MiCA-regulation article as
  `bearish`/0.65/0.80, more nuanced than the Tier 3 heuristic's `neutral`/0.35/0.35 on the same text.
- **A second real finding, not a bug**: two identical calls at `temperature=0.0` returned different
  classifications (`bearish` then `neutral`) — Gemini doesn't guarantee bit-identical output at zero
  temperature. Exactly the case `SimulationRun`'s own docstring already hedges for ("reproducible as far
  as the external LLM API permits") — confirms a prior design decision, no code change needed.
- 22 new tests (schema conversion against real models, `GeminiLLMClient` against an injected fetch
  reproducing the real verified response shape — no live calls in the automated suite).

</details>

<details>
<summary>Phase 12 (reporting / dashboard) — complete. All 12 phases done — MVP runs start to finish.</summary>

- `reports/report_agent/tools.py` — `RunReportTools`, the 10 read-only tools from §20, reading only this
  system's own artifacts. **Real bug fixed**: a naive read-only tool wrapping `RunArtifactWriter` would
  silently create an empty directory for a mistyped `run_id` (the writer's directory creation is
  idempotent, needed for real run-resuming) — fixed with an existence check first, tested explicitly.
- `reports/report_agent/report_generator.py` — `generate_report()` + a real tag validator: every claim
  must carry `[SIMULATION FACT]`, `[MODEL INTERPRETATION]`, or `[REAL MARKET OUTCOME]`, or generation
  fails. No `ANTHROPIC_API_KEY` here, so only real `[SIMULATION FACT]` sections are emitted, plus one
  `[MODEL INTERPRETATION]` section stating its own honest absence.
- `api/chart_data.py` — pure, tested Python functions behind every chart (the actual logic, not
  unverifiable browser JS). `api/app.py` — FastAPI read-only endpoints, never touching OASIS/LLM/data
  adapters directly. `api/dashboard.py` — one self-contained HTML page, vanilla JS, zero external
  libraries, real inline SVG charts: agent population, equity curve, leaderboard, signal timeline, belief
  distribution, backtest variant comparison. Correlation matrix and predicted-vs-actual are declared as
  not-yet-wired (no artifact persists that data yet), not fabricated.
- **Declared limitation**: no browser automation was used, so SVG rendering was never visually observed.
  What *was* verified: a real `uvicorn` server (an actual OS process on a real port) queried with real
  HTTP requests — every endpoint, including the dashboard, confirmed serving correct real content.
- 36 new tests. 311 passing + 11 skipped (Neo4j, unchanged).
- `examples/phase12_e2e.py` — builds a full real run (Phases 5–11), starts a real server, and verifies
  every endpoint (including the dashboard HTML) over real HTTP, plus a real 404 for an unknown run.

### MVP complete

All 12 phases have a real, tested, executed implementation with a real end-to-end example. Real market
data → knowledge graph → agent population → OASIS social simulation → belief/decision loop → signal
aggregation → risk-sized positions → 7-variant walk-forward backtest → agent scoring/attribution →
report + live dashboard, start to finish, zero fabricated numbers. `Neo4jGraphBackend` is still never run
live (its 11 tests skip cleanly without a server) — see the section above for the current, more precise
state of the LLM limitation (live for Phase 3's event interpretation, still deterministic-only for
Phase 5's agent generation, verified rather than assumed either way).

</details>

<details>
<summary>Phase 11 (agent scoring / evolution) — complete.</summary>

- `evaluation/agent_scoring/scoring.py` — `AgentScoreTracker`, a **real** drop-in implementation of
  Phase 8's `AgentScoreProvider` Protocol. Every score is Bayesian-shrunk toward the neutral prior by
  sample size; `recency_weight` implements §17's "never delete losing agents" literally — always
  recomputed from recency-weighted history, so it recovers automatically after a losing streak ends.
- `evaluation/calibration/calibration.py` — `reliability_curve()`, a real confidence-vs-accuracy
  diagnostic for Phase 12's dashboard.
- `evaluation/attribution/attribution.py` — `attribute_portfolio_pnl()`, proportionally scaled so
  per-agent attributions sum **exactly** to the realized portfolio return (a reconciliation, not an
  approximation), plus `attribute_by_archetype()`.
- 39 new tests — hand-computed Bayesian shrinkage, the exact §17 decay-then-recovery scenario, and
  exact-reconciliation PnL attribution. 273 passing + 11 skipped (Neo4j, unchanged).
- `examples/phase11_e2e.py` — 15 real rounds scored into a real tracker, a real weight change shown
  (0.5000 → 0.5438 as real evidence accumulated), real PnL attribution reconciled to the real portfolio
  return.

</details>

<details>
<summary>Phase 10 (historical replay / backtest) — complete.</summary>

- `backtest/metrics/metrics.py` — CAGR/Sharpe/Sortino/max drawdown/Calmar/win rate/profit factor/
  turnover/exposure/VaR/CVaR, all pure Tier 3 functions. **A real bug was found and fixed by the
  hand-computed test discipline itself**: a floating-point edge case in `value_at_risk`'s index
  truncation (`1-0.9` lands just under an integer in float) — fixed properly, not by changing the test
  to match the bug.
- `backtest/walk_forward/split.py` — `make_walk_forward_split()` + `assert_chronological()`, the actual
  structural guard against shuffling time-series data, not just a documented convention.
- `backtest/engine/baselines.py` — the 6 baselines (Buy & Hold, Momentum, Mean Reversion, Random,
  single-agent, multi-agent-no-social), all reusing the exact same decision threshold and risk engine as
  the full system (extracted in this phase specifically so the comparison is honest — strategy differs,
  risk discipline doesn't).
- **Corrected during this phase**: Phase 9's import lint was too strict — `backtest/engine/` legitimately
  needs `SimulationRoundLoop` (→ `serena.llm`) to run the full-system variant the brief requires comparing
  against. Narrowed the "never imports LLM" guarantee to `backtest/metrics/`/`backtest/walk_forward/`
  (the actual calculations), with the exception itself asserted by a test.
- **Found and fixed en route**: `RunArtifactWriter._serialize()` didn't recurse into `dict` values — a
  real gap from Phase 2, only exposed once this phase's own metrics output needed it, fixed with a
  regression test.
- 55 new tests. 245 passing + 11 skipped (Neo4j, unchanged).
- `examples/phase10_e2e.py` — a real walk-forward split over 23 real BTC/USD candles, all 7 variants on
  the identical out-of-sample slice, real metrics persisted. Reported honestly: two variants tied exactly
  because no event was injected per period in this run (Cointelegraph has no historical archive to align
  to past dates) — Phase 7 already proved the social channel matters when an event *is* injected.

</details>

<details>
<summary>Phase 9 (risk engine) — complete.</summary>

- `risk/portfolio/portfolio.py` — `PortfolioState`/`Position` (signed equity-fraction sizing),
  `apply_fill()` a pure, never-mutating state transition.
- `risk/limits/limits.py` — 7 independent limit checks (position/exposure/leverage/daily-loss/drawdown/
  correlation/liquidity), each its own testable function. Liquidity is honestly skipped, not faked, when
  no order-book source is wired up (none exists yet). Correlation reuses §14's "don't concentrate in a
  correlated cluster" principle applied to assets, with its own lightweight implementation.
- `risk/sizing/sizing.py` — `size_position()`, the literal `(signal, portfolio, limits) -> Position` pure
  function architecture §16 specifies; collapses to exactly `0.0` (never a partial size) if any limit
  fails.
- `tests/test_import_graph_lint.py` — a **real** automated check (AST-based, not text grep) that `risk/`
  and `backtest/` never import an LLM client, including a test that the checker itself actually catches a
  synthetic violation.
- 42 new tests, one dedicated fixture per limit type. 197 passing + 11 skipped (Neo4j, unchanged).
- `examples/phase9_e2e.py` — re-ran Phases 7–8's real loop and sized a real position each round against a
  fresh $100k paper portfolio. Reported honestly: the resulting fraction was effectively zero, correctly
  reflecting Phase 8's near-zero real signal rather than manufacturing a position.

</details>

<details>
<summary>Phase 8 (signal engine) — complete.</summary>

- `signals/independence/matrix.py` — `AgentPredictionMatrix`. Uses the clustered-sampling "design
  effect" formula instead of literal Kish ESS (which is scale-invariant and doesn't actually collapse for
  N equally-weighted correlated copies) — the real tool for the brief's actual "100 copies ≠ 100 votes"
  requirement. `independence_score(agent)` and the reported `effective_sample_size` are the same
  correction, not two disconnected numbers.
- `signals/aggregation/pipeline.py` — `compute_risk_adjusted_signal()`: the full §13 weight formula,
  min-max normalized with a constant-vector fallback, → `independent_consensus` → `confidence` → final
  `risk_adjusted_signal`. `NeutralAgentScoreProvider` — the 3 historical factors that depend on Phase 11's
  not-yet-built track record honestly return `1.0` (no preference) rather than a fabricated score.
- 26 new tests — hand-computed arithmetic to `1e-9`, and the exact brief scenario (100 correlated copies)
  proving effective sample size ≈ 1, not ~100. 162 passing + 11 skipped (Neo4j, unchanged).
- `examples/phase8_e2e.py` — re-ran Phase 7's real loop and fed every round through the real pipeline: 5
  real signals persisted. Consensus was exactly 0 every round because Phase 7's real data produced all-
  `HOLD` decisions — reported as-is, not massaged into looking more interesting.

</details>

<details>
<summary>Phase 7 (belief / social feedback loop) — complete.</summary>

- `agents/beliefs/updater.py` — three pure, deterministic belief-shift functions (event/peer-exposure/
  strategy-hint), each a proportional pull toward a target, never a direct jump.
- `simulation/round_loop.py` — `SimulationRoundLoop` wires architecture §12's full loop end to end: real
  `ManualAction` event injection → real OASIS social exposure → belief updates with provenance → one
  Tier-3 deterministic `AgentDecision` per agent per round. A `BeliefUpdate` is only ever constructed when
  something actually changed (the schema itself rejects a no-op update).
- 24 new tests (`tests/test_belief_updater.py`, `tests/test_round_loop.py`) — zero mocking, including a
  full proof that one agent's post genuinely shifts a second agent's belief one round later via OASIS's
  real recommendation table. 145 passing + 11 skipped (Neo4j, unchanged).
- `examples/phase7_e2e.py` — real 5-round run: a real Cointelegraph article at round 0, real 90-day
  BTC/USD closes feeding the archetype strategy hints every round, 27 real belief updates with full
  provenance, all decisions correctly `HOLD` given how small the real shifts were — reported honestly,
  not dramatized.

</details>

<details>
<summary>Phase 6 (OASIS adapter) — complete.</summary>

- `simulation/oasis/adapter.py` — `OasisSimulationAdapter`, the only module that imports `oasis`.
  `initialize`/`execute_round`/`collect_actions`/`collect_social_exposure`/`persist_state`/`close`, every
  OASIS-touching call wrapped in targeted `random` seeding (`determinism.py`).
- **Two upstream bugs found by actually running a simulation, not by reading docs**: (1) `UserInfo`'s
  Reddit/Twitter system-message builders raise `UnboundLocalError` unless `profile["other_info"]` has all
  of `user_profile`/`gender`/`age`/`mbti`/`country` — worked around by always populating them. (2)
  `SocialAgent(model=None)` still requires a real `OPENAI_API_KEY` (resolves to a default OpenAI model) —
  worked around with `null_model.py`'s `NullModelBackend`, a real `BaseModelBackend` that raises loudly if
  ever actually invoked (verified: never invoked, since this adapter only ever sends `ManualAction`).
- Also pinned `mcp<2.0` — `camel-ai==0.2.78` under-constrains it, and an unpinned resolve breaks
  `import oasis` outright (verified live).
- 11 new tests (`tests/test_oasis_adapter.py`), **zero mocking of OASIS** — a real `OasisEnv` with a real
  sqlite database per test. 121 passing + 11 skipped (Neo4j, unchanged).
- `examples/phase6_e2e.py` — real end-to-end run: 5 real Phase-5 agents, a real Cointelegraph article
  (Phase 3) posted via `ManualAction`, a real recsys refresh, 4 agents genuinely seeing it via the real
  `rec` table and reacting with real `like_post` actions.

</details>

<details>
<summary>Phase 5 (agent factory) — complete.</summary>

- `agents/profiles/archetypes.py` — behavioral-coefficient priors for all 12 archetypes.
- `agents/strategies/hints.py` — deterministic, non-LLM starting-belief heuristics (5 archetypes get a
  real price-based sigmoid; the other 6 honestly return neutral 0.5 rather than fabricate a signal they
  don't have wired up yet).
- `agents/profiles/generator.py` — batched population generation seeded via `RandomSeedBundle`, Tier 1
  LLM path with one retry then per-batch (never whole-population) fallback to the deterministic prior.
- **Declared limitation**: no `ANTHROPIC_API_KEY` here, so the LLM path is unit-tested with a fake client
  only — real execution used the deterministic path.
- 17 new tests (`tests/test_agent_factory.py`): determinism across seeds, collision-free multi-batch IDs,
  LLM retry/fallback composition.
- `examples/phase5_e2e.py` — generated the real 50-agent MVP population across 10 archetypes.

</details>

<details>
<summary>Phase 4 (knowledge graph) — complete.</summary>

- `knowledge/graph/backend.py` — `GraphBackend` Protocol + `GraphBackendBase`: reserved-attribute-key
  rejection, dangling-relationship rejection, and the `query_neighborhood` BFS traversal are all
  implemented once here and inherited by every backend, so "interchangeable backends" is a tested fact,
  not an aspiration.
- `knowledge/graph/kuzu_backend.py` — `KuzuGraphBackend`, the default (embedded, zero-infrastructure).
  **Verified live**: real Kuzu database, idempotent `MERGE` on nodes and relationships, confirmed with
  real queries before the adapter was written.
- `knowledge/graph/neo4j_backend.py` — `Neo4jGraphBackend`, real Cypher via the official driver
  (optional extra: `pip install "serena[neo4j]"`). **Declared limitation**: no Neo4j server exists in
  this dev environment, so unlike Kuzu this backend has never been executed live — its tests are
  included in the same parametrized suite and skip cleanly without `SERENA_NEO4J_URI`.
- `OntologyChangeProposal` extended with `relation_type_endpoints` to give "no dangling edges" a real
  meaning for our fixed-ontology design: a proposed relation type's declared source/target entity types
  must exist (in the fixed ontology or the same proposal), or the proposal is rejected.
- 21 new tests (`tests/test_graph_backend.py`, `tests/test_graph_models.py`) — 93 passing + 11 skipped
  (all 11 are the Neo4j cases, per the declared limitation above).
- `examples/phase4_e2e.py` — real end-to-end run: re-used Phase 3's live Cointelegraph fetch, promoted
  resolved entities from 30 real articles into a real Kuzu database file under `runs/{run_id}/`, queried
  BTC's real 2-hop neighborhood, persisted and reloaded a verifiable summary.

<details>
<summary>Phase 3 (data ingestion + event engine) — complete.</summary>

- `data/point_in_time.py` — `PointInTimeDataView`: no-look-ahead enforced structurally, not by
  convention. Constructed once with a fixed `current_time`; filters out any future `DataPoint` at
  construction; no public method accepts a timestamp parameter, so there is literally no call an
  agent/LLM can make to read `t > now` (verified by a test that inspects every method signature).
- `data/market/coingecko.py` — real CoinGecko OHLC adapter (no API key required). Declares
  explicitly which fields it does NOT cover (volume/volatility/mcap/funding/OI/liquidations/
  orderbook — `CoinGeckoUnavailableFieldError` on request, never a faked value).
- `data/news/cointelegraph.py` — real Cointelegraph RSS adapter (no API key required; verified live
  that CryptoCompare/coindesk.com now requires one and Reddit's public JSON endpoint blocks
  unauthenticated requests, so this was the source actually reachable from this environment).
- `simulation/events/engine.py` — `EventEngine`: deterministic `resolve_entities()` (keyword→id,
  a documented placeholder ahead of the real Phase 4 graph lookup) and `compute_novelty()` (Jaccard
  text-overlap, a documented placeholder ahead of Phase 4's embedding-based distance), composed with
  an `EventInterpreter` for the LLM-judged fields (`direction`/`importance`/`confidence`):
  `HeuristicEventInterpreter` (Tier 3, deterministic, no network) and `LLMBackedEventInterpreter`
  (Tier 1/2, one retry at reduced temperature per §7) — `EventEngine` always falls through to the
  Tier 3 heuristic if the LLM path fails, so no event is ever left without an interpretation.
- **Limitation, stated plainly**: no `ANTHROPIC_API_KEY` exists in this local dev environment, so
  `LLMBackedEventInterpreter` is implemented and unit-tested against an injected fake client but has
  never made a real network call — only the Tier 3 deterministic path has been exercised live. A
  concrete Anthropic backend is deferred to Phase 5, the first phase the plan requires to make real
  LLM calls.
- 29 new tests (`tests/test_point_in_time.py`, `tests/test_data_market.py`, `tests/test_data_news.py`,
  `tests/test_event_engine.py`) — 72 total, all passing. Market/news tests replay real payloads
  captured live on 2026-08-22 (`tests/fixtures/`), no live network calls inside the test suite.
- `examples/phase3_e2e.py` — real end-to-end run: live CoinGecko + Cointelegraph calls, a real
  `PointInTimeDataView` (including a synthetic future probe proven excluded), 30 real `Event`s built
  by `EventEngine`, all persisted to and reloaded from a real `runs/{run_id}/` directory.

<details>
<summary>Phase 2 (project skeleton + schemas + persistence) — complete.</summary>

- Full package tree matching `TRADING_ARCHITECTURE.md` §1 (`data/ knowledge/ agents/ simulation/
  signals/ risk/ backtest/ evaluation/ reports/ api/`), currently empty subpackages awaiting their
  own phases.
- `serena/models/` — every Pydantic schema from the architecture doc (`SimulationRun`,
  `RandomSeedBundle`, `TemperatureConfig`, `ModelTierConfig`, `Entity`/`Relationship`/ontology types,
  `DataPoint`, `Event`, `AgentProfile`, `AgentDecision`, `BeliefUpdate`), `extra="forbid"` everywhere,
  with validators enforcing the brief's hard rules at the schema level (e.g. a `BeliefUpdate` without
  a `reason`/`information_source` is a validation error, not a convention).
  `TemperatureConfig` defaults to `0.0` on every knob — deliberately not MiroFish's `0.7` default
  (verified in the reverse-engineering doc §A.12).
- `serena/artifacts.py` — the never-overwrite, append-only artifact writer for `runs/{run_id}/`.
  `write_once()` raises `FileExistsError` on a second write; `append_jsonl()` is append-only by
  construction. Resuming a run reuses the same directory (idempotent `mkdir`), individual files never
  do.
- 43 tests (`tests/test_models.py`, `tests/test_artifacts.py`), all passing on real `pytest`
  execution — no mocks for the artifact writer, real files under a real temp directory per test.
- `examples/phase2_e2e.py` — real end-to-end run against the actual `runs/` directory (not a test
  fixture): builds a `SimulationRun` + 2 `AgentProfile` + an `Event` + an `AgentDecision` + a
  `BeliefUpdate`, writes them, reloads every one from disk, asserts round-trip fidelity, and confirms
  the never-overwrite guard actually raises.

</details>

</details>

</details>

## Setup

```
cd serena
uv venv .venv
uv pip install --python .venv -e ".[dev]"        # add ",neo4j" to the extras if you have a server to test against
cp .env.example .env                              # optional: add a real GEMINI_API_KEY to exercise Tier 1/2 live
```

## Running

```
.venv/Scripts/python.exe -m pytest -v             # 335 passed, 11 skipped (Neo4j, no server available)
.venv/Scripts/python.exe examples/phase2_e2e.py   # real end-to-end run, writes to runs/
.venv/Scripts/python.exe examples/phase3_e2e.py   # real live CoinGecko + Cointelegraph run, writes to runs/
.venv/Scripts/python.exe examples/phase4_e2e.py   # real live news -> real Kuzu graph run, writes to runs/
.venv/Scripts/python.exe examples/phase5_e2e.py   # real 50-agent MVP population, writes to runs/
.venv/Scripts/python.exe examples/phase6_e2e.py   # real 5-agent OASIS Reddit simulation, writes to runs/
.venv/Scripts/python.exe examples/phase7_e2e.py   # real 5-round belief/social feedback loop, writes to runs/
.venv/Scripts/python.exe examples/phase8_e2e.py   # real signal pipeline over the Phase 7 loop, writes to runs/
.venv/Scripts/python.exe examples/phase9_e2e.py   # real risk sizing over the Phase 8 signals, writes to runs/
.venv/Scripts/python.exe examples/phase10_e2e.py  # real walk-forward backtest, 7 variants, writes to runs/
.venv/Scripts/python.exe examples/phase11_e2e.py  # real agent scoring + PnL attribution, writes to runs/
.venv/Scripts/python.exe examples/phase12_e2e.py  # real run + real live server + real HTTP verification
.venv/Scripts/python.exe examples/llm_infrastructure_check.py  # real live Gemini call (needs .env key)
```

To browse a run's dashboard yourself:

```
.venv/Scripts/python.exe -c "import uvicorn; from serena.api.app import create_app; uvicorn.run(create_app())"
```

then open `http://127.0.0.1:8000/dashboard/{run_id}` (find a `run_id` under `serena/runs/`, or via `http://127.0.0.1:8000/runs`).

## Status: MVP complete

All 12 phases of `docs/IMPLEMENTATION_PLAN.md` are implemented, tested, and actually executed end to end.
A live LLM backend (Gemini) is now wired in and verified for Phase 3's event interpretation. Nothing left
to build for the MVP scope — further work (a running Neo4j server, a schema-compatible path for Phase 5's
agent generation, agent mutation/new-strategy generation, richer dashboard views) is optional extension,
not a gap in the plan.
