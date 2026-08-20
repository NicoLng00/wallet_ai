// Fase 1 della roadmap di ottimizzazione: prima index.html e driverTemplate.js mantenevano a
// mano due liste dell'ordine di caricamento del motore, a rischio di divergenza silenziosa se
// si aggiungeva un file motore in uno solo dei due posti. driverTemplate.js ora legge
// src/engine-manifest.json direttamente (fonte unica), quindi non puo' piu' divergere da se'
// stesso — questo test verifica invece index.html, che resta statico per design (nessun
// caricamento dinamico su un motore che assume ordine sincrono garantito) e quindi PUO' ancora
// divergere se qualcuno dimentica di aggiornarlo: se succede, questo test fallisce in CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const manifest = JSON.parse(readFileSync(path.join(REPO_ROOT, 'src', 'engine-manifest.json'), 'utf8'));

function extractScriptSrcs(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');
  const matches = [...html.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)];
  return matches.map((m) => m[1]);
}

test('index.html carica il motore condiviso nello stesso ordine del manifest', () => {
  const scripts = extractScriptSrcs(path.join(REPO_ROOT, 'index.html'));
  const enginePortion = scripts.slice(0, manifest.engineScripts.length);
  assert.deepEqual(enginePortion, manifest.engineScripts, 'index.html deve caricare esattamente i file del manifest, nello stesso ordine, prima di qualunque file solo-browser');
});

test('index.html carica i file solo-browser dichiarati (views/controllers/main) dopo il motore condiviso', () => {
  const scripts = extractScriptSrcs(path.join(REPO_ROOT, 'index.html'));
  const afterEngine = scripts.slice(manifest.engineScripts.length);
  assert.deepEqual(afterEngine, manifest.browserOnlyScripts);
});

test('il manifest non ha duplicati e ogni file dichiarato esiste davvero su disco', () => {
  const all = [...manifest.engineScripts, ...manifest.browserOnlyScripts];
  assert.equal(new Set(all).size, all.length, 'nessun file deve comparire due volte nel manifest');
  all.forEach((relativePath) => {
    assert.ok(existsSync(path.join(REPO_ROOT, relativePath)), `${relativePath} dichiarato nel manifest ma non trovato su disco`);
  });
});
