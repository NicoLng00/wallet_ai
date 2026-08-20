// Fetch di dati di mercato reali (quotazioni live e storico per il backtest). Nessuna chiave
// nel codice sorgente: tutte inserite dall'utente e salvate solo in localStorage.
window.Aurora = window.Aurora || {};
Aurora.Services = Aurora.Services || {};

// Alpha Vantage free tier: limite reale verificato in sessione e' AL MINUTO (5 richieste/min),
// non al secondo — un throttle da 1,1s bastava per due chiamate isolate ma falliva testando piu'
// simboli in sequenza (verificato: QQQ/AAPL/NVDA/TSLA/WTI rifiutati in un ciclo di validazione
// multi-mercato). 13s di distanza tiene un margine di sicurezza sotto le 5/min.
// Timeout esplicito per OGNI fetch verso provider esterni: senza, una singola richiesta appesa
// (osservato in sessione — CoinGecko/Yahoo da un runner CI, IP condivisi piu' soggetti a rate
// limiting silenzioso che da una rete residenziale) blocca l'intero job di setup giornaliero fino
// al timeout esterno di spawnSync, invece di fallire in fretta e lasciare che il resto dei
// simboli/strategie prosegua (ogni chiamata e' gia' avvolta in un try/catch dal chiamante).
const FETCH_TIMEOUT_MS = 15000;
function fetchWithTimeout(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

let lastAlphaVantageCallAt = 0;
async function throttleAlphaVantage() {
  const elapsed = Date.now() - lastAlphaVantageCallAt;
  if (elapsed < 13000) await new Promise((resolve) => setTimeout(resolve, 13000 - elapsed));
  lastAlphaVantageCallAt = Date.now();
}

Aurora.Services.fetchFinnhubQuote = async function fetchFinnhubQuote(apiSymbol) {
  const res = await fetchWithTimeout(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(apiSymbol)}&token=${encodeURIComponent(Aurora.Models.liveData.finnhubKey)}`);
  if (res.status === 429) throw new Error('rate-limit');
  if (res.status === 401 || res.status === 403) throw new Error('unauthorized');
  if (!res.ok) throw new Error(`http-${res.status}`);
  const data = await res.json();
  const price = Number(data.c);
  if (!price || price <= 0) throw new Error('no-price');
  const previousClose = Number(data.pc);
  return { price, previousClose: previousClose > 0 ? previousClose : null };
};

Aurora.Services.fetchCoinGeckoPrices = async function fetchCoinGeckoPrices() {
  const ids = Object.values(Aurora.Models.COINGECKO_IDS).join(',');
  const res = await fetchWithTimeout(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
  if (!res.ok) throw new Error(`http-${res.status}`);
  return res.json();
};

// Bug reale trovato e riprodotto in sessione (mai visibile finora solo perche' la chiamata
// Finnhub per EURUSD non era mai riuscita in produzione): EURUSD e' GIA' un tasso di cambio
// (quanti USD per 1 EUR) restituito da Finnhub — a differenza di azioni/materie prime quotate
// in USD (AAPL, WTI, XAUUSD...), che vanno davvero convertite in EUR moltiplicando per
// usdToEurRate. Applicare la STESSA conversione a EURUSD lo corrompe verso ~1.0 (quotazione
// reale ~1.16 * reciproco ~0.86 ≈ 1.0) — e un crollo apparente da 1.16 a 1.0 (~14%) avrebbe
// sfondato uno stop loss reale (tipicamente a ~0.4% di distanza, ATR-based) per un motivo
// del tutto fittizio, realizzando una perdita finta su una posizione vera. Se in futuro si
// aggiungono altre coppie valutarie a FINNHUB_SYMBOLS, vanno aggiunte anche qui.
const FX_RATE_SYMBOLS = new Set(['EURUSD']);

Aurora.Services.refreshLiveQuotes = async function refreshLiveQuotes() {
  const Models = Aurora.Models;
  if (!Models.liveData.enabled || !Models.liveData.finnhubKey) return;
  if (Models.liveFetchInFlight || Date.now() < Models.liveCooldownUntil) return;
  Models.liveFetchInFlight = true;
  let rateLimited = false;
  let unauthorized = false;
  try {
    const finnhubEntries = Object.entries(Models.FINNHUB_SYMBOLS);
    const [fxResult, ...finnhubResults] = await Promise.allSettled([
      Aurora.Services.fetchFinnhubQuote('OANDA:USD_EUR'),
      ...finnhubEntries.map(([, apiSymbol]) => Aurora.Services.fetchFinnhubQuote(apiSymbol))
    ]);

    if (fxResult.status === 'fulfilled') {
      Models.usdToEurRate = fxResult.value.price;
      Models.usdToEurAvailable = true;
    } else {
      Models.usdToEurAvailable = false;
      if (fxResult.reason?.message === 'rate-limit') rateLimited = true;
      if (fxResult.reason?.message === 'unauthorized') unauthorized = true;
    }

    finnhubResults.forEach((result, index) => {
      const [symbol] = finnhubEntries[index];
      if (result.status === 'fulfilled') {
        const { price, previousClose } = result.value;
        Models.demoAccount.market[symbol] = FX_RATE_SYMBOLS.has(symbol) ? price : price * Models.usdToEurRate;
        Models.liveStatus[symbol] = 'live';
        Models.liveChangePercent[symbol] = previousClose ? ((price - previousClose) / previousClose) * 100 : null;
      } else {
        Models.liveStatus[symbol] = 'error';
        if (result.reason?.message === 'rate-limit') rateLimited = true;
        if (result.reason?.message === 'unauthorized') unauthorized = true;
      }
    });

    try {
      const prices = await Aurora.Services.fetchCoinGeckoPrices();
      Object.entries(Models.COINGECKO_IDS).forEach(([symbol, id]) => {
        const price = Number(prices?.[id]?.usd);
        if (price > 0) {
          Models.demoAccount.market[symbol] = price * Models.usdToEurRate;
          Models.liveStatus[symbol] = 'live';
          const change24h = Number(prices?.[id]?.usd_24h_change);
          Models.liveChangePercent[symbol] = Number.isFinite(change24h) ? change24h : null;
        } else Models.liveStatus[symbol] = 'error';
      });
    } catch {
      Object.keys(Models.COINGECKO_IDS).forEach((symbol) => { Models.liveStatus[symbol] = 'error'; });
    }

    if (rateLimited || unauthorized) Models.liveCooldownUntil = Date.now() + 60000;

    Models.persistDemoAccount();
    Aurora.Views.renderDemoAccount();
    Aurora.Views.renderWalletOverview();
    Aurora.Views.updateQuoteUI();
    Aurora.Views.renderWatchlist();
    Aurora.Views.updateOrderEstimate();
    Aurora.Views.renderChartLevelsOverlay();
    Aurora.Views.renderLiveDataStatus(unauthorized ? 'unauthorized' : rateLimited ? 'rate-limit' : null);
  } finally {
    Models.liveFetchInFlight = false;
  }
};

// --- Fetch storico (una tantum su richiesta, mai in polling: la quota Alpha Vantage free è 25/giorno) ---

// Ritorna { closes, candles } — candles = OHLC completo, gia' incluso nella stessa risposta AV
// (nessuna chiamata di rete aggiuntiva), usato dalla strategia Engulfing e dall'ATR.
// outputsize=full e' a pagamento su Alpha Vantage (verificato in sessione: risposta "Information"
// che richiede un piano premium) — il free tier resta "compact" (~100 giorni), limite dichiarato.
Aurora.Services.fetchAlphaVantageDaily = async function fetchAlphaVantageDaily(symbol) {
  await throttleAlphaVantage();
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${encodeURIComponent(Aurora.Models.researchData.alphaVantageKey)}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`http-${res.status}`);
  const data = await res.json();
  const series = data['Time Series (Daily)'];
  if (!series) throw new Error(data.Note || data.Information || data['Error Message'] || 'Dati non disponibili');
  const dates = Object.keys(series).sort();
  const closes = dates.map((date) => Number(series[date]['4. close']));
  const candles = dates.map((date) => ({
    time: date,
    open: Number(series[date]['1. open']),
    high: Number(series[date]['2. high']),
    low: Number(series[date]['3. low']),
    close: Number(series[date]['4. close']),
    volume: Number(series[date]['5. volume'])
  }));
  return { closes, candles, dates };
};

Aurora.Services.fetchAlphaVantageWTI = async function fetchAlphaVantageWTI() {
  await throttleAlphaVantage();
  const url = `https://www.alphavantage.co/query?function=WTI&interval=daily&apikey=${encodeURIComponent(Aurora.Models.researchData.alphaVantageKey)}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`http-${res.status}`);
  const data = await res.json();
  if (!data.data) throw new Error(data.Note || data.Information || 'Dati non disponibili');
  const points = data.data.slice().reverse().filter((point) => point.value !== '.');
  return { closes: points.map((point) => Number(point.value)), candles: null, dates: points.map((point) => point.date) };
};

// Storico giornaliero fino a 365 giorni (il massimo gratuito su CoinGecko), non piu' limitato a 200.
Aurora.Services.fetchCoinGeckoHistory = async function fetchCoinGeckoHistory(symbol) {
  const id = Aurora.Models.COINGECKO_IDS[symbol];
  const to = Math.floor(Date.now() / 1000);
  const from = to - 365 * 86400;
  const res = await fetchWithTimeout(`https://api.coingecko.com/api/v3/coins/${id}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`);
  if (!res.ok) throw new Error(`http-${res.status}`);
  const data = await res.json();
  const points = data.prices || [];
  const volumePoints = data.total_volumes || [];
  // total_volumes arriva gia' gratis nella stessa risposta di prices, allineato per indice (stessi
  // timestamp) — prima veniva scartato del tutto. Nessuna vera candela OHLC qui (CoinGecko
  // market_chart da' solo un prezzo per punto, non open/high/low), ma volume_breakout in
  // engine/strategies.js ha bisogno solo di closes + volume, non di OHLC completo.
  const hasAlignedVolume = volumePoints.length === points.length;
  const candles = points.map(([ts, price], i) => ({
    date: new Date(ts).toISOString().slice(0, 10),
    close: price,
    volume: hasAlignedVolume ? volumePoints[i][1] : null
  }));
  return { closes: points.map(([, price]) => price), candles, dates: points.map(([ts]) => new Date(ts).toISOString().slice(0, 10)) };
};

// Storico a granularita' oraria (CoinGecko la assegna automaticamente per range <=90 giorni,
// gratuito) — solo crypto: e' la fonte che rende plausibile un'attivita' piu' che giornaliera,
// senza abbassare la soglia di validazione su nessuna singola regola.
Aurora.Services.fetchCoinGeckoHourly = async function fetchCoinGeckoHourly(symbol) {
  const id = Aurora.Models.COINGECKO_IDS[symbol];
  const to = Math.floor(Date.now() / 1000);
  const from = to - 90 * 86400;
  const res = await fetchWithTimeout(`https://api.coingecko.com/api/v3/coins/${id}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`);
  if (!res.ok) throw new Error(`http-${res.status}`);
  const data = await res.json();
  const points = data.prices || [];
  return { closes: points.map(([, price]) => price), dates: points.map(([ts]) => new Date(ts).toISOString()) };
};

// OHLC reale (candele vere, non solo chiusura) — usato per il pattern Engulfing e per l'ATR.
Aurora.Services.fetchCoinGeckoOHLC = async function fetchCoinGeckoOHLC(symbol, days = 180) {
  const id = Aurora.Models.COINGECKO_IDS[symbol];
  const res = await fetchWithTimeout(`https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=${days}`);
  if (!res.ok) throw new Error(`http-${res.status}`);
  const data = await res.json();
  return (data || []).map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
};

// Storico reale piu' lungo (~2 anni contro le ~100 barre "compact" gratuite di Alpha Vantage),
// via il backend locale (server/marketData.js) che fa da proxy a Yahoo Finance — nessuna chiave
// utente richiesta, ma serve il backend in esecuzione (CORS blocca Yahoo dal browser). XAUUSD usa
// GC=F (futures oro) come proxy dichiarato: prima di questo restava sempre neutro per mancanza di
// una fonte storica gratuita.
Aurora.Services.fetchYahooDaily = async function fetchYahooDaily(symbol, range = '2y') {
  const res = await fetchWithTimeout(`${Aurora.Config.backendUrl}/api/history?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `http-${res.status}`);
  }
  const data = await res.json();
  return { closes: data.closes, candles: data.candles, dates: data.dates };
};

// Storico intraday (30 minuti, ~60 giorni), unico consumatore la strategia orb_breakout — vedi
// server/marketData.js per il motivo del lookback breve (limite gratuito Yahoo). candles porta
// .time (epoch ms), non .date: necessario per identificare la barra delle 09:30 NY.
Aurora.Services.fetchYahooIntraday = async function fetchYahooIntraday(symbol, interval = '30m', range = '60d') {
  const res = await fetchWithTimeout(`${Aurora.Config.backendUrl}/api/intraday?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `http-${res.status}`);
  }
  const data = await res.json();
  return { candles: data.candles || [] };
};

Aurora.Services.fetchHistoricalCloses = async function fetchHistoricalCloses(symbol) {
  const Models = Aurora.Models;
  if (Models.COINGECKO_IDS[symbol]) return Aurora.Services.fetchCoinGeckoHistory(symbol);
  if (symbol === 'WTI' || symbol === 'XAUUSD' || symbol === 'EURUSD' || symbol === 'ES' || Models.ALPHA_VANTAGE_STOCK_SYMBOLS.includes(symbol)) {
    try {
      return await Aurora.Services.fetchYahooDaily(symbol);
    } catch (backendError) {
      // Ripiego su Alpha Vantage (richiede la chiave dell'utente) solo se il backend locale non
      // e' raggiungibile — la regola tecnica deve restare utilizzabile anche senza backend. XAUUSD,
      // EURUSD ed ES non hanno un ripiego (forex/futures, mai integrati con l'endpoint Alpha Vantage
      // dedicato): senza backend restano onestamente senza fonte storica, come sempre stato.
      if (symbol === 'XAUUSD' || symbol === 'EURUSD' || symbol === 'ES') throw backendError;
      if (symbol === 'WTI') return Aurora.Services.fetchAlphaVantageWTI();
      return Aurora.Services.fetchAlphaVantageDaily(symbol);
    }
  }
  throw new Error('Nessuna fonte storica gratuita disponibile per questo simbolo.');
};

// Costruisce l'elenco di candidati (strategia x timeframe) da testare per un simbolo, con i
// dati reali gia' scaricati per ciascuno. Le fonti secondarie (orario, OHLC) sono opzionali:
// se falliscono (es. rate limit), il simbolo resta comunque coperto dai candidati giornalieri.
async function buildCandidateJobs(symbol) {
  const Models = Aurora.Models;
  const jobs = [];
  const CLOSES_STRATEGIES = ['sma_rsi', 'macd_cross', 'bollinger_reversion', 'donchian_breakout'];

  // Tutte le strategie sullo STESSO (simbolo, timeframe) condividono ora un unico historyEntry
  // completo (closes + dates + candles, quando disponibili) invece di ricostruirne uno ciascuna:
  // prima, essendo scritte tutte sulla stessa chiave in researchData/historyCache, l'ultima
  // processata sovrascriveva le altre — bug reale gia' trovato una volta per le date mancanti
  // sull'engulfing, la stessa fragilita' si sarebbe ripresentata aggiungendo il volume.
  // ohlcStrategies e' esplicito per chiamata: CoinGecko market_chart da' solo close+volume per
  // barra (mai open/high/low), quindi li' puo' girare volume_breakout ma MAI engulfing (che
  // confronta open/close — su candele senza open resterebbe sempre neutro, un candidato morto).
  function pushGroup(timeframe, closes, dates, candles, ohlcStrategies = []) {
    const historyEntry = { closes, dates, candles: candles || null };
    CLOSES_STRATEGIES.forEach((strategyId) => {
      jobs.push({ candidateKey: `${strategyId}@${timeframe}`, strategyId, timeframe, closes, candles: candles || null, historyEntry });
    });
    if (candles?.length) {
      ohlcStrategies.forEach((strategyId) => {
        jobs.push({ candidateKey: `${strategyId}@${timeframe}`, strategyId, timeframe, closes, candles, historyEntry });
      });
    }
  }

  if (Models.COINGECKO_IDS[symbol]) {
    const daily = await Aurora.Services.fetchCoinGeckoHistory(symbol);
    pushGroup('1D', daily.closes, daily.dates, daily.candles, ['volume_breakout']);
    try {
      const hourly = await Aurora.Services.fetchCoinGeckoHourly(symbol);
      const hourlyEntry = { closes: hourly.closes, dates: hourly.dates, candles: null };
      ['sma_rsi', 'macd_cross'].forEach((strategyId) => {
        jobs.push({ candidateKey: `${strategyId}@1h`, strategyId, timeframe: '1h', closes: hourly.closes, candles: null, historyEntry: hourlyEntry });
      });
    } catch { /* orario opzionale */ }
    try {
      // OHLC vera (open/high/low, non solo close+volume come in market_chart) — serve solo al
      // pattern Engulfing, che guarda open/close, non al volume_breakout (gia' coperto sopra).
      const ohlc = await Aurora.Services.fetchCoinGeckoOHLC(symbol);
      const ohlcCloses = ohlc.map((candle) => candle.close);
      jobs.push({ candidateKey: 'engulfing@ohlc_1D', strategyId: 'engulfing', timeframe: 'ohlc_1D', closes: ohlcCloses, candles: ohlc, historyEntry: { closes: ohlcCloses, candles: ohlc } });
    } catch { /* pattern a candela opzionale */ }
  } else {
    // Yahoo/Alpha Vantage danno OHLC reale + volume nella stessa risposta: qui sia volume_breakout
    // sia engulfing possono girare sullo stesso historyEntry condiviso, nessun fetch aggiuntivo.
    const daily = await Aurora.Services.fetchHistoricalCloses(symbol);
    pushGroup('1D', daily.closes, daily.dates, daily.candles, ['volume_breakout', 'engulfing']);
  }

  // orb_breakout: unica strategia del progetto che serve dati intraday con timestamp completo
  // (identifica la barra 09:30 NY) invece di chiusure giornaliere — vedi engine/strategies.js.
  // Scope deciso esplicitamente: ES=F, SPY, QQQ. Fonte opzionale come l'orario/OHLC crypto sopra:
  // se Yahoo non risponde, il simbolo resta comunque coperto dai candidati giornalieri.
  if (Models.ORB_SYMBOLS?.includes(symbol)) {
    try {
      const intraday = await Aurora.Services.fetchYahooIntraday(symbol, '30m', '60d');
      if (intraday.candles.length) {
        const orbCloses = intraday.candles.map((c) => c.close);
        const historyEntry = { closes: orbCloses, dates: null, candles: intraday.candles };
        jobs.push({ candidateKey: 'orb_breakout@30m', strategyId: 'orb_breakout', timeframe: '30m', closes: orbCloses, candles: intraday.candles, historyEntry });
      }
    } catch { /* intraday opzionale: ORB salta, il resto della copertura resta intatto */ }
  }
  return jobs;
}

// Sul sito pubblicato (GitHub Pages) lo stato non e' piu' locale al browser di chi visita: e' il
// conto del bot autonomo che gira via job schedulati (server/jobs/, GitHub Actions), che
// committano data/account.json e data/research.json nel repo. Qui il frontend li legge e sostituisce
// lo stato locale — il sito diventa una dashboard di sola lettura sul bot, non un secondo conto
// indipendente. In sviluppo locale (file://) il fetch fallisce silenziosamente (bloccato dal
// browser) e l'app si comporta esattamente come sempre: nessun ramo speciale da mantenere a parte.
Aurora.Services.hydrateFromSharedState = async function hydrateFromSharedState() {
  try {
    const [accountRes, researchRes] = await Promise.all([fetch('./data/account.json'), fetch('./data/research.json')]);
    if (!accountRes.ok || !researchRes.ok) return false;
    const account = await accountRes.json();
    const research = await researchRes.json();
    const Models = Aurora.Models;

    if (account.demoAccount) Models.demoAccount = { ...Models.makeDemoAccount(), ...account.demoAccount };
    if (Array.isArray(account.activity)) Models.activity = account.activity;
    if (account.autopilotMode === 'quality' || account.autopilotMode === 'coverage') Models.autopilotMode = account.autopilotMode;
    if (research.researchData) {
      Models.researchData = {
        alphaVantageKey: null,
        validated: research.researchData.validated || {},
        trackRecord: research.researchData.trackRecord || {},
        tradeEpisodes: research.researchData.tradeEpisodes || {},
        lessons: research.researchData.lessons || {},
        seeded: false
      };
    }
    if (research.historyCache) Models.historyCache = research.historyCache;

    Models.persistDemoAccount();
    Models.persistActivity();
    Models.persistResearchData();
    Models.persistHistoryCache();
    return true;
  } catch {
    return false;
  }
};

// Backtest walk-forward multi-strategia: ogni candidato (strategia x timeframe) e' validato
// indipendentemente, in-sample E out-of-sample contro una baseline casuale. Il pool di candidati
// validati alimenta Aurora.Engine.ruleSignalFor, che sceglie il migliore momento per momento.
Aurora.Services.runResearchBacktest = async function runResearchBacktest(symbol) {
  const Models = Aurora.Models;
  const statusEl = Aurora.Utils.$('research-status');
  statusEl.textContent = `Scarico storico e testo le strategie per ${symbol}…`;
  statusEl.className = 'status-pill running';
  try {
    const jobs = await buildCandidateJobs(symbol);
    if (!jobs.length) throw new Error('Nessuna fonte storica gratuita disponibile per questo simbolo.');

    const stopPct = Models.SIMULATION.autopilotStopPercent;
    const targetPct = Models.SIMULATION.autopilotTargetPercent;
    const warmup = 50;
    const candidates = {};
    Models.historyCache[symbol] = Models.historyCache[symbol] || {};

    jobs.forEach((job) => {
      const strategy = Aurora.Engine.STRATEGIES[job.strategyId];
      if (strategy.requiresOhlc && !job.candles) return;
      if (job.closes.length < 60) return;

      Models.historyCache[symbol][job.timeframe] = { ...job.historyEntry, fetchedAt: new Date().toISOString() };

      const split = Aurora.Engine.runSplitBacktest(job.closes, strategy.signal, stopPct, targetPct, 0.7, warmup, job.candles);
      const inSampleBars = Math.max(1, split.splitIndex - warmup);
      const entryProb = Aurora.Utils.clamp(split.inSample.count / inSampleBars, 0.01, 0.5);
      // 90 invece di 30 (RANDOM_BASELINE_TRIALS): confrontando lo stesso identico backtest
      // ri-eseguito due volte, il 4% dei candidati (soprattutto quelli a pochi trade, vicini al
      // margine del gate) cambiava fascia validato/esplorativo/nessuno da soli per il rumore
      // della media a 30 estrazioni casuali — mai per bollinger_reversion, che ha campioni piu'
      // ampi. Piu' trial riduce (non elimina) quella varianza; nessuna soglia abbassata.
      const baseline = Aurora.Engine.runRandomBaselineSplit(job.closes, stopPct, targetPct, split.splitIndex, entryProb, 0.15, Aurora.Models.RANDOM_BASELINE_TRIALS, warmup);
      const inSamplePasses = Aurora.Engine.passesEdgeGate(split.inSample, baseline.inSample);
      const hasEnoughOutOfSampleData = split.outOfSample.count >= Models.SIMULATION.minimumOutOfSampleTrades;
      const outOfSamplePasses = hasEnoughOutOfSampleData && Aurora.Engine.passesEdgeGate(split.outOfSample, baseline.outOfSample);
      const validated = inSamplePasses && outOfSamplePasses;
      // Esplorativo: un edge in-sample reale che i dati fuori campione non hanno ancora ne'
      // confermato ne' smentito (campione insufficiente) — non "matematicamente perfetto",
      // ma nemmeno inventato. Diverso da una strategia che i dati hanno gia' smentito: quella
      // resta esclusa, il rischio li' non sarebbe ignoranza ma negazione dell'evidenza.
      const exploratory = !validated && inSamplePasses && !hasEnoughOutOfSampleData;

      candidates[job.candidateKey] = {
        validated, exploratory, strategyId: job.strategyId, label: strategy.label, timeframe: job.timeframe,
        count: split.inSample.count + split.outOfSample.count,
        winRate: split.outOfSample.count ? split.outOfSample.winRate : split.inSample.winRate,
        avgReturn: split.outOfSample.count ? split.outOfSample.avgReturn : split.inSample.avgReturn,
        inSample: split.inSample,
        outOfSample: split.outOfSample,
        inSampleBaseline: baseline.inSample,
        outOfSampleBaseline: baseline.outOfSample,
        checkedAt: new Date().toISOString()
      };
    });

    Models.persistHistoryCache();
    Models.researchData.validated[symbol] = { candidates };
    Models.persistResearchData();
    Aurora.Views.renderResearchResults();

    const validatedCount = Object.values(candidates).filter((c) => c.validated).length;
    const exploratoryCount = Object.values(candidates).filter((c) => c.exploratory).length;
    const totalCount = Object.keys(candidates).length;
    statusEl.textContent = `Backtest completato per ${symbol}: ${validatedCount}/${totalCount} validate, ${exploratoryCount} esplorative.`;
    statusEl.className = `status-pill ${validatedCount ? 'ok' : exploratoryCount ? 'running' : 'blocked'}`;
    Aurora.Views.showToast(
      validatedCount ? `${symbol}: ${validatedCount} strategie validate in-sample e out-of-sample.`
        : exploratoryCount ? `${symbol}: nessuna validata, ${exploratoryCount} esplorative (edge promettente, dati fuori campione insufficienti).`
        : `${symbol}: nessuna delle ${totalCount} strategie testate ha un edge robusto, resta neutro.`,
      validatedCount ? 'success' : ''
    );
  } catch (error) {
    statusEl.textContent = `Errore backtest ${symbol}: ${error.message}`;
    statusEl.className = 'status-pill blocked';
  }
};
