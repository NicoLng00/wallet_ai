// Esegue una pagina driver in Chrome headless e ne estrae l'output serializzato in JSON —
// stessa tecnica usata per tutto lo sviluppo di questa sessione (verificare il motore reale via
// un vero browser, mai un mock del DOM). Qui la riusiamo per far girare il motore client-side
// (src/) senza un browser interattivo, dentro un job schedulato (GitHub Actions).
//
// Usa Puppeteer (solo controllo, mai download di un browser: executablePath punta sempre a un
// Chrome gia' installato) invece di spawnSync + `--dump-dom` + `--virtual-time-budget`: quella
// combinazione, verificata in sessione, si e' bloccata in modo ripetibile su GitHub Actions fino
// al timeout esterno di spawnSync (ETIMEDOUT), identico prima e dopo aver aggiunto timeout a ogni
// singola fetch — segno che il blocco non era di rete ma nel meccanismo stesso di completamento di
// --dump-dom sotto --headless=new su quel runner. page.waitForFunction ha un'attesa reale ed
// esplicita sul segnale di completamento della pagina, non un'ipotesi sul comportamento di Chrome.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { REPO_ROOT } from './driverTemplate.js';

function resolveChromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.platform === 'win32') return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (process.platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return 'google-chrome'; // Linux (runner GitHub Actions, installato via browser-actions/setup-chrome)
}

function toFileUrl(absolutePath) {
  const normalized = absolutePath.replace(/\\/g, '/');
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `file://${encodeURI(withLeadingSlash)}`;
}

// Esegue driverHtmlPath in Chrome headless e restituisce il JSON.parse del contenuto testuale di
// <pre id="output">…</pre> che la pagina scrive al termine del proprio lavoro.
export async function runDriverAndGetOutput(driverHtmlPath, { timeoutMs = 120000 } = {}) {
  const profileDir = fs.mkdtempSync(path.join(REPO_ROOT, '.aurora-chrome-profile-'));
  const browser = await puppeteer.launch({
    executablePath: resolveChromePath(),
    headless: true,
    userDataDir: profileDir,
    // Profilo isolato ed effimero: senza, Chrome punta al profilo di default, gia' occupato da un
    // Chrome interattivo eventualmente in esecuzione sulla stessa macchina (bug reale trovato in
    // sessione: collideva col Chrome dell'utente in locale).
    args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files']
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);
    page.on('pageerror', (err) => { throw new Error(`Errore JS non gestito nella pagina driver: ${err.message}`); });

    const url = toFileUrl(driverHtmlPath);
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.getElementById('output'), { timeout: timeoutMs, polling: 250 });
    const raw = await page.$eval('#output', (el) => el.textContent);
    return JSON.parse(raw);
  } finally {
    await browser.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
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
