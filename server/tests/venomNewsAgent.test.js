// venomNewsAgent: mocka globalThis.fetch (nessuna rete nella suite CI, stesso principio degli
// altri test) - la verifica che Google News RSS risponda DAVVERO per Juventus/Dortmund e' stata
// fatta manualmente in sessione con richieste reali (vedi commento nel tool), non ripetuta qui.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { venomNewsAgentTool } from '../mcp/tools/venomNewsAgent.js';

const SAMPLE_XML = `<rss><channel>
<item><title>Titolo recente - Gazzetta</title><pubDate>${new Date().toUTCString()}</pubDate><source>Gazzetta</source></item>
<item><title>Titolo vecchio - Tuttosport</title><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate><source>Tuttosport</source></item>
</channel></rss>`;

let originalFetch;
before(() => { originalFetch = globalThis.fetch; });
after(() => { globalThis.fetch = originalFetch; });

const LOCALE = { hl: 'it', gl: 'IT', ceid: 'IT:it' };

test('venomNewsAgent: notizie reali (mockate) -> available, evidenza col titolo', async () => {
  globalThis.fetch = async () => ({ ok: true, text: async () => SAMPLE_XML });
  const result = await venomNewsAgentTool.handler({ symbol: 'JUVE.MI', clubName: 'Juventus', locale: LOCALE });
  assert.equal(result.available, true);
  assert.equal(result.evidence.length, 2);
  assert.equal(result.evidence[0], 'Titolo recente - Gazzetta');
});

// Bug reale trovato con una verifica dal vivo contro Google News: il titolo include GIA' " -
// NomeFonte" in coda (verificato su piu' lingue/club) — appendere di nuovo "(NomeFonte)" duplicava
// la fonte in ogni evidenza.
test('venomNewsAgent: mai una fonte duplicata quando il titolo la contiene gia\' in coda', async () => {
  const xml = `<rss><channel><item><title>Notizia - La Gazzetta dello Sport</title><pubDate>${new Date().toUTCString()}</pubDate><source>La Gazzetta dello Sport</source></item></channel></rss>`;
  globalThis.fetch = async () => ({ ok: true, text: async () => xml });
  const result = await venomNewsAgentTool.handler({ symbol: 'JUVE.MI', clubName: 'Juventus', locale: LOCALE });
  assert.equal(result.evidence[0], 'Notizia - La Gazzetta dello Sport');
  assert.equal((result.evidence[0].match(/Gazzetta/g) || []).length, 1);
});

test('venomNewsAgent: se il titolo NON contiene gia\' la fonte, la aggiunge tra parentesi', async () => {
  const xml = `<rss><channel><item><title>Notizia senza fonte nel titolo</title><pubDate>${new Date().toUTCString()}</pubDate><source>Fonte Esterna</source></item></channel></rss>`;
  globalThis.fetch = async () => ({ ok: true, text: async () => xml });
  const result = await venomNewsAgentTool.handler({ symbol: 'JUVE.MI', clubName: 'Juventus', locale: LOCALE });
  assert.equal(result.evidence[0], 'Notizia senza fonte nel titolo (Fonte Esterna)');
});

test('venomNewsAgent: nessuna notizia trovata -> available:false, mai un\'evidenza inventata', async () => {
  globalThis.fetch = async () => ({ ok: true, text: async () => '<rss><channel></channel></rss>' });
  const result = await venomNewsAgentTool.handler({ symbol: 'JUVE.MI', clubName: 'Juventus', locale: LOCALE });
  assert.equal(result.available, false);
});

test('venomNewsAgent: risposta http non-ok -> available:false con il codice nel motivo', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 429 });
  const result = await venomNewsAgentTool.handler({ symbol: 'JUVE.MI', clubName: 'Juventus', locale: LOCALE });
  assert.equal(result.available, false);
  assert.match(result.thesis, /429/);
});

test('venomNewsAgent: fetch che lancia un errore di rete -> gestito, mai un crash', async () => {
  globalThis.fetch = async () => { throw new Error('network down'); };
  const result = await venomNewsAgentTool.handler({ symbol: 'JUVE.MI', clubName: 'Juventus', locale: LOCALE });
  assert.equal(result.available, false);
  assert.match(result.thesis, /network down/);
});

test('venomNewsAgent: molte notizie recenti (finestra 72h) -> risk_flag high-news-volume', async () => {
  const manyRecent = `<rss><channel>${Array.from({ length: 5 }, (_, i) => `<item><title>Notizia ${i}</title><pubDate>${new Date().toUTCString()}</pubDate><source>Fonte</source></item>`).join('')}</channel></rss>`;
  globalThis.fetch = async () => ({ ok: true, text: async () => manyRecent });
  const result = await venomNewsAgentTool.handler({ symbol: 'JUVE.MI', clubName: 'Juventus', locale: LOCALE });
  assert.ok(result.risk_flags.includes('high-news-volume'));
});

test('venomNewsAgent: notizie vecchie non contano come "recenti" ai fini del flag', async () => {
  const allOld = `<rss><channel>${Array.from({ length: 5 }, (_, i) => `<item><title>Notizia ${i}</title><pubDate>Mon, 01 Jan 2020 00:00:00 GMT</pubDate><source>Fonte</source></item>`).join('')}</channel></rss>`;
  globalThis.fetch = async () => ({ ok: true, text: async () => allOld });
  const result = await venomNewsAgentTool.handler({ symbol: 'JUVE.MI', clubName: 'Juventus', locale: LOCALE });
  assert.equal(result.risk_flags.includes('high-news-volume'), false);
  assert.match(result.thesis, /0 nelle ultime/);
});
