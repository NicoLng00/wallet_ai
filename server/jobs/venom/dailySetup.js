// Job "setup giornaliero" della pipeline venom — gemello di server/jobs/dailySetup.js, stesso
// motore (backtest walk-forward reale, src/), stato/dati completamente separati (data/venom/*.json,
// venomState.js al posto di state.js). Ri-scarica lo storico reale e rigira il backtest per i 13
// club calcistici europei verificati, aggiorna validated/historyCache in data/venom/research.json.
// Deliberatamente senza archiviazione/streak di validazione ancora (vedi venomStateStore.js): da
// aggiungere quando servira' davvero, non per simmetria preventiva col sistema principale.
import { buildDriverHtml, VENOM_ENGINE_SCRIPTS } from '../lib/driverTemplate.js';
import { runDriverAndGetOutput, writeTempDriverFile, removeDriverFile } from '../lib/chromeRunner.js';
import { startBackend, stopBackend } from '../lib/backendProcess.js';
import { readResearchState, writeResearchState } from '../lib/venomStateStore.js';

// Stesso taglio di dailySetup.js principale, stessa motivazione (il backtest ha bisogno dello
// storico intero per validare, il segnale live no) — 150 barre coprono il warmup piu' lungo
// (SMA50) con margine, senza far crescere data/venom/research.json senza limite.
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
  const backend = await startBackend(); // proxy Yahoo per i 13 ticker europei (server/marketData.js, VENOM_CLUB_SYMBOLS)
  try {
    const injections = {
      'aurora-venom-research-v1': (research.researchData && Object.keys(research.researchData.validated || {}).length)
        ? { alphaVantageKey: null, ...research.researchData }
        : null,
      'aurora-venom-history-v1': (research.historyCache && Object.keys(research.historyCache).length) ? research.historyCache : null
    };

    const tailScript = `
(async function () {
  const Models = Aurora.Models;
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

    const html = buildDriverHtml({ injections, tailScript, engineScripts: VENOM_ENGINE_SCRIPTS });
    const driverPath = writeTempDriverFile(html, 'venom-daily-setup.html');
    let output;
    try {
      // 13 simboli, ciascuno con una sola fetch storica (nessun orario/OHLC extra come per crypto/ORB
      // nel sistema principale) — margine ampio anche nel caso peggiore.
      output = await runDriverAndGetOutput(driverPath, { timeoutMs: 300000 });
    } finally {
      removeDriverFile(driverPath);
    }

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

    console.log('Venom — setup giornaliero completato:', JSON.stringify(output.setupResults));
  } finally {
    stopBackend(backend);
  }
}

main().catch((error) => {
  console.error('Venom — setup giornaliero fallito:', error.message);
  process.exit(1);
});
