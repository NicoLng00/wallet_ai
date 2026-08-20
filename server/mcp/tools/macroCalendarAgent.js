import { z } from 'zod';

function unavailable(reason) {
  return { available: false, thesis: reason, confidence: null, evidence: [], risk_flags: [], model_version: null };
}

// Eventi macro reali (Finnhub /calendar/economic, stessa chiave gratuita gia' supportata) nei
// prossimi giorni — a differenza di fundamentalAgent.js (notizie per singolo titolo azionario),
// questo si applica a QUALUNQUE simbolo: FOMC/CPI/NFP muovono EURUSD/XAUUSD/ES/TLT/WTI quanto o
// piu' di un titolo azionario, ed erano l'unico contesto reale del progetto a cui il modello non
// aveva mai accesso.
// VERIFICATO CON UNA CHIAVE FINNHUB REALE (piano gratuito): l'endpoint risponde 403 "You don't
// have access to this resource" — /calendar/economic e' riservato ai piani a pagamento di
// Finnhub, non solo temporaneamente non raggiungibile. Con una chiave free questo agente e' quindi
// SEMPRE available:false in pratica, non per un bug ma per un limite reale del piano gratuito —
// il fallback sotto (`!res.ok -> unavailable`) lo gestisce correttamente, senza crash e senza dati
// inventati, ma va dichiarato onestamente nella documentazione invece di presentarlo come un
// agente con dati reali sempre disponibili.
// Solo eventi ad alto impatto dichiarato da Finnhub (impact: 3, la scala e' 1-3) — un calendario
// pieno di dati macro minori sarebbe rumore, non evidenza.
export const macroCalendarAgentTool = {
  name: 'macro_calendar',
  config: {
    title: 'Macro Calendar',
    description: 'Recupera eventi macroeconomici reali ad alto impatto nei prossimi giorni (FOMC, CPI, NFP...) da Finnhub — evidenza qualitativa per qualunque simbolo, mai un gate quantitativo.',
    inputSchema: { finnhubKey: z.string().nullable().optional() },
    outputSchema: {
      available: z.boolean(), thesis: z.string(), confidence: z.number().nullable(),
      evidence: z.array(z.string()), risk_flags: z.array(z.string()), model_version: z.string().nullable()
    }
  },
  async handler({ finnhubKey }) {
    if (!finnhubKey) return unavailable('Nessuna chiave Finnhub disponibile per il calendario macro.');
    try {
      const from = new Date().toISOString().slice(0, 10);
      const to = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
      const url = `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${encodeURIComponent(finnhubKey)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return unavailable(`Finnhub calendario economico non disponibile (http ${res.status}).`);
      const data = await res.json();
      const events = Array.isArray(data?.economicCalendar) ? data.economicCalendar : [];
      const highImpact = events.filter((e) => Number(e.impact) >= 3).slice(0, 8);
      if (!highImpact.length) return unavailable('Nessun evento macro ad alto impatto nei prossimi 5 giorni.');
      const evidence = highImpact.map((e) => `${e.time || e.date || '?'} · ${e.country || ''} ${e.event || 'evento'}${e.estimate != null ? ` (stima ${e.estimate})` : ''}`);
      return {
        available: true,
        thesis: `${highImpact.length} eventi macro ad alto impatto nei prossimi 5 giorni (FOMC/CPI/NFP e simili) — possono muovere prezzo e volatilità indipendentemente da qualunque segnale tecnico, specialmente su forex/materie prime/obbligazioni/future indice.`,
        confidence: null,
        evidence,
        risk_flags: ['macro-event-window'],
        model_version: 'finnhub-economic-calendar'
      };
    } catch (error) {
      return unavailable(`Errore nel recuperare il calendario macro: ${error.message}`);
    }
  }
};
