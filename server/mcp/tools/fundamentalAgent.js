import { z } from 'zod';

function unavailable(reason) {
  return { available: false, thesis: reason, confidence: null, evidence: [], risk_flags: ['no-data-source'], model_version: null };
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
      isStock: z.boolean().default(false)
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
  async handler({ symbol, finnhubKey, isStock }) {
    if (!isStock) return unavailable(`Nessuna fonte di notizie gratuita per ${symbol} (solo titoli azionari su Finnhub).`);
    if (!finnhubKey) return unavailable('Nessuna chiave Finnhub disponibile per le notizie.');
    try {
      const to = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${encodeURIComponent(finnhubKey)}`;
      const res = await fetch(url);
      if (!res.ok) return unavailable(`Finnhub news non disponibile (http ${res.status}).`);
      const items = await res.json();
      if (!Array.isArray(items) || !items.length) return unavailable(`Nessuna notizia recente trovata per ${symbol}.`);
      const headlines = items.slice(0, 5).map((item) => item.headline).filter(Boolean);
      return {
        available: true,
        thesis: `${headlines.length} titoli di notizie recenti reali disponibili per ${symbol} (ultimi 7 giorni) — sentiment qualitativo, non backtestato.`,
        confidence: null,
        evidence: headlines,
        risk_flags: [],
        model_version: 'finnhub-company-news'
      };
    } catch (error) {
      return unavailable(`Errore nel recuperare le notizie: ${error.message}`);
    }
  }
};
