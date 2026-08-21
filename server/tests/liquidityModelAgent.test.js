// liquidityModelAgent: primo test automatico per un tool MCP in questo progetto (finora
// verificati solo con chiamate reali end-to-end). Sintetico e deterministico (nessuna rete),
// mai i dati reali dei 13 club venom qui - quelli restano una verifica manuale separata per non
// introdurre dipendenza di rete nella suite CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liquidityModelAgentTool } from '../mcp/tools/liquidityModelAgent.js';

function makeCandles(count, volume) {
  return Array.from({ length: count }, (_, i) => ({ close: 100 + i * 0.1, volume }));
}

test('liquidityModelAgent: meno di 30 barre con volume -> available:false, mai un giudizio inventato', async () => {
  const result = await liquidityModelAgentTool.handler({ symbol: 'TEST', candles: makeCandles(20, 50000) });
  assert.equal(result.available, false);
  assert.ok(result.risk_flags.includes('no-data-source'));
});

test('liquidityModelAgent: volume basso e stabile -> flag illiquid, nessun falso volume-spike/drought', async () => {
  const result = await liquidityModelAgentTool.handler({ symbol: 'TEST', candles: makeCandles(40, 500) });
  assert.equal(result.available, true);
  assert.ok(result.risk_flags.includes('illiquid'));
  assert.ok(!result.risk_flags.includes('volume-spike'));
  assert.ok(!result.risk_flags.includes('volume-drought'));
});

test('liquidityModelAgent: volume alto e stabile -> nessun flag di illiquidita\'', async () => {
  const result = await liquidityModelAgentTool.handler({ symbol: 'TEST', candles: makeCandles(40, 500000) });
  assert.equal(result.available, true);
  assert.equal(result.risk_flags.includes('illiquid'), false);
});

test('liquidityModelAgent: volume recente molto piu\' alto della baseline -> volume-spike', async () => {
  const baseline = makeCandles(30, 100000);
  const recent = makeCandles(5, 400000); // 4x la baseline, sopra la soglia 2.5x
  const result = await liquidityModelAgentTool.handler({ symbol: 'TEST', candles: [...baseline, ...recent] });
  assert.ok(result.risk_flags.includes('volume-spike'));
});

test('liquidityModelAgent: volume recente molto piu\' basso della baseline -> volume-drought', async () => {
  const baseline = makeCandles(30, 100000);
  const recent = makeCandles(5, 20000); // 0.2x la baseline, sotto la soglia 0.4x
  const result = await liquidityModelAgentTool.handler({ symbol: 'TEST', candles: [...baseline, ...recent] });
  assert.ok(result.risk_flags.includes('volume-drought'));
});

test('liquidityModelAgent: giorni a volume zero nella baseline -> flag dedicato, mai nascosto nella media', async () => {
  const baseline = [...makeCandles(25, 50000), ...makeCandles(5, 0)];
  const recent = makeCandles(5, 50000);
  const result = await liquidityModelAgentTool.handler({ symbol: 'TEST', candles: [...baseline, ...recent] });
  assert.ok(result.risk_flags.includes('zero-volume-days'));
  assert.match(result.thesis, /volume zero/);
});

test('liquidityModelAgent: candele senza volume valido vengono scartate, mai contate come zero reale', async () => {
  const withNulls = [...makeCandles(35, 50000), { close: 100, volume: null }, { close: 101 }];
  const result = await liquidityModelAgentTool.handler({ symbol: 'TEST', candles: withNulls });
  assert.equal(result.available, true);
  assert.equal(result.risk_flags.includes('zero-volume-days'), false);
});
