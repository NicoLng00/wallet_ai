// Test reali delle funzioni pure di src/engine/indicators.js, caricato dentro Node puro via
// server/tests/helpers/loadEngine.js — nessun browser, nessuna chiave API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/loadEngine.js';

const Aurora = loadEngine(['src/engine/indicators.js']);
const { Engine } = Aurora;

test('computeSMA: media delle ultime N barre', () => {
  assert.equal(Engine.computeSMA([1, 2, 3, 4, 5], 3), 4); // (3+4+5)/3
});

test('computeSMA: storico insufficiente -> null', () => {
  assert.equal(Engine.computeSMA([1, 2], 5), null);
});

test('computeRSI: solo guadagni -> 100', () => {
  const closes = Array.from({ length: 16 }, (_, i) => i + 1); // strettamente crescente
  assert.equal(Engine.computeRSI(closes, 14), 100);
});

test('computeRSI: solo perdite -> 0', () => {
  const closes = Array.from({ length: 16 }, (_, i) => 16 - i); // strettamente decrescente
  assert.equal(Engine.computeRSI(closes, 14), 0);
});

test('computeBollingerBands: serie costante -> deviazione standard zero, bande = media', () => {
  const closes = Array(20).fill(100);
  const bands = Engine.computeBollingerBands(closes, 20, 2);
  assert.equal(bands.middle, 100);
  assert.equal(bands.upper, 100);
  assert.equal(bands.lower, 100);
  assert.equal(bands.stdDev, 0);
});

test('computeDonchianHigh: massimo delle barre PRIMA di quella corrente, mai includendola', () => {
  // ultime 21 barre: le prime 20 salgono fino a 120, l'ultima (attuale) e' 999 — non deve contare.
  const closes = [...Array.from({ length: 20 }, (_, i) => 100 + i), 999];
  assert.equal(Engine.computeDonchianHigh(closes, 20), 119);
});

test('computeAverageVolume: media delle barre PRIMA di quella corrente, mai includendola', () => {
  const candles = [
    ...Array.from({ length: 20 }, () => ({ volume: 100 })),
    { volume: 999999 } // barra corrente, non deve influenzare la media
  ];
  assert.equal(Engine.computeAverageVolume(candles, 20), 100);
});

test('computeAverageVolume: volume mancante in una barra -> null, mai un valore inventato', () => {
  const candles = [
    ...Array.from({ length: 19 }, () => ({ volume: 100 })),
    { volume: null },
    { volume: 100 }
  ];
  assert.equal(Engine.computeAverageVolume(candles, 20), null);
});

test('detectEngulfing: pattern rialzista reale', () => {
  const candles = [
    { open: 105, close: 100 }, // ribassista
    { open: 99, close: 106 }   // rialzista, avvolge completamente la precedente
  ];
  assert.equal(Engine.detectEngulfing(candles), 'bullish');
});

test('detectEngulfing: pattern ribassista reale', () => {
  const candles = [
    { open: 100, close: 105 }, // rialzista
    { open: 106, close: 99 }   // ribassista, avvolge completamente la precedente
  ];
  assert.equal(Engine.detectEngulfing(candles), 'bearish');
});

test('detectEngulfing: nessun pattern -> none', () => {
  const candles = [{ open: 100, close: 102 }, { open: 101, close: 103 }];
  assert.equal(Engine.detectEngulfing(candles), 'none');
});

test('computeMACD: storico insufficiente -> null', () => {
  assert.equal(Engine.computeMACD([1, 2, 3]), null);
});

test('computeMACD: storico sufficiente -> oggetto numerico valido', () => {
  const closes = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 3) * 5);
  const macd = Engine.computeMACD(closes);
  assert.ok(macd);
  assert.equal(typeof macd.macd, 'number');
  assert.equal(typeof macd.signal, 'number');
  assert.equal(macd.histogram, macd.macd - macd.signal);
});

test('groupCandlesByLocalDay: raggruppa per giorno di calendario nel fuso richiesto', () => {
  // 09:00 e 09:30 UTC del 2026-01-05 sono entrambe 04:00/04:30 EST (America/New_York) — stesso giorno.
  const candles = [
    { time: Date.UTC(2026, 0, 5, 9, 0) },
    { time: Date.UTC(2026, 0, 5, 9, 30) },
    { time: Date.UTC(2026, 0, 6, 14, 0) }
  ];
  const days = Engine.groupCandlesByLocalDay(candles, 'America/New_York');
  assert.equal(days.length, 2);
  assert.equal(days[0].bars.length, 2);
  assert.equal(days[1].bars.length, 1);
});

test('findOpeningRangeBar: trova la barra delle 09:30 locali, non una barra successiva a caso', () => {
  const tz = 'America/New_York';
  // 14:30 UTC = 09:30 EST (gennaio, fuori orario legale)
  const bars = [
    { time: Date.UTC(2026, 0, 5, 14, 0), high: 1, low: 1 },  // 09:00 EST, troppo presto
    { time: Date.UTC(2026, 0, 5, 14, 30), high: 100, low: 90 }, // 09:30 EST, quella giusta
    { time: Date.UTC(2026, 0, 5, 15, 0), high: 2, low: 2 }
  ];
  const opening = Engine.findOpeningRangeBar(bars, tz);
  assert.ok(opening);
  assert.equal(opening.bar.high, 100);
  assert.equal(opening.index, 1);
});

test('findOpeningRangeBar: nessuna barra vicina alle 09:30 -> null, mai una barra sbagliata', () => {
  const tz = 'America/New_York';
  const bars = [{ time: Date.UTC(2026, 0, 5, 20, 0), high: 1, low: 1 }]; // 15:00 EST, troppo tardi
  assert.equal(Engine.findOpeningRangeBar(bars, tz), null);
});
