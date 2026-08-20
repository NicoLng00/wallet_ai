// Test reali del budget di contesto (server/lib/contextBudget.js) — nessuna chiave API richiesta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoundedContext } from '../lib/contextBudget.js';

function makeEntry(symbol, headlineCount, postCount) {
  return {
    symbol,
    price: 100,
    changePercent: 1,
    technicalAgent: { available: true, thesis: `${symbol} validata`, confidence: 70 },
    riskAgent: { thesis: 'ok', riskFlags: [] },
    fundamentalAgent: headlineCount ? { thesis: 'notizie', headlines: Array.from({ length: headlineCount }, (_, i) => `titolo ${symbol} ${i} `.repeat(10)) } : null,
    socialSentimentAgent: postCount ? { thesis: 'social', posts: Array.from({ length: postCount }, (_, i) => `post ${symbol} ${i} `.repeat(10)) } : null,
    hedgeAgent: null,
    marketRegimeAgent: null
  };
}

test('sotto soglia: il context non viene toccato', () => {
  const context = [makeEntry('AAPL', 1, 1)];
  const result = buildBoundedContext(context, 1000000);
  assert.equal(result.trimmed, false);
  assert.deepEqual(result.context, context);
});

test('sopra soglia: taglia notizie/social, MAI il segnale tecnico o il rischio', () => {
  const context = [makeEntry('AAPL', 15, 15), makeEntry('NVDA', 15, 15)];
  const before = JSON.stringify(context).length;
  const result = buildBoundedContext(context, Math.floor(before / 3));
  assert.equal(result.trimmed, true);
  assert.ok(result.finalChars < before, 'il payload finale deve essere piu piccolo');
  result.context.forEach((entry, i) => {
    assert.equal(entry.technicalAgent.thesis, context[i].technicalAgent.thesis, 'la tesi tecnica non deve mai cambiare');
    assert.equal(entry.riskAgent.thesis, context[i].riskAgent.thesis, 'il rischio non deve mai cambiare');
  });
});

test('non muta mai l\'oggetto context originale passato in ingresso', () => {
  const context = [makeEntry('AAPL', 15, 15)];
  const originalHeadlineCount = context[0].fundamentalAgent.headlines.length;
  buildBoundedContext(context, 100);
  assert.equal(context[0].fundamentalAgent.headlines.length, originalHeadlineCount, 'l\'originale deve restare intatto: buildBoundedContext lavora su una copia');
});

test('taglia prima il simbolo con piu evidenza, non a caso', () => {
  const context = [makeEntry('SMALL', 2, 2), makeEntry('BIG', 15, 15)];
  const before = JSON.stringify(context).length;
  const result = buildBoundedContext(context, Math.floor(before * 0.6));
  assert.ok(result.trimmedSymbols.includes('BIG'), 'il simbolo con piu evidenza deve essere tra i tagliati');
});
