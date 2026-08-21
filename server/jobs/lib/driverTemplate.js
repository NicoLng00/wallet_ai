// Costruisce la pagina "driver": lo stesso motore client (src/) usato dal browser, caricato in
// Chrome headless con lo stato iniettato via localStorage — nessuna riscrittura del motore, nessun
// mock del DOM oltre a Views/$, la stessa tecnica di verifica usata in tutta questa sessione.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// Fonte unica di verita' (src/engine-manifest.json) invece di una lista duplicata qui — prima
// questo file e index.html mantenevano a mano due liste che dovevano restare sincronizzate,
// un rischio reale di divergenza silenziosa. index.html resta statico per design (nessun
// caricamento dinamico su un motore che assume ordine sincrono garantito) — un test di coerenza
// (server/tests/engineManifest.test.js) verifica che coincida comunque con questo stesso manifest.
const manifest = JSON.parse(readFileSync(path.join(REPO_ROOT, 'src', 'engine-manifest.json'), 'utf8'));
const ENGINE_SCRIPTS = manifest.engineScripts;

// Pipeline venom (branch dedicato): stesso motore, stato diverso — manifest gemello con
// venomState.js al posto di state.js (vedi src/venom-engine-manifest.json). Letto solo se
// richiesto esplicitamente (engineScripts param sotto), mai per il driver del sistema principale.
const venomManifest = JSON.parse(readFileSync(path.join(REPO_ROOT, 'src', 'venom-engine-manifest.json'), 'utf8'));
export const VENOM_ENGINE_SCRIPTS = venomManifest.engineScripts;

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
export function buildDriverHtml({ injections = {}, tailScript, engineScripts = ENGINE_SCRIPTS }) {
  const setters = Object.entries(injections)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(JSON.stringify(value))});`)
    .join('\n');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>aurora job</title></head><body>
<script>
${setters}
</script>
${engineScripts.map(scriptTag).join('\n')}
<script>
${tailScript}
</script>
</body></html>
`;
}
