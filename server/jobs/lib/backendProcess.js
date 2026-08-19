// Avvia/ferma il backend locale (server/index.js) per la durata di un job — serve solo da proxy
// verso Yahoo Finance (storico) e Gemini (giudizio AI), esattamente come quando gira in sviluppo.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(__dirname, '..', '..');
const HEALTH_URL = 'http://localhost:8787/api/health';

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(HEALTH_URL);
      if (res.ok) return true;
    } catch { /* non ancora pronto */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

export async function startBackend() {
  const alreadyUp = await waitForHealth(1000);
  if (alreadyUp) return { alreadyRunning: true, proc: null };

  const proc = spawn(process.execPath, ['index.js'], {
    cwd: SERVER_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env
  });
  proc.stdout?.on('data', () => {});
  proc.stderr?.on('data', () => {});

  const ready = await waitForHealth(15000);
  if (!ready) {
    proc.kill();
    throw new Error('Il backend locale non ha risposto a /api/health entro 15s.');
  }
  return { alreadyRunning: false, proc };
}

export function stopBackend(handle) {
  if (handle && !handle.alreadyRunning && handle.proc) handle.proc.kill();
}
