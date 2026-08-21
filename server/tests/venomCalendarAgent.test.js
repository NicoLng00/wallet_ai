import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { venomCalendarAgentTool } from '../mcp/tools/venomCalendarAgent.js';

const SAMPLE_XML = `<rss><channel>
<item><title>Fenerbahçe fikstürü açıklandı - Fenerbahce.org</title><pubDate>${new Date().toUTCString()}</pubDate><source>Fenerbahce.org</source></item>
</channel></rss>`;

let originalFetch;
before(() => { originalFetch = globalThis.fetch; });
after(() => { globalThis.fetch = originalFetch; });

test('venomCalendarAgent: risultati reali (mockati) -> available, evidenza con i titoli', async () => {
  globalThis.fetch = async () => ({ ok: true, text: async () => SAMPLE_XML });
  const result = await venomCalendarAgentTool.handler({ symbol: 'FENER.IS', clubName: 'Fenerbahçe', locale: { hl: 'tr', gl: 'TR', ceid: 'TR:tr' } });
  assert.equal(result.available, true);
  assert.equal(result.evidence.length, 1);
  assert.match(result.evidence[0], /fikstürü/);
});

test('venomCalendarAgent: lingua senza query calendario definita -> unavailable esplicito, mai una query a caso', async () => {
  const result = await venomCalendarAgentTool.handler({ symbol: 'X', clubName: 'X FC', locale: { hl: 'fr', gl: 'FR', ceid: 'FR:fr' } });
  assert.equal(result.available, false);
  assert.match(result.thesis, /Nessuna query calendario/);
});

test('venomCalendarAgent: nessun risultato -> available:false', async () => {
  globalThis.fetch = async () => ({ ok: true, text: async () => '<rss><channel></channel></rss>' });
  const result = await venomCalendarAgentTool.handler({ symbol: 'JUVE.MI', clubName: 'Juventus', locale: { hl: 'it', gl: 'IT', ceid: 'IT:it' } });
  assert.equal(result.available, false);
});

test('venomCalendarAgent: errore di rete gestito, mai un crash', async () => {
  globalThis.fetch = async () => { throw new Error('network down'); };
  const result = await venomCalendarAgentTool.handler({ symbol: 'JUVE.MI', clubName: 'Juventus', locale: { hl: 'it', gl: 'IT', ceid: 'IT:it' } });
  assert.equal(result.available, false);
  assert.match(result.thesis, /network down/);
});

test('venomCalendarAgent: ogni combinazione hl usata da venomState.js ha una query calendario definita', async () => {
  const usedLocales = ['it', 'de', 'en-GB', 'nl', 'tr', 'pt-PT'];
  globalThis.fetch = async () => ({ ok: true, text: async () => SAMPLE_XML });
  for (const hl of usedLocales) {
    const result = await venomCalendarAgentTool.handler({ symbol: 'X', clubName: 'Test Club', locale: { hl, gl: 'XX', ceid: `XX:${hl}` } });
    assert.notEqual(result.thesis, 'Nessuna query calendario definita per la lingua "' + hl + '".', `manca la query calendario per hl="${hl}"`);
  }
});
