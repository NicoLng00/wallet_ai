// Lettura/scrittura dello stato condiviso in data/*.json — la "base dati" del bot autonomo: due
// job schedulati (setup giornaliero, ciclo di trading frequente) leggono e riscrivono questi file,
// git li versiona, GitHub Pages li serve come dashboard di sola lettura. Nessun database esterno:
// deliberatamente il repo stesso è lo storage, coerente con "tutto gratis su GitHub".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DATA_DIR = path.join(REPO_ROOT, 'data');

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
    demoAccount: null, // null = usa i default dell'app (conto pulito da €10)
    activity: [],
    autopilotMode: 'coverage',
    liveDataEnabled: true,
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
