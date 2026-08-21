import { callVenomAgentTool } from './mcp/venomClient.js';
import { callVenomGemini } from './providers/venomGemini.js';
import { buildBoundedContext } from './lib/contextBudget.js';

// Gemello di supervisor.js: stessa architettura (agenti -> contesto compatto -> Gemini), tool set
// e provider diversi (venomServer.js/venomGemini.js). Nessun agente qui puo' autorizzare da solo
// un'esecuzione — stesso invariante non negoziabile del sistema principale (ARCHITECTURE.md): il
// Risk Engine lato client (src/engine/riskGate.js) resta l'unico gate.
const MAX_CONTEXT_CHARS = 24000;

function buildQueryContext({ symbol, tier, strategyLabel, bullish }) {
  if (!strategyLabel) return `${symbol}: nessuna strategia attiva`;
  const direction = bullish ? 'segnale rialzista' : 'nessun segnale rialzista al momento';
  return `${symbol}: ${strategyLabel}, fascia ${tier || 'nessuna'}, ${direction}`;
}

// 7 agenti (contro i 9 del sistema principale): fundamental/social_sentiment/macro_calendar
// sostituiti da un solo venom_news (Finnhub non copre i 13 ticker europei, confermato con una
// chiave reale — nessuna fonte macro/calendario ancora verificata per questi mercati, vedi
// roadmap). clubName/locale (vedi src/models/venomState.js) passati dal chiamante invece di
// derivati qui, stesso principio di separazione dati/orchestrazione del resto del progetto.
export async function runVenomAgentsForSymbol({ symbol, closes, candles, validated, tier, strategyLabel, timeframe, bullish, confidenceHint, lessons, confluence, risk, clubName, newsLocale, otherSymbols }) {
  const queryContext = buildQueryContext({ symbol, tier, strategyLabel, bullish });
  const [technical, riskManager, marketRegime, liquidityModel, hedge, auditSentinel, venomNews] = await Promise.all([
    callVenomAgentTool('technical_analyst', { symbol, validated: !!validated, tier: tier || null, strategyLabel: strategyLabel || null, timeframe: timeframe || null, bullish: !!bullish, confidenceHint: confidenceHint ?? null, lessons: lessons || [], confluence: confluence || [] }),
    callVenomAgentTool('risk_manager', risk),
    callVenomAgentTool('market_regime', { symbol, candles: candles || [] }),
    callVenomAgentTool('liquidity_model', { symbol, candles: candles || [] }),
    callVenomAgentTool('hedge', { symbol, candidateCloses: closes || [], otherSymbols: otherSymbols || [] }),
    callVenomAgentTool('audit_sentinel', { symbol }),
    callVenomAgentTool('venom_news', { symbol, clubName, locale: newsLocale })
  ]);
  return { technical, riskManager, marketRegime, liquidityModel, hedge, auditSentinel, venomNews };
}

// callModel iniettabile (default: la vera chiamata Gemini) solo per i test — nessuna chiave
// Gemini reale disponibile in sessione per verificare quella parte dal vivo, dichiarato
// onestamente invece di lasciarla non testata in silenzio (vedi server/tests/venomSupervisor.test.js).
export async function generateVenomDecision({ apiKey, symbols, marketContext, risk, heldPositions, callModel = callVenomGemini }) {
  if (!apiKey) throw new Error('Chiave Gemini mancante per venom.');

  const held = new Set(heldPositions || []);
  const context = await Promise.all(symbols.map(async (symbol) => {
    const market = marketContext[symbol] || {};
    const otherSymbols = symbols
      .filter((other) => other !== symbol && marketContext[other]?.closes?.length)
      .map((other) => ({ symbol: other, closes: marketContext[other].closes, heldPosition: held.has(other) }));
    const evidence = await runVenomAgentsForSymbol({
      symbol, closes: market.closes, candles: market.candles, validated: market.validated, tier: market.tier,
      strategyLabel: market.strategyLabel, timeframe: market.timeframe, bullish: market.bullish,
      confidenceHint: market.confidenceHint, lessons: market.lessons, confluence: market.confluence,
      risk, clubName: market.clubName, newsLocale: market.newsLocale, otherSymbols
    });
    return {
      symbol,
      price: market.price,
      changePercent: market.changePercent,
      technicalAgent: { available: evidence.technical.available, thesis: evidence.technical.thesis, confidence: evidence.technical.confidence },
      riskAgent: { thesis: evidence.riskManager.thesis, riskFlags: evidence.riskManager.risk_flags },
      liquidityAgent: evidence.liquidityModel.available ? { thesis: evidence.liquidityModel.thesis, riskFlags: evidence.liquidityModel.risk_flags } : null,
      hedgeAgent: evidence.hedge.available ? { thesis: evidence.hedge.thesis, riskFlags: evidence.hedge.risk_flags } : null,
      marketRegimeAgent: evidence.marketRegime.available ? { thesis: evidence.marketRegime.thesis, riskFlags: evidence.marketRegime.risk_flags } : null,
      venomNewsAgent: evidence.venomNews.available ? { thesis: evidence.venomNews.thesis, headlines: evidence.venomNews.evidence } : null
    };
  }));

  const bounded = buildBoundedContext(context, MAX_CONTEXT_CHARS);
  const signals = await callModel({ apiKey, context: bounded.context });
  return {
    signals, engine: 'gemini', fetchedAt: new Date().toISOString(),
    contextTrimmed: bounded.trimmed, trimmedSymbols: bounded.trimmedSymbols
  };
}
