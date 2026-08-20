// Test reali di server/lib/fetchRetry.js — puro, nessuna rete, nessuna chiave.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithRetry } from '../lib/fetchRetry.js';

test('fetchWithRetry: successo al primo tentativo, mai ritenta', async () => {
  let calls = 0;
  const result = await fetchWithRetry(async () => { calls += 1; return 'ok'; });
  assert.equal(result, 'ok');
  assert.equal(calls, 1);
});

test('fetchWithRetry: fallisce le prime volte, riesce all\'ultimo tentativo utile', async () => {
  let calls = 0;
  const result = await fetchWithRetry(async () => {
    calls += 1;
    if (calls < 3) throw new Error('transitorio');
    return 'ok-al-terzo';
  }, { attempts: 3, delayMs: 1 });
  assert.equal(result, 'ok-al-terzo');
  assert.equal(calls, 3);
});

test('fetchWithRetry: esaurisce i tentativi e rilancia l\'ultimo errore, mai un numero infinito', async () => {
  let calls = 0;
  await assert.rejects(
    () => fetchWithRetry(async () => { calls += 1; throw new Error(`fallimento ${calls}`); }, { attempts: 3, delayMs: 1 }),
    /fallimento 3/
  );
  assert.equal(calls, 3, 'deve fermarsi esattamente al numero di tentativi dichiarato, non oltre');
});
