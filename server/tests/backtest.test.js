// Test reali del motore di backtest (src/engine/backtest.js), caricato dentro Node puro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/loadEngine.js';

const Aurora = loadEngine(['src/engine/indicators.js', 'src/engine/backtest.js']);
const { Engine } = Aurora;
// passesEdgeGate legge Aurora.Models.EDGE_MARGIN — Models minimale, senza caricare tutto state.js.
Aurora.Models = { EDGE_MARGIN: 5 };

test('summarizeTrades: winRate, rendimento medio e drawdown massimo calcolati correttamente', () => {
  const trades = [{ returnPct: 2 }, { returnPct: -1 }, { returnPct: 3 }];
  const summary = Engine.summarizeTrades(trades);
  assert.equal(summary.count, 3);
  assert.equal(Math.round(summary.winRate * 100) / 100, 66.67);
  assert.ok(Math.abs(summary.avgReturn - 4 / 3) < 1e-9);
  assert.equal(summary.totalReturn, 4);
  assert.equal(summary.maxDrawdown, 1); // cumulativo 2 -> 1 -> 4: picco 2, minimo 1, drawdown 1
});

test('summarizeTrades: nessun trade -> tutto a zero, mai un errore', () => {
  const summary = Engine.summarizeTrades([]);
  assert.equal(summary.count, 0);
  assert.equal(summary.winRate, 0);
  assert.equal(summary.avgReturn, 0);
  assert.equal(summary.totalReturn, 0);
  assert.equal(summary.maxDrawdown, 0);
});

test('runSplitBacktest: assegna i trade a in-sample/out-of-sample in base all\'indice di apertura, non a quello di chiusura', () => {
  // Prezzo alternato 100/102, regola sempre rialzista: apre subito, chiude al primo target (1.5%)
  // due barre dopo, riapre subito — pattern completamente deterministico e verificabile a mano.
  const closes = [];
  for (let i = 0; i < 20; i += 1) closes.push(i % 2 === 0 ? 100 : 102);
  const alwaysBullish = () => 'bullish';

  const result = Engine.runSplitBacktest(closes, alwaysBullish, 50 /* stop mai raggiunto */, 1.5, 0.7, 0);

  assert.equal(result.splitIndex, 14); // floor(20 * 0.7)
  // Trade attesi: apertura a i=0,2,4,...,18 (10 trade), tutti con rendimento +2%.
  // In-sample (entryIndex < 14): i=0,2,4,6,8,10,12 -> 7 trade. Fuori campione: i=14,16,18 -> 3 trade.
  assert.equal(result.inSample.count, 7);
  assert.equal(result.outOfSample.count, 3);
  assert.ok(Math.abs(result.inSample.avgReturn - 2) < 1e-9);
  assert.ok(Math.abs(result.outOfSample.avgReturn - 2) < 1e-9);
});

test('runSplitBacktest: lo stop loss chiude la posizione anche con segnale ancora rialzista', () => {
  // Prezzo scende sempre: con stop stretto (1%) ogni posizione chiude subito in perdita.
  const closes = [100, 95, 100, 95, 100, 95, 100, 95];
  const alwaysBullish = () => 'bullish';
  const result = Engine.runSplitBacktest(closes, alwaysBullish, 1, 999 /* target mai raggiunto */, 0.7, 0);
  const allTrades = result.inSample.count + result.outOfSample.count;
  assert.ok(allTrades > 0, 'deve aprire almeno un trade');
  const combinedAvg = (result.inSample.avgReturn * result.inSample.count + result.outOfSample.avgReturn * result.outOfSample.count) / allTrades;
  assert.ok(combinedAvg < 0, 'con solo lo stop a chiudere, il rendimento medio deve essere negativo');
});

test('passesEdgeGate: richiede almeno 5 trade, anche con un edge enorme', () => {
  const sample = { count: 4, winRate: 90, avgReturn: 5 };
  const baseline = { winRate: 10, avgReturn: 0 };
  assert.equal(Engine.passesEdgeGate(sample, baseline), false);
});

test('passesEdgeGate: supera la soglia solo se batte la baseline di almeno EDGE_MARGIN punti E ha rendimento medio positivo', () => {
  const baseline = { winRate: 50, avgReturn: 0.1 };
  const justUnder = { count: 10, winRate: 54.9, avgReturn: 1 }; // sotto i 5pp di margine
  const exactMargin = { count: 10, winRate: 55, avgReturn: 1 }; // esattamente 5pp, deve passare
  const negativeReturn = { count: 10, winRate: 60, avgReturn: -0.5 }; // batte la baseline ma rendimento negativo
  assert.equal(Engine.passesEdgeGate(justUnder, baseline), false);
  assert.equal(Engine.passesEdgeGate(exactMargin, baseline), true);
  assert.equal(Engine.passesEdgeGate(negativeReturn, baseline), false);
});
