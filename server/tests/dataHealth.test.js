import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findStaleEntries } from '../lib/dataHealth.js';

const NOW = new Date('2026-08-21T06:00:00Z').getTime();

test('findStaleEntries: entry fresco (poche ore fa) non e\' segnalato', () => {
  const historyCache = { AAPL: { '1D': { fetchedAt: '2026-08-21T05:00:00Z' } } };
  assert.deepEqual(findStaleEntries(historyCache, NOW), []);
});

test('findStaleEntries: entry oltre soglia (>26h) e\' segnalato con l\'eta\' reale', () => {
  const historyCache = { AAPL: { '1D': { fetchedAt: '2026-08-19T00:00:00Z' } } }; // ~54h prima
  const stale = findStaleEntries(historyCache, NOW);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].symbol, 'AAPL');
  assert.ok(stale[0].ageHours > 50);
});

test('findStaleEntries: entry senza fetchedAt (mai aggiornato) e\' sempre segnalato', () => {
  const historyCache = { EURUSD: { '30m': {} } };
  const stale = findStaleEntries(historyCache, NOW);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].reason, 'mai aggiornato');
});

test('findStaleEntries: nessun falso allarme entro il margine (25h, sotto la soglia 26h)', () => {
  const historyCache = { AAPL: { '1D': { fetchedAt: new Date(NOW - 25 * 3600000).toISOString() } } };
  assert.deepEqual(findStaleEntries(historyCache, NOW), []);
});
