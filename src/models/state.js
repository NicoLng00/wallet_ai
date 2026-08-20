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
    EURUSD: { name: 'Euro / Dollaro USA', exchange: 'FOREX · USD', price: 1.1609, change: 0, color: '#8fa8d6', tv: 'OANDA:EURUSD' },
    // Aggiunto solo per la strategia orb_breakout (apertura NY, primi 30 minuti) — vedi
    // engine/strategies.js. Nessuna mappatura Finnhub: i future indice non sono coperti dal piano
    // gratuito usato da questo progetto (a differenza del proxy forex usato per XAUUSD/WTI), quindi
    // A DIFFERENZA di ogni altro simbolo, ES non ha NESSUNA correzione live: il prezzo demo qui
    // sotto e' un seed iniziale (verificato contro lo storico Yahoo reale al momento
    // dell'integrazione), poi segue solo il proprio random walk locale (tickDemoMarket) — destinato
    // a divergere nel tempo dal prezzo reale. Limite dichiarato, non nascosto: computeStopTarget
    // (engine/autopilot.js) per questo si rifiuta di usare lo stop/target specifico ORB quando il
    // minimo del range risulta sopra il prezzo demo corrente (range e prezzo troppo divergenti),
    // ripiegando sul fallback ATR/percentuale generico invece di aprire con uno stop invalido.
    ES: { name: 'E-mini S&P 500 Future', exchange: 'CME · USD', price: 7730, change: 0, color: '#5c9ee0', tv: 'CME_MINI:ES1!' },
    // Espansione da 6 a 40 titoli azionari (sessione 2026-08-20, su richiesta esplicita di testare
    // l'edge su un pool piu' ampio di simboli — non piu' trade concorrenti: il sizing reale
    // sull'attuale capitale rende ogni slot oltre il ~15-18esimo economicamente irrilevante,
    // verificato con un calcolo diretto, vedi conversazione). Prezzi presi da Yahoo Finance in
    // sessione (regularMarketPrice reale, nessun valore inventato), stessa fonte gia' verificata
    // reggere 60 richieste reali senza rate limit. "change" lasciato a 0 come seed neutro (stesso
    // trattamento gia' in uso per ES/EURUSD): sara' sovrascritto dal primo refreshLiveQuotes reale.
    MSFT: { name: 'Microsoft Corp.', exchange: 'NASDAQ · USD', price: 480.46, change: 0, color: '#4d8fd6', tv: 'NASDAQ:MSFT' },
    GOOGL: { name: 'Alphabet Inc. (A)', exchange: 'NASDAQ · USD', price: 339.94, change: 0, color: '#5cb87a', tv: 'NASDAQ:GOOGL' },
    AMZN: { name: 'Amazon.com Inc.', exchange: 'NASDAQ · USD', price: 260.92, change: 0, color: '#e8a33d', tv: 'NASDAQ:AMZN' },
    META: { name: 'Meta Platforms Inc.', exchange: 'NASDAQ · USD', price: 543.68, change: 0, color: '#5b7fd6', tv: 'NASDAQ:META' },
    JPM: { name: 'JPMorgan Chase & Co.', exchange: 'NYSE · USD', price: 356.39, change: 0, color: '#7a6fd0', tv: 'NYSE:JPM' },
    V: { name: 'Visa Inc.', exchange: 'NYSE · USD', price: 368.25, change: 0, color: '#4f6bd6', tv: 'NYSE:V' },
    MA: { name: 'Mastercard Inc.', exchange: 'NYSE · USD', price: 578.12, change: 0, color: '#d68f4f', tv: 'NYSE:MA' },
    UNH: { name: 'UnitedHealth Group Inc.', exchange: 'NYSE · USD', price: 387, change: 0, color: '#4f9bd6', tv: 'NYSE:UNH' },
    HD: { name: 'Home Depot Inc.', exchange: 'NYSE · USD', price: 338.51, change: 0, color: '#d6704f', tv: 'NYSE:HD' },
    PG: { name: 'Procter & Gamble Co.', exchange: 'NYSE · USD', price: 142.90, change: 0, color: '#4fd6c4', tv: 'NYSE:PG' },
    JNJ: { name: 'Johnson & Johnson', exchange: 'NYSE · USD', price: 271.12, change: 0, color: '#d64f6b', tv: 'NYSE:JNJ' },
    KO: { name: 'Coca-Cola Co.', exchange: 'NYSE · USD', price: 91.32, change: 0, color: '#d63f3f', tv: 'NYSE:KO' },
    PEP: { name: 'PepsiCo Inc.', exchange: 'NASDAQ · USD', price: 142.65, change: 0, color: '#4f9fd6', tv: 'NASDAQ:PEP' },
    DIS: { name: 'Walt Disney Co.', exchange: 'NYSE · USD', price: 107.72, change: 0, color: '#5c5cd6', tv: 'NYSE:DIS' },
    NFLX: { name: 'Netflix Inc.', exchange: 'NASDAQ · USD', price: 80.12, change: 0, color: '#d6414f', tv: 'NASDAQ:NFLX' },
    ADBE: { name: 'Adobe Inc.', exchange: 'NASDAQ · USD', price: 273.18, change: 0, color: '#d64fb0', tv: 'NASDAQ:ADBE' },
    CRM: { name: 'Salesforce Inc.', exchange: 'NYSE · USD', price: 206.92, change: 0, color: '#4fb0d6', tv: 'NYSE:CRM' },
    ORCL: { name: 'Oracle Corp.', exchange: 'NYSE · USD', price: 142.14, change: 0, color: '#d6534f', tv: 'NYSE:ORCL' },
    INTC: { name: 'Intel Corp.', exchange: 'NASDAQ · USD', price: 91.83, change: 0, color: '#4f7ad6', tv: 'NASDAQ:INTC' },
    AMD: { name: 'Advanced Micro Devices Inc.', exchange: 'NASDAQ · USD', price: 465.80, change: 0, color: '#d6874f', tv: 'NASDAQ:AMD' },
    COST: { name: 'Costco Wholesale Corp.', exchange: 'NASDAQ · USD', price: 941.27, change: 0, color: '#4fd68c', tv: 'NASDAQ:COST' },
    WMT: { name: 'Walmart Inc.', exchange: 'NYSE · USD', price: 103.62, change: 0, color: '#4f8ed6', tv: 'NYSE:WMT' },
    BAC: { name: 'Bank of America Corp.', exchange: 'NYSE · USD', price: 62.95, change: 0, color: '#d6474f', tv: 'NYSE:BAC' },
    XOM: { name: 'Exxon Mobil Corp.', exchange: 'NYSE · USD', price: 167.89, change: 0, color: '#d69a4f', tv: 'NYSE:XOM' },
    CVX: { name: 'Chevron Corp.', exchange: 'NYSE · USD', price: 207.65, change: 0, color: '#d6b04f', tv: 'NYSE:CVX' },
    PFE: { name: 'Pfizer Inc.', exchange: 'NYSE · USD', price: 27.84, change: 0, color: '#4fc6d6', tv: 'NYSE:PFE' },
    ABBV: { name: 'AbbVie Inc.', exchange: 'NYSE · USD', price: 264.24, change: 0, color: '#8a4fd6', tv: 'NYSE:ABBV' },
    MRK: { name: 'Merck & Co. Inc.', exchange: 'NYSE · USD', price: 151.44, change: 0, color: '#4fd6ad', tv: 'NYSE:MRK' },
    T: { name: 'AT&T Inc.', exchange: 'NYSE · USD', price: 25.15, change: 0, color: '#5d6bd6', tv: 'NYSE:T' },
    VZ: { name: 'Verizon Communications Inc.', exchange: 'NYSE · USD', price: 49.50, change: 0, color: '#d64f9c', tv: 'NYSE:VZ' },
    CSCO: { name: 'Cisco Systems Inc.', exchange: 'NASDAQ · USD', price: 111.18, change: 0, color: '#4fa8d6', tv: 'NASDAQ:CSCO' },
    IBM: { name: 'International Business Machines Corp.', exchange: 'NYSE · USD', price: 237.07, change: 0, color: '#5c6f7a', tv: 'NYSE:IBM' },
    NKE: { name: 'Nike Inc.', exchange: 'NYSE · USD', price: 40.19, change: 0, color: '#d6664f', tv: 'NYSE:NKE' },
    MCD: { name: 'McDonald\'s Corp.', exchange: 'NYSE · USD', price: 270.61, change: 0, color: '#d6a44f', tv: 'NYSE:MCD' }
  };

  // I nuovi 34 titoli (vedi sopra) mappano su Finnhub/Alpha Vantage con lo stesso ticker: nessuna
  // azione USA di questo elenco ha bisogno di un prefisso OANDA:/proxy come materie prime o forex.
  const EXPANDED_STOCK_SYMBOLS = [
    'MSFT', 'GOOGL', 'AMZN', 'META', 'JPM', 'V', 'MA', 'UNH', 'HD', 'PG', 'JNJ', 'KO', 'PEP', 'DIS',
    'NFLX', 'ADBE', 'CRM', 'ORCL', 'INTC', 'AMD', 'COST', 'WMT', 'BAC', 'XOM', 'CVX', 'PFE', 'ABBV',
    'MRK', 'T', 'VZ', 'CSCO', 'IBM', 'NKE', 'MCD'
  ];
  const FINNHUB_SYMBOLS = { AAPL: 'AAPL', NVDA: 'NVDA', SPY: 'SPY', QQQ: 'QQQ', TSLA: 'TSLA', XAUUSD: 'OANDA:XAU_USD', WTI: 'OANDA:WTICO_USD', TLT: 'TLT', EURUSD: 'OANDA:EUR_USD' };
  EXPANDED_STOCK_SYMBOLS.forEach((symbol) => { FINNHUB_SYMBOLS[symbol] = symbol; });
  const COINGECKO_IDS = { BTCUSD: 'bitcoin', ETHUSD: 'ethereum' };
  // TLT e' un ETF come gli altri: Alpha Vantage TIME_SERIES_DAILY funziona identico. EURUSD resta
  // fuori: e' forex, Alpha Vantage lo servirebbe solo dall'endpoint FX_DAILY (mai integrato in
  // questo progetto) — senza backend raggiungibile EURUSD resta onestamente senza fonte storica,
  // stesso trattamento gia' dichiarato per XAUUSD.
  const ALPHA_VANTAGE_STOCK_SYMBOLS = ['AAPL', 'NVDA', 'SPY', 'QQQ', 'TSLA', 'TLT', ...EXPANDED_STOCK_SYMBOLS];
  // Simboli il cui "prezzo" e' GIA' un tasso di cambio (quanti USD per 1 unita'), non un valore
  // in USD da convertire come azioni/materie prime — usato sia da refreshLiveQuotes (mai una
  // doppia conversione, bug reale trovato e corretto in sessione) sia da formatPrice (precisione
  // a 4 decimali, non 2: per un cambio, la differenza tra 1,1609 e 1,1563 e' reale e visibile,
  // non rumore di arrotondamento).
  const FX_RATE_SYMBOLS = new Set(['EURUSD']);

  // Simboli su cui gira orb_breakout (apertura NY, primi 30 minuti) — scope deciso esplicitamente
  // con l'utente: ES=F insieme a SPY/QQQ fin da subito, non solo il future puro. EURUSD aggiunto
  // come test esplicito su un mercato strutturalmente diverso: forex tratta 24/5, la barra 09:30 NY
  // non e' una vera apertura di sessione (nessun gap, nessuna asta) come per azioni/future indice —
  // limite concettuale dichiarato in README.md, non solo tecnico.
  const ORB_SYMBOLS = ['ES', 'SPY', 'QQQ', 'EURUSD'];

  // Elenco decorativo mostrato nel pannello "AI Decision Desk" — la lista dei 7 agenti reali
  // (che producono evidenze vere per il modello principale) vive in Aurora.Agents.
  const deskAgents = [
    ['⌁', 'Market Regime', 'Trend, volatilità e contesto'],
    ['◒', 'Liquidity Model', 'Spread, volume e order-flow'],
    ['∿', 'Technical Analyst', 'Struttura, livelli e momentum'],
    ['◌', 'Fundamental Scan', 'Eventi, earnings e notizie'],
    ['⊹', 'Hedge Strategist', 'Correlazioni e protezione'],
    ['◇', 'Risk Manager', 'Limiti, sizing e stop'],
    ['✓', 'Audit Sentinel', 'Policy, explainability e log'],
    ['☍', 'Social Sentiment', 'Chiacchiericcio reale da StockTwits/Reddit'],
    ['◔', 'Macro Calendar', 'FOMC/CPI/NFP reali nei prossimi giorni']
  ];

  const SIMULATION = {
    // Portato da 10 a 50 su richiesta esplicita (sessione del 2026-08-20): stesso 25% di
    // maximumPositionPercent, stesso stop/target/drawdown — piu' capitale disponibile, non un
    // edge diverso. Il conto GIA' in produzione (data/account.json) e' stato aggiornato a parte
    // con un deposito reale (+40€ sul cash esistente, mai un reset del P&L accumulato) — vedi
    // git log per il commit dedicato.
    accountSeed: 50,
    maximumOrder: 12.5,
    maximumPositionPercent: 25,
    maximumDrawdownPercent: 20,
    autopilotCadenceMs: 20000,
    minimumConfidence: 60,
    autopilotStopPercent: 1.6,
    autopilotTargetPercent: 2.8,
    // Più posizioni concorrenti = più trade/giorno quando più simboli qualificano lo stesso ciclo,
    // senza abbassare la soglia di qualità di un singolo segnale (vedi engine/autopilot.js). FINO
    // all'espansione della watchlist a 46 simboli (sessione 2026-08-20) era pari 1:1 al numero di
    // simboli — verificato con un test giorno-per-giorno su 60 giorni di storico reale (con solo 3
    // slot: 19/60 giornate a zero trade nonostante il fallback attivo; con uno slot per simbolo +
    // maxHoldingDays: 0/60). A 46 simboli, 1:1 non è più sensato: il sizing reale (25% del cash
    // residuo a ogni apertura) rende ogni slot oltre il ~15-18esimo economicamente irrilevante
    // (calcolato: la decima posizione su 50€ vale già meno di 1€, la quindicesima meno di 25
    // centesimi) — più slot di quelli non aiuterebbero comunque. 20 è quindi un compromesso
    // deliberato tra "abbastanza slot da non bloccare troppi simboli diversi" e "non oltre il punto
    // in cui il capitale attuale rende lo slot inutile" — NON riverificato con lo stesso test
    // giorno-per-giorno sui 46 simboli: la garanzia "zero giornate senza trade" documentata sopra
    // vale per la vecchia configurazione 1:1, va ridimostrata a questa scala prima di darla per
    // certa.
    maxConcurrentPositions: 20,
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
    // Leva simulata (sessione 2026-08-20, su richiesta esplicita "1:2"): un ordine puo' ora
    // controllare fino a leverageMultiplier volte il notional che il solo margine (cash impegnato)
    // permetterebbe — esattamente come un conto a margine reale, MAI simulando un broker/interessi
    // reali (resta paper, vedi ARCHITECTURE.md). Cambia SOLO l'ampiezza di guadagni e perdite, non
    // il win rate ne' l'edge misurato: un trade che perdeva 1,6% ne perde ora 3,2% in termini di
    // capitale realmente impegnato, a parita' di stop tecnico. Implementato con la stessa
    // contabilita' a margine di un conto CFD/forex reale (vedi engine/execution.js,
    // engine/market.js): il cash si riduce solo del margine (notional/leverageMultiplier)
    // all'apertura, non dell'intero notional — SENZA questo, il tetto piu' alto non avrebbe mai
    // effetto pratico, dato che il cash disponibile sarebbe rimasto comunque il vincolo piu'
    // stringente (verificato: e' esattamente quello che succedeva prima di questa modifica).
    leverageMultiplier: 2,
    // "Regola d'oro" esplicitamente richiesta: nessun trade, a prescindere dalla leva, puo'
    // rischiare (prezzo di entrata -> stop loss, sul notional PIENO cioe' leva inclusa) piu' del
    // 5% dell'equity al momento dell'apertura. Con lo stop fisso 1,6% oggi in uso questo tetto non
    // e' quasi mai vincolante (1,6% di rischio su un notional 2x resta bene sotto il 5%) — diventa
    // rilevante con stop piu' larghi (ATR, oppure orb_breakout che usa il minimo dell'opening
    // range, potenzialmente molto piu' lontano) dove altrimenti la leva da sola potrebbe spingere
    // il rischio reale oltre la soglia dichiarata. Vedi engine/riskGate.js e engine/autopilot.js.
    maxRiskPerTradePercent: 5,
    storageKey: 'aurora-demo-account-v2'
  };

  const LIVE_DATA_KEY = 'aurora-live-data-v1';
  const RESEARCH_KEY = 'aurora-research-v1';
  const HISTORY_KEY = 'aurora-history-v1';
  const AI_ENGINE_KEY = 'aurora-ai-engine-v1';
  const AUTOPILOT_MODE_KEY = 'aurora-autopilot-mode-v1';
  const EDGE_MARGIN = 5;
  // Trial della baseline casuale mediati nel walk-forward (runRandomBaselineSplit). Alzato da 30
  // a 90 dopo aver misurato che a 30 il ~4% delle candidate a pochi trade cambiava fascia
  // (validato/esplorativo/nessuno) su una semplice ri-esecuzione identica — vedi dataProviders.js.
  const RANDOM_BASELINE_TRIALS = 90;
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

  // Bug reale trovato analizzando la produzione: activity non aveva MAI una chiave di
  // persistenza — ogni job headless (server/jobs/*.js) e ogni ricarica di pagina in locale
  // ripartivano da un array vuoto, mai dal precedente. Il campo "activity" scritto in
  // data/account.json rifletteva quindi solo l'ultimo ciclo, mai una vera finestra scorrevole
  // nonostante il taglio a 60 voci applicato altrove lasciasse intendere il contrario.
  // logActivity centralizza unshift+taglio+persistenza in un solo punto, cosi' un futuro nuovo
  // punto di log non puo' dimenticare la persistenza come e' successo qui.
  const ACTIVITY_KEY = 'aurora-activity-v1';
  const ACTIVITY_CAP = 60;
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
    // Configurazione statica
    instruments, FINNHUB_SYMBOLS, COINGECKO_IDS, ALPHA_VANTAGE_STOCK_SYMBOLS, ORB_SYMBOLS, FX_RATE_SYMBOLS, deskAgents, SIMULATION, EDGE_MARGIN, RANDOM_BASELINE_TRIALS, GEMINI_MODEL,

    // Stato UI
    activeSymbol: 'AAPL',
    activeSide: 'buy',
    activeTimeframe: '15m',
    analysisReady: false,
    activity: loadActivity(),
    logActivity, persistActivity,
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
