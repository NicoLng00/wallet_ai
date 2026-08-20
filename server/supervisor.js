import { callAgentTool } from './mcp/client.js';
import { providerRegistry } from './providers/registry.js';

const STOCK_SYMBOLS = ['AAPL', 'NVDA', 'SPY', 'QQQ', 'TSLA'];

// Chiama sempre tutti e 8 gli agenti (tool MCP) per un simbolo — stesso spirito della UI che
// mostra sempre "8 agenti" — e restituisce le loro evidenze strutturate.
export async function runAgentsForSymbol({ symbol, closes, candles, validated, tier, strategyLabel, timeframe, bullish, confidenceHint, lessons, risk, finnhubKey, otherSymbols }) {
  const [technical, riskManager, marketRegime, liquidity, fundamental, hedge, auditSentinel, socialSentiment] = await Promise.all([
    callAgentTool('technical_analyst', { symbol, validated: !!validated, tier: tier || null, strategyLabel: strategyLabel || null, timeframe: timeframe || null, bullish: !!bullish, confidenceHint: confidenceHint ?? null, lessons: lessons || [] }),
    callAgentTool('risk_manager', risk),
    callAgentTool('market_regime', { symbol, candles: candles || [] }),
    callAgentTool('liquidity', {}),
    callAgentTool('fundamental', { symbol, finnhubKey: finnhubKey || null, isStock: STOCK_SYMBOLS.includes(symbol) }),
    callAgentTool('hedge', { symbol, candidateCloses: closes || [], otherSymbols: otherSymbols || [] }),
    callAgentTool('audit_sentinel', { symbol }),
    callAgentTool('social_sentiment', { symbol })
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
      confidenceHint: market.confidenceHint, lessons: market.lessons, risk, finnhubKey, otherSymbols
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

  const signals = await provider.call({ apiKey, context });
  return { signals, engine: providerId, fetchedAt: new Date().toISOString() };
}
