import { GEMINI_MODEL } from '../lib/geminiConfig.js';

// Gemello di providers/gemini.js: stessa meccanica (retry sui 5xx transitori, output JSON
// strutturato via responseSchema, stesso parsing/validazione) — SOLO il testo del prompt cambia,
// per descrivere il set di agenti reale di venom (liquidity_model e venom_news al posto di
// fundamental/social_sentiment/macro_calendar) invece di lasciare un prompt che nomina agenti che
// per questa pipeline non esistono.
const TRANSIENT_RETRY_DELAYS_MS = [3000, 6000];

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

export async function callVenomGemini({ apiKey, context }) {
  if (!apiKey) throw new Error('Chiave Gemini mancante.');
  const prompt = `Sei un analista che valuta azioni di club calcistici europei quotati in borsa per un conto demo di paper trading educativo (nessun ordine reale, nessuna consulenza finanziaria). `
    + `Per ciascun club ricevi: prezzo in EUR e variazione percentuale, la tesi dell'agente Technical Analyst (strategia VALIDATA walk-forward, ESPLORATIVA — edge promettente ma non ancora confermato fuori campione — oppure SONDA — nessun edge misurato, taglia minima solo per generare dati di apprendimento; puo' includere lezioni da trade passati del Learning Loop), `
    + `lo stato dell'agente Risk Manager (esposizione/drawdown del conto), l'agente Liquidity Model (proxy di liquidita' reale da volume di mercato: un titolo poco liquido ha spread ed esecuzione peggiori anche con un segnale tecnico corretto — mai un gate, solo un motivo per essere piu' cauti sulla dimensione), eventuali segnalazioni di concentrazione da correlazione dall'agente Hedge, eventuali segnalazioni di volatilita' anomala reale (ATR) dall'agente Market Regime, e notizie pubbliche reali recenti sul club (trasferimenti, formazioni, risultati, dichiarazioni) dall'agente Venom News — qualitativo, mai backtestato, mai un proxy di analisti professionali. `
    + `Questi titoli sono strutturalmente diversi da azioni ordinarie: il prezzo puo' muoversi per notizie di calciomercato, risultati sportivi, qualificazioni a competizioni internazionali — eventi che nessun indicatore tecnico cattura da solo, per questo l'evidenza qualitativa (Venom News) ha un peso relativo maggiore che su un'azione ordinaria. Sii proporzionalmente piu' cauto nella confidenza quando la strategia e' esplorativa, e ancora piu' cauto quando e' una sonda o il titolo e' segnalato poco liquido. Valuta se il quadro complessivo appare favorevole a una posizione long a breve termine. `
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
