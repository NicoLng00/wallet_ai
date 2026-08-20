import { z } from 'zod';
import { embedBatch } from '../../lib/embeddings.js';
import { retrieveTopK } from '../../lib/retrieval.js';

const MAX_HEADLINES_IN_CONTEXT = 5;

function unavailable(reason) {
  return { available: false, thesis: reason, confidence: null, evidence: [], risk_flags: ['no-data-source'], model_version: null };
}

// RAG vero, non solo un taglio: se una chiave Gemini e' disponibile, classifica i titoli per
// rilevanza semantica rispetto al contesto della decisione (simbolo + fascia + direzione) invece
// di prendere sempre e solo i primi N in ordine cronologico. Senza chiave, o se l'embedding
// fallisce per qualunque motivo, ricade sull'ordine cronologico esistente — mai un errore, mai un
// risultato peggiore di quello che c'era prima di questa funzione.
async function rankByRelevance(apiKey, queryContext, headlines, limit) {
  if (!apiKey || !queryContext || headlines.length <= limit) return headlines.slice(0, limit);
  try {
    const [queryEmbedding, ...headlineEmbeddings] = await embedBatch(apiKey, [queryContext, ...headlines]);
    if (!queryEmbedding) return headlines.slice(0, limit);
    const items = headlines.map((text, i) => ({ text, embedding: headlineEmbeddings[i] }));
    const ranked = retrieveTopK(items, queryEmbedding, limit);
    return ranked.length ? ranked.map((r) => r.text) : headlines.slice(0, limit);
  } catch {
    return headlines.slice(0, limit);
  }
}

// Notizie reali (Finnhub /company-news, stessa chiave gratuita gia' supportata per le quotazioni
// live). Solo per titoli azionari (Finnhub non copre crypto/forex/commodity su questo endpoint).
// Il sentiment resta qualitativo: le notizie sono passate come evidenza al modello principale,
// MAI un gate quantitativo — non ha senso "backtestare" un titolo di giornale.
export const fundamentalAgentTool = {
  name: 'fundamental',
  config: {
    title: 'Fundamental Scan',
    description: 'Recupera i titoli di notizie recenti reali su un simbolo azionario da Finnhub, se una chiave e\' disponibile.',
    inputSchema: {
      symbol: z.string(),
      finnhubKey: z.string().nullable().optional(),
      isStock: z.boolean().default(false),
      geminiKey: z.string().nullable().optional(),
      queryContext: z.string().nullable().optional()
    },
    outputSchema: {
      available: z.boolean(),
      thesis: z.string(),
      confidence: z.number().nullable(),
      evidence: z.array(z.string()),
      risk_flags: z.array(z.string()),
      model_version: z.string().nullable()
    }
  },
  async handler({ symbol, finnhubKey, isStock, geminiKey, queryContext }) {
    if (!isStock) return unavailable(`Nessuna fonte di notizie gratuita per ${symbol} (solo titoli azionari su Finnhub).`);
    if (!finnhubKey) return unavailable('Nessuna chiave Finnhub disponibile per le notizie.');
    // Earnings imminenti (Finnhub /calendar/earnings, stessa chiave) — evidenza ADDITIVA, mai un
    // motivo per far fallire l'intero agente se le notizie sono disponibili ma il calendario no
    // (o viceversa). Forma della risposta VERIFICATA con una chiave Finnhub reale in sessione:
    // {"earningsCalendar":[{symbol,date,hour,quarter,year,epsEstimate,epsActual,revenueEstimate,
    // revenueActual}]} — a differenza di /calendar/economic (vedi macroCalendarAgent.js), questo
    // endpoint e' incluso nel piano gratuito e ha risposto 200 con dati reali.
    const earningsPromise = (async () => {
      try {
        const from = new Date().toISOString().slice(0, 10);
        const to = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
        const url = `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(finnhubKey)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) return null;
        const data = await res.json();
        const upcoming = Array.isArray(data?.earningsCalendar) ? data.earningsCalendar[0] : null;
        return upcoming?.date ? `Earnings ${symbol} previste il ${upcoming.date}${upcoming.hour ? ` (${upcoming.hour})` : ''} — volatilità attesa in aumento in prossimità della data.` : null;
      } catch {
        return null;
      }
    })();
    try {
      const to = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${encodeURIComponent(finnhubKey)}`;
      const res = await fetch(url);
      if (!res.ok) return unavailable(`Finnhub news non disponibile (http ${res.status}).`);
      const items = await res.json();
      const earningsNote = await earningsPromise;
      if (!Array.isArray(items) || !items.length) {
        if (!earningsNote) return unavailable(`Nessuna notizia recente trovata per ${symbol}.`);
        return { available: true, thesis: earningsNote, confidence: null, evidence: [earningsNote], risk_flags: ['earnings-imminent'], model_version: 'finnhub-earnings-calendar' };
      }
      // Pool piu' ampio del limite finale (15, non 5): senza un pool da cui scegliere, non c'e'
      // nulla su cui il retrieval per rilevanza possa lavorare — sarebbe solo un taglio travestito.
      const pool = items.slice(0, 15).map((item) => item.headline).filter(Boolean);
      const headlines = await rankByRelevance(geminiKey, queryContext, pool, MAX_HEADLINES_IN_CONTEXT);
      return {
        available: true,
        thesis: `${headlines.length} titoli di notizie recenti reali disponibili per ${symbol} (ultimi 7 giorni, ${geminiKey && queryContext ? 'selezionati per rilevanza' : 'ordine cronologico'}) — sentiment qualitativo, non backtestato.${earningsNote ? ` ${earningsNote}` : ''}`,
        confidence: null,
        evidence: earningsNote ? [earningsNote, ...headlines] : headlines,
        risk_flags: earningsNote ? ['earnings-imminent'] : [],
        model_version: 'finnhub-company-news'
      };
    } catch (error) {
      return unavailable(`Errore nel recuperare le notizie: ${error.message}`);
    }
  }
};
