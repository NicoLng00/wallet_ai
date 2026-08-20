// Test reali della logica di retrieval (server/lib/retrieval.js) — nessuna chiave API richiesta,
// e' matematica pura. Esegui con: node --test server/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cosineSimilarity, retrieveTopK } from '../lib/retrieval.js';

test('cosineSimilarity: vettori identici -> 1', () => {
  assert.equal(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);
});

test('cosineSimilarity: vettori ortogonali -> 0', () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test('cosineSimilarity: vettori opposti -> -1', () => {
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
});

test('cosineSimilarity: lunghezze diverse o input nullo -> 0, mai un\'eccezione', () => {
  assert.equal(cosineSimilarity([1, 2], [1, 2, 3]), 0);
  assert.equal(cosineSimilarity(null, [1, 2]), 0);
  assert.equal(cosineSimilarity([], []), 0);
});

test('retrieveTopK: sceglie davvero i piu\' simili alla query, non solo i primi k', () => {
  const query = [1, 0];
  const items = [
    { text: 'lontano', embedding: [0, 1] },      // ortogonale, score 0
    { text: 'vicino', embedding: [0.99, 0.14] },  // quasi identico, score alto
    { text: 'medio', embedding: [0.7, 0.7] }      // score medio
  ];
  const top2 = retrieveTopK(items, query, 2);
  assert.equal(top2.length, 2);
  assert.equal(top2[0].text, 'vicino');
  assert.equal(top2[1].text, 'medio');
  assert.ok(!top2.some((item) => item.text === 'lontano'), 'il meno rilevante deve restare fuori dal top-2');
});

test('retrieveTopK: item con embedding mancante finisce in fondo, mai escluso con un errore', () => {
  const query = [1, 0];
  const items = [
    { text: 'senza-embedding', embedding: null },
    { text: 'con-embedding', embedding: [1, 0] }
  ];
  const top = retrieveTopK(items, query, 2);
  assert.equal(top.length, 2);
  assert.equal(top[0].text, 'con-embedding');
  assert.equal(top[1].text, 'senza-embedding');
});

test('retrieveTopK: input vuoto o query mancante -> array vuoto, mai un\'eccezione', () => {
  assert.deepEqual(retrieveTopK([], [1, 0], 3), []);
  assert.deepEqual(retrieveTopK([{ text: 'x', embedding: [1] }], null, 3), []);
});
