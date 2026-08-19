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

// Storia longitudinale delle validazioni: dailySetup.js SOVRASCRIVE researchData.validated a ogni
// run, quindi senza questo non c'e' modo di sapere se un edge e' persistente (validato da giorni)
// o e' apparso e sparira' per rumore statistico — proprio la domanda a cui un sistema con
// "piu' conoscenza" dovrebbe saper rispondere. Un record al giorno, capato per non crescere senza
// limite (~90 giorni e' gia' piu' della finestra di backtest usata altrove nel progetto).
const VALIDATION_HISTORY_CAP_DAYS = 90;

export function readValidationHistory() {
  return readJson('validation-history.json', { days: [] });
}

// snapshot: { [symbol]: string[] } — solo le candidateKey validate oggi, non l'intero oggetto
// candidates (gia' in research.json) per restare piccolo anche dopo mesi di storia.
export function appendValidationHistory(dateStr, snapshot) {
  const history = readValidationHistory();
  const days = history.days.filter((entry) => entry.date !== dateStr); // idempotente: un run ripetuto lo stesso giorno sostituisce, non duplica
  days.push({ date: dateStr, validated: snapshot });
  days.sort((a, b) => a.date.localeCompare(b.date));
  writeJson('validation-history.json', { days: days.slice(-VALIDATION_HISTORY_CAP_DAYS) });
  return days;
}

// Giorni CONSECUTIVI (fino a oggi incluso, andando a ritroso) in cui candidateKey e' risultata
// validata per symbol — 0 se non e' validata oggi o non c'e' abbastanza storia.
export function computeValidationStreak(days, symbol, candidateKey) {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if ((days[i].validated[symbol] || []).includes(candidateKey)) streak += 1;
    else break;
  }
  return streak;
}

export { DATA_DIR };
