// Leva simulata 1:2 + "regola d'oro" (rischio massimo 5% dell'equity per trade) — sessione
// 2026-08-20. La parte delicata non e' il numero (SIMULATION.leverageMultiplier), e' la
// contabilita': se il cash si debita/accredita ancora per il notional PIENO come prima della leva,
// il tetto piu' alto non ha mai effetto pratico (il cash disponibile resta comunque il vincolo piu'
// stringente) — questi test verificano la matematica del margine, non solo che il numero esista.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/loadEngine.js';

const Aurora = loadEngine([
  'src/utils.js', 'src/config.js', 'src/models/seedData.js', 'src/models/state.js',
  'src/engine/market.js', 'src/engine/execution.js', 'src/engine/riskGate.js'
]);

function freshAccount(cash = 50) {
  const Models = Aurora.Models;
  Models.demoAccount = Models.makeDemoAccount();
  Models.demoAccount.cash = cash;
  Models.demoAccount.highWater = cash;
  Models.demoAccount.market = { AAPL: 100 };
  Models.instruments.AAPL = Models.instruments.AAPL || { name: 'Apple Inc.', price: 100 };
  Models.orderCount = 0;
  Models.Views = Models.Views;
  return Models;
}

// executePaperTrade chiama Aurora.Views.* e Aurora.Models.persistDemoAccount/logActivity — stub
// minimo, stessi pattern gia' usati in regression.test.js.
Aurora.Views = new Proxy({}, { get: () => function () {} });
Aurora.Models.persistDemoAccount = () => {};
Aurora.Models.persistActivity = Aurora.Models.persistActivity || (() => {});
const realLogActivity = Aurora.Models.logActivity;
Aurora.Models.logActivity = () => {};
Aurora.Engine.liveConfidenceFactor = Aurora.Engine.liveConfidenceFactor || (() => 1);
Aurora.Engine.recordStrategyOutcome = Aurora.Engine.recordStrategyOutcome || (() => {});
Aurora.Engine.recordTradeEpisode = Aurora.Engine.recordTradeEpisode || (() => {});
Aurora.Engine.classifyTradeOutcome = Aurora.Engine.classifyTradeOutcome || (() => 'signal_flip_profit');

test('executePaperTrade: apertura leveraged debita solo il margine (notional/leva), non il notional pieno', () => {
  const Models = freshAccount(50);
  Models.SIMULATION.leverageMultiplier = 2;
  const quantity = 20 / 100; // notional = 20€ a prezzo 100
  const ok = Aurora.Engine.executePaperTrade({ symbol: 'AAPL', side: 'buy', quantity, stopLoss: 90, takeProfit: 120 });
  assert.equal(ok, true);
  assert.ok(Math.abs(Models.demoAccount.cash - 40) < 1e-9, `cash atteso 50-10(margine)=40, letto ${Models.demoAccount.cash}`);
});

test('getMetrics: equity resta invariata subito dopo l\'apertura (nessun movimento di prezzo)', () => {
  const Models = freshAccount(50);
  Models.SIMULATION.leverageMultiplier = 2;
  const before = Aurora.Engine.getMetrics().equity;
  const quantity = 20 / 100;
  Aurora.Engine.executePaperTrade({ symbol: 'AAPL', side: 'buy', quantity, stopLoss: 90, takeProfit: 120 });
  const after = Aurora.Engine.getMetrics().equity;
  assert.ok(Math.abs(before - 50) < 1e-9, `equity iniziale attesa 50, letta ${before}`);
  assert.ok(Math.abs(after - before) < 1e-9, `aprire una posizione non deve cambiare l'equity da sola: prima ${before}, dopo ${after}`);
});

test('getMetrics: un movimento di prezzo del 10% su un notional leveraged produce il P&L corretto sul notional pieno, non sul margine', () => {
  const Models = freshAccount(50);
  Models.SIMULATION.leverageMultiplier = 2;
  const quantity = 20 / 100; // notional 20€, margine 10€
  Aurora.Engine.executePaperTrade({ symbol: 'AAPL', side: 'buy', quantity, stopLoss: 90, takeProfit: 120 });
  Models.demoAccount.market.AAPL = 110; // +10%
  const equity = Aurora.Engine.getMetrics().equity;
  // +10% su 20€ di notional = +2€, indipendentemente da quanto margine e' stato davvero impegnato.
  assert.ok(Math.abs(equity - 52) < 1e-9, `equity attesa 52 (50 + 2 di P&L sul notional pieno), letta ${equity}`);
});

test('executePaperTrade: la chiusura restituisce margine + P&L realizzato — sull\'intero giro il cash si muove esattamente del P&L', () => {
  const Models = freshAccount(50);
  Models.SIMULATION.leverageMultiplier = 2;
  const quantity = 20 / 100;
  Aurora.Engine.executePaperTrade({ symbol: 'AAPL', side: 'buy', quantity, stopLoss: 90, takeProfit: 120 });
  Models.demoAccount.market.AAPL = 110;
  Aurora.Engine.executePaperTrade({ symbol: 'AAPL', side: 'sell', quantity });
  assert.ok(Math.abs(Models.demoAccount.cash - 52) < 1e-9, `cash finale atteso 52 (50 iniziali + 2 di P&L), letto ${Models.demoAccount.cash}`);
});

test('leva 1:2: a parita\' di MARGINE impegnato, il P&L raddoppia rispetto a leva 1x (e\' letteralmente cosa vuol dire "1:2")', () => {
  const margin = 10;
  const priceMove = 0.10; // +10%

  const noLeverage = freshAccount(50);
  noLeverage.SIMULATION.leverageMultiplier = 1;
  const qtyNoLeverage = margin / 100; // notional = margine, nessuna leva
  Aurora.Engine.executePaperTrade({ symbol: 'AAPL', side: 'buy', quantity: qtyNoLeverage, stopLoss: 90, takeProfit: 120 });
  noLeverage.demoAccount.market.AAPL = 100 * (1 + priceMove);
  const pnlNoLeverage = Aurora.Engine.getMetrics().equity - 50;

  const leveraged = freshAccount(50);
  leveraged.SIMULATION.leverageMultiplier = 2;
  const qtyLeveraged = (margin * 2) / 100; // stesso margine (10€), ma notional doppio grazie alla leva
  Aurora.Engine.executePaperTrade({ symbol: 'AAPL', side: 'buy', quantity: qtyLeveraged, stopLoss: 90, takeProfit: 120 });
  leveraged.demoAccount.market.AAPL = 100 * (1 + priceMove);
  const pnlLeveraged = Aurora.Engine.getMetrics().equity - 50;

  assert.ok(Math.abs(pnlLeveraged - pnlNoLeverage * 2) < 1e-9,
    `a parita' di margine (10€), il P&L a leva 2x deve essere il doppio di quello a leva 1x: 1x=${pnlNoLeverage}, 2x=${pnlLeveraged}`);
});

// --- "Regola d'oro": rischio massimo 5% dell'equity per trade, via orderRisk (ordine manuale) ---
function mockStopTarget(stopLoss, takeProfit) {
  Aurora.Utils.$ = (id) => {
    if (id === 'order-stop-loss') return { value: String(stopLoss ?? '') };
    if (id === 'order-take-profit') return { value: String(takeProfit ?? '') };
    return { value: '' };
  };
}

test('orderRisk: uno stop largo (20%) fa scattare il tetto del 5% PRIMA del tetto di leva, anche se la leva lo permetterebbe', () => {
  const Models = freshAccount(50);
  Models.SIMULATION.leverageMultiplier = 2;
  Models.analysisReady = true;
  mockStopTarget(80, 130); // stop al 20% sotto un prezzo di 100
  // notional 20€: sotto il tetto di leva (min(12.5*2, 50*0.25*2)=25) ma sopra il tetto 5%-rischio
  // (equity 50 * 5% / 20% di stop = 12.5€).
  const quantity = 20 / 100;
  const result = Aurora.Engine.orderRisk('AAPL', 'buy', quantity);
  assert.equal(result.allowed, false);
  assert.match(result.reason, /regola del 5%/);
});

test('orderRisk: lo stesso ordine passa se il notional resta sotto il tetto 5%-rischio', () => {
  const Models = freshAccount(50);
  Models.SIMULATION.leverageMultiplier = 2;
  Models.analysisReady = true;
  mockStopTarget(80, 130); // stesso stop al 20%, tetto rischio = 12.5€
  const quantity = 10 / 100; // notional 10€, sotto i 12.5€ consentiti
  const result = Aurora.Engine.orderRisk('AAPL', 'buy', quantity);
  assert.equal(result.allowed, true, result.reason);
});

test('orderRisk: con uno stop stretto (1.6%, quello di default) la leva 2x e\' il vincolo, il tetto 5% non scatta mai in pratica', () => {
  const Models = freshAccount(50);
  Models.SIMULATION.leverageMultiplier = 2;
  Models.analysisReady = true;
  mockStopTarget(98.4, 102.8); // stop 1.6%, come autopilotStopPercent
  // tetto di leva: min(12.5*2, 50*0.25*2) = 25€. tetto 5%-rischio: (50*0.05)/0.016 = 156.25€ — molto
  // piu' largo, non vincolante qui.
  const quantity = 25 / 100;
  const result = Aurora.Engine.orderRisk('AAPL', 'buy', quantity);
  assert.equal(result.allowed, true, result.reason);
  assert.ok(Math.abs(result.maximumOrder - 25) < 1e-9, `maximumOrder atteso 25 (leva 2x su 12.5), letto ${result.maximumOrder}`);
});
