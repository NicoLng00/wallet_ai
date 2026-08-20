// Test reali dell'archiviazione (Fase 2 della roadmap) — sia della logica pura di taglio, sia
// della proprieta' che conta davvero: dopo l'archiviazione, survivesLiveTrackRecord deve dare
// ESATTAMENTE la stessa risposta di prima sugli stessi dati (l'archiviazione deve essere
// invisibile al motore live, non solo "sembrare" corretta).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archiveTrackRecord, archiveEpisodes, makeEmptyArchive, KEEP_TRACK_RECORD_TRADES, KEEP_EPISODES } from '../lib/archival.js';
import { loadEngine } from './helpers/loadEngine.js';

function makeTrades(count, returnPct) {
  return Array.from({ length: count }, (_, i) => ({ returnPct, at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z` }));
}

test('archiveTrackRecord: sotto soglia -> non tocca nulla', () => {
  const trackRecord = { AAPL: { 'sma_rsi@1D': { trades: makeTrades(5, 1) } } };
  const archive = makeEmptyArchive();
  const { trackRecord: next, archivedCount } = archiveTrackRecord(trackRecord, archive);
  assert.equal(archivedCount, 0);
  assert.equal(next.AAPL['sma_rsi@1D'].trades.length, 5);
});

test('archiveTrackRecord: sopra soglia -> tiene solo gli ultimi KEEP_TRACK_RECORD_TRADES, archivia il resto', () => {
  const trackRecord = { AAPL: { 'sma_rsi@1D': { trades: makeTrades(30, 1) } } };
  const archive = makeEmptyArchive();
  const { trackRecord: next, archivedCount } = archiveTrackRecord(trackRecord, archive);
  assert.equal(archivedCount, 30 - KEEP_TRACK_RECORD_TRADES);
  assert.equal(next.AAPL['sma_rsi@1D'].trades.length, KEEP_TRACK_RECORD_TRADES);
  assert.equal(archive.trackRecord.AAPL['sma_rsi@1D'].length, 30 - KEEP_TRACK_RECORD_TRADES);
});

test('archiveTrackRecord: archivia i trade PIU VECCHI, tiene i piu recenti (ordine cronologico rispettato)', () => {
  // 25 trade vecchi con returnPct=-1, 10 recenti con returnPct=+1 — dopo l'archiviazione (tiene
  // gli ultimi 20) devono restare tutti e 10 i recenti PIU 10 vecchi, mai il contrario.
  const trades = [...makeTrades(25, -1), ...makeTrades(10, 1)];
  const trackRecord = { AAPL: { 'sma_rsi@1D': { trades } } };
  const archive = makeEmptyArchive();
  const { trackRecord: next } = archiveTrackRecord(trackRecord, archive);
  const kept = next.AAPL['sma_rsi@1D'].trades;
  assert.equal(kept.length, KEEP_TRACK_RECORD_TRADES);
  assert.ok(kept.slice(-10).every((t) => t.returnPct === 1), 'i 10 trade piu recenti (positivi) devono essere tutti presenti, in coda');
  assert.ok(kept.slice(0, 10).every((t) => t.returnPct === -1), 'i restanti 10 tenuti devono essere i piu vecchi tra quelli non ancora archiviati');
});

test('archiveEpisodes: stessa logica, soglia KEEP_EPISODES', () => {
  const episodes = Array.from({ length: 25 }, (_, i) => ({ tradeId: `T${i}`, returnPct: 1 }));
  const archive = makeEmptyArchive();
  const { tradeEpisodes: next, archivedCount } = archiveEpisodes({ 'macd_cross@1D': episodes }, archive);
  assert.equal(archivedCount, 25 - KEEP_EPISODES);
  assert.equal(next['macd_cross@1D'].length, KEEP_EPISODES);
  assert.equal(next['macd_cross@1D'][KEEP_EPISODES - 1].tradeId, 'T24', 'l\'ultimo episodio tenuto deve essere il piu recente, non uno a caso');
});

// --- La proprieta' che conta davvero: invisibile al motore live ---
const Aurora = loadEngine([
  'src/utils.js', 'src/config.js', 'src/models/seedData.js', 'src/models/state.js',
  'src/engine/indicators.js', 'src/engine/rules.js', 'src/engine/backtest.js', 'src/engine/market.js'
]);

test('dopo l\'archiviazione, survivesLiveTrackRecord da\' ESATTAMENTE la stessa risposta di prima', () => {
  const symbol = 'AAPL';
  const candidateKey = 'sma_rsi@1D';
  // 25 vecchi in perdita + 15 recenti in vincita: la finestra live (15) guarda solo i recenti.
  const trades = [...makeTrades(25, -2), ...makeTrades(15, 3)];
  const candidate = { outOfSampleBaseline: { winRate: 50, avgReturn: 0 } };

  Aurora.Models.researchData = { trackRecord: { [symbol]: { [candidateKey]: { trades } } } };
  const before = Aurora.Engine.survivesLiveTrackRecord(symbol, candidateKey, candidate);

  const archive = makeEmptyArchive();
  const { trackRecord: archived } = archiveTrackRecord(Aurora.Models.researchData.trackRecord, archive);
  Aurora.Models.researchData = { trackRecord: archived };
  const after = Aurora.Engine.survivesLiveTrackRecord(symbol, candidateKey, candidate);

  assert.equal(before, true, 'precondizione: la finestra recente (15 vincite) deve superare il gate prima dell\'archiviazione');
  assert.equal(after, before, 'l\'archiviazione non deve cambiare il risultato: e\' invisibile al motore live');
});
