// Motore di backtest: cammina lo storico barra per barra applicando le stesse % di stop/target
// già usate dall'Autopilot reale, con validazione walk-forward (in-sample / out-of-sample).
window.Aurora = window.Aurora || {};
Aurora.Engine = Aurora.Engine || {};

Aurora.Engine.summarizeTrades = function summarizeTrades(trades) {
  const count = trades.length;
  const wins = trades.filter((trade) => trade.returnPct > 0).length;
  const winRate = count ? (wins / count) * 100 : 0;
  const avgReturn = count ? trades.reduce((sum, trade) => sum + trade.returnPct, 0) / count : 0;
  const totalReturn = trades.reduce((sum, trade) => sum + trade.returnPct, 0);
  let peak = 0;
  let cumulative = 0;
  let maxDrawdown = 0;
  trades.forEach((trade) => {
    cumulative += trade.returnPct;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  });
  return { count, winRate, avgReturn, totalReturn, maxDrawdown };
};

Aurora.Engine.runBacktest = function runBacktest(closes, ruleFn, warmup = 50) {
  const SIMULATION = Aurora.Models.SIMULATION;
  const trades = [];
  let position = null;
  for (let i = warmup; i < closes.length; i += 1) {
    const price = closes[i];
    if (!position) {
      const signal = ruleFn(closes.slice(0, i + 1));
      if (signal === 'bullish') position = { entryPrice: price };
    } else {
      const changePct = ((price - position.entryPrice) / position.entryPrice) * 100;
      const signal = ruleFn(closes.slice(0, i + 1));
      if (changePct <= -SIMULATION.autopilotStopPercent || changePct >= SIMULATION.autopilotTargetPercent || signal !== 'bullish') {
        trades.push({ returnPct: changePct });
        position = null;
      }
    }
  }
  return Aurora.Engine.summarizeTrades(trades);
};

// Baseline onesta: stessa struttura (stop/target, frequenza di ingresso comparabile) ma ingressi casuali,
// per capire se la regola batte davvero il caso o sta solo raccogliendo rumore.
Aurora.Engine.runRandomBaseline = function runRandomBaseline(closes, trials = 30, warmup = 50) {
  const SIMULATION = Aurora.Models.SIMULATION;
  const results = [];
  for (let trial = 0; trial < trials; trial += 1) {
    const trades = [];
    let position = null;
    for (let i = warmup; i < closes.length; i += 1) {
      const price = closes[i];
      if (!position) {
        if (Math.random() < 0.05) position = { entryPrice: price };
      } else {
        const changePct = ((price - position.entryPrice) / position.entryPrice) * 100;
        if (changePct <= -SIMULATION.autopilotStopPercent || changePct >= SIMULATION.autopilotTargetPercent || Math.random() < 0.1) {
          trades.push({ returnPct: changePct });
          position = null;
        }
      }
    }
    results.push(Aurora.Engine.summarizeTrades(trades));
  }
  const avg = (key) => results.reduce((sum, result) => sum + result[key], 0) / results.length;
  return { winRate: avg('winRate'), avgReturn: avg('avgReturn'), count: avg('count') };
};

// Validazione walk-forward: cammina l'intera serie UNA sola volta e attribuisce ogni trade chiuso
// a in-sample o out-of-sample in base all'indice di ingresso — niente parametri tarati e verificati
// sulla stessa finestra: "Validato" deve reggere anche su dati che la regola non ha mai visto.
// ruleFn riceve un contesto { closes, candles } (candles puo' essere null se non disponibile) e
// restituisce 'bullish'|'neutral' — stesso contratto per tutte le strategie in engine/strategies.js.
Aurora.Engine.runSplitBacktest = function runSplitBacktest(closes, ruleFn, stopPct, targetPct, splitRatio = 0.7, warmup = 50, candles = null) {
  const splitIndex = Math.floor(closes.length * splitRatio);
  const inTrades = [];
  const outTrades = [];
  let position = null;
  for (let i = warmup; i < closes.length; i += 1) {
    const price = closes[i];
    const context = { closes: closes.slice(0, i + 1), candles: candles ? candles.slice(0, i + 1) : null };
    if (!position) {
      const signal = ruleFn(context);
      if (signal === 'bullish') position = { entryPrice: price, entryIndex: i };
    } else {
      const changePct = ((price - position.entryPrice) / position.entryPrice) * 100;
      const signal = ruleFn(context);
      if (changePct <= -stopPct || changePct >= targetPct || signal !== 'bullish') {
        (position.entryIndex < splitIndex ? inTrades : outTrades).push({ returnPct: changePct });
        position = null;
      }
    }
  }
  return { splitIndex, inSample: Aurora.Engine.summarizeTrades(inTrades), outOfSample: Aurora.Engine.summarizeTrades(outTrades) };
};

Aurora.Engine.runRandomBaselineSplit = function runRandomBaselineSplit(closes, stopPct, targetPct, splitIndex, entryProb, exitProb = 0.15, trials = 30, warmup = 50) {
  const inResults = [];
  const outResults = [];
  for (let t = 0; t < trials; t += 1) {
    const inTrades = [];
    const outTrades = [];
    let position = null;
    for (let i = warmup; i < closes.length; i += 1) {
      const price = closes[i];
      if (!position) {
        if (Math.random() < entryProb) position = { entryPrice: price, entryIndex: i };
      } else {
        const changePct = ((price - position.entryPrice) / position.entryPrice) * 100;
        if (changePct <= -stopPct || changePct >= targetPct || Math.random() < exitProb) {
          (position.entryIndex < splitIndex ? inTrades : outTrades).push({ returnPct: changePct });
          position = null;
        }
      }
    }
    inResults.push(Aurora.Engine.summarizeTrades(inTrades));
    outResults.push(Aurora.Engine.summarizeTrades(outTrades));
  }
  const avg = (arr, key) => arr.reduce((sum, result) => sum + result[key], 0) / arr.length;
  return {
    inSample: { winRate: avg(inResults, 'winRate'), avgReturn: avg(inResults, 'avgReturn'), count: avg(inResults, 'count') },
    outOfSample: { winRate: avg(outResults, 'winRate'), avgReturn: avg(outResults, 'avgReturn'), count: avg(outResults, 'count') }
  };
};

// Stesso gate di onestà già in uso (edge misurato vs baseline casuale), applicabile a un singolo segmento.
Aurora.Engine.passesEdgeGate = function passesEdgeGate(sample, baseline) {
  return sample.count >= 5
    && sample.winRate >= baseline.winRate + Aurora.Models.EDGE_MARGIN
    && sample.avgReturn > baseline.avgReturn
    && sample.avgReturn > 0;
};
