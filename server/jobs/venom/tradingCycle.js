// Job "ciclo di trading" della pipeline venom — gemello di server/jobs/tradingCycle.js. Un
// passaggio dell'Autopilot reale (stesso motore, src/) sul conto paper venom.
//
// Quotazioni: refreshVenomQuotes (dataProviders.js) aggiorna il prezzo reale (Yahoo, ultimo close)
// convertito in EUR per tutti e 13 i ticker prima di ogni ciclo — bug reale trovato e corretto
// nella stessa sessione: senza questo, i prezzi in valuta nativa (TRY/GBp/USD) venivano trattati
// come se fossero gia' in EUR, un errore di unita' di misura nel sizing/margine, non solo di
// visualizzazione. Finnhub resta fuori (non copre questi ticker, confermato con una chiave reale).
//
// Limite dichiarato, non nascosto: il giudizio Gemini non e' ancora wireato per venom in questo
// job (i due nuovi agenti reali, liquidity_model e venom_news, esistono e sono testati ma non
// ancora orchestrati in un supervisor dedicato che li passi a un modello) — l'Autopilot gira
// quindi sulla sola regola tecnica (walk-forward validata), esattamente come il sistema principale
// in modalita' "rule".
import { buildDriverHtml, VENOM_ENGINE_SCRIPTS } from '../lib/driverTemplate.js';
import { runDriverAndGetOutput, writeTempDriverFile, removeDriverFile } from '../lib/chromeRunner.js';
import { startBackend, stopBackend } from '../lib/backendProcess.js';
import { readAccountState, writeAccountState, readResearchState, writeResearchState } from '../lib/venomStateStore.js';

async function main() {
  const account = readAccountState();
  const research = readResearchState();
  const backend = await startBackend(); // proxy Yahoo per refreshVenomQuotes (13 ticker europei)

  const injections = {
    'aurora-venom-account-v1': account.demoAccount ? { version: 2, ...account.demoAccount } : null,
    'aurora-venom-research-v1': (research.researchData && Object.keys(research.researchData.validated || {}).length)
      ? { alphaVantageKey: null, ...research.researchData }
      : null,
    'aurora-venom-history-v1': (research.historyCache && Object.keys(research.historyCache).length) ? research.historyCache : null,
    'aurora-venom-activity-v1': Array.isArray(account.activity) && account.activity.length ? account.activity : null,
    'aurora-venom-ai-engine-v1': { mode: 'rule', geminiKey: null },
    'aurora-venom-live-data-v1': { enabled: false, finnhubKey: null },
    'aurora-venom-autopilot-mode-v1': { mode: account.autopilotMode || 'coverage' }
  };

  const tailScript = `
(async function () {
  const Models = Aurora.Models;
  Aurora.Views = new Proxy({}, { get: () => function () {} });
  Aurora.Utils.$ = function (id) {
    return document.getElementById(id) || {
      textContent: '', value: '', className: '', style: {},
      classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
      closest: () => ({ classList: { toggle() {} } }),
      addEventListener() {}
    };
  };
  Models.autopilotRunning = true;

  try { await Aurora.Services.refreshVenomQuotes(); }
  catch (e) { Models.logActivity({ title: 'Quotazioni venom non disponibili', detail: String(e && e.message || e), tag: 'JOB' }); }

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
    }
  };
  document.body.insertAdjacentHTML('beforeend', '<pre id="output"></pre>');
  document.getElementById('output').textContent = JSON.stringify(output);
})();
`;

  const html = buildDriverHtml({ injections, tailScript, engineScripts: VENOM_ENGINE_SCRIPTS });
  const driverPath = writeTempDriverFile(html, 'venom-trading-cycle.html');
  let output;
  try {
    try {
      // 13 quotazioni reali (refreshVenomQuotes) + 1 chiamata tassi di cambio prima
      // dell'autopilot: margine ampio anche nel caso peggiore di retry su piu' simboli.
      output = await runDriverAndGetOutput(driverPath, { timeoutMs: 90000 });
    } finally {
      removeDriverFile(driverPath);
    }
  } finally {
    stopBackend(backend);
  }

  writeAccountState({
    demoAccount: output.demoAccount,
    activity: output.activity,
    autopilotMode: output.autopilotMode,
    liveDataEnabled: false
  });

  const freshResearch = readResearchState();
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
    historyCache: freshResearch.historyCache
  });

  console.log(`Venom — ciclo di trading completato. Trade totali: ${output.demoAccount.trades.length}. Posizioni aperte: ${Object.keys(output.demoAccount.positions).length}.`);
}

main().catch((error) => {
  console.error('Venom — ciclo di trading fallito:', error.message);
  process.exit(1);
});
