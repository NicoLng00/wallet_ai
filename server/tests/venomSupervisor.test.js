// Verifica reale del protocollo MCP venom (server/mcp/venomServer.js + venomClient.js — handshake
// e tool-calling autentici via InMemoryTransport, stessa tecnica del sistema principale) e della
// logica di orchestrazione in venomSupervisor.js. Il modello (callVenomGemini) e' mockato: nessuna
// chiave Gemini reale disponibile in sessione per verificarlo dal vivo, dichiarato esplicitamente
// invece di fingere una verifica che non e' stata fatta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callVenomAgentTool } from '../mcp/venomClient.js';
import { VENOM_AGENT_TOOL_NAMES } from '../mcp/venomServer.js';

test('venomServer: registra esattamente i 7 tool attesi (nessuno mancante, nessuno del sistema principale infiltrato)', () => {
  assert.deepEqual(VENOM_AGENT_TOOL_NAMES, [
    'technical_analyst', 'risk_manager', 'market_regime', 'liquidity_model', 'hedge', 'audit_sentinel', 'venom_news'
  ]);
  assert.ok(!VENOM_AGENT_TOOL_NAMES.includes('fundamental'), 'fundamental (Finnhub) non deve esistere qui: non copre i ticker venom');
  assert.ok(!VENOM_AGENT_TOOL_NAMES.includes('social_sentiment'), 'sostituito da venom_news');
  assert.ok(!VENOM_AGENT_TOOL_NAMES.includes('macro_calendar'), 'nessuna fonte macro verificata per questi mercati');
});

test('venomClient: handshake MCP reale (InMemoryTransport) + chiamata reale a technical_analyst', async () => {
  const result = await callVenomAgentTool('technical_analyst', {
    symbol: 'JUVE.MI', validated: true, tier: 'validated', strategyLabel: 'MACD crossover', timeframe: '1D', bullish: true, confidenceHint: 70
  });
  assert.equal(result.available, true);
  assert.match(result.thesis, /MACD crossover/);
});

test('venomClient: liquidity_model reale via MCP, non solo import diretto', async () => {
  const candles = Array.from({ length: 40 }, (_, i) => ({ close: 2 + i * 0.01, volume: 50000 }));
  const result = await callVenomAgentTool('liquidity_model', { symbol: 'JUVE.MI', candles });
  assert.equal(result.available, true);
  assert.equal(result.model_version, 'liquidity-volume-proxy-v1');
});

test('venomClient: tool inesistente -> errore esplicito (protocollo MCP reale, non un mock che accetterebbe qualunque nome)', async () => {
  await assert.rejects(() => callVenomAgentTool('fundamental', { symbol: 'JUVE.MI' }));
});

// --- generateVenomDecision: pipeline reale (7 agenti veri via MCP) fino al confine esterno ---
// callModel iniettato (nessuna chiave Gemini reale in sessione per verificarlo dal vivo,
// dichiarato onestamente) - tutto il resto (agenti, contesto, budget) e' il codice vero.
const { generateVenomDecision } = await import('../venomSupervisor.js');

test('generateVenomDecision: orchestra i 7 agenti reali e passa un contesto ben formato al modello', async () => {
  // venom_news farebbe una vera chiamata a Google News senza questo mock — stesso principio di
  // venomNewsAgent.test.js, nessuna dipendenza di rete nella suite CI.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => '<rss><channel></channel></rss>' });
  let capturedContext = null;
  const fakeCallModel = async ({ context }) => {
    capturedContext = context;
    return { 'JUVE.MI': { bullish: true, defensive: false, confidence: 65, rationale: 'test', fetchedAt: new Date().toISOString() } };
  };
  let result;
  try {
    result = await generateVenomDecision({
      apiKey: 'fake-key-for-test',
      symbols: ['JUVE.MI'],
      marketContext: {
        'JUVE.MI': {
          price: 2.05, changePercent: 1.2, closes: Array.from({ length: 40 }, (_, i) => 2 + i * 0.01),
          candles: Array.from({ length: 40 }, (_, i) => {
            const close = 2 + i * 0.01;
            return { open: close - 0.005, high: close + 0.01, low: close - 0.01, close, volume: 50000 };
          }),
          validated: true, tier: 'validated', strategyLabel: 'MACD crossover', timeframe: '1D', bullish: true,
          confidenceHint: 70, lessons: [], confluence: [], clubName: 'Juventus', newsLocale: { hl: 'it', gl: 'IT', ceid: 'IT:it' }
        }
      },
      risk: { equity: 50, cash: 40, exposurePercent: 20, drawdownPercent: 0, maxExposurePercent: 25, maxDrawdownPercent: 20, openPositions: 0, maxConcurrentPositions: 13 },
      heldPositions: [],
      callModel: fakeCallModel
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.ok(result.signals['JUVE.MI']);
  assert.equal(capturedContext.length, 1);
  assert.equal(capturedContext[0].symbol, 'JUVE.MI');
  assert.ok(capturedContext[0].technicalAgent.available, 'l\'agente tecnico reale deve aver risposto available:true con una strategia validata');
  assert.equal(capturedContext[0].liquidityAgent.riskFlags.length, 0, 'volume 50000 stabile -> nessun flag di illiquidita\'');
  // fundamental/socialSentiment NON devono esistere nel contesto venom (sostituiti da venomNewsAgent).
  assert.equal(capturedContext[0].fundamentalAgent, undefined);
  assert.equal(capturedContext[0].socialSentimentAgent, undefined);
});

test('generateVenomDecision: senza chiave -> errore esplicito, mai una chiamata al modello', async () => {
  await assert.rejects(
    () => generateVenomDecision({ apiKey: null, symbols: ['JUVE.MI'], marketContext: {}, risk: {}, heldPositions: [] }),
    /Chiave Gemini mancante/
  );
});
