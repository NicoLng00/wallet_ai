"""Verifica di riproducibilita' della sandbox — NON ancora eseguito.

Python non era installato sulla macchina usata per scrivere questo script (verificato:
`python3`/`python` non trovati). La logica replica intenzionalmente, formula per formula, quella
di src/engine/indicators.js (computeBollingerBands), src/engine/strategies.js
(bollinger_reversion) e src/engine/backtest.js (runSplitBacktest) — stessi parametri:
periodo 20, 2 deviazioni standard (varianza di popolazione, non campionaria — numpy con ddof=0,
identico a JS), stop 1.6%, target 2.8% (SIMULATION.autopilotStopPercent/TargetPercent, FISSI: il
backtest walk-forward di validazione non usa l'ATR, solo l'esecuzione live lo fa), warmup 50,
split 70/30, storico Yahoo a 2 anni (stesso default di fetchYahooDaily).

Esegui e confronta il risultato con la candidata SPY:bollinger_reversion@1D REALMENTE validata in
produzione in data/research.json, prima di fidarti di qualunque nuova analisi in questa sandbox.
Se i numeri non coincidono entro un margine di arrotondamento ragionevole, il bug e' qui, non li'
— data/research.json e' il motore di produzione gia' verificato in sessione con dati reali.
"""
import requests
import numpy as np

SYMBOL = "SPY"
STOP_PCT = 1.6
TARGET_PCT = 2.8
WARMUP = 50
SPLIT_RATIO = 0.7
BOLLINGER_PERIOD = 20
BOLLINGER_K = 2


def fetch_yahoo_daily(symbol, range_="2y"):
    url = f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}"
    params = {"range": range_, "interval": "1d"}
    headers = {"User-Agent": "Mozilla/5.0 (compatible; AuroraMarketsResearch/1.0)"}
    res = requests.get(url, params=params, headers=headers, timeout=15)
    res.raise_for_status()
    payload = res.json()
    result = payload["chart"]["result"][0]
    closes_raw = result["indicators"]["quote"][0]["close"]
    closes = [c for c in closes_raw if c is not None]
    return closes


def bollinger_lower_band(window, period=BOLLINGER_PERIOD, k=BOLLINGER_K):
    if len(window) < period:
        return None
    slice_ = np.array(window[-period:])
    mean = slice_.mean()
    std = slice_.std(ddof=0)  # varianza di popolazione — identico a computeBollingerBands in JS
    return mean - std * k


def summarize(trades):
    count = len(trades)
    if count == 0:
        return {"count": 0, "win_rate": 0.0, "avg_return": 0.0}
    wins = sum(1 for t in trades if t > 0)
    return {
        "count": count,
        "win_rate": round(wins / count * 100, 2),
        "avg_return": round(sum(trades) / count, 4),
    }


def run_split_backtest(closes, stop_pct=STOP_PCT, target_pct=TARGET_PCT, split_ratio=SPLIT_RATIO, warmup=WARMUP):
    split_index = int(len(closes) * split_ratio)
    in_trades, out_trades = [], []
    position = None
    for i in range(warmup, len(closes)):
        price = closes[i]
        window = closes[: i + 1]
        lower = bollinger_lower_band(window)
        signal_bullish = lower is not None and window[-1] < lower
        if position is None:
            if signal_bullish:
                position = {"entry_price": price, "entry_index": i}
        else:
            change_pct = (price - position["entry_price"]) / position["entry_price"] * 100
            if change_pct <= -stop_pct or change_pct >= target_pct or not signal_bullish:
                target_list = in_trades if position["entry_index"] < split_index else out_trades
                target_list.append(change_pct)
                position = None
    return split_index, in_trades, out_trades


def main():
    print(f"Scarico storico reale {SYMBOL} da Yahoo Finance (2 anni, stesso default del motore JS)...")
    closes = fetch_yahoo_daily(SYMBOL)
    print(f"{len(closes)} barre scaricate.")

    split_index, in_trades, out_trades = run_split_backtest(closes)
    in_summary = summarize(in_trades)
    out_summary = summarize(out_trades)

    print("\n=== Risultato walk-forward indipendente (Python) ===")
    print(f"In-sample:  {in_summary}")
    print(f"Out-of-sample: {out_summary}")
    print("\nConfronta questi numeri con SPY -> candidates['bollinger_reversion@1D'] in data/research.json.")
    print("Se non coincidono entro un margine di arrotondamento ragionevole, la sandbox NON e' ancora affidabile.")


if __name__ == "__main__":
    main()
