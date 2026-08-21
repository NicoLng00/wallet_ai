import { z } from 'zod';
import { parseRssItems } from '../../lib/rssParser.js';

const MAX_HEADLINES = 8;
const RECENT_WINDOW_HOURS = 72;

function unavailable(reason) {
  return { available: false, thesis: reason, confidence: null, evidence: [], risk_flags: ['no-data-source'], model_version: null };
}

// Notizie reali per i club calcistici venom, dove Finnhub non arriva (403 confermato in sessione
// per JUVE.MI, ne' quote ne' news). Google News RSS non richiede chiave ed e' verificato dal vivo
// in sessione su piu' lingue (italiano/Juventus, tedesco/Dortmund) — restituisce testate sportive
// reali (Gazzetta, Tuttosport, Sportmediaset, Goal.com...), esattamente le fonti richieste
// esplicitamente ("social e pagine delle squadre, o Gazzetta etc."). La query e' mirata per lingua
// nativa del club (venomState.js, newsQuery/newsLocale) invece di una ricerca generica in inglese —
// la parte "ricerca intelligente" della richiesta originale, senza toccare informazioni personali.
// NOTA legale dichiarata, non nascosta: i termini pubblicati del feed Google News RSS lo limitano
// a "uso personale non commerciale in un feed reader" — coerente con lo stato attuale del progetto
// (ricerca/paper trading, nessuna esecuzione reale), da rivalutare se mai si passasse a un uso
// commerciale/con denaro reale.
export const venomNewsAgentTool = {
  name: 'venom_news',
  config: {
    title: 'Venom News Scan',
    description: 'Notizie pubbliche reali sul club (Google News RSS, query nella lingua nativa del club) — mai un gate quantitativo, evidenza qualitativa per il modello.',
    inputSchema: {
      symbol: z.string(),
      clubName: z.string(),
      locale: z.object({ hl: z.string(), gl: z.string(), ceid: z.string() })
    },
    outputSchema: {
      available: z.boolean(), thesis: z.string(), confidence: z.number().nullable(),
      evidence: z.array(z.string()), risk_flags: z.array(z.string()), model_version: z.string().nullable()
    }
  },
  async handler({ symbol, clubName, locale }) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(clubName)}&hl=${locale.hl}&gl=${locale.gl}&ceid=${locale.ceid}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return unavailable(`Google News RSS non disponibile per ${symbol} (http ${res.status}).`);
      const xml = await res.text();
      const items = parseRssItems(xml, MAX_HEADLINES);
      if (!items.length) return unavailable(`Nessuna notizia recente trovata per ${clubName}.`);

      const now = Date.now();
      const recentCount = items.filter((item) => {
        const t = item.pubDate ? Date.parse(item.pubDate) : NaN;
        return Number.isFinite(t) && (now - t) <= RECENT_WINDOW_HOURS * 3600000;
      }).length;

      // Google News mette gia' " - NomeFonte" in coda al titolo (verificato dal vivo su piu'
      // lingue/club) — appendere di nuovo item.source duplicherebbe la fonte nell'evidenza.
      const evidence = items.map((item) => {
        const suffix = item.source ? ` - ${item.source}` : null;
        const alreadyHasSource = suffix && item.title.endsWith(suffix);
        return alreadyHasSource || !item.source ? item.title : `${item.title} (${item.source})`;
      });
      return {
        available: true,
        thesis: `${items.length} notizie reali trovate per ${clubName} (${recentCount} nelle ultime ${RECENT_WINDOW_HOURS / 24} giornate) — sentiment/eventi qualitativi (trasferimenti, formazioni, risultati), mai backtestati.`,
        confidence: null,
        evidence,
        risk_flags: recentCount >= 4 ? ['high-news-volume'] : [],
        model_version: 'google-news-rss-v1'
      };
    } catch (error) {
      return unavailable(`Errore nel recuperare le notizie per ${symbol}: ${error.message}`);
    }
  }
};
