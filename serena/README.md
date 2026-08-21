# Serena — MiroFish Trading

Research-grade, local-first financial multi-agent simulation. Phase 1: research/backtesting/paper
trading only — live execution is disabled by default (`docs/TRADING_ARCHITECTURE.md` §22).

Full design docs live in `../docs/`:

- [`MIROFISH_REVERSE_ENGINEERING.md`](../docs/MIROFISH_REVERSE_ENGINEERING.md) — direct source
  inspection of MiroFish and OASIS, tagged VERIFIED FROM SOURCE / INFERRED / OUR DESIGN DECISION.
- [`TRADING_ARCHITECTURE.md`](../docs/TRADING_ARCHITECTURE.md) — this system's design.
- [`IMPLEMENTATION_PLAN.md`](../docs/IMPLEMENTATION_PLAN.md) — the 12-phase staged build plan.

## Status

**Phase 2 (project skeleton + schemas + persistence) — complete.**

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

## Setup

```
cd serena
uv venv .venv
uv pip install --python .venv -e ".[dev]"
```

## Running

```
.venv/Scripts/python.exe -m pytest -v          # 43 tests
.venv/Scripts/python.exe examples/phase2_e2e.py  # real end-to-end run, writes to runs/
```

## Next

Phase 3 (`docs/IMPLEMENTATION_PLAN.md`): data ingestion adapters (`data/market/`, `data/news/`) +
`PointInTimeDataView` (no-look-ahead, enforced structurally) + `EventEngine`. Not started.
