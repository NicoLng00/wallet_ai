// Stato applicativo della pipeline "venom" (branch dedicato, 2026-08-21): stessa forma esatta di
// Aurora.Models in src/models/state.js — cosi' TUTTO il motore condiviso (engine/backtest.js,
// engine/strategies.js, engine/riskGate.js, engine/execution.js, engine/market.js, engine/rules.js)
// gira INVARIATO contro questo file, zero righe riscritte ("non si butta via nulla"). Va caricato
// AL POSTO di state.js (mai insieme, stessa variabile Aurora.Models) in un context motore dedicato
// a venom — vera indipendenza dal sistema principale a livello di processo/contesto, non solo di
// nome. Vedi server/jobs/venom/ (roadmap) per chi lo carica davvero.
window.Aurora = window.Aurora || {};

(function () {
  // 13 club calcistici europei REALMENTE quotati, verificati uno per uno con richieste dirette a
  // Yahoo Finance in sessione (prezzo, nome legale, borsa, valuta — nessun dato inventato). Lione
  // (delistata dopo un'acquisizione) e Rangers (non trovato) erano tra i candidati iniziali e sono
  // stati esclusi perche' NON quotati, non per scelta editoriale.
  // "currency" e' un campo nuovo, assente nell'istrumento del sistema principale (li' tutto passa
  // da USD): qui serve per sapere quale tasso applicare (vedi services/dataProviders.js
  // convertToEur) — GBp (Celtic) e' PENNY sterline, non sterline: 100 GBp = 1 GBP, gestito
  // esplicitamente per non sbagliare il prezzo di un fattore 100.
  const instruments = {
    'JUVE.MI': { name: 'Juventus Football Club S.p.A.', exchange: 'Borsa Italiana · EUR', price: 2.05, change: 0, color: '#3b6ea5', tv: 'MIL:JUVE', currency: 'EUR' },
    'SSL.MI': { name: 'S.S. Lazio S.p.A.', exchange: 'Borsa Italiana · EUR', price: 1.645, change: 0, color: '#5c9ee0', tv: 'MIL:SSL', currency: 'EUR' },
    'BVB.DE': { name: 'Borussia Dortmund GmbH & Co. KGaA', exchange: 'XETRA · EUR', price: 3.185, change: 0, color: '#e0b04f', tv: 'XETR:BVB', currency: 'EUR' },
    MANU: { name: 'Manchester United plc', exchange: 'NYSE · USD', price: 24.02, change: 0, color: '#d64f4f', tv: 'NYSE:MANU', currency: 'USD' },
    'AJAX.AS': { name: 'AFC Ajax NV', exchange: 'Euronext Amsterdam · EUR', price: 8.96, change: 0, color: '#d6474f', tv: 'AMS:AJAX', currency: 'EUR' },
    'CCP.L': { name: 'Celtic plc', exchange: 'LSE (AIM) · GBp', price: 200, change: 0, color: '#4f8f5c', tv: 'LON:CCP', currency: 'GBp' },
    'FENER.IS': { name: 'Fenerbahçe Futbol A.S.', exchange: 'Borsa Istanbul · TRY', price: 3.17, change: 0, color: '#d6a44f', tv: 'BIST:FENER', currency: 'TRY' },
    'GSRAY.IS': { name: 'Galatasaray Sportif A.S.', exchange: 'Borsa Istanbul · TRY', price: 1.14, change: 0, color: '#d68f4f', tv: 'BIST:GSRAY', currency: 'TRY' },
    'BJKAS.IS': { name: 'Beşiktaş Futbol Yatırımları A.S.', exchange: 'Borsa Istanbul · TRY', price: 2.83, change: 0, color: '#3f3f3f', tv: 'BIST:BJKAS', currency: 'TRY' },
    'TSPOR.IS': { name: 'Trabzonspor Sportif A.S.', exchange: 'Borsa Istanbul · TRY', price: 1.07, change: 0, color: '#7a3f3f', tv: 'BIST:TSPOR', currency: 'TRY' },
    'SCP.LS': { name: 'Sporting Clube de Portugal - Futebol, SAD', exchange: 'Euronext Lisbon · EUR', price: 1, change: 0, color: '#4f7ad6', tv: 'ELI:SCP', currency: 'EUR' },
    'SLBEN.LS': { name: 'Sport Lisboa e Benfica - Futebol, SAD', exchange: 'Euronext Lisbon · EUR', price: 6.84, change: 0, color: '#d64f4f', tv: 'ELI:SLBEN', currency: 'EUR' },
    'FCP.LS': { name: 'Futebol Clube do Porto - Futebol, SAD', exchange: 'Euronext Lisbon · EUR', price: 2.98, change: 0, color: '#4f6bd6', tv: 'ELI:FCP', currency: 'EUR' }
  };

  // Finnhub rifiuta con 403 quote/news per JUVE.MI (verificato con una chiave reale in sessione,
  // stesso limite di piano gia' trovato su OANDA:) — nessuna mappatura qui, sarebbe una chiamata
  // sprecata garantita.
  const FINNHUB_SYMBOLS = {};
  const COINGECKO_IDS = {};
  // ATTENZIONE al nome: services/dataProviders.js (fetchHistoricalCloses) usa questo elenco per
  // decidere quali simboli instradare su Yahoo-PRIMA-di-tutto (stesso backend gia' verificato,
  // vedi server/marketData.js VENOM_CLUB_SYMBOLS) — non e' una promessa che Alpha Vantage li
  // copra davvero. Stesso identico pattern gia' in uso per i 34 titoli USA aggiunti in sessione
  // (mai verificato Alpha Vantage nemmeno per quelli): Yahoo e' la fonte primaria VERIFICATA,
  // Alpha Vantage resta un tentativo di ripiego onesto se il backend non risponde, mai garantito.
  const ALPHA_VANTAGE_STOCK_SYMBOLS = Object.keys(instruments);
  // orb_breakout e' specifico per l'apertura di mercato USA (09:30 NY) — non ha senso su borse
  // europee/turche con orari diversi, nessun simbolo qui la usa.
  const ORB_SYMBOLS = [];
  const FX_RATE_SYMBOLS = new Set();

  const deskAgents = [
    ['⌁', 'Market Regime', 'Trend, volatilità e contesto'],
    ['◒', 'Liquidity Model', 'Volume/spread reali — l\'agente che finalmente esce dal placeholder'],
    ['∿', 'Technical Analyst', 'Struttura, livelli e momentum'],
    ['◌', 'Fundamental Scan', 'Notizie club, calendario partite, trasferimenti'],
    ['⊹', 'Hedge Strategist', 'Correlazioni tra i 13 club'],
    ['◇', 'Risk Manager', 'Limiti, sizing e stop'],
    ['✓', 'Audit Sentinel', 'Policy, explainability e log'],
    ['☍', 'Social Sentiment', 'Chiacchiericcio pubblico su social/pagine club/Gazzetta']
  ];

  const SIMULATION = {
    // Stesso conto paper €50 e stessa disciplina di rischio del sistema principale, ereditati
    // esplicitamente su richiesta ("prendi le informazioni utili di partenza dall'altro sistema") —
    // nessun parametro di rischio inventato ex novo per venom.
    accountSeed: 50,
    maximumOrder: 12.5,
    maximumPositionPercent: 25,
    maximumDrawdownPercent: 20,
    autopilotCadenceMs: 20000,
    minimumConfidence: 60,
    autopilotStopPercent: 1.6,
    autopilotTargetPercent: 2.8,
    // A differenza del sistema principale (46 simboli, slot disaccoppiati dal conteggio — vedi
    // state.js), qui i simboli sono solo 13: 1 slot per simbolo resta sensato ed e' esattamente la
    // configurazione gia' verificata con un test giorno-per-giorno reale (0/60 giornate a zero
    // trade) prima che il sistema principale crescesse oltre quella scala.
    maxConcurrentPositions: 13,
    exploratorySizeFactor: 0.4,
    probeSizeFactor: 0.15,
    forcedSizeFactor: 0.1,
    maxHoldingDays: 6,
    minimumOutOfSampleTrades: 5,
    leverageMultiplier: 2,
    maxRiskPerTradePercent: 5,
    storageKey: 'aurora-venom-account-v1'
  };

  const LIVE_DATA_KEY = 'aurora-venom-live-data-v1';
  const RESEARCH_KEY = 'aurora-venom-research-v1';
  const HISTORY_KEY = 'aurora-venom-history-v1';
  const AI_ENGINE_KEY = 'aurora-venom-ai-engine-v1';
  const AUTOPILOT_MODE_KEY = 'aurora-venom-autopilot-mode-v1';
  const ACTIVITY_KEY = 'aurora-venom-activity-v1';
  const ACTIVITY_CAP = 60;
  const EDGE_MARGIN = 5;
  const RANDOM_BASELINE_TRIALS = 90;
  // Chiave Gemini dedicata (fornita dall'utente, mai committata nel codice sorgente — inserita
  // solo a runtime, stessa disciplina della chiave del sistema principale). Il formato fornito
  // in sessione ("AQ.Ab8...") non corrisponde a quello standard delle chiavi Google AI Studio
  // ("AIza..."): da verificare prima di fare affidamento su questo motore, mai assunto valido.
  const GEMINI_MODEL = 'gemini-3.5-flash';

  function makeDemoAccount() {
    return {
      version: 2,
      cash: SIMULATION.accountSeed,
      highWater: SIMULATION.accountSeed,
      positions: {},
      market: Object.fromEntries(Object.entries(instruments).map(([symbol, data]) => [symbol, data.price])),
      model: { calibration: 50, outcomes: 0, wins: 0 },
      trades: []
    };
  }

  function loadDemoAccount() {
    try {
      const stored = JSON.parse(localStorage.getItem(SIMULATION.storageKey));
      if (!stored || stored.version !== 2 || typeof stored.cash !== 'number') return makeDemoAccount();
      const defaults = makeDemoAccount();
      return {
        ...defaults, ...stored,
        market: { ...defaults.market, ...stored.market },
        positions: stored.positions || {},
        model: { ...defaults.model, ...stored.model },
        trades: stored.trades || []
      };
    } catch {
      return makeDemoAccount();
    }
  }
  function persistDemoAccount() {
    try { localStorage.setItem(SIMULATION.storageKey, JSON.stringify(Aurora.Models.demoAccount)); } catch { /* Persistence is optional. */ }
  }

  function loadLiveData() {
    try {
      const stored = JSON.parse(localStorage.getItem(LIVE_DATA_KEY));
      return { enabled: !!stored?.enabled, finnhubKey: stored?.finnhubKey || null };
    } catch {
      return { enabled: false, finnhubKey: null };
    }
  }
  function persistLiveData() {
    try { localStorage.setItem(LIVE_DATA_KEY, JSON.stringify(Aurora.Models.liveData)); } catch { /* Persistence is optional. */ }
  }

  // Nessun seed di conoscenza iniziale (a differenza del sistema principale, che parte da un
  // backtest reale gia' eseguito in src/models/seedData.js): venom parte onestamente da zero,
  // il primo backtest walk-forward reale sara' la prima conoscenza vera. Aurora.SeedData non
  // viene caricato in questo context, quindi il ramo "seed" sotto non scatta mai qui.
  function loadResearchData() {
    try {
      const stored = JSON.parse(localStorage.getItem(RESEARCH_KEY));
      return {
        alphaVantageKey: null,
        validated: stored?.validated || {},
        trackRecord: stored?.trackRecord || {},
        tradeEpisodes: stored?.tradeEpisodes || {},
        lessons: stored?.lessons || {},
        seeded: false
      };
    } catch {
      return { alphaVantageKey: null, validated: {}, trackRecord: {}, tradeEpisodes: {}, lessons: {}, seeded: false };
    }
  }
  function persistResearchData() {
    try { localStorage.setItem(RESEARCH_KEY, JSON.stringify(Aurora.Models.researchData)); } catch { /* Persistence is optional. */ }
  }
  function loadHistoryCache() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || {}; } catch { return {}; }
  }
  function persistHistoryCache() {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(Aurora.Models.historyCache)); } catch { /* Persistence is optional. */ }
  }

  function loadAiEngine() {
    try {
      const stored = JSON.parse(localStorage.getItem(AI_ENGINE_KEY));
      return { mode: stored?.mode === 'gemini' ? 'gemini' : 'rule', geminiKey: stored?.geminiKey || null };
    } catch {
      return { mode: 'rule', geminiKey: null };
    }
  }
  function persistAiEngine() {
    try { localStorage.setItem(AI_ENGINE_KEY, JSON.stringify(Aurora.Models.aiEngine)); } catch { /* Persistence is optional. */ }
  }

  function loadAutopilotMode() {
    try {
      const stored = JSON.parse(localStorage.getItem(AUTOPILOT_MODE_KEY));
      return stored?.mode === 'quality' ? 'quality' : 'coverage';
    } catch {
      return 'coverage';
    }
  }
  function persistAutopilotMode() {
    try { localStorage.setItem(AUTOPILOT_MODE_KEY, JSON.stringify({ mode: Aurora.Models.autopilotMode })); } catch { /* Persistence is optional. */ }
  }

  function loadActivity() {
    try {
      const stored = JSON.parse(localStorage.getItem(ACTIVITY_KEY));
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  }
  function persistActivity() {
    try { localStorage.setItem(ACTIVITY_KEY, JSON.stringify(Aurora.Models.activity.slice(0, ACTIVITY_CAP))); } catch { /* Persistence is optional. */ }
  }
  function logActivity(entry) {
    Aurora.Models.activity.unshift(entry);
    if (Aurora.Models.activity.length > ACTIVITY_CAP) Aurora.Models.activity.length = ACTIVITY_CAP;
    persistActivity();
  }

  Aurora.Models = {
    instruments, FINNHUB_SYMBOLS, COINGECKO_IDS, ALPHA_VANTAGE_STOCK_SYMBOLS, ORB_SYMBOLS, FX_RATE_SYMBOLS, deskAgents, SIMULATION, EDGE_MARGIN, RANDOM_BASELINE_TRIALS, GEMINI_MODEL,

    activeSymbol: 'JUVE.MI',
    activeSide: 'buy',
    activeTimeframe: '1D',
    analysisReady: false,
    activity: loadActivity(),
    logActivity, persistActivity,
    selectedTab: 'activity',
    orderCount: 0,
    autopilotRunning: false,
    autopilotTimer: null,
    autopilotMode: loadAutopilotMode(),
    persistAutopilotMode,
    sharedStateMode: false,

    demoAccount: loadDemoAccount(),
    makeDemoAccount, persistDemoAccount,

    liveData: loadLiveData(),
    liveStatus: {},
    liveChangePercent: {},
    liveFetchInFlight: false,
    liveCooldownUntil: 0,
    usdToEurRate: 1,
    usdToEurAvailable: false,
    persistLiveData,

    researchData: loadResearchData(),
    historyCache: loadHistoryCache(),
    persistResearchData, persistHistoryCache,

    aiEngine: loadAiEngine(),
    geminiSignals: {},
    geminiFetchInFlight: false,
    geminiCooldownUntil: 0,
    persistAiEngine
  };
})();
