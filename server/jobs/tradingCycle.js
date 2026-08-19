// Job "ciclo di trading": un passaggio dell'Autopilot reale (stesso motore del browser, src/),
// con prezzi live quando disponibili e giudizio Gemini quando la chiave e' configurata. Pensato
// per girare ogni ~15 minuti via GitHub Actions. Non tocca validated/historyCache (di proprieta'
// del job "setup giornaliero", dailySetup.js) — solo il conto demo e il track record/Learning Loop.
import { buildDriverHtml } from './lib/driverTemplate.js';
import { runDriverAndGetOutput, writeTempDriverFile, removeDriverFile } from './lib/chromeRunner.js';
import { readAccountState, writeAccountState, readResearchState, writeResearchState } from './lib/stateStore.js';

async function main() {
  const account = readAccountState();
  const research = readResearchState();

  const geminiKey = process.env.GEMINI_API_KEY || null;
  const finnhubKey = process.env.FINNHUB_API_KEY || null;

  const injections = {
    'aurora-demo-account-v2': account.demoAccount ? { version: 2, ...account.demoAccount } : null,
    'aurora-research-v1': (research.researchData && Object.keys(research.researchData.validated || {}).length)
      ? { alphaVantageKey: null, ...research.researchData }
      : null, // niente storico di ricerca ancora: lascia agire il fallback al seed reale locale
    'aurora-history-v1': (research.historyCache && Object.keys(research.historyCache).length) ? research.historyCache : null,
    'aurora-ai-engine-v1': { mode: geminiKey ? 'gemini' : 'rule', geminiKey },
    'aurora-live-data-v1': { enabled: true, finnhubKey },
    'aurora-autopilot-mode-v1': { mode: account.autopilotMode || 'coverage' }
  };

  const tailScript = `
(async function () {
  const Models = Aurora.Models;
  Aurora.Views = Aurora.Views || {};
  ['renderDemoAccount','renderWalletOverview','updateQuoteUI','renderWatchlist','renderActivity','updateOrderEstimate','renderChartLevelsOverlay','showAnalysis','showToast','renderMemoryHistory','renderMemoryLessons'].forEach((fn) => { Aurora.Views[fn] = function () {}; });
  Aurora.Utils.$ = function (id) { return document.getElementById(id) || { textContent: '', value: '', className: '', closest: () => ({ classList: { toggle() {} } }) }; };
  Models.autopilotRunning = true;

  try { if (Models.liveData.enabled) await Aurora.Services.refreshLiveQuotes(); }
  catch (e) { Models.activity.unshift({ title: 'Prezzi live non disponibili', detail: String(e && e.message || e), tag: 'JOB' }); }

  try { if (Models.aiEngine.mode === 'gemini' && Models.aiEngine.geminiKey) await Aurora.Services.fetchGeminiSignals(); }
  catch (e) { Models.activity.unshift({ title: 'Giudizio Gemini non disponibile, procedo con la regola tecnica', detail: String(e && e.message || e), tag: 'JOB' }); }

  Aurora.Engine.runAutopilotCycle();

  const output = {
    demoAccount: Models.demoAccount,
    activity: Models.activity.slice(0, 60),
    autopilotMode: Models.autopilotMode,
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
  const driverPath = writeTempDriverFile(html, 'trading-cycle.html');
  let output;
  try {
    output = await runDriverAndGetOutput(driverPath, { timeoutMs: 120000 });
  } finally {
    removeDriverFile(driverPath);
  }

  writeAccountState({
    demoAccount: output.demoAccount,
    activity: output.activity,
    autopilotMode: output.autopilotMode,
    liveDataEnabled: true
  });

  // Ri-legge research.json appena prima di scrivere: se nel frattempo il job "setup giornaliero"
  // ha aggiornato validated/historyCache, questo job (che non li tocca mai) non li sovrascrive con
  // una copia più vecchia — riduce, senza un vero lock, la finestra di collisione tra i due job.
  const freshResearch = readResearchState();
  // Il Learning Loop legge solo gli ultimi 8 episodi per strategia (RECENT_WINDOW in
  // engine/memory.js) — tenerne di piu' nello storico persistito non aggiunge nulla che il loop usi
  // davvero, e fa crescere data/research.json a ogni ciclo (ogni 15 minuti) senza limite.
  const EPISODE_HISTORY_CAP = 50;
  const cappedTradeEpisodes = Object.fromEntries(
    Object.entries(output.researchData.tradeEpisodes).map(([key, episodes]) => [key, episodes.slice(-EPISODE_HISTORY_CAP)])
  );
  writeResearchState({
    researchData: {
      validated: freshResearch.researchData.validated,
      trackRecord: output.researchData.trackRecord,
      tradeEpisodes: cappedTradeEpisodes,
      lessons: output.researchData.lessons
    },
    historyCache: Object.keys(freshResearch.historyCache || {}).length ? freshResearch.historyCache : output.historyCache
  });

  console.log(`Ciclo di trading completato. Trade totali: ${output.demoAccount.trades.length}. Posizioni aperte: ${Object.keys(output.demoAccount.positions).length}.`);
}

main().catch((error) => {
  console.error('Ciclo di trading fallito:', error.message);
  process.exit(1);
});
