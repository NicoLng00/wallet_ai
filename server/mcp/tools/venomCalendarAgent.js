import { z } from 'zod';
import { parseRssItems } from '../../lib/rssParser.js';

const MAX_ITEMS = 6;

function unavailable(reason) {
  return { available: false, thesis: reason, confidence: null, evidence: [], risk_flags: ['no-data-source'], model_version: null };
}

// Calendario partite/impegni per i club venom — ultimo vuoto della roadmap.
// Provato PRIMA con fonti di calendario strutturate reali (football-data.org, TheSportsDB, ESPN
// unofficial): tutte e tre irraggiungibili dalla rete di sviluppo usata in sessione (stesso
// errore TLS "self-signed certificate in certificate chain" gia' visto con Frankfurter.app — le
// tre hanno in comune host su Cloudflare/IP dedicati diversi da Yahoo/Google, verificato con
// nslookup: probabile intercettazione TLS aziendale su quelle specifiche destinazioni, non un
// problema dei servizi in se'). I runner di GitHub Actions (dove il job gira davvero in
// produzione) non passano da questo proxy aziendale — potrebbero funzionare li' anche se non
// verificabili da qui: se in futuro si vuole tentare football-data.org, verificarlo con un vero
// workflow_dispatch prima di fidarsene, non assumerlo dal successo locale (che qui non c'e' mai
// stato) ne' dal fallimento locale.
// Soluzione scelta, verificata dal vivo per davvero: stessa infrastruttura di venomNewsAgent.js
// (Google News RSS, gia' provata affidabile), con una query mirata a calendario/prossima partita
// nella lingua nativa del club invece che a notizie generiche — reale, non strutturato come una
// vera API di fixture (niente data/ora esatta parsabile), ma verificabile qui e ora, su tutte le
// lingue coinvolte incluso il turco (verificato dal vivo: risultati reali sul sorteggio del
// calendario 2026-27 di Fenerbahce/Galatasaray/Besiktas/Trabzonspor).
const CALENDAR_QUERY_SUFFIX = {
  it: 'calendario partite prossima giornata',
  de: 'Spielplan Termine nächstes Spiel',
  'en-GB': 'fixtures schedule next match',
  nl: 'wedstrijdschema programma',
  tr: 'fikstür maç programı',
  'pt-PT': 'calendário jogos próximo jogo'
};

export const venomCalendarAgentTool = {
  name: 'venom_calendar',
  config: {
    title: 'Venom Calendar',
    description: 'Notizie pubbliche reali su calendario/prossime partite del club (Google News RSS, query calendario nella lingua nativa) — mai un gate quantitativo, evidenza qualitativa per il modello.',
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
    const suffix = CALENDAR_QUERY_SUFFIX[locale.hl];
    if (!suffix) return unavailable(`Nessuna query calendario definita per la lingua "${locale.hl}".`);
    try {
      const query = `${clubName} ${suffix}`;
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${locale.hl}&gl=${locale.gl}&ceid=${locale.ceid}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return unavailable(`Google News RSS non disponibile per il calendario di ${symbol} (http ${res.status}).`);
      const xml = await res.text();
      const items = parseRssItems(xml, MAX_ITEMS);
      if (!items.length) return unavailable(`Nessuna notizia di calendario recente trovata per ${clubName}.`);
      const evidence = items.map((item) => item.title);
      return {
        available: true,
        thesis: `${items.length} notizie reali su calendario/prossime partite di ${clubName} — un impegno imminente (specie in coppe europee o derby) puo' aumentare volatilita' e volume indipendentemente dal segnale tecnico, mai una direzione da solo.`,
        confidence: null,
        evidence,
        risk_flags: [],
        model_version: 'google-news-rss-calendar-v1'
      };
    } catch (error) {
      return unavailable(`Errore nel recuperare il calendario per ${symbol}: ${error.message}`);
    }
  }
};
