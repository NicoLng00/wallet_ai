// Job "setup giornaliero": ri-scarica lo storico reale e rigira il backtest walk-forward per
// tutti i simboli della watchlist (stesso motore del browser, src/) — aggiorna validated e
// historyCache. Non genera mai trackRecord/tradeEpisodes/lessons (di proprieta' del job "ciclo
// di trading", tradingCycle.js: quelli sono la memoria del Learning Loop, non si azzerano ogni
// giorno) — ma li ARCHIVIA quando crescono oltre la finestra che il motore live guarda davvero
// (Fase 2 della roadmap di ottimizzazione, vedi lib/archival.js): mai un reset, solo uno
// spostamento dei trade/episodi piu' vecchi fuori dal file servito ad ogni visitatore.
// Pensato per girare una volta al giorno via GitHub Actions, prima dell'apertura dei mercati USA.
import { buildDriverHtml } from './lib/driverTemplate.js';
import { runDriverAndGetOutput, writeTempDriverFile, removeDriverFile } from './lib/chromeRunner.js';
import { startBackend, stopBackend } from './lib/backendProcess.js';
import { readResearchState, writeResearchState, appendValidationHistory, computeValidationStreak, readArchiveState, writeArchiveState } from './lib/stateStore.js';
import { archiveTrackRecord, archiveEpisodes } from '../lib/archival.js';

// Il backtest walk-forward ha bisogno dello storico intero (fino a 2 anni) per validare, ma la
// SOLA generazione del segnale in tempo reale (evaluateCandidates in engine/rules.js) ha bisogno
// solo dell'ultima finestra — 150 barre coprono ampiamente il warmup piu' lungo (SMA50) con
// margine. Senza questo taglio, data/research.json arrivava a >1.3MB e sarebbe stato riscritto e
// committato ogni 15 minuti dal job "ciclo di trading" — insostenibile per la storia del repo.
const LIVE_LOOKBACK_BARS = 150;
function truncateHistoryCache(historyCache) {
  const truncated = {};
  Object.entries(historyCache).forEach(([symbol, timeframes]) => {
    truncated[symbol] = {};
    Object.entries(timeframes).forEach(([timeframe, entry]) => {
      const cut = Math.max(0, (entry.closes?.length || 0) - LIVE_LOOKBACK_BARS);
      truncated[symbol][timeframe] = {
        ...entry,
        closes: entry.closes ? entry.closes.slice(cut) : entry.closes,
        candles: entry.candles ? entry.candles.slice(cut) : entry.candles,
        dates: entry.dates ? entry.dates.slice(cut) : entry.dates
      };
    });
  });
  return truncated;
}

async function main() {
  const research = readResearchState();
  const backend = await startBackend(); // serve da proxy Yahoo Finance per azioni/ETF/materie prime
  try {
    const injections = {
      'aurora-research-v1': (research.researchData && Object.keys(research.researchData.validated || {}).length)
        ? { alphaVantageKey: null, ...research.researchData }
        : null,
      'aurora-history-v1': (research.historyCache && Object.keys(research.historyCache).length) ? research.historyCache : null
    };

    const tailScript = `
(async function () {
  const Models = Aurora.Models;
  // Proxy catch-all invece di una lista esplicita (bug reale trovato in tradingCycle.js: una
  // funzione Views mancante dalla lista faceva fallire una chiamata reale a meta' — vedi li' per
  // il dettaglio). Qualunque funzione Views chiamata e' un no-op sicuro.
  Aurora.Views = new Proxy({}, { get: () => function () {} });
  Aurora.Utils.$ = function () {
    return {
      textContent: '', value: '', className: '', style: {},
      classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
      closest: () => ({ classList: { toggle() {} } }),
      addEventListener() {}
    };
  };

  const symbols = Object.keys(Models.instruments);
  const results = {};
  for (const symbol of symbols) {
    try {
      await Aurora.Services.runResearchBacktest(symbol);
      const entry = Models.researchData.validated[symbol];
      const candidateCount = entry ? Object.keys(entry.candidates).length : 0;
      const validatedCount = entry ? Object.values(entry.candidates).filter((c) => c.validated).length : 0;
      results[symbol] = { candidateCount, validatedCount };
    } catch (e) {
      results[symbol] = { error: String(e && e.message || e) };
    }
  }

  const output = {
    setupResults: results,
    researchData: {
      validated: Models.researchData.validated,
      trackRecord: Models.researchData.trackRecord,
      tradeEpisodes: Models.researchData.tradeEpisodes,
      lessons: Models.researchData.lessons
    },
    historyCache: Models.historyCache
  };
  document.body.insertAdjacentHTML('beforeend', '<pre id="output"></pre>');
  document.getElementById('output').textContent = JSON.stringify(output);
})();
`;

    const html = buildDriverHtml({ injections, tailScript });
    const driverPath = writeTempDriverFile(html, 'daily-setup.html');
    let output;
    try {
      // 9 simboli, ciascuno con piu' fetch reali (storico + eventuale orario/OHLC), ognuna con un
      // proprio timeout di 15s (dataProviders.js) — 5 minuti restano ampio margine anche nel
      // caso peggiore in cui ogni singola fetch vada in timeout.
      output = await runDriverAndGetOutput(driverPath, { timeoutMs: 300000 });
    } finally {
      removeDriverFile(driverPath);
    }

    // Storia longitudinale delle validazioni: senza questo, ogni run sovrascrive la precedente e
    // non c'e' modo di sapere se un edge e' persistente o e' rumore statistico di un solo giorno.
    // Un record al giorno (idempotente: piu' run nello stesso giorno solare sostituiscono, non
    // duplicano), poi lo streak di giorni consecutivi validati va nel candidato stesso in
    // research.json, cosi' la UI esistente (Research) lo mostra senza dover leggere un file in piu'.
    const todayStr = new Date().toISOString().slice(0, 10);
    const todaySnapshot = {};
    Object.entries(output.researchData.validated).forEach(([symbol, entry]) => {
      todaySnapshot[symbol] = Object.entries(entry.candidates)
        .filter(([, candidate]) => candidate.validated)
        .map(([key]) => key);
    });
    const validationDays = appendValidationHistory(todayStr, todaySnapshot);
    const validatedWithStreak = {};
    Object.entries(output.researchData.validated).forEach(([symbol, entry]) => {
      const candidates = {};
      Object.entries(entry.candidates).forEach(([key, candidate]) => {
        candidates[key] = candidate.validated
          ? { ...candidate, validatedStreakDays: computeValidationStreak(validationDays, symbol, key) }
          : candidate;
      });
      validatedWithStreak[symbol] = { candidates };
    });

    // Ri-legge trackRecord/tradeEpisodes/lessons appena prima di scrivere: questo job non li
    // genera mai (il backtest walk-forward non chiude trade reali), quindi non deve rischiare di
    // sovrascrivere con una copia più vecchia ciò che tradingCycle.js ha aggiornato nel frattempo.
    const freshResearch = readResearchState();

    // Archiviazione (Fase 2): solo i trade/episodi PIU' VECCHI della finestra che il motore live
    // legge davvero vengono spostati — verificato con dati sintetici (server/tests/archival.test.js)
    // che questo non cambia MAI il risultato di survivesLiveTrackRecord sugli stessi dati.
    const archive = readArchiveState();
    const { trackRecord: trimmedTrackRecord, archivedCount: archivedTrades } = archiveTrackRecord(freshResearch.researchData.trackRecord, archive);
    const { tradeEpisodes: trimmedEpisodes, archivedCount: archivedEpisodes } = archiveEpisodes(freshResearch.researchData.tradeEpisodes, archive);
    if (archivedTrades > 0 || archivedEpisodes > 0) {
      writeArchiveState(archive);
      console.log(`Archiviati ${archivedTrades} trade e ${archivedEpisodes} episodi in data/research-archive.json.`);
    }

    writeResearchState({
      researchData: {
        validated: validatedWithStreak,
        trackRecord: trimmedTrackRecord,
        tradeEpisodes: trimmedEpisodes,
        lessons: freshResearch.researchData.lessons
      },
      historyCache: truncateHistoryCache(output.historyCache)
    });

    console.log('Setup giornaliero completato:', JSON.stringify(output.setupResults));
  } finally {
    stopBackend(backend);
  }
}

main().catch((error) => {
  console.error('Setup giornaliero fallito:', error.message);
  process.exit(1);
});
