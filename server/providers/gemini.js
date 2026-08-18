const GEMINI_MODEL = 'gemini-3.5-flash';
const TRANSIENT_RETRY_DELAYS_MS = [3000, 6000];

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

// Stessa chiamata già verificata funzionante lato browser in sessione, ora lato server:
// una sola richiesta batched per l'intero watchlist, output JSON strutturato via
// responseSchema (niente parsing fragile di testo libero), retry sugli errori 5xx transitori.
export async function callGemini({ apiKey, context }) {
  if (!apiKey) throw new Error('Chiave Gemini mancante.');
  const prompt = `Sei un analista che valuta titoli per un conto demo di paper trading educativo (nessun ordine reale, nessuna consulenza finanziaria). `
    + `Per ciascuno di questi simboli ricevi: prezzo e variazione percentuale simulata, la tesi dell'agente Technical Analyst (se disponibile, basata su una strategia validata walk-forward oppure ESPLORATIVA — edge promettente ma non ancora confermato fuori campione per carenza di dati, mai spacciata per validata; puo' includere lezioni apprese da trade passati con quella stessa strategia, dal Learning Loop), `
    + `lo stato dell'agente Risk Manager (esposizione/drawdown del conto), eventuali titoli di notizie reali recenti dall'agente Fundamental (se disponibili, solo qualitativo, non validato da backtest), `
    + `eventuali segnalazioni di concentrazione da correlazione dall'agente Hedge, ed eventuali segnalazioni di volatilita' anomala reale (ATR) dall'agente Market Regime (se disponibili). Se la strategia e' esplorativa o ci sono lezioni su fallimenti ricorrenti, sii proporzionalmente piu' cauto nella confidenza. Valuta se il quadro complessivo appare favorevole a una posizione long a breve termine. `
    + `Dati: ${JSON.stringify(context)}. `
    + `Rispondi SOLO con l'array JSON richiesto, un elemento per simbolo.`;
  const schema = {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        symbol: { type: 'STRING' },
        bullish: { type: 'BOOLEAN' },
        defensive: { type: 'BOOLEAN' },
        confidence: { type: 'INTEGER' },
        rationale: { type: 'STRING' }
      },
      required: ['symbol', 'bullish', 'defensive', 'confidence', 'rationale']
    }
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema }
  });

  let res;
  for (let attempt = 0; ; attempt += 1) {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body });
    const transient = res.status === 502 || res.status === 503 || res.status === 504;
    if (transient && attempt < TRANSIENT_RETRY_DELAYS_MS.length) { await wait(TRANSIENT_RETRY_DELAYS_MS[attempt]); continue; }
    break;
  }
  if (res.status === 429) throw new Error('Limite richieste Gemini raggiunto, riprova tra 60s.');
  if (!res.ok) throw new Error(`Errore Gemini (http ${res.status})`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Risposta Gemini vuota o inattesa.');
  const parsed = JSON.parse(text);
  const fetchedAt = new Date().toISOString();
  const signals = {};
  parsed.forEach((entry) => {
    if (!entry || typeof entry.symbol !== 'string') return;
    signals[entry.symbol] = {
      bullish: !!entry.bullish,
      defensive: !!entry.defensive,
      confidence: Math.min(95, Math.max(20, Number(entry.confidence) || 50)),
      rationale: String(entry.rationale || '').slice(0, 400),
      fetchedAt
    };
  });
  return signals;
}
