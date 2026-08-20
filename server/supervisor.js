import { callAgentTool } from './mcp/client.js';
import { providerRegistry } from './providers/registry.js';
import { buildBoundedContext } from './lib/contextBudget.js';

const STOCK_SYMBOLS = ['AAPL', 'NVDA', 'SPY', 'QQQ', 'TSLA'];

// Payload massimo (in caratteri di JSON) del context inviato a Gemini per l'intero watchlist in
// una sola chiamata batched — vedi lib/contextBudget.js. A 12 simboli oggi il taglio non scatta
// mai (verificato); il tetto esiste per quando il watchlist crescera'.
const MAX_CONTEXT_CHARS = 24000;

// Query testuale usata per il retrieval per rilevanza (fundamental/social_sentiment) — riassume
// in una riga il "di cosa stiamo decidendo adesso" per quel simbolo, cosi' l'embedding ha un
// bersaglio concreto invece di un simbolo nudo.
function buildQueryContext({ symbol, tier, strategyLabel, bullish }) {
  if (!strategyLabel) return `${symbol}: nessuna strategia attiva`;
  const direction = bullish ? 'segnale rialzista' : 'nessun segnale rialzista al momento';
  return `${symbol}: ${strategyLabel}, fascia ${tier || 'nessuna'}, ${direction}`;
}

// Chiama sempre tutti e 8 gli agenti (tool MCP) per un simbolo — stesso spirito della UI che
// mostra sempre "8 agenti" — e restituisce le loro evidenze strutturate.
export async function runAgentsForSymbol({ symbol, closes, candles, validated, tier, strategyLabel, timeframe, bullish, confidenceHint, lessons, risk, finnhubKey, geminiKey, otherSymbols }) {
  const queryContext = buildQueryContext({ symbol, tier, strategyLabel, bullish });
  const [technical, riskManager, marketRegime, liquidity, fundamental, hedge, auditSentinel, socialSentiment] = await Promise.all([
    callAgentTool('technical_analyst', { symbol, validated: !!validated, tier: tier || null, strategyLabel: strategyLabel || null, timeframe: timeframe || null, bullish: !!bullish, confidenceHint: confidenceHint ?? null, lessons: lessons || [] }),
    callAgentTool('risk_manager', risk),
    callAgentTool('market_regime', { symbol, candles: candles || [] }),
    callAgentTool('liquidity', {}),
    callAgentTool('fundamental', { symbol, finnhubKey: finnhubKey || null, isStock: STOCK_SYMBOLS.includes(symbol), geminiKey: geminiKey || null, queryContext }),
    callAgentTool('hedge', { symbol, candidateCloses: closes || [], otherSymbols: otherSymbols || [] }),
    callAgentTool('audit_sentinel', { symbol }),
    callAgentTool('social_sentiment', { symbol, geminiKey: geminiKey || null, queryContext })
  ]);
  return { technical, riskManager, marketRegime, liquidity, fundamental, hedge, auditSentinel, socialSentiment };
}

// Orchestrazione completa: per ogni simbolo fa parlare gli agenti, assembla un contesto
// compatto per il modello principale, poi chiama il provider scelto (oggi solo Gemini reale).
//
// Invariante non negoziabile ereditato da ARCHITECTURE.md: qui si genera solo una PROPOSTA
// di giudizio per simbolo. Nessun ordine viene mai inviato da questo backend — l'esecuzione
// e l'unico gate di rischio che conta restano interamente nel browser (src/engine/riskGate.js),
// dopo la risposta del modello, non prima.
export async function generateDecision({ providerId, apiKey, finnhubKey, symbols, marketContext, risk, heldPositions }) {
  const provider = providerRegistry[providerId];
  if (!provider) throw new Error(`Provider "${providerId}" non riconosciuto.`);
  if (!provider.implemented) throw new Error(`Provider "${providerId}" non ancora implementato in questo backend.`);

  const held = new Set(heldPositions || []);
  const context = await Promise.all(symbols.map(async (symbol) => {
    const market = marketContext[symbol] || {};
    const otherSymbols = symbols
      .filter((other) => other !== symbol && marketContext[other]?.closes?.length)
      .map((other) => ({ symbol: other, closes: marketContext[other].closes, heldPosition: held.has(other) }));
    const evidence = await runAgentsForSymbol({
      symbol, closes: market.closes, candles: market.candles, validated: market.validated, tier: market.tier,
      strategyLabel: market.strategyLabel, timeframe: market.timeframe, bullish: market.bullish,
      confidenceHint: market.confidenceHint, lessons: market.lessons, risk, finnhubKey, geminiKey: apiKey, otherSymbols
    });
    return {
      symbol,
      price: market.price,
      changePercent: market.changePercent,
      technicalAgent: { available: evidence.technical.available, thesis: evidence.technical.thesis, confidence: evidence.technical.confidence },
      riskAgent: { thesis: evidence.riskManager.thesis, riskFlags: evidence.riskManager.risk_flags },
      fundamentalAgent: evidence.fundamental.available ? { thesis: evidence.fundamental.thesis, headlines: evidence.fundamental.evidence } : null,
      hedgeAgent: evidence.hedge.available ? { thesis: evidence.hedge.thesis, riskFlags: evidence.hedge.risk_flags } : null,
      marketRegimeAgent: evidence.marketRegime.available ? { thesis: evidence.marketRegime.thesis, riskFlags: evidence.marketRegime.risk_flags } : null,
      socialSentimentAgent: evidence.socialSentiment.available ? { thesis: evidence.socialSentiment.thesis, posts: evidence.socialSentiment.evidence } : null
    };
  }));

  // Budget esplicito prima di inviare a Gemini — vedi lib/contextBudget.js per la priorita'
  // dichiarata (segnale/rischio mai tagliati, notizie/social i primi a saltare). A 12 simboli il
  // taglio non scatta mai (verificato): il tetto esiste per quando il watchlist crescera'.
  const bounded = buildBoundedContext(context, MAX_CONTEXT_CHARS);
  const signals = await provider.call({ apiKey, context: bounded.context });
  return {
    signals, engine: providerId, fetchedAt: new Date().toISOString(),
    contextTrimmed: bounded.trimmed, trimmedSymbols: bounded.trimmedSymbols
  };
}
