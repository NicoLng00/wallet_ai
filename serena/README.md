# Serena — MiroFish Trading

Research-grade, local-first financial multi-agent simulation. Phase 1: research/backtesting/paper
trading only — live execution is disabled by default (`docs/TRADING_ARCHITECTURE.md` §22).

Full design docs live in `../docs/`:

- [`MIROFISH_REVERSE_ENGINEERING.md`](../docs/MIROFISH_REVERSE_ENGINEERING.md) — direct source
  inspection of MiroFish and OASIS, tagged VERIFIED FROM SOURCE / INFERRED / OUR DESIGN DECISION.
- [`TRADING_ARCHITECTURE.md`](../docs/TRADING_ARCHITECTURE.md) — this system's design.
- [`IMPLEMENTATION_PLAN.md`](../docs/IMPLEMENTATION_PLAN.md) — the 12-phase staged build plan.

## Status

**Phase 4 (knowledge graph) — complete.**

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

## Setup

```
cd serena
uv venv .venv
uv pip install --python .venv -e ".[dev]"        # add ",neo4j" to the extras if you have a server to test against
```

## Running

```
.venv/Scripts/python.exe -m pytest -v            # 93 passed, 11 skipped (Neo4j, no server available)
.venv/Scripts/python.exe examples/phase2_e2e.py  # real end-to-end run, writes to runs/
.venv/Scripts/python.exe examples/phase3_e2e.py  # real live CoinGecko + Cointelegraph run, writes to runs/
.venv/Scripts/python.exe examples/phase4_e2e.py  # real live news -> real Kuzu graph run, writes to runs/
```

## Next

Phase 5 (`docs/IMPLEMENTATION_PLAN.md`): agent factory — the 10-archetype profile library, batched
staged LLM-assisted profile generation at `cohort_temperature`, deterministic archetype-prior fallback.
Not started. This is also the first phase the plan requires making real LLM calls — will need an
`ANTHROPIC_API_KEY` in the environment to exercise the LLM path live rather than only via injected fakes.
