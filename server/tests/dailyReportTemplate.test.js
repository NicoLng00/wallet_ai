import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDailyReportHtml } from '../lib/dailyReportTemplate.js';

function makeSystemData(overrides = {}) {
  return {
    equity: { equity: 50, cash: 40, positionValue: 10, drawdownPercent: 2, openPositions: 1 },
    trades: { newTradesCount: 1, closedCount: 0, wins: 0, realizedPnl: 0 },
    validated: [{ symbol: 'AAPL', candidateKey: 'macd_cross@1D', label: 'MACD crossover', timeframe: '1D', winRate: 66.7, avgReturn: 0.86 }],
    activity: [{ title: 'Autopilot: apre AAPL', detail: 'score 82', tag: 'AUTO' }],
    symbolCount: 46,
    ...overrides
  };
}

test('renderDailyReportHtml: nessun tag <style> o CSS moderno — solo stili inline, compatibile email', () => {
  const html = renderDailyReportHtml({ generatedAt: '2026-08-21T09:00:00.000Z', spiderman: makeSystemData(), venom: null });
  assert.ok(!html.includes('<style'), 'niente <style>, molti client email lo rimuovono');
  assert.ok(!html.includes('display:flex') && !html.includes('display: flex'), 'niente flexbox, non supportato in Outlook');
  assert.ok(!html.includes('display:grid'), 'niente CSS grid, non supportato in Outlook');
});

test('renderDailyReportHtml: entrambi i sistemi presenti -> entrambi i nomi nel markup', () => {
  const html = renderDailyReportHtml({ generatedAt: '2026-08-21T09:00:00.000Z', spiderman: makeSystemData(), venom: makeSystemData({ symbolCount: 13 }) });
  assert.match(html, /SpiderMan/);
  assert.match(html, /Venom/);
});

test('renderDailyReportHtml: sistema assente -> messaggio esplicito, mai un errore o una sezione vuota silenziosa', () => {
  const html = renderDailyReportHtml({ generatedAt: '2026-08-21T09:00:00.000Z', spiderman: makeSystemData(), venom: null });
  assert.match(html, /Nessun dato disponibile/);
});

test('renderDailyReportHtml: escape HTML nei campi testo (mai un\'iniezione dal titolo/dettaglio di un\'attivita\')', () => {
  const html = renderDailyReportHtml({
    generatedAt: '2026-08-21T09:00:00.000Z',
    spiderman: makeSystemData({ activity: [{ title: '<script>alert(1)</script>', detail: 'x', tag: 'AUTO' }] }),
    venom: null
  });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('renderDailyReportHtml: P&L negativo colorato di rosso, positivo di verde (coerenza col resto del progetto)', () => {
  const htmlLoss = renderDailyReportHtml({ generatedAt: '2026-08-21T09:00:00.000Z', spiderman: makeSystemData({ trades: { newTradesCount: 1, closedCount: 1, wins: 0, realizedPnl: -3 } }), venom: null });
  assert.match(htmlLoss, /#ff6d7b/);
  const htmlWin = renderDailyReportHtml({ generatedAt: '2026-08-21T09:00:00.000Z', spiderman: makeSystemData({ trades: { newTradesCount: 1, closedCount: 1, wins: 1, realizedPnl: 3 } }), venom: null });
  assert.match(htmlWin, /#3ad59f/);
});
