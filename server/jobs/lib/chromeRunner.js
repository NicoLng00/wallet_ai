// Esegue una pagina driver in Chrome headless e ne estrae l'output serializzato in JSON —
// stessa tecnica usata per tutto lo sviluppo di questa sessione (verificare il motore reale via
// un vero browser, mai un mock del DOM). Qui la riusiamo per far girare il motore client-side
// (src/) senza un browser interattivo, dentro un job schedulato (GitHub Actions).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REPO_ROOT } from './driverTemplate.js';

function resolveChromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.platform === 'win32') return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (process.platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return 'google-chrome'; // Linux (runner GitHub Actions, installato via browser-actions/setup-chrome)
}

// Il percorso del repo su questa macchina contiene spazi ("OneDrive - alpitronic GmbH") — encodeURI
// li trasforma in %20 (come fa .NET [System.Uri], gia' verificato affidabile in sessione per l'URL
// del DOCUMENTO principale; il problema separato degli spazi negli <script src=...> e' risolto
// scrivendo il driver nella root del repo e usando percorsi relativi, vedi driverTemplate.js).
function toFileUrl(absolutePath) {
  const normalized = absolutePath.replace(/\\/g, '/');
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `file://${encodeURI(withLeadingSlash)}`;
}

function decodeHtmlEntities(text) {
  // --dump-dom serializza il DOM come sorgente HTML: < > & dentro il testo del <pre> tornano
  // come entità. Il resto del JSON (virgolette, parentesi) non viene toccato dalla serializzazione.
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// Esegue driverHtmlPath in Chrome headless e restituisce il JSON.parse del contenuto testuale di
// <pre id="output">…</pre> che la pagina deve scrivere prima di terminare.
export function runDriverAndGetOutput(driverHtmlPath, { virtualTimeBudgetMs = 25000, timeoutMs = 90000 } = {}) {
  const chrome = resolveChromePath();
  const url = toFileUrl(driverHtmlPath);
  // Profilo isolato ed effimero per ogni invocazione: SENZA --user-data-dir Chrome punta al
  // profilo di default, che su questa macchina e' gia' occupato dal Chrome interattivo
  // dell'utente — una nuova istanza headless collide con quella in esecuzione (singleton per
  // profilo) e puo' uscire subito senza completare il caricamento. Bug reale trovato debuggando:
  // stessa pagina, stesso comando, falliva solo quando lanciata senza un profilo dedicato.
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-chrome-profile-'));
  const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    `--user-data-dir=${profileDir}`,
    // Il documento driver vive in una directory temporanea diversa da quella dei <script src=...>
    // (che puntano al repo): senza questo flag Chrome blocca il caricamento cross-directory da file://.
    '--allow-file-access-from-files',
    `--virtual-time-budget=${virtualTimeBudgetMs}`,
    '--dump-dom', url
  ];
  let result;
  try {
    result = spawnSync(chrome, args, { timeout: timeoutMs, maxBuffer: 128 * 1024 * 1024, encoding: 'utf8' });
  } finally {
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Chrome headless uscito con codice ${result.status}: ${(result.stderr || '').slice(0, 2000)}`);
  const html = result.stdout || '';
  // Cerca l'ULTIMA occorrenza, non la prima: la stringa 'id="output"' compare gia' prima, come
  // testo sorgente dentro il tag <script> stesso (il tail script scrive letteralmente quella
  // stringa per creare l'elemento) — la prima occorrenza trovata con indexOf() era quella, non
  // il <pre> reale renderizzato dopo </script>. Bug reale trovato debuggando: l'estrazione
  // prendeva sempre il contenuto (vuoto) tra quella stringa sorgente e il successivo '</pre>'
  // nel testo dello script, non il payload JSON vero.
  const marker = 'id="output"';
  const markerIndex = html.lastIndexOf(marker);
  if (markerIndex === -1) throw new Error('Nessun elemento #output trovato nella pagina driver: la pagina non ha completato correttamente.');
  const tagEnd = html.indexOf('>', markerIndex);
  const contentEnd = html.indexOf('</pre>', tagEnd);
  if (tagEnd === -1 || contentEnd === -1) throw new Error('Formato inatteso della pagina driver: impossibile isolare il contenuto di #output.');
  const raw = decodeHtmlEntities(html.slice(tagEnd + 1, contentEnd));
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Output della pagina driver non è JSON valido: ${error.message}. Prime 500 char: ${raw.slice(0, 500)}`);
  }
}

// Scritto DENTRO la root del repo (prefisso "_", gia' escluso da .gitignore) cosi' i percorsi
// relativi degli <script src="./src/..."> nel driver risolvono correttamente — mai in una
// cartella temporanea separata (vedi driverTemplate.js per il perche').
export function writeTempDriverFile(html, name) {
  const filePath = path.join(REPO_ROOT, `_job-${name}`);
  fs.writeFileSync(filePath, html, 'utf8');
  return filePath;
}

export function removeDriverFile(filePath) {
  try { fs.unlinkSync(filePath); } catch { /* gia' rimosso o mai creato, non e' un problema */ }
}
