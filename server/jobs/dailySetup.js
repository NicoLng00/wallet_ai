// Job "setup giornaliero": ri-scarica lo storico reale e rigira il backtest walk-forward per
// tutti i simboli della watchlist (stesso motore del browser, src/) — aggiorna validated e
// historyCache. Non tocca trackRecord/tradeEpisodes/lessons (di proprieta' del job "ciclo di
// trading", tradingCycle.js): quelli sono la memoria del Learning Loop, non si azzerano ogni
// giorno. Pensato per girare una volta al giorno via GitHub Actions, prima dell'apertura dei
// mercati USA.
import { buildDriverHtml } from './lib/driverTemplate.js';
import { runDriverAndGetOutput, writeTempDriverFile, removeDriverFile } from './lib/chromeRunner.js';
import { startBackend, stopBackend } from './lib/backendProcess.js';
import { readResearchState, writeResearchState } from './lib/stateStore.js';

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
  Aurora.Views = Aurora.Views || {};
  ['renderResearchResults','renderMemoryHistory','renderMemoryLessons','showToast'].forEach((fn) => { Aurora.Views[fn] = function () {}; });
  Aurora.Utils.$ = function () { return { textContent: '', value: '', className: '' }; };

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
      // 9 simboli, ciascuno con piu' fetch reali (storico + eventuale orario/OHLC) — su un runner
      // GitHub Actions la latenza reale verso Yahoo Finance/CoinGecko e' risultata piu' alta che
      // in locale: il primo run reale e' fallito con ETIMEDOUT a 180s. Budget alzato con margine.
      output = runDriverAndGetOutput(driverPath, { virtualTimeBudgetMs: 240000, timeoutMs: 480000 });
    } finally {
      removeDriverFile(driverPath);
    }

    // Ri-legge trackRecord/tradeEpisodes/lessons appena prima di scrivere: questo job non li
    // genera mai (il backtest walk-forward non chiude trade reali), quindi non deve rischiare di
    // sovrascrivere con una copia più vecchia ciò che tradingCycle.js ha aggiornato nel frattempo.
    const freshResearch = readResearchState();
    writeResearchState({
      researchData: {
        validated: output.researchData.validated,
        trackRecord: freshResearch.researchData.trackRecord,
        tradeEpisodes: freshResearch.researchData.tradeEpisodes,
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
