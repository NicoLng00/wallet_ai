import { z } from 'zod';
import { embedBatch } from '../../lib/embeddings.js';
import { retrieveTopK } from '../../lib/retrieval.js';

const MAX_POSTS_IN_CONTEXT = 6;

function unavailable(reason) {
  return { available: false, thesis: reason, confidence: null, evidence: [], risk_flags: [], model_version: null };
}

// Stesso RAG di fundamentalAgent.js: con una chiave Gemini disponibile, classifica il pool social
// combinato (StockTwits + Reddit) per rilevanza rispetto al contesto della decisione invece dei
// primi N per ordine cronologico. Senza chiave o su qualunque errore, ricade sull'ordine
// cronologico — mai peggio di prima, mai un errore che rompe l'agente.
async function rankByRelevance(apiKey, queryContext, texts, limit) {
  if (!apiKey || !queryContext || texts.length <= limit) return texts.slice(0, limit);
  try {
    const [queryEmbedding, ...textEmbeddings] = await embedBatch(apiKey, [queryContext, ...texts]);
    if (!queryEmbedding) return texts.slice(0, limit);
    const items = texts.map((text, i) => ({ text, embedding: textEmbeddings[i] }));
    const ranked = retrieveTopK(items, queryEmbedding, limit);
    return ranked.length ? ranked.map((r) => r.text) : texts.slice(0, limit);
  } catch {
    return texts.slice(0, limit);
  }
}

// Mappatura ai ticker StockTwits, verificata a mano (endpoint pubblico non ufficiale, nessuna
// chiave, ma non documentato/garantito — puo' smettere di rispondere senza preavviso, a
// differenza di Finnhub). Diversa dai ticker interni per crypto/future/materie prime.
const STOCKTWITS_SYMBOL = {
  AAPL: 'AAPL', NVDA: 'NVDA', SPY: 'SPY', QQQ: 'QQQ', TSLA: 'TSLA', TLT: 'TLT',
  BTCUSD: 'BTC.X', ETHUSD: 'ETH.X', WTI: 'USO', XAUUSD: 'XAUUSD', EURUSD: 'EURUSD', ES: 'ES_F'
};

// Misurato in sessione: l'endpoint risponde davvero (dati reali confermati) ma in modo
// probabilistico — su richieste identiche ripetute, ~1 su 6 e' passata, le altre hanno
// ricevuto un 403 (verosimilmente un WAF/anti-bot a valle, non un blocco fisso). Un solo
// tentativo sottostimerebbe quanto spesso questa fonte e' davvero disponibile — 3 tentativi
// con una piccola pausa alzano la probabilita' di successo senza introdurre un retry infinito.
async function fetchStockTwitsOnce(ticker) {
  const res = await fetch(`https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(ticker)}.json`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AuroraMarkets/1.0)' },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`http ${res.status}`);
  return res.json();
}

async function fetchStockTwits(symbol) {
  const ticker = STOCKTWITS_SYMBOL[symbol];
  if (!ticker) return { source: 'stocktwits', ok: false, reason: `nessun ticker StockTwits mappato per ${symbol}` };
  let data;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      data = await fetchStockTwitsOnce(ticker);
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  if (!data) return { source: 'stocktwits', ok: false, reason: lastError?.message || 'errore sconosciuto' };
  const messages = Array.isArray(data.messages) ? data.messages : [];
  if (!messages.length) return { source: 'stocktwits', ok: false, reason: 'nessun messaggio recente' };
  const tagged = messages.filter((m) => m.entities?.sentiment?.basic);
  const bullish = tagged.filter((m) => m.entities.sentiment.basic === 'Bullish').length;
  const bearish = tagged.filter((m) => m.entities.sentiment.basic === 'Bearish').length;
  return {
    source: 'stocktwits', ok: true, count: messages.length, bullish, bearish, taggedCount: tagged.length,
    // Pool piu' ampio del limite finale (15 su 30 disponibili): serve materiale su cui il
    // retrieval per rilevanza possa davvero scegliere, non solo i primi N cronologici.
    sample: messages.slice(0, 15).map((m) => m.body).filter(Boolean)
  };
}

// Reddit non e' stato verificabile con dati reali durante lo sviluppo (bloccato da un filtro di
// rete locale, non da Reddit stesso — vedi commit) — implementato con lo stesso grado di
// difesa (timeout, try/catch, degrado a "non disponibile") di ogni altra fonte del progetto,
// cosi' se in produzione risponde diventa evidenza reale, se non risponde non rompe nulla.
async function fetchReddit(symbol) {
  const res = await fetch(`https://www.reddit.com/search.json?q=%24${encodeURIComponent(symbol)}&sort=new&limit=10&t=day`, {
    headers: { 'User-Agent': 'web:aurora-markets-research:v1.0 (by /u/aurora_markets_bot)' },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) return { source: 'reddit', ok: false, reason: `http ${res.status}` };
  const data = await res.json();
  const posts = data?.data?.children || [];
  if (!posts.length) return { source: 'reddit', ok: false, reason: 'nessun post recente' };
  return {
    source: 'reddit', ok: true, count: posts.length,
    sample: posts.slice(0, 10).map((p) => p.data?.title).filter(Boolean)
  };
}

// Sentiment social reale (StockTwits pubblico + tentativo Reddit), MAI un gate quantitativo —
// esattamente come fundamentalAgent.js: solo evidenza qualitativa passata al modello principale.
// Dichiarato esplicitamente cosa NON copre: nessuna fonte gratuita/legale esiste per isolare i
// "principali investitori" (richiederebbe un abbonamento a piattaforme di social listening a
// pagamento) ne' per gli studi di analisi tecnica di eToro (API richiede autenticazione partner,
// verificato — nessuno scraping del sito).
export const socialSentimentAgentTool = {
  name: 'social_sentiment',
  config: {
    title: 'Social Sentiment',
    description: 'Recupera messaggi social reali recenti su un simbolo da StockTwits (sempre) e Reddit (se raggiungibile) — evidenza qualitativa, mai un segnale quantitativo.',
    inputSchema: { symbol: z.string(), geminiKey: z.string().nullable().optional(), queryContext: z.string().nullable().optional() },
    outputSchema: {
      available: z.boolean(), thesis: z.string(), confidence: z.number().nullable(),
      evidence: z.array(z.string()), risk_flags: z.array(z.string()), model_version: z.string().nullable()
    }
  },
  async handler({ symbol, geminiKey, queryContext }) {
    const [stocktwits, reddit] = await Promise.allSettled([fetchStockTwits(symbol), fetchReddit(symbol)]);
    const st = stocktwits.status === 'fulfilled' ? stocktwits.value : { ok: false, reason: stocktwits.reason?.message };
    const rd = reddit.status === 'fulfilled' ? reddit.value : { ok: false, reason: reddit.reason?.message };

    if (!st.ok && !rd.ok) return unavailable(`Nessuna fonte social raggiungibile per ${symbol} (StockTwits: ${st.reason}; Reddit: ${rd.reason}).`);

    const pool = [];
    const parts = [];
    if (st.ok) {
      pool.push(...st.sample.map((body) => `[StockTwits] ${body}`));
      parts.push(`StockTwits: ${st.count} messaggi recenti${st.taggedCount ? `, ${st.bullish} rialzisti/${st.bearish} ribassisti su ${st.taggedCount} con tag esplicito` : ', nessun tag sentiment esplicito nel campione'}`);
    }
    if (rd.ok) {
      pool.push(...rd.sample.map((title) => `[Reddit] ${title}`));
      parts.push(`Reddit: ${rd.count} post recenti`);
    }
    const evidence = await rankByRelevance(geminiKey, queryContext, pool, MAX_POSTS_IN_CONTEXT);

    return {
      available: true,
      thesis: `${parts.join(' · ')} — chiacchiericcio social non filtrato per autorevolezza (nessuna fonte gratuita isola i "principali investitori"), mai un segnale quantitativo. ${geminiKey && queryContext ? 'Selezionati per rilevanza semantica.' : 'Ordine cronologico (nessuna chiave Gemini per il retrieval).'}`,
      confidence: null,
      evidence,
      risk_flags: !rd.ok ? ['reddit-unreachable'] : [],
      model_version: 'stocktwits-public-stream+reddit-search-v1'
    };
  }
};
