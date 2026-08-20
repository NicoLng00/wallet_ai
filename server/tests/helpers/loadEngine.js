// Shim minimo per caricare src/engine/*.js (scritti per window.Aurora, script globali, non
// moduli ES) dentro Node puro — senza Chrome/Puppeteer, per test veloci. Stessa tecnica di
// principio del driver Puppeteer (server/jobs/lib/driverTemplate.js): nessuna riscrittura del
// motore, solo l'ambiente minimo perche' giri. localStorage non esiste in Node — ogni lettura in
// state.js e' gia' avvolta in try/catch che ricade sui default, quindi non serve un finto
// localStorage: l'assenza stessa e' gia' gestita dal codice di produzione.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// Un solo context V8 condiviso tra tutti i file caricati in una sessione di test, cosi'
// Aurora.Engine/Aurora.Models restano lo stesso oggetto tra un file e l'altro — esattamente come
// nel browser, dove ogni <script> tag esegue nello stesso global scope.
export function createEngineContext() {
  const sandbox = {};
  sandbox.window = sandbox; // window === global scope, stesso alias usato da ogni file motore
  sandbox.console = console;
  vm.createContext(sandbox);
  return sandbox;
}

export function loadEngineFile(context, relativePath) {
  const fullPath = path.join(REPO_ROOT, relativePath);
  const code = readFileSync(fullPath, 'utf8');
  vm.runInContext(code, context, { filename: fullPath });
}

// Carica solo i file richiesti, nell'ordine dato — i test scelgono il sottoinsieme minimo che
// serve (indicators.js da solo per gli indicatori, + state.js/backtest.js/strategies.js/rules.js
// per la selezione a fasce), invece di caricare sempre l'intero motore.
export function loadEngine(relativePaths) {
  const context = createEngineContext();
  relativePaths.forEach((p) => loadEngineFile(context, p));
  return context.Aurora;
}
