// Fetch di dati di mercato reali (quotazioni live e storico per il backtest). Nessuna chiave
// nel codice sorgente: tutte inserite dall'utente e salvate solo in localStorage.
window.Aurora = window.Aurora || {};
Aurora.Services = Aurora.Services || {};

// Alpha Vantage free tier rifiuta piu' di 1 richiesta/secondo (verificato in sessione con un
// errore reale). Throttle minimo prima di ogni chiamata AV, cosi' testare piu' simboli in
// sequenza (es. dalla Research) non incappa mai nel rate limit per un semplice timing.
let lastAlphaVantageCallAt = 0;
async function throttleAlphaVantage() {
  const elapsed = Date.now() - lastAlphaVantageCallAt;
  if (elapsed < 1100) await new Promise((resolve) => setTimeout(resolve, 1100 - elapsed));
  lastAlphaVantageCallAt = Date.now();
}

Aurora.Services.fetchFinnhubQuote = async function fetchFinnhubQuote(apiSymbol) {
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(apiSymbol)}&token=${encodeURIComponent(Aurora.Models.liveData.finnhubKey)}`);
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
  const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
  if (!res.ok) throw new Error(`http-${res.status}`);
  return res.json();
};

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
        Models.demoAccount.market[symbol] = price * Models.usdToEurRate;
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
  const res = await fetch(url);
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
    close: Number(series[date]['4. close'])
  }));
  return { closes, candles, dates };
};

Aurora.Services.fetchAlphaVantageWTI = async function fetchAlphaVantageWTI() {
  await throttleAlphaVantage();
  const url = `https://www.alphavantage.co/query?function=WTI&interval=daily&apikey=${encodeURIComponent(Aurora.Models.researchData.alphaVantageKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`http-${res.status}`);
  const data = await res.json();
  if (!data.data) throw new Error(data.Note || data.Information || 'Dati non disponibili');
  const closes = data.data.slice().reverse().filter((point) => point.value !== '.').map((point) => Number(point.value));
  return { closes, candles: null, dates: null };
};

// Storico giornaliero fino a 365 giorni (il massimo gratuito su CoinGecko), non piu' limitato a 200.
Aurora.Services.fetchCoinGeckoHistory = async function fetchCoinGeckoHistory(symbol) {
  const id = Aurora.Models.COINGECKO_IDS[symbol];
  const to = Math.floor(Date.now() / 1000);
  const from = to - 365 * 86400;
  const res = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`);
  if (!res.ok) throw new Error(`http-${res.status}`);
  const data = await res.json();
  const points = data.prices || [];
  return { closes: points.map(([, price]) => price), candles: null, dates: points.map(([ts]) => new Date(ts).toISOString().slice(0, 10)) };
};

// Storico a granularita' oraria (CoinGecko la assegna automaticamente per range <=90 giorni,
// gratuito) — solo crypto: e' la fonte che rende plausibile un'attivita' piu' che giornaliera,
// senza abbassare la soglia di validazione su nessuna singola regola.
Aurora.Services.fetchCoinGeckoHourly = async function fetchCoinGeckoHourly(symbol) {
  const id = Aurora.Models.COINGECKO_IDS[symbol];
  const to = Math.floor(Date.now() / 1000);
  const from = to - 90 * 86400;
  const res = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`);
  if (!res.ok) throw new Error(`http-${res.status}`);
  const data = await res.json();
  const points = data.prices || [];
  return { closes: points.map(([, price]) => price), dates: points.map(([ts]) => new Date(ts).toISOString()) };
};

// OHLC reale (candele vere, non solo chiusura) — usato per il pattern Engulfing e per l'ATR.
Aurora.Services.fetchCoinGeckoOHLC = async function fetchCoinGeckoOHLC(symbol, days = 180) {
  const id = Aurora.Models.COINGECKO_IDS[symbol];
  const res = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=${days}`);
  if (!res.ok) throw new Error(`http-${res.status}`);
  const data = await res.json();
  return (data || []).map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
};

Aurora.Services.fetchHistoricalCloses = async function fetchHistoricalCloses(symbol) {
  const Models = Aurora.Models;
  if (Models.COINGECKO_IDS[symbol]) return Aurora.Services.fetchCoinGeckoHistory(symbol);
  if (symbol === 'WTI') return Aurora.Services.fetchAlphaVantageWTI();
  if (Models.ALPHA_VANTAGE_STOCK_SYMBOLS.includes(symbol)) return Aurora.Services.fetchAlphaVantageDaily(symbol);
  throw new Error('Nessuna fonte storica gratuita disponibile per questo simbolo.');
};

// Costruisce l'elenco di candidati (strategia x timeframe) da testare per un simbolo, con i
// dati reali gia' scaricati per ciascuno. Le fonti secondarie (orario, OHLC) sono opzionali:
// se falliscono (es. rate limit), il simbolo resta comunque coperto dai candidati giornalieri.
async function buildCandidateJobs(symbol) {
  const Models = Aurora.Models;
  const jobs = [];
  const CLOSES_STRATEGIES = ['sma_rsi', 'macd_cross', 'bollinger_reversion'];

  if (Models.COINGECKO_IDS[symbol]) {
    const daily = await Aurora.Services.fetchCoinGeckoHistory(symbol);
    CLOSES_STRATEGIES.forEach((strategyId) => {
      jobs.push({ candidateKey: `${strategyId}@1D`, strategyId, timeframe: '1D', closes: daily.closes, candles: null, historyEntry: { closes: daily.closes, dates: daily.dates } });
    });
    try {
      const hourly = await Aurora.Services.fetchCoinGeckoHourly(symbol);
      ['sma_rsi', 'macd_cross'].forEach((strategyId) => {
        jobs.push({ candidateKey: `${strategyId}@1h`, strategyId, timeframe: '1h', closes: hourly.closes, candles: null, historyEntry: { closes: hourly.closes, dates: hourly.dates } });
      });
    } catch { /* orario opzionale */ }
    try {
      const ohlc = await Aurora.Services.fetchCoinGeckoOHLC(symbol);
      const ohlcCloses = ohlc.map((candle) => candle.close);
      jobs.push({ candidateKey: 'engulfing@1D', strategyId: 'engulfing', timeframe: 'ohlc_1D', closes: ohlcCloses, candles: ohlc, historyEntry: { closes: ohlcCloses, candles: ohlc } });
    } catch { /* pattern a candela opzionale */ }
  } else {
    const daily = await Aurora.Services.fetchHistoricalCloses(symbol);
    CLOSES_STRATEGIES.forEach((strategyId) => {
      jobs.push({ candidateKey: `${strategyId}@1D`, strategyId, timeframe: '1D', closes: daily.closes, candles: null, historyEntry: { closes: daily.closes, dates: daily.dates } });
    });
    if (daily.candles) {
      jobs.push({ candidateKey: 'engulfing@1D', strategyId: 'engulfing', timeframe: '1D', closes: daily.closes, candles: daily.candles, historyEntry: { closes: daily.closes, candles: daily.candles } });
    }
  }
  return jobs;
}

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
      const baseline = Aurora.Engine.runRandomBaselineSplit(job.closes, stopPct, targetPct, split.splitIndex, entryProb, 0.15, 30, warmup);
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
