import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyReport } from '../lib/dailyReportData.js';

function makeAccount({ cash = 40, highWater = 50, positions = {}, market = {}, trades = [], activity = [] } = {}) {
  return { demoAccount: { cash, highWater, positions, market, trades, model: { calibration: 50 } }, activity, updatedAt: '2026-08-21T09:00:00.000Z' };
}

test('buildDailyReport: entrambi i sistemi assenti -> report vuoto, mai un errore', () => {
  const report = buildDailyReport({ spiderman: null, venom: null, sinceIso: '2026-08-20T00:00:00.000Z', generatedAtIso: '2026-08-21T09:00:00.000Z' });
  assert.equal(report.spiderman, null);
  assert.equal(report.venom, null);
});

test('buildDailyReport: equity/drawdown calcolati correttamente da cash+posizioni+highWater', () => {
  const account = makeAccount({
    cash: 30, highWater: 50,
    positions: { AAPL: { quantity: 2, averagePrice: 100 } },
    market: { AAPL: 105 }
  });
  const report = buildDailyReport({ spiderman: { account, research: null }, venom: null, sinceIso: '2026-08-20T00:00:00.000Z', generatedAtIso: '2026-08-21T09:00:00.000Z' });
  // equity = 30 + 2*105 = 240
  assert.ok(Math.abs(report.spiderman.equity.equity - 240) < 1e-9);
  // drawdown = (50-240)/50 *100 = negativo -> equity sopra il picco, drawdown 0 o negativo dichiarato cosi' com'e' (mai forzato a 0 artificialmente)
  assert.ok(report.spiderman.equity.drawdownPercent < 0);
});

test('buildDailyReport: usa market[symbol] se disponibile, altrimenti averagePrice come fallback onesto', () => {
  const account = makeAccount({ cash: 10, highWater: 50, positions: { AAPL: { quantity: 1, averagePrice: 100 } }, market: {} });
  const report = buildDailyReport({ spiderman: { account, research: null }, venom: null, sinceIso: '2026-08-20T00:00:00.000Z', generatedAtIso: '2026-08-21T09:00:00.000Z' });
  assert.ok(Math.abs(report.spiderman.equity.positionValue - 100) < 1e-9);
});

test('buildDailyReport: conta solo i trade successivi a sinceIso come "nuovi"', () => {
  const trades = [
    { at: '2026-08-19T10:00:00.000Z', side: 'sell', realizedPnl: 5 },
    { at: '2026-08-21T08:00:00.000Z', side: 'sell', realizedPnl: -2 },
    { at: '2026-08-21T09:00:00.000Z', side: 'buy', realizedPnl: 0 }
  ];
  const account = makeAccount({ trades });
  const report = buildDailyReport({ spiderman: { account, research: null }, venom: null, sinceIso: '2026-08-20T00:00:00.000Z', generatedAtIso: '2026-08-21T09:00:00.000Z' });
  assert.equal(report.spiderman.trades.newTradesCount, 2);
  assert.equal(report.spiderman.trades.closedCount, 1);
  assert.equal(report.spiderman.trades.wins, 0);
  assert.ok(Math.abs(report.spiderman.trades.realizedPnl - (-2)) < 1e-9);
});

test('buildDailyReport: candidati validati ordinati per rendimento medio decrescente, solo quelli davvero validati', () => {
  const research = {
    researchData: {
      validated: {
        AAPL: { candidates: { 'macd_cross@1D': { validated: true, label: 'MACD', timeframe: '1D', outOfSample: { winRate: 60, avgReturn: 0.5 } }, 'sma_rsi@1D': { validated: false, exploratory: true, label: 'SMA/RSI', timeframe: '1D', outOfSample: { winRate: 40, avgReturn: -1 } } } },
        NVDA: { candidates: { 'bollinger@1D': { validated: true, label: 'Bollinger', timeframe: '1D', outOfSample: { winRate: 70, avgReturn: 1.2 } } } }
      }
    }
  };
  const report = buildDailyReport({ spiderman: { account: makeAccount(), research }, venom: null, sinceIso: '2026-08-20T00:00:00.000Z', generatedAtIso: '2026-08-21T09:00:00.000Z' });
  assert.equal(report.spiderman.validated.length, 2, 'solo i candidati validated:true, non gli esplorativi');
  assert.equal(report.spiderman.validated[0].symbol, 'NVDA', 'il rendimento piu alto (1.2%) deve essere primo');
});

test('buildDailyReport: i due sistemi restano indipendenti, uno presente e uno assente non si mescolano', () => {
  const report = buildDailyReport({ spiderman: { account: makeAccount(), research: null }, venom: null, sinceIso: '2026-08-20T00:00:00.000Z', generatedAtIso: '2026-08-21T09:00:00.000Z' });
  assert.ok(report.spiderman);
  assert.equal(report.venom, null);
});
