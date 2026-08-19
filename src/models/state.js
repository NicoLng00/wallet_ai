// Stato applicativo e persistenza (localStorage). Ogni altro modulo legge/scrive SOLO tramite
// le proprietà di Aurora.Models — mai variabili locali — così le modifiche restano visibili ovunque
// anche senza un bundler a moduli ES.
window.Aurora = window.Aurora || {};

(function () {
  const instruments = {
    AAPL: { name: 'Apple Inc.', exchange: 'NASDAQ · USD', price: 214.38, change: 1.4, color: '#3b89ed', tv: 'NASDAQ:AAPL' },
    NVDA: { name: 'NVIDIA Corp.', exchange: 'NASDAQ · USD', price: 181.62, change: 2.86, color: '#72a8ff', tv: 'NASDAQ:NVDA' },
    SPY: { name: 'SPDR S&P 500 ETF', exchange: 'NYSE Arca · USD', price: 641.09, change: 0.46, color: '#ef8059', tv: 'AMEX:SPY' },
    QQQ: { name: 'Invesco QQQ Trust', exchange: 'NASDAQ · USD', price: 568.31, change: 0.73, color: '#9e7cff', tv: 'NASDAQ:QQQ' },
    BTCUSD: { name: 'Bitcoin', exchange: 'CRYPTO · USD', price: 117420.6, change: -1.18, color: '#f1a84b', tv: 'BITSTAMP:BTCUSD' },
    TSLA: { name: 'Tesla Inc.', exchange: 'NASDAQ · USD', price: 331.8, change: -0.92, color: '#e56363', tv: 'NASDAQ:TSLA' },
    XAUUSD: { name: 'Oro (Spot)', exchange: 'FOREX · USD', price: 2612.4, change: 0.32, color: '#e0b45c', tv: 'OANDA:XAUUSD' },
    ETHUSD: { name: 'Ethereum', exchange: 'CRYPTO · USD', price: 3184.5, change: 1.05, color: '#7b8bdb', tv: 'BITSTAMP:ETHUSD' },
    WTI: { name: 'WTI Crude Oil', exchange: 'NYMEX · USD', price: 72.8, change: -0.54, color: '#c97b4a', tv: 'TVC:USOIL' },
    // Aggiunti per diversificare le classi di attivo, non solo altri titoli tech: prima il
    // watchlist non copriva ne' obbligazioni ne' forex, due classi con dinamiche strutturalmente
    // diverse da azioni/crypto/materie prime — piu' probabilita' che un edge reale esista da
    // qualche parte, stesso principio "piu' fonti indipendenti" gia' usato per le strategie.
    TLT: { name: 'iShares 20+ Year Treasury Bond ETF', exchange: 'NASDAQ · USD', price: 81.66, change: 0, color: '#5ec9a8', tv: 'NASDAQ:TLT' },
    EURUSD: { name: 'Euro / Dollaro USA', exchange: 'FOREX · USD', price: 1.1609, change: 0, color: '#8fa8d6', tv: 'OANDA:EURUSD' }
  };

  const FINNHUB_SYMBOLS = { AAPL: 'AAPL', NVDA: 'NVDA', SPY: 'SPY', QQQ: 'QQQ', TSLA: 'TSLA', XAUUSD: 'OANDA:XAU_USD', WTI: 'OANDA:WTICO_USD', TLT: 'TLT', EURUSD: 'OANDA:EUR_USD' };
  const COINGECKO_IDS = { BTCUSD: 'bitcoin', ETHUSD: 'ethereum' };
  // TLT e' un ETF come gli altri: Alpha Vantage TIME_SERIES_DAILY funziona identico. EURUSD resta
  // fuori: e' forex, Alpha Vantage lo servirebbe solo dall'endpoint FX_DAILY (mai integrato in
  // questo progetto) — senza backend raggiungibile EURUSD resta onestamente senza fonte storica,
  // stesso trattamento gia' dichiarato per XAUUSD.
  const ALPHA_VANTAGE_STOCK_SYMBOLS = ['AAPL', 'NVDA', 'SPY', 'QQQ', 'TSLA', 'TLT'];

  // Elenco decorativo mostrato nel pannello "AI Decision Desk" — la lista dei 7 agenti reali
  // (che producono evidenze vere per il modello principale) vive in Aurora.Agents.
  const deskAgents = [
    ['⌁', 'Market Regime', 'Trend, volatilità e contesto'],
    ['◒', 'Liquidity Model', 'Spread, volume e order-flow'],
    ['∿', 'Technical Analyst', 'Struttura, livelli e momentum'],
    ['◌', 'Fundamental Scan', 'Eventi, earnings e notizie'],
    ['⊹', 'Hedge Strategist', 'Correlazioni e protezione'],
    ['◇', 'Risk Manager', 'Limiti, sizing e stop'],
    ['✓', 'Audit Sentinel', 'Policy, explainability e log']
  ];

  const SIMULATION = {
    accountSeed: 10,
    maximumOrder: 2.5,
    maximumPositionPercent: 25,
    maximumDrawdownPercent: 20,
    autopilotCadenceMs: 20000,
    minimumConfidence: 60,
    autopilotStopPercent: 1.6,
    autopilotTargetPercent: 2.8,
    // Più posizioni concorrenti = più trade/giorno quando più simboli qualificano lo stesso ciclo,
    // senza abbassare la soglia di qualità di un singolo segnale (vedi engine/autopilot.js). Pari
    // al numero di simboli in watchlist (11, da quando TLT ed EURUSD si sono aggiunti per
    // diversificare le classi di attivo): con meno slot che simboli, posizioni che non toccano ne'
    // SL ne' TP restano aperte e bloccano sia nuovi ingressi sia il fallback "sonda forzata" su
    // ALTRI simboli — verificato con un test giorno-per-giorno su 60 giorni di storico reale (con
    // solo 3 slot: 19/60 giornate a zero trade nonostante il fallback attivo; con uno slot per
    // simbolo + maxHoldingDays: 0/60). Il rischio reale non cresce con gli slot: ogni ordine resta
    // comunque capato da maximumOrder/maximumPositionPercent e dai fattori di taglia per livello.
    maxConcurrentPositions: 11,
    // Taglia ridotta per i candidati "esplorativi" (edge promettente ma non ancora confermato
    // fuori campione per carenza di dati, non perché smentito) — vedi engine/rules.js.
    exploratorySizeFactor: 0.4,
    // Taglia minima per le posizioni "sonda" (nessun edge misurato, la meno peggio tra le
    // strategie scartate, usata solo per generare episodi per il Learning Loop quando non c'è
    // nulla di validato o esplorativo) — vedi engine/rules.js e engine/autopilot.js.
    probeSizeFactor: 0.15,
    // Taglia minima assoluta per il trade "forzato" giornaliero (vedi engine/rules.js
    // pickForcedDailyCandidate + engine/autopilot.js): scatta solo se ENTRO LA GIORNATA nessun
    // livello validato/esplorativo/sonda ha aperto nulla, sul candidato con lo score piu' alto
    // sull'intero watchlist a prescindere dalla direzione. Piu' piccola della sonda perche' qui
    // manca anche l'unico requisito che la sonda mantiene (una direzione tecnica letta oggi).
    forcedSizeFactor: 0.1,
    // Limite massimo di detenzione per posizioni ESPLORATIVE/SONDA/FORZATE (mai per quelle
    // validate, che hanno un edge misurato e si sono guadagnate il diritto di aspettare il proprio
    // SL/TP reale): oltre questa finestra senza aver toccato ne' SL ne' TP, la posizione viene
    // comunque chiusa (time-stop, tecnica standard di gestione del portafoglio, non un segnale) —
    // vedi engine/autopilot.js. Tarato insieme a maxConcurrentPositions sullo stesso test: 6 giorni,
    // con uno slot per ogni simbolo della watchlist, azzera le giornate senza trade su 60 giorni reali.
    maxHoldingDays: 6,
    // Soglia minima di trade fuori campione sotto la quale un candidato resta "esplorativo"
    // invece di "validato" o "escluso" — vedi services/dataProviders.js.
    minimumOutOfSampleTrades: 5,
    storageKey: 'aurora-demo-account-v2'
  };

  const LIVE_DATA_KEY = 'aurora-live-data-v1';
  const RESEARCH_KEY = 'aurora-research-v1';
  const HISTORY_KEY = 'aurora-history-v1';
  const AI_ENGINE_KEY = 'aurora-ai-engine-v1';
  const AUTOPILOT_MODE_KEY = 'aurora-autopilot-mode-v1';
  const EDGE_MARGIN = 5;
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

  function loadResearchData() {
    try {
      const rawStored = localStorage.getItem(RESEARCH_KEY);
      const stored = JSON.parse(rawStored);
      // Prima apertura in assoluto (nessuna chiave salvata ancora): parte da un seed di
      // conoscenza REALE — backtest walk-forward gia' eseguito su storico reale durante lo
      // sviluppo (src/models/seedData.js), stesso motore, nessuna soglia abbassata. Basta
      // QUALUNQUE azione reale dell'utente (un backtest, un trade chiuso, una lezione
      // disattivata) perche' persistResearchData() salvi il suo stato: da quel momento questo
      // seed non viene piu' consultato, i suoi dati hanno sempre precedenza.
      if (rawStored === null && Aurora.SeedData) {
        const seed = Aurora.SeedData;
        return {
          alphaVantageKey: null,
          validated: seed.validated || {},
          trackRecord: seed.trackRecord || {},
          tradeEpisodes: seed.tradeEpisodes || {},
          lessons: seed.lessons || {},
          seeded: true
        };
      }
      return {
        alphaVantageKey: stored?.alphaVantageKey || null,
        validated: stored?.validated || {},
        trackRecord: stored?.trackRecord || {},
        // Learning Loop: episodi di trade chiusi (Trade Critic + Failure Attribution) e lezioni
        // versionate estratte da pattern ricorrenti — vedi engine/memory.js.
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

  // Interruttore "copertura" (default, attuale comportamento: sonda + fallback forzato garantiscono
  // almeno un trade al giorno) vs "qualità" (solo livelli validato/esplorativo — niente sonda, niente
  // fallback forzato: giornate a zero trade sono un esito accettato, non un difetto, quando non c'è
  // nulla con un edge reale o promettente) — vedi engine/autopilot.js.
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

  Aurora.Models = {
    // Configurazione statica
    instruments, FINNHUB_SYMBOLS, COINGECKO_IDS, ALPHA_VANTAGE_STOCK_SYMBOLS, deskAgents, SIMULATION, EDGE_MARGIN, GEMINI_MODEL,

    // Stato UI
    activeSymbol: 'AAPL',
    activeSide: 'buy',
    activeTimeframe: '15m',
    analysisReady: false,
    activity: [],
    selectedTab: 'activity',
    orderCount: 0,
    autopilotRunning: false,
    autopilotTimer: null,
    autopilotMode: loadAutopilotMode(),
    persistAutopilotMode,
    // true quando la pagina ha caricato con successo lo stato condiviso del bot autonomo
    // (data/*.json, vedi Aurora.Services.hydrateFromSharedState) — disattiva la simulazione
    // locale, che altrimenti mostrerebbe una seconda "verita'" indipendente sopra quella reale.
    sharedStateMode: false,

    // Conto demo
    demoAccount: loadDemoAccount(),
    makeDemoAccount, persistDemoAccount,

    // Dati live
    liveData: loadLiveData(),
    liveStatus: {},
    liveChangePercent: {},
    liveFetchInFlight: false,
    liveCooldownUntil: 0,
    usdToEurRate: 1,
    usdToEurAvailable: false,
    persistLiveData,

    // Research/backtest
    researchData: loadResearchData(),
    historyCache: loadHistoryCache(),
    persistResearchData, persistHistoryCache,

    // Motore AI (Gemini o futuri provider)
    aiEngine: loadAiEngine(),
    geminiSignals: {},
    geminiFetchInFlight: false,
    geminiCooldownUntil: 0,
    persistAiEngine
  };
})();
