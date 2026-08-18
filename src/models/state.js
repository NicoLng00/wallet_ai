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
    WTI: { name: 'WTI Crude Oil', exchange: 'NYMEX · USD', price: 72.8, change: -0.54, color: '#c97b4a', tv: 'TVC:USOIL' }
  };

  const FINNHUB_SYMBOLS = { AAPL: 'AAPL', NVDA: 'NVDA', SPY: 'SPY', QQQ: 'QQQ', TSLA: 'TSLA', XAUUSD: 'OANDA:XAU_USD', WTI: 'OANDA:WTICO_USD' };
  const COINGECKO_IDS = { BTCUSD: 'bitcoin', ETHUSD: 'ethereum' };
  const ALPHA_VANTAGE_STOCK_SYMBOLS = ['AAPL', 'NVDA', 'SPY', 'QQQ', 'TSLA'];

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
    // senza abbassare la soglia di qualità di un singolo segnale (vedi engine/autopilot.js).
    maxConcurrentPositions: 3,
    // Taglia ridotta per i candidati "esplorativi" (edge promettente ma non ancora confermato
    // fuori campione per carenza di dati, non perché smentito) — vedi engine/rules.js.
    exploratorySizeFactor: 0.4,
    // Soglia minima di trade fuori campione sotto la quale un candidato resta "esplorativo"
    // invece di "validato" o "escluso" — vedi services/dataProviders.js.
    minimumOutOfSampleTrades: 5,
    storageKey: 'aurora-demo-account-v2'
  };

  const LIVE_DATA_KEY = 'aurora-live-data-v1';
  const RESEARCH_KEY = 'aurora-research-v1';
  const HISTORY_KEY = 'aurora-history-v1';
  const AI_ENGINE_KEY = 'aurora-ai-engine-v1';
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
      const stored = JSON.parse(localStorage.getItem(RESEARCH_KEY));
      return {
        alphaVantageKey: stored?.alphaVantageKey || null,
        validated: stored?.validated || {},
        trackRecord: stored?.trackRecord || {},
        // Learning Loop: episodi di trade chiusi (Trade Critic + Failure Attribution) e lezioni
        // versionate estratte da pattern ricorrenti — vedi engine/memory.js.
        tradeEpisodes: stored?.tradeEpisodes || {},
        lessons: stored?.lessons || {}
      };
    } catch {
      return { alphaVantageKey: null, validated: {}, trackRecord: {}, tradeEpisodes: {}, lessons: {} };
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
