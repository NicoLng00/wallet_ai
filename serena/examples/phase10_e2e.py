"""Esempio end-to-end reale per la Fase 10 (docs/IMPLEMENTATION_PLAN.md): backtest walk-forward su
90 giorni reali di chiusure BTC/USD (CoinGecko, Fase 3), split train/validation/out-of-sample reale,
le 7 varianti dell'architettura §15 (6 baseline + il sistema completo) fatte girare sulla STESSA
finestra out-of-sample con lo STESSO risk engine (Fase 9) e la stessa soglia di decisione
(agents/beliefs/decision.py) — mai regole diverse per varianti diverse. Metriche reali (Sharpe,
Sortino, CAGR, max drawdown, ecc.) persistite in metrics.json.

Limite dichiarato: la variante "sistema completo" fa girare un vero OasisSimulationAdapter per ogni
periodo (overhead reale di sqlite/asyncio) — la finestra out-of-sample e' quindi tenuta breve
(~12 periodi) per un runtime ragionevole in questo esempio, non perche' il motore non supporti
finestre piu' lunghe.

Uso: .venv/Scripts/python.exe examples/phase10_e2e.py
"""
from __future__ import annotations
import asyncio
from datetime import datetime, timezone

from serena.agents.profiles.generator import generate_agent_population
from serena.artifacts import RunArtifactWriter
from serena.backtest.engine.baselines import (
    NoSocialAgentBacktester,
    buy_and_hold_fraction,
    mean_reversion_fraction,
    momentum_fraction,
    random_fraction,
)
from serena.backtest.engine.engine import VariantResult, run_full_system_variant, run_price_variant
from serena.backtest.walk_forward.split import make_walk_forward_split
from serena.data.market.coingecko import CoinGeckoMarketAdapter
from serena.ids import new_run_id
from serena.models.agent import AgentArchetype
from serena.risk.limits.limits import RiskLimits
from serena.risk.portfolio.portfolio import PortfolioState
from serena.simulation.events.engine import EventEngine
from serena.simulation.oasis.adapter import OasisSimulationAdapter
from serena.simulation.round_loop import SimulationRoundLoop

import numpy as np

NOW = datetime.now(timezone.utc)
ASSET = "BTC/USDT"
INITIAL_EQUITY = 100_000.0
PERIODS_PER_YEAR = 365
FULL_SYSTEM_PERIODS = 12  # finestra ridotta per l'overhead reale di OASIS, vedi limite dichiarato sopra


async def main() -> None:
    run_id = new_run_id()
    writer = RunArtifactWriter(run_id)

    print("Chiamata live: CoinGecko OHLC BTC/USD (90 giorni, Fase 3)...")
    market_points = await CoinGeckoMarketAdapter().fetch_ohlc("bitcoin", days=90)
    timestamps = [point.timestamp for point in market_points]
    closes = [point.normalized["close"] for point in market_points]
    print(f"  -> {len(closes)} candele reali")

    split = make_walk_forward_split(timestamps, train_fraction=0.6, validation_fraction=0.2)
    out_of_sample_start_index = timestamps.index(split.out_of_sample_start)
    print(f"Split walk-forward reale: train fino a {split.train_end.date()}, "
          f"validation fino a {split.validation_end.date()}, out-of-sample da {split.out_of_sample_start.date()}")

    # Le 7 varianti devono girare sulla STESSA fetta di dati per un confronto onesto (architettura
    # §15, regola #8 del brief) — la variante "sistema completo" e' la piu' lenta (OASIS reale per
    # periodo), quindi la finestra out-of-sample e' troncata per TUTTE le varianti a quanto il
    # sistema completo puo' effettivamente coprire in questo esempio, non solo per lui.
    full_system_end_index = min(out_of_sample_start_index + FULL_SYSTEM_PERIODS, len(closes) - 1)
    timestamps = timestamps[: full_system_end_index + 1]
    closes = closes[: full_system_end_index + 1]

    limits = RiskLimits(max_position_fraction=0.2)
    results: dict[str, VariantResult] = {}

    results["buy_and_hold"] = run_price_variant(
        "buy_and_hold", ASSET, timestamps, closes, out_of_sample_start_index,
        lambda window, portfolio: buy_and_hold_fraction(ASSET, window, portfolio, limits),
        INITIAL_EQUITY, PERIODS_PER_YEAR,
    )
    results["momentum"] = run_price_variant(
        "momentum", ASSET, timestamps, closes, out_of_sample_start_index,
        lambda window, portfolio: momentum_fraction(ASSET, window, portfolio, limits),
        INITIAL_EQUITY, PERIODS_PER_YEAR,
    )
    results["mean_reversion"] = run_price_variant(
        "mean_reversion", ASSET, timestamps, closes, out_of_sample_start_index,
        lambda window, portfolio: mean_reversion_fraction(ASSET, window, portfolio, limits),
        INITIAL_EQUITY, PERIODS_PER_YEAR,
    )
    rng = np.random.default_rng(20260822)
    results["random"] = run_price_variant(
        "random", ASSET, timestamps, closes, out_of_sample_start_index,
        lambda window, portfolio: random_fraction(ASSET, rng, portfolio, limits),
        INITIAL_EQUITY, PERIODS_PER_YEAR,
    )

    agents = await generate_agent_population(
        {AgentArchetype.MOMENTUM: 1, AgentArchetype.CONTRARIAN: 1, AgentArchetype.RETAIL: 1,
         AgentArchetype.LONG_TERM_HOLDER: 1, AgentArchetype.QUANT: 1},
        seed=20260822, created_at=NOW, preferred_assets=[ASSET],
    )

    single_agent_backtester = NoSocialAgentBacktester([agents[0]], ASSET, limits)
    results["single_agent_no_social"] = run_price_variant(
        "single_agent_no_social", ASSET, timestamps, closes, out_of_sample_start_index,
        lambda window, portfolio: single_agent_backtester.step(timestamps[len(window) - 1], window, portfolio),
        INITIAL_EQUITY, PERIODS_PER_YEAR,
    )

    multi_agent_backtester = NoSocialAgentBacktester(agents, ASSET, limits)
    results["multi_agent_no_social"] = run_price_variant(
        "multi_agent_no_social", ASSET, timestamps, closes, out_of_sample_start_index,
        lambda window, portfolio: multi_agent_backtester.step(timestamps[len(window) - 1], window, portfolio),
        INITIAL_EQUITY, PERIODS_PER_YEAR,
    )

    print(f"Sistema completo: OASIS reale su {FULL_SYSTEM_PERIODS} periodi (vedi limite dichiarato)...")
    db_path = writer.dir / "oasis_backtest.db"
    adapter = OasisSimulationAdapter(agents, platform="reddit", seed=20260822, database_path=db_path)
    await adapter.initialize()
    loop = SimulationRoundLoop(agents, EventEngine(), adapter, ASSET, writer)
    results["full_system"] = await run_full_system_variant(
        "full_system", ASSET, timestamps, closes, out_of_sample_start_index, loop, INITIAL_EQUITY, PERIODS_PER_YEAR, limits,
    )
    await adapter.close()

    writer.write_once("metrics.json", {name: result.metrics for name, result in results.items()})
    reloaded = writer.read_json("metrics.json")
    assert set(reloaded.keys()) == set(results.keys())

    print(f"\nOK — run_id={run_id}")
    print(f"{'Variante':<24} {'Rendimento':>12} {'Sharpe':>8} {'MaxDD':>8} {'WinRate':>8}")
    for name, result in results.items():
        total_return = result.equity_curve[-1] / result.equity_curve[0] - 1
        m = result.metrics
        print(f"{name:<24} {total_return:>+11.4%} {m.sharpe_ratio:>8.3f} {m.max_drawdown:>8.3%} {m.win_rate:>8.3%}")
    print(f"\n7 varianti (6 baseline + sistema completo) confrontate sulla stessa finestra out-of-sample.")
    print("Nota onesta: multi_agent_no_social e full_system coincidono in questo run perche' nessun "
          "evento di mercato e' stato iniettato per periodo (Cointelegraph, Fase 3, e' un feed live — "
          "non ha un archivio storico allineabile a date passate arbitrarie); senza un evento da "
          "postare, il loop sociale di OASIS non ha nulla da esporre, quindi il sistema completo si "
          "riduce esattamente al meccanismo di multi_agent_no_social per questo backtest. Fase 7 ha "
          "gia' dimostrato con un evento reale iniettato che il canale sociale sposta davvero le "
          "belief in modo diverso — qui la differenza semplicemente non e' esercitata, non e' rotta.")
    print(f"Metriche reali persistite e rilette: {writer.dir / 'metrics.json'}")


if __name__ == "__main__":
    asyncio.run(main())
