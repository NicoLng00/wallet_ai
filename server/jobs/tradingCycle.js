// Job "ciclo di trading": un passaggio dell'Autopilot reale (stesso motore del browser, src/),
// con prezzi live quando disponibili e giudizio Gemini quando la chiave e' configurata. Pensato
// per girare ogni ~15 minuti via GitHub Actions. Non tocca validated (di proprieta' del job "setup
// giornaliero", dailySetup.js) — solo il conto demo e il track record/Learning Loop. Eccezione
// dichiarata su historyCache: aggiorna SOLO la candela 30m dei simboli ORB (vedi sotto), il resto
// dello storico resta di dailySetup.js.
import { buildDriverHtml } from './lib/driverTemplate.js';
import { runDriverAndGetOutput, writeTempDriverFile, removeDriverFile } from './lib/chromeRunner.js';
import { startBackend, stopBackend } from './lib/backendProcess.js';
import { readAccountState, writeAccountState, readResearchState, writeResearchState } from './lib/stateStore.js';

// Eccezione dichiarata all'ownership "storico = solo dailySetup.js" (vedi commento in testa al
// file): orb_breakout ha bisogno di candele intraday AGGIORNATE nel corso della stessa giornata
// (per vedere l'opening range, la conferma, il ritest man mano che accadono), ma dailySetup gira
// una volta al giorno PRIMA dell'apertura di New York — la sua copia sarebbe sempre quella del
// giorno precedente per tutta la giornata di trading. Qui si aggiorna SOLO historyCache[symbol]['30m']
// per i simboli ORB, nient'altro: trackRecord/tradeEpisodes/lessons/demoAccount restano l'unica
// vera proprieta' di questo job, validated/il resto di historyCache restano di dailySetup.js.
// Deve restare identico a Aurora.Models.ORB_SYMBOLS (src/models/state.js) — duplicato qui solo
// perche' questo file gira in Node puro, fuori dal motore browser iniettato nella pagina driver.
const ORB_SYMBOLS = ['ES', 'SPY', 'QQQ', 'EURUSD'];

async function main() {
  const account = readAccountState();
  const research = readResearchState();
  const backend = await startBackend(); // serve solo da proxy Yahoo per il refresh intraday ORB

  const geminiKey = process.env.GEMINI_API_KEY || null;
  const finnhubKey = process.env.FINNHUB_API_KEY || null;

  const injections = {
    'aurora-demo-account-v2': account.demoAccount ? { version: 2, ...account.demoAccount } : null,
    'aurora-research-v1': (research.researchData && Object.keys(research.researchData.validated || {}).length)
      ? { alphaVantageKey: null, ...research.researchData }
      : null, // niente storico di ricerca ancora: lascia agire il fallback al seed reale locale
    'aurora-history-v1': (research.historyCache && Object.keys(research.historyCache).length) ? research.historyCache : null,
    // Bug reale corretto: prima activity non veniva mai re-iniettata, quindi ogni ciclo ripartiva
    // da un array vuoto e data/account.json finiva per riflettere solo l'ultimo ciclo, mai una
    // vera finestra scorrevole di 60 voci — vedi la stessa correzione in src/models/state.js.
    'aurora-activity-v1': Array.isArray(account.activity) && account.activity.length ? account.activity : null,
    'aurora-ai-engine-v1': { mode: geminiKey ? 'gemini' : 'rule', geminiKey },
    'aurora-live-data-v1': { enabled: true, finnhubKey },
    'aurora-autopilot-mode-v1': { mode: account.autopilotMode || 'coverage' }
  };

  const tailScript = `
(async function () {
  const Models = Aurora.Models;
  // Proxy catch-all invece di una lista esplicita di funzioni Views da stubbare: una lista
  // esplicita e' fragile, un bug reale trovato in produzione — Aurora.Views.renderLiveDataStatus
  // non era nella lista, refreshLiveQuotes() lanciava un errore alla sua ultima riga (dopo aver
  // gia' scritto i prezzi live reali in memoria) e finiva loggato come "prezzi live non
  // disponibili" anche quando in realta' avevano funzionato. Con il proxy, qualunque funzione
  // Views chiamata (presente o futura) e' semplicemente un no-op sicuro.
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

  try { if (Models.liveData.enabled) await Aurora.Services.refreshLiveQuotes(); }
  catch (e) { Models.logActivity({ title: 'Prezzi live non disponibili', detail: String(e && e.message || e), tag: 'JOB' }); }

  try { if (Models.aiEngine.mode === 'gemini' && Models.aiEngine.geminiKey) await Aurora.Services.fetchGeminiSignals(); }
  catch (e) { Models.logActivity({ title: 'Giudizio Gemini non disponibile, procedo con la regola tecnica', detail: String(e && e.message || e), tag: 'JOB' }); }

  // Refresh intraday ORB (vedi commento in testa a tradingCycle.js): SOLO historyCache['30m'] dei
  // simboli ORB, prima di generare i segnali di questo ciclo — altrimenti orb_breakout vedrebbe
  // sempre e solo la copia del giorno precedente scaricata da dailySetup.js. Troncato alle ultime
  // 150 barre (stessa soglia di dailySetup.js) per non far crescere data/research.json ad ogni ciclo.
  for (const symbol of (Models.ORB_SYMBOLS || [])) {
    try {
      const intraday = await Aurora.Services.fetchYahooIntraday(symbol, '30m', '60d');
      if (intraday.candles.length) {
        const trimmed = intraday.candles.slice(-150);
        Models.historyCache[symbol] = Models.historyCache[symbol] || {};
        Models.historyCache[symbol]['30m'] = { closes: trimmed.map((c) => c.close), dates: null, candles: trimmed, fetchedAt: new Date().toISOString() };
      }
    } catch (e) { Models.logActivity({ title: 'Aggiornamento intraday ORB non disponibile (' + symbol + ')', detail: String(e && e.message || e), tag: 'JOB' }); }
  }

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
    try {
      output = await runDriverAndGetOutput(driverPath, { timeoutMs: 120000 });
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
  // Storico: base = la copia piu' fresca di dailySetup.js (se presente), MA sovrascritta con la
  // candela 30m ORB appena scaricata da QUESTO ciclo — altrimenti il refresh intraday sopra
  // verrebbe scartato ad ogni scrittura, vanificando l'intero scopo dell'eccezione.
  const baseHistoryCache = Object.keys(freshResearch.historyCache || {}).length ? freshResearch.historyCache : output.historyCache;
  const mergedHistoryCache = { ...baseHistoryCache };
  ORB_SYMBOLS.forEach((symbol) => {
    const fresh30m = output.historyCache?.[symbol]?.['30m'];
    if (fresh30m) mergedHistoryCache[symbol] = { ...(mergedHistoryCache[symbol] || {}), '30m': fresh30m };
  });
  writeResearchState({
    researchData: {
      validated: freshResearch.researchData.validated,
      trackRecord: output.researchData.trackRecord,
      tradeEpisodes: cappedTradeEpisodes,
      lessons: output.researchData.lessons
    },
    historyCache: mergedHistoryCache
  });

  console.log(`Ciclo di trading completato. Trade totali: ${output.demoAccount.trades.length}. Posizioni aperte: ${Object.keys(output.demoAccount.positions).length}.`);
}

main().catch((error) => {
  console.error('Ciclo di trading fallito:', error.message);
  process.exit(1);
});
