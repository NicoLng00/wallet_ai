# MiroFish Trading — Architecture

Status: Phase 0 deliverable (branch `Serena`). Everything in this document is **OUR DESIGN DECISION**
unless it explicitly cites `docs/MIROFISH_REVERSE_ENGINEERING.md`. This is a design for a **new** system;
it is informed by, but does not copy, MiroFish or OASIS internals.

Scope discipline (restated from the brief, load-bearing for every section below): LLM reasoning, agent
behavior, social simulation, market data, quantitative signal generation, risk management, backtesting,
and agent performance evaluation are separate modules. **The LLM never controls position size and never
bypasses deterministic risk controls.** Phase 1 is research/backtesting/paper trading only; live
execution is disabled by default behind multiple explicit gates.

---

## 1. Repository layout

```
serena/                              # Python package root (name matches the branch; renamed at release if needed)
  data/
    market/          adapters + normalized OHLCV/volume/volatility/mcap/funding/OI/liquidations/orderbook
    news/            news adapters + normalized articles
    social/          Reddit/X ingestion (reuses OASIS for simulated social layer; this dir is REAL external social data)
    macro/           macro indicator adapters
    onchain/         on-chain metric adapters (optional, feature-flagged)
  knowledge/
    graph/            GraphBackend protocol + Neo4j/Kuzu implementations, ontology schema, entities/relationships
    memories/         per-agent belief/episodic memory store (separate from OASIS's ChatAgent memory)
    embeddings/       embedding client abstraction (for retrieval, not for trading signals)
  agents/
    profiles/         Pydantic AgentProfile schema + archetype library
    strategies/       deterministic strategy hints per archetype (NOT the LLM's final say)
    beliefs/           belief state + belief-update provenance log
    performance/        agent scoring, weight decay/recovery, regime-conditioned weights
  simulation/
    oasis/             OasisSimulationAdapter (the ONLY module that imports `oasis`)
    environment/        TradingEnvironment (point-in-time market/news/social view)
    events/             EventEngine (raw data -> structured Event)
    memory/             checkpoint/resume machinery for the whole simulation run
  signals/
    aggregation/         raw -> weighted -> risk-adjusted signal pipeline
    consensus/           independent_consensus calculation
    independence/        agent_prediction_matrix, correlation, effective sample size
    confidence/          calibration-derived confidence scoring
  risk/
    portfolio/           portfolio accounting (deterministic)
    sizing/              position sizing (deterministic)
    limits/               exposure/leverage/drawdown/correlation/liquidity limits (deterministic)
  backtest/
    engine/               walk-forward backtest engine
    walk_forward/         train/validation/out-of-sample split logic
    metrics/              CAGR/Sharpe/Sortino/Calmar/VaR/CVaR/etc.
  evaluation/
    agent_scoring/         direction accuracy, return error, PnL contribution
    calibration/            Brier score / reliability curves
    attribution/            which agents/archetypes drove a given signal
  reports/
    report_agent/           ReACT report agent (MiroFish-inspired, rebuilt on our own tool set)
  api/                     FastAPI app exposing simulation control + read endpoints
  frontend/                minimal research dashboard (reads from api/, no direct DB access)
  runs/                    <- SimulationRun artifacts land here, one immutable dir per run_id (gitignored)
  tests/
    fixtures/              synthetic market/news/social/agent fixtures
    ...                    mirrors the package tree above
docs/
  MIROFISH_REVERSE_ENGINEERING.md
  TRADING_ARCHITECTURE.md            (this file)
  IMPLEMENTATION_PLAN.md
```

**Why this shape, not a flatter one**: every top-level package corresponds to exactly one of the 8 items
in the brief's "Core Principle" separation list, so a reviewer can map "is the LLM leaking into risk
control?" to "does `risk/` import anything from `agents/` or call an LLM client?" — the answer must always
be no, and the directory boundary makes that reviewable at a glance, not just a convention.

This lives as a **separate Python subproject inside `wallet_test`**, not merged into the existing Node.js
Aurora Markets codebase — different language, different runtime, different risk profile (research
platform vs. the live paper-trading bots already in production on `main`). It is developed entirely on
the `Serena` branch and never touches `data/`, `server/`, or `src/` from the existing project.

---

## 2. Reproducibility: the `SimulationRun` object

Every simulation is reproducible **as far as the external LLM API permits** (temperature=0 and a fixed
seed reduce but do not eliminate provider-side non-determinism — we document this honestly rather than
overclaim it, per the brief's rule #8 "no claims of profitability without out-of-sample evidence" and the
same spirit applied to determinism claims).

```python
class SimulationRun(BaseModel):
    run_id: str                      # ULID, sortable + unique, generated at creation
    seed: int                        # top-level seed; derives all component seeds (see below)
    start_timestamp: datetime        # simulated period start (historical replay)
    end_timestamp: datetime          # simulated period end
    assets: list[str]                # e.g. ["BTC/USDT"]
    timeframe: str                   # e.g. "1h"
    agent_count: int
    simulation_rounds: int
    model_config: ModelTierConfig    # which model per tier, see §7
    temperature_config: TemperatureConfig  # SIMULATION_SEED-derived, see below
    prompts_version: str             # git-tracked prompt bundle hash (sha256 of prompts/ dir at run time)
    graph_version: str               # ontology + graph backend schema version
    data_snapshot_version: str       # hash of the exact data slice fed to this run (see §4)
    random_seeds: RandomSeedBundle   # every stdlib random / numpy seed actually used, itemized
    code_version: str                # `git rev-parse HEAD` at run time; dirty-tree runs are flagged
    simulation_config: dict          # the full resolved config, for audit
    created_at: datetime
```

`RandomSeedBundle` exists because §A.12/B.11 of the reverse-engineering doc found **two independent
unseeded RNG sources in the upstream systems** (rule-based profile fallback, per-round agent-activation
sampling) beyond LLM temperature. We do not repeat that mistake: every `random`/`numpy.random` call in
our own code takes an explicit `Generator` instance derived from `seed` via
`numpy.random.SeedSequence(seed).spawn(n)`, never the global RNG. `TemperatureConfig` exposes exactly the
four knobs the brief asks for:

```python
class TemperatureConfig(BaseModel):
    cohort_temperature: float = 0.0    # agent-population generation (MiroFish used 0.7 here — §A.4/A.5)
    agent_temperature: float = 0.0     # per-round agent LLM reasoning
    decision_temperature: float = 0.0  # final structured trade-decision call
```

Defaults are **0.0**, not MiroFish's 0.7/0.3 (§A.12) — determinism is opt-out, not opt-in, for this
research platform. Non-zero temperatures remain fully supported (some experiments legitimately want
diversity) but must be set explicitly, and whatever value is used is always recorded in
`temperature_config` on the persisted run.

**Persistence rule**: `runs/{run_id}/` is created once, at simulation start, and **never overwritten** —
this is a direct, deliberate correction of MiroFish's `state.json`/`run_state.json` overwrite-in-place
behavior (§A.10) and its destructive `cleanup_simulation_logs()` restart path. A "restart" of a failed run
creates a new `run_id` that references the old one via `resumed_from_run_id`; it never deletes or mutates
the old run's directory. Checkpointing (§10) writes new files inside `runs/{run_id}/checkpoints/{n}/`,
never in place.

---

## 3. Knowledge graph

### 3.1 Backend abstraction — the direct fix for §A.3/A.7's Zep Cloud lock-in

```python
class GraphBackend(Protocol):
    def upsert_entities(self, entities: list[Entity]) -> None: ...
    def upsert_relationships(self, relationships: list[Relationship]) -> None: ...
    def query_neighborhood(self, entity_id: str, depth: int = 2) -> Subgraph: ...
    def query_by_type(self, entity_type: str) -> list[Entity]: ...
    def health_check(self) -> bool: ...
```

Two implementations ship: `Neo4jGraphBackend` (Cypher, for anyone who already runs Neo4j) and
`KuzuGraphBackend` (embedded, zero-infra — **the default**, since it requires no external service to run
the MVP locally, matching "local-first" in the brief's title). No implementation is Zep or any other
cloud-only vendor; nothing in `signals/`, `agents/`, `risk/`, or `backtest/` imports a graph library
directly — only `knowledge/graph/` does, exactly mirroring how we'll fix MiroFish's actual bug (every
Zep-touching service in `backend/app/services/` instantiated the Zep client directly — §A.3).

### 3.2 Entity/relationship ontology — Pydantic-validated, not LLM-defined at runtime

Unlike MiroFish, where the LLM invents the entire ontology per-project (§A.2), we ship a **fixed, curated
trading ontology** as Pydantic models, because a financial knowledge graph has known, stable entity
categories — there's no need to re-derive "what is an Asset" from an LLM every run, and doing so is
exactly the kind of ontology drift the brief's "prevent excessive ontology complexity" rule warns about.

```python
class EntityType(str, Enum):
    ASSET = "Asset"; COMPANY = "Company"; FINANCIAL_INSTITUTION = "FinancialInstitution"
    TRADER = "Trader"; MARKET_MAKER = "MarketMaker"; WHALE = "Whale"; EXCHANGE = "Exchange"
    ETF = "ETF"; PROTOCOL = "Protocol"; GOVERNMENT = "Government"; CENTRAL_BANK = "CentralBank"
    ECONOMIC_INDICATOR = "EconomicIndicator"; NEWS_SOURCE = "NewsSource"; ANALYST = "Analyst"
    INFLUENCER = "Influencer"; EVENT = "Event"

class RelationType(str, Enum):
    HOLDS = "HOLDS"; BUYS = "BUYS"; SELLS = "SELLS"; LONGS = "LONGS"; SHORTS = "SHORTS"
    INFLUENCES = "INFLUENCES"; REPORTS_ON = "REPORTS_ON"; AFFECTS = "AFFECTS"
    ANNOUNCES = "ANNOUNCES"; LISTS = "LISTS"; FLOWS_INTO = "FLOWS_INTO"
    FLOWS_OUT_OF = "FLOWS_OUT_OF"; CORRELATES_WITH = "CORRELATES_WITH"

class Entity(BaseModel):
    entity_id: str; entity_type: EntityType; name: str
    attributes: dict[str, str | float | int | bool] = {}
    model_config = ConfigDict(extra="forbid")

class Relationship(BaseModel):
    source_id: str; target_id: str; relation_type: RelationType
    attributes: dict[str, str | float | int | bool] = {}
    valid_from: datetime; valid_until: datetime | None = None   # temporal validity, not permanent fact
```

An LLM-assisted **ontology extension proposal** flow does exist (for genuinely new entity/relationship
categories discovered during operation — e.g. a new instrument type) but it never writes directly to the
schema: it produces a `OntologyChangeProposal` that must pass the same validation MiroFish already proved
useful (§A.2) — hard type-count ceiling, no duplicate types, no attribute-name collisions, dangling-edge
rejection — and additionally requires a human or a deterministic policy check to merge it. This directly
implements the brief's "validate the output with strict schemas... prevent invalid/duplicate/circular/
excessive ontology complexity" requirement while avoiding MiroFish's failure mode of a fresh, potentially
inconsistent ontology being LLM-invented on every single run.

---

## 4. Data ingestion — no look-ahead bias by construction

```python
class DataPoint(BaseModel):
    timestamp: datetime          # UTC, source-native precision preserved
    source: str                  # adapter name, e.g. "binance_ohlcv", "coingecko", "newsapi"
    asset: str | None            # None for macro-only points
    raw_payload_hash: str        # sha256 of the raw response, for audit + dedup
    normalized: dict             # adapter-specific normalized shape, schema-checked per adapter
```

Adapters: `market/` (OHLCV, volume, volatility, market cap, funding rates, open interest, liquidations,
order-book snapshots where available), `news/`, `social/` (real external Reddit/X data — distinct from
OASIS's *simulated* social layer in `simulation/oasis/`), `macro/`, `onchain/` (feature-flagged, many
free sources are rate-limited or unreliable — we will not fabricate on-chain data if no free source is
reachable, matching the existing Aurora Markets project's established honesty discipline about data-source
limits).

**No-look-ahead is enforced structurally, not by convention**: the backtest engine and `TradingEnvironment`
never receive the full dataset. They receive a `PointInTimeDataView` that is constructed by filtering the
canonical dataset to `timestamp <= current_simulation_time` **before** it is handed to any agent or LLM
call. This is a hard architectural boundary — agents literally cannot query for `t > now`, because the
view object has no method that accepts a future timestamp. `data_snapshot_version` on `SimulationRun`
hashes exactly the slice used, so a run's data provenance is auditable after the fact.

---

## 5. Event engine

Raw data → structured `Event`, matching the brief's example shape exactly, with deterministic fields kept
separate from LLM-interpreted fields:

```python
class Event(BaseModel):
    event_id: str
    timestamp: datetime                 # deterministic, from source data
    type: str                           # e.g. "ETF_FLOW", "EARNINGS", "MACRO_RELEASE", "SOCIAL_SPIKE"
    entities: list[str]                 # entity_ids from the knowledge graph
    direction: Literal["bullish","bearish","neutral"]  # LLM-interpreted
    importance: float                   # LLM-interpreted, 0-1
    novelty: float                      # deterministic: cosine distance from recent embeddings of same entity
    confidence: float                   # LLM-interpreted, 0-1
    source_ids: list[str]               # DataPoint.raw_payload_hash values, for traceability
```

`timestamp`, `entities` (resolved via graph lookup), and `novelty` (embedding-distance against a rolling
window) are computed deterministically in Python. `direction`, `importance`, `confidence` require semantic
judgment and go through Tier 1/2 LLM calls (§7) with a validated JSON schema — same "LLM never silently
free-forms" discipline the brief demands everywhere else, applied here too, since MiroFish's own ontology
generator proved the value of hard schema validation around LLM output (§A.2) and its report agent proved
the value of stripping anything the model tries to fabricate (§A.8).

---

## 6. Agent factory

`AgentProfile` (Pydantic, `extra="forbid"`) with every field the brief lists (`identity, capital,
risk_profile, time_horizon, strategy, beliefs, information_sources, behavioral_biases,
social_influence, information_sensitivity, herding_coefficient, contrarian_coefficient,
news_sensitivity, risk_aversion, maximum_position, maximum_drawdown, preferred_assets`), plus a
persistent `agent_id` that survives across simulation runs (brief rule #11: "every agent must have a
persistent identity") — this is a deliberate departure from MiroFish, where agent profiles are
regenerated fresh (and non-deterministically, §A.12) every simulation.

The 12 archetypes from the brief (`momentum, mean_reversion, macro, fundamental, news, contrarian,
retail, whale, market_maker, quant, trend_follower, long_term_holder`) each get:

1. A **profile prior** — reasonable default ranges for `risk_aversion`, `herding`, `news_sensitivity`,
   etc. (e.g. `whale`: low herding, high capital, low news_sensitivity; `retail`: high herding, high
   news_sensitivity, low capital).
2. A **deterministic strategy hint** in `agents/strategies/` — a cheap, non-LLM heuristic (e.g. momentum
   = N-period return sign) that seeds the agent's *starting* belief and is always computable even if the
   LLM call for that round fails or is skipped (Tier 3, §7) — this gives every agent a sane fallback,
   analogous to MiroFish's rule-based fallback generation (§A.4/A.5), except ours is domain-appropriate
   (a trading heuristic, not `random.choice`) rather than purely random.

Agent population generation reuses MiroFish's validated pattern of **batched, staged LLM calls** (§A.5)
rather than one call per agent or one call for all 50 agents at once — batches of ~10-15 profiles per
call, at `cohort_temperature` (default 0.0, see §2), with the deterministic archetype prior as a
structural fallback if a batch's JSON fails validation after retries (never `random`-based, per the point
above).

---

## 7. LLM tiering — `LLMClient` abstraction

```python
class LLMClient(Protocol):
    async def complete_json(self, prompt: str, schema: type[BaseModel], *,
                             tier: Literal["opus","fast","deterministic"],
                             temperature: float, seed: int | None = None) -> BaseModel: ...
```

- **Tier 1 (Opus)**: ontology extension proposals, complex event interpretation, agent-population
  generation, major belief updates (large deltas), simulation-level analysis, final reports.
- **Tier 2 (fast/cheap model)**: routine per-round agent actions, sentiment classification,
  summarization — the high-volume path (50 agents × 20 rounds = 1,000 calls in the MVP alone; Tier 1 for
  all of them would be both slow and unnecessarily expensive for what is often a small belief nudge).
- **Tier 3 (deterministic Python, no LLM)**: every indicator, return, volatility, position size, PnL,
  risk check, and score. This tier is not a fallback — it's mandatory-by-construction: `risk/` and
  `backtest/` modules do not import `LLMClient` at all, so it's structurally impossible for either to make
  a model call, directly enforcing the brief's "LLM never bypasses deterministic risk controls" rule at
  the import-graph level, not just by convention.

Every response is validated against a Pydantic schema before use; on validation failure, one retry at
reduced temperature (this specific pattern — retry with lower temperature — is the one MiroFish behavior
worth keeping verbatim, §A.4/A.5/A.11), then fall through to the Tier 3 deterministic heuristic. No
response is ever used unvalidated (brief rule #4).

---

## 8. Agent decision schema

```python
class AgentDecision(BaseModel):
    action: Literal["BUY","SELL","HOLD"]
    asset: str
    confidence: float = Field(ge=0, le=1)
    expected_return: float
    time_horizon_hours: int = Field(gt=0)
    reasoning_summary: str
    information_used: list[str]          # Event.event_id / DataPoint references
    belief_update: dict[str, float]       # asset -> new belief value
    model_config = ConfigDict(extra="forbid")
```

This is the **only** thing an agent's LLM call is allowed to produce for a trading round. It is never
interpreted as an order — `signals/` consumes many agents' `AgentDecision`s and produces one
`risk_adjusted_signal`; `risk/` is what turns a signal into an actual position size. This two-step
separation is the direct implementation of the brief's single most repeated constraint.

---

## 9. OASIS integration — `OasisSimulationAdapter`

Built entirely on the extension points verified in §B.12 of the reverse-engineering doc — **zero forking
of OASIS source**:

```python
class OasisSimulationAdapter:
    def __init__(self, agent_profiles: list[AgentProfile], platform: Literal["twitter","reddit"], seed: int): ...
    async def initialize(self) -> None: ...          # builds AgentGraph + Platform via oasis.make()
    async def execute_round(self, manual_events: list[ManualAction]) -> RoundResult: ...
    async def collect_actions(self) -> list[SocialAction]: ...
    async def collect_social_exposure(self, agent_id: str) -> list[Post]: ...
    async def persist_state(self, path: Path) -> None: ...
    async def close(self) -> None: ...                # graceful OasisEnv.close()
```

- **`execute_round`** calls `OasisEnv.step({agent: LLMAction(...) or ManualAction(...)})` (§B.2) — market
  events from the `EventEngine` (§5) are injected as `ManualAction(CREATE_POST, ...)` posts (§B.12 point
  2), so agents "hear about" a market event exactly the way MiroFish's own narrative events reach agents,
  without us touching OASIS internals.
- **Trading-specific agent tools** (e.g. exposing the agent's current `TradingEnvironment` view, or a
  `submit_decision` tool that returns an `AgentDecision`) are attached via `tools=` on `SocialAgent`
  (§B.12 point 1) — the lowest-friction extension point found. Because these calls bypass OASIS's
  `Channel`/`trace` table (verified in §B.12), the adapter independently persists every `AgentDecision` to
  `runs/{run_id}/actions.jsonl` itself — we do not rely on OASIS's own audit trail for anything
  trading-related.
- **We do not fork `Platform`** for an MVP `place_trade` action type (§B.12 point 3 describes how one
  could) — trading decisions are collected via the tool-call mechanism above, not as a native OASIS
  platform action, because a forked `Platform` would need its own SQL schema file and would tie us to
  OASIS's release-specific internals (§A.6/A.9 already flags MiroFish's own exact-pin fragility here as a
  cautionary example). This can be revisited post-MVP if native OASIS action semantics prove necessary.
- **Determinism**: `initialize()` seeds Python's global `random` module for the duration of the OASIS
  call (`Platform.refresh()`, `recsys.py` both use unseeded `random`, per §B.11) using a seed spawned from
  `SimulationRun.seed`, and restores the previous RNG state on exit — a targeted mitigation for a
  verified upstream gap we cannot fix by forking (no seeding hook exists in OASIS itself).
- **Twitter vs. Reddit are not required to produce identical content** (brief requirement, directly
  matching the verified §B.6 finding that they already structurally differ in OASIS — different recsys,
  different time semantics) — the adapter passes platform-appropriate `UserInfo.recsys_type` and does not
  attempt to force parity.

The adapter is the **only** module in the entire codebase that imports `oasis`. `simulation/environment/`
and everything above it interacts with `RoundResult`, never with OASIS types directly — if OASIS's API
changes on a future release, only this one adapter needs updating.

---

## 10. `TradingEnvironment`

Separate from OASIS by design (OASIS has no financial concepts at all, §B.9 — there is nothing to extend,
only something to sit beside):

```python
class TradingEnvironment:
    def snapshot(self, asset: str, at: datetime) -> EnvironmentSnapshot: ...
```

`EnvironmentSnapshot` exposes exactly what the brief lists — price, returns, volume, volatility, funding,
open interest, order flow, news, macro, social sentiment, agent consensus — all sourced through the
`PointInTimeDataView` (§4), so it is structurally impossible for a snapshot to leak future information.
Agent consensus is read from the *previous* round's `signals/` output only (never the current round's, to
avoid circularity within a step).

---

## 11. Belief dynamics

```python
class BeliefUpdate(BaseModel):
    agent_id: str; asset: str
    old_belief: float; new_belief: float
    reason: str                          # free text, LLM- or rule-generated
    information_source: str              # Event.event_id, DataPoint id, or "peer:{agent_id}"
    timestamp: datetime
```

Every belief change is appended to `runs/{run_id}/belief_updates.jsonl` — never mutated in place, and
never allowed without a `reason`/`information_source` (brief rule #12: "every belief update must have
provenance"). Sources of change: new market data (Tier 3 trigger, e.g. a volatility spike crosses a
threshold), new events (Tier 1/2 interpretation), peer social exposure (via `OasisSimulationAdapter`),
and strategy-rule triggers (Tier 3 archetype heuristics, §6).

---

## 12. Social feedback loop

```
market/news event (EventEngine)
  -> ManualAction posts into OASIS (OasisSimulationAdapter.execute_round)
  -> agents observe (SocialEnvironment.to_text_prompt, OASIS-native, §B.10)
  -> agents post/interact (OASIS ActionType actions, §B.5)
  -> OASIS recommendation system changes exposure (Platform.update_rec_table, §B.7)
  -> agents see new information next round
  -> beliefs update (BeliefUpdate, §11)
  -> AgentDecision changes (§8)
  -> signals/ aggregates (§13)
```

This loop runs entirely on OASIS's existing, verified machinery (§B.2's `step()`, §B.7's recsys) for the
"agents observe/post/get recommended content" portion — we do not reimplement social recommendation. Our
own code owns only the two ends of the loop: injecting market events in, and reading `AgentDecision`s out.

---

## 13. Signal engine

Explicitly not majority vote, per the brief. Weight formula (documented as a starting design, tunable —
this is a modeling choice, not a fact about the world, and will be empirically validated in backtesting
before being trusted):

```
weight(agent, regime) =
    accuracy_score(agent)            # historical directional accuracy, §evaluation/agent_scoring
    * calibration_score(agent)       # Brier-score-derived, §evaluation/calibration
    * regime_score(agent, regime)    # performance conditioned on current market regime
    * independence_score(agent)      # 1 / effective_cluster_size, §14
    * confidence(agent, round)       # from AgentDecision.confidence
    * recency_weight(agent)          # exponential decay favoring recent performance
```

All five multiplicative factors are `[0,1]`-normalized before combination (min-max within the active
agent population per round, with a floor to avoid zero-weight lock-in for agents with a thin sample —
`evaluation/agent_scoring` tracks `sample_size` and blends toward a neutral prior when it's small). Output
pipeline: `raw_agent_signal` (each `AgentDecision` alone) → `weighted_signal` (weight-combined) →
`independent_consensus` (§14) → `confidence` (population agreement + calibration) → `expected_return`
(weighted mean of `AgentDecision.expected_return`) → `risk_adjusted_signal` (final input to `risk/`,
scaled by the signal's own confidence — a low-confidence signal requests a smaller position, but the
actual size is still decided deterministically in `risk/`, never by the signal engine itself).

---

## 14. Agent correlation / independence

```python
class AgentPredictionMatrix:
    def pairwise_correlation(self) -> np.ndarray: ...       # Pearson over recent AgentDecision.expected_return
    def cluster_correlation(self, threshold: float = 0.7) -> list[set[str]]: ...  # connected components above threshold
    def effective_sample_size(self) -> float: ...            # Kish's effective sample size over correlation clusters
    def independent_consensus(self) -> float: ...            # consensus computed per-cluster, then clusters combined
```

This directly implements the brief's "100 agents copying one source must not count as 100 independent
votes" requirement, and is exposed in reports (§16) so a reader can see *why* a signal has the confidence
it does, not just the number.

---

## 15. Market replay / backtest engine

Walk-forward only — **no shuffling of time-series data**, ever (brief rule, and the same discipline
`PointInTimeDataView` already enforces structurally in §4). Standard train / validation / out-of-sample
split, configurable per run and recorded on `SimulationRun.simulation_config`.

Costs modeled: transaction costs, slippage, spread, funding, liquidity constraints — each a pluggable,
deterministic function of `(asset, size, EnvironmentSnapshot)`, never LLM-estimated.

Metrics (`backtest/metrics/`): CAGR, Sharpe, Sortino, max drawdown, Calmar, win rate, profit factor,
turnover, exposure, average holding period, VaR, CVaR, tail risk. All computed in Tier 3 (deterministic
Python), never asked of an LLM.

Baselines compared against, exactly per the brief: Buy & Hold, Momentum, Mean Reversion, Random, single
LLM agent (no multi-agent), multi-agent without social interaction (OASIS loop disabled — a direct
ablation of §12), and the full multi-agent + social simulation. Running all six alongside the real system
on the same data slice is what makes a profitability claim honest — a Sharpe ratio in isolation proves
nothing; beating Buy & Hold and Random *out of sample* on the same walk-forward split is the actual bar
(brief rule #8).

---

## 16. Risk engine

Fully deterministic (`risk/` never imports `LLMClient`, enforced by import-linting in CI — see
`IMPLEMENTATION_PLAN.md` testing phase): max position, max portfolio exposure, max leverage, max daily
loss, max drawdown, volatility targeting, stop conditions, correlation limits (reusing §14's correlation
matrix — a portfolio should not implicitly concentrate in a correlated cluster of *assets* the way agent
consensus must not implicitly concentrate in a correlated cluster of *agents*), liquidity limits. Position
sizing is a pure function `(risk_adjusted_signal, portfolio_state, limits) -> Position` — same input
always produces the same output, independent of any LLM.

---

## 17. Agent performance loop

After outcomes are known (`AgentDecision.time_horizon_hours` elapses and real/replayed price data
confirms or refutes the prediction): `evaluation/agent_scoring` computes direction accuracy, return
prediction error, calibration (Brier score), PnL contribution, drawdown contribution, regime-conditioned
performance, and updates `AgentPredictionMatrix` correlation. Weights (§13) are updated via **decay
toward, not deletion** — a losing agent's weight shrinks (`recency_weight`) but the agent persists (brief
rule: "do not automatically delete losing agents"); a recovering agent's weight can rise again. Mutation
(new strategy variants for an archetype) and new-strategy generation are Phase 11 (`IMPLEMENTATION_PLAN.md`)
work, deliberately deferred past the MVP.

---

## 18. Checkpointing

Every N rounds (configurable, default 5): agent state, beliefs, actions, social state (OASIS's own
`env` state via `OasisSimulationAdapter.persist_state`), market state (the `data_snapshot_version` slice
boundary), signal state, `RandomSeedBundle`'s current spawn-point, and simulation metadata are written to
`runs/{run_id}/checkpoints/{round_n}/`. Resuming loads the latest checkpoint and continues — it never
deletes an existing run directory (§2), a direct, deliberate contrast with MiroFish's destructive
`cleanup_simulation_logs()` restart path (§A.10).

---

## 19. Artifacts (every run produces exactly these, append-only within the run's own directory)

`run_metadata.json, agents.json, events.jsonl, belief_updates.jsonl, actions.jsonl,
social_interactions.jsonl, signals.jsonl, positions.jsonl, portfolio.jsonl, agent_scores.jsonl,
metrics.json, report.md` — matching the brief's list exactly, all under `runs/{run_id}/`.

---

## 20. Report agent

Rebuilt on our own tool set, keeping the parts of MiroFish's `ReportAgent` that were genuinely good
engineering (§A.8): the ReACT-with-typed-tools loop structure, and the code-level anti-hallucination
guardrail (strip any tool-result block the LLM invents rather than trusting it not to). Tools:
`search_events, search_agent_actions, search_agent, search_belief_changes, search_signals,
search_portfolio, search_market_state, compare_agents, compare_runs, calculate_metrics` — all reading from
this system's own `runs/{run_id}/*.jsonl` artifacts and the knowledge graph (§3), never from OASIS or
Zep. Report text is structurally required to tag every claim as **SIMULATION FACT** (read directly from
an artifact), **MODEL INTERPRETATION** (an LLM's reading of those facts), or **REAL MARKET OUTCOME**
(from actual historical data, only available for backtest runs) — enforced the same way MiroFish enforces
"don't fabricate a tool result": a post-generation validator scans for these tags and rejects/retries a
section that asserts something without one.

---

## 21. Research dashboard

Minimal FastAPI + a lightweight frontend (framework choice deferred to `IMPLEMENTATION_PLAN.md` Phase 12)
reading only from `api/`, which itself reads only from `runs/{run_id}/` artifacts and the graph backend —
the dashboard never talks to OASIS, the LLM, or the data adapters directly. Views: simulation status,
agent population/archetypes, belief distribution, bullish/bearish + independent consensus, signal
timeline vs. price timeline, predicted-vs-actual returns, agent leaderboard, agent correlation matrix,
portfolio equity curve + drawdown, simulation logs.

---

## 22. Execution adapters — live trading disabled by default

```python
class ExecutionAdapter(Protocol):
    def submit(self, position: Position) -> ExecutionResult: ...

class PaperExecutionAdapter:               # the only adapter enabled by default
    def submit(self, position: Position) -> ExecutionResult: ...   # simulated fill against EnvironmentSnapshot

class LiveExecutionAdapter:                # disabled; multiple explicit gates required to enable
    def __init__(self, *, i_understand_this_places_real_trades: Literal[True], exchange_credentials: ...): ...
    def submit(self, position: Position) -> ExecutionResult:
        raise NotImplementedError("Live execution is out of scope for Phase 1.")
```

`LiveExecutionAdapter` requires a literal-`True` acknowledgment parameter at construction (a real,
type-checked gate, not just a config flag that could be flipped accidentally) and currently always raises
— the class exists to define the interface shape for a future phase, not to be usable yet. This directly
implements brief rule #16.

---

## 23. Testing strategy (see `IMPLEMENTATION_PLAN.md` for staging)

Synthetic fixtures under `tests/fixtures/` for: ontology validation, graph persistence (against both
backends), agent profile schema, belief updates (provenance required), information timestamps (no
look-ahead — a fixture that asserts `PointInTimeDataView` raises/filters on a future query),
`AgentPredictionMatrix` correlation adjustment, signal aggregation (weight formula unit tests with known
inputs/outputs), position sizing (deterministic, same input -> same output), portfolio accounting,
transaction-cost application, checkpoint/resume (a resumed run's artifacts must be byte-identical in
structure to a non-interrupted run's, modulo the checkpoint boundary), simulation determinism
(temperature=0 + fixed seed -> identical `AgentDecision` sequence, run twice), and backtest metrics
(known-answer tests against hand-computed Sharpe/Sortino/etc. on a small synthetic series).
