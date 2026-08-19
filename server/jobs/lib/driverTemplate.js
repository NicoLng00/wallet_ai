// Costruisce la pagina "driver": lo stesso motore client (src/) usato dal browser, caricato in
// Chrome headless con lo stato iniettato via localStorage — nessuna riscrittura del motore, nessun
// mock del DOM oltre a Views/$, la stessa tecnica di verifica usata in tutta questa sessione.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const ENGINE_SCRIPTS = [
  'src/utils.js', 'src/config.js', 'src/models/seedData.js', 'src/models/state.js',
  'src/engine/indicators.js', 'src/engine/rules.js', 'src/engine/backtest.js', 'src/engine/market.js',
  'src/engine/riskGate.js', 'src/engine/execution.js', 'src/engine/strategies.js', 'src/engine/learning.js',
  'src/engine/memory.js', 'src/agents/supervisor.js', 'src/engine/autopilot.js',
  'src/services/dataProviders.js', 'src/services/aiProviders.js'
];

// Percorsi RELATIVI (non file:// assoluti): il percorso del repo su questa macchina contiene
// spazi ("OneDrive - alpitronic GmbH") che un URL file:// assoluto non gestisce in modo affidabile
// per il caricamento di <script src>. Stessa tecnica, verificata su decine di pagine di test in
// questa sessione, di scrivere il driver DENTRO la root del repo (mai in una cartella temporanea)
// cosi' "./src/..." risolve correttamente — vedi writeTempDriverFile in chromeRunner.js.
function scriptTag(relativePath) {
  return `<script src="./${relativePath}"></script>`;
}

// injections: { [localStorageKey]: valueOrNull } — null/undefined = non impostare la chiave,
// cosi' i fallback gia' esistenti in models/state.js (seed reale o default puliti) restano intatti.
export function buildDriverHtml({ injections = {}, tailScript }) {
  const setters = Object.entries(injections)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(JSON.stringify(value))});`)
    .join('\n');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>aurora job</title></head><body>
<script>
${setters}
</script>
${ENGINE_SCRIPTS.map(scriptTag).join('\n')}
<script>
${tailScript}
</script>
</body></html>
`;
}
