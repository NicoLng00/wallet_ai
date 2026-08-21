// Lettura/scrittura dello stato venom in data/venom/*.json — stessa tecnica di stateStore.js
// (il sistema principale), directory separata cosi' i due bot autonomi non toccano mai lo stesso
// file. Deliberatamente piu' semplice del gemello principale: niente validation-history/archival
// ancora (sistema piccolo, 13 simboli, nessuno storico accumulato da archiviare) — da aggiungere
// se e quando servira' davvero, non prima.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DATA_DIR = path.join(REPO_ROOT, 'data', 'venom');

function readJson(fileName, fallback) {
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, fileName), 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(fileName, value) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, fileName), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function readAccountState() {
  return readJson('account.json', {
    demoAccount: null,
    activity: [],
    autopilotMode: 'coverage',
    liveDataEnabled: false,
    updatedAt: null
  });
}

export function writeAccountState(state) {
  writeJson('account.json', { ...state, updatedAt: new Date().toISOString() });
}

export function readResearchState() {
  return readJson('research.json', {
    researchData: { validated: {}, trackRecord: {}, tradeEpisodes: {}, lessons: {} },
    historyCache: {},
    updatedAt: null
  });
}

export function writeResearchState(state) {
  writeJson('research.json', { ...state, updatedAt: new Date().toISOString() });
}

export { DATA_DIR };
