// Test reali di src/utils.js — in particolare formatPrice, aggiunto dopo un bug trovato
// testando EURUSD: formatMoney arrotondava sempre a 2 decimali, quindi entry (1,1609) e stop
// loss (1,1563) di una posizione EURUSD reale apparivano ENTRAMBI "1,16 €" in interfaccia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/loadEngine.js';

const Aurora = loadEngine(['src/utils.js', 'src/config.js', 'src/models/seedData.js', 'src/models/state.js']);

test('formatPrice: una coppia valutaria (EURUSD) usa 4 decimali, non 2', () => {
  const expected = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(1.1609);
  assert.equal(Aurora.Utils.formatPrice('EURUSD', 1.1609), expected);
});

test('formatPrice: entry e stop loss di una posizione EURUSD reale restano distinguibili', () => {
  const entry = Aurora.Utils.formatPrice('EURUSD', 1.1609);
  const stopLoss = Aurora.Utils.formatPrice('EURUSD', 1.1563087563923427);
  assert.notEqual(entry, stopLoss, 'con 2 decimali sarebbero stati identici ("1,16 €" entrambi) — bug reale gia\' trovato');
});

test('formatPrice: un simbolo non-FX (azione/commodity) si comporta esattamente come formatMoney, invariato', () => {
  assert.equal(Aurora.Utils.formatPrice('AAPL', 214.38), Aurora.Utils.formatMoney(214.38));
  assert.equal(Aurora.Utils.formatPrice('WTI', 72.8), Aurora.Utils.formatMoney(72.8));
});

test('FX_RATE_SYMBOLS: contiene EURUSD, unica fonte condivisa con refreshLiveQuotes', () => {
  assert.ok(Aurora.Models.FX_RATE_SYMBOLS.has('EURUSD'));
  assert.ok(!Aurora.Models.FX_RATE_SYMBOLS.has('AAPL'));
});
