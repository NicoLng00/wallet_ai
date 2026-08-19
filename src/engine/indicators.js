// Indicatori tecnici (funzioni pure, senza stato).
window.Aurora = window.Aurora || {};
Aurora.Engine = Aurora.Engine || {};

Aurora.Engine.computeSMA = function computeSMA(closes, period) {
  if (closes.length < period) return null;
  const windowSlice = closes.slice(-period);
  return windowSlice.reduce((sum, value) => sum + value, 0) / period;
};

Aurora.Engine.computeRSI = function computeRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  const windowSlice = closes.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < windowSlice.length; i += 1) {
    const delta = windowSlice[i] - windowSlice[i - 1];
    if (delta >= 0) gains += delta; else losses -= delta;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
};

function computeEMASeries(closes, period) {
  if (closes.length < period) return [];
  const k = 2 / (period + 1);
  const series = [];
  let ema = closes.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  series[period - 1] = ema;
  for (let i = period; i < closes.length; i += 1) {
    ema = closes[i] * k + ema * (1 - k);
    series[i] = ema;
  }
  return series;
}

// MACD(12,26,9): linea MACD (EMA12-EMA26), linea segnale (EMA9 della MACD), istogramma.
// Ritorna null finche' non c'e' storico sufficiente per tutte e tre le EMA.
Aurora.Engine.computeMACD = function computeMACD(closes, fast = 12, slow = 26, signalPeriod = 9) {
  if (closes.length < slow + signalPeriod) return null;
  const emaFast = computeEMASeries(closes, fast);
  const emaSlow = computeEMASeries(closes, slow);
  const macdSeries = [];
  for (let i = slow - 1; i < closes.length; i += 1) {
    if (emaFast[i] === undefined || emaSlow[i] === undefined) continue;
    macdSeries.push(emaFast[i] - emaSlow[i]);
  }
  if (macdSeries.length < signalPeriod) return null;
  const signalSeries = computeEMASeries(macdSeries, signalPeriod);
  const macd = macdSeries[macdSeries.length - 1];
  const signal = signalSeries[signalSeries.length - 1];
  if (signal === undefined) return null;
  return { macd, signal, histogram: macd - signal };
};

// Bollinger Bands: SMA(period) +/- deviazioni standard*stdDevMultiplier.
Aurora.Engine.computeBollingerBands = function computeBollingerBands(closes, period = 20, stdDevMultiplier = 2) {
  if (closes.length < period) return null;
  const windowSlice = closes.slice(-period);
  const mean = windowSlice.reduce((sum, value) => sum + value, 0) / period;
  const variance = windowSlice.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);
  return { middle: mean, upper: mean + stdDev * stdDevMultiplier, lower: mean - stdDev * stdDevMultiplier, stdDev };
};

// ATR (Average True Range) su candele OHLC: misura di volatilita' reale, usata per SL/TP adattivi.
Aurora.Engine.computeATR = function computeATR(candles, period = 14) {
  if (!candles || candles.length < period + 1) return null;
  const trueRanges = [];
  for (let i = 1; i < candles.length; i += 1) {
    const { high, low } = candles[i];
    const prevClose = candles[i - 1].close;
    trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  const windowSlice = trueRanges.slice(-period);
  if (windowSlice.length < period) return null;
  return windowSlice.reduce((sum, value) => sum + value, 0) / period;
};

// Regime di volatilita': confronta l'ATR14 piu' recente con l'ATR14 di un blocco precedente di
// candele. Usato come circuit breaker consultivo (mai un blocco silenzioso): un rapporto molto
// alto segnala uno spike anomalo, momento sconsigliato per aprire nuove posizioni.
Aurora.Engine.computeVolatilityRegime = function computeVolatilityRegime(candles) {
  if (!candles || candles.length < 30) return null;
  const recentATR = Aurora.Engine.computeATR(candles, 14);
  const baselineATR = Aurora.Engine.computeATR(candles.slice(0, candles.length - 14), 14);
  if (!recentATR || !baselineATR) return null;
  const ratio = recentATR / baselineATR;
  const regime = ratio >= 2.5 ? 'extreme' : ratio >= 1.5 ? 'elevated' : 'normal';
  return { ratio, regime, recentATR, baselineATR };
};

// Volume medio sulle `period` candele PRIMA di quella corrente (esclusa, stessa logica di
// computeDonchianHigh — mai guardare il volume di oggi contro se stesso). Il volume arriva gia'
// gratis in ogni fonte dati usata dal progetto (Yahoo Finance, CoinGecko) — semplicemente non
// veniva mai estratto ne' usato, un dato reale scartato senza motivo.
Aurora.Engine.computeAverageVolume = function computeAverageVolume(candles, period = 20) {
  if (!candles || candles.length < period + 1) return null;
  const windowSlice = candles.slice(-(period + 1), -1).map((c) => c.volume);
  if (windowSlice.some((v) => !Number.isFinite(v))) return null;
  return windowSlice.reduce((sum, v) => sum + v, 0) / period;
};

// Massimo Donchian: il piu' alto valore di chiusura nelle `period` barre PRIMA di quella corrente
// (esclusa, per evitare look-ahead). Base per la strategia breakout — logica di continuazione del
// trend, diversa sia da SMA/RSI (trend ma filtrato da RSI in banda media, puo' perdere breakout
// forti con RSI gia' alto) sia da Bollinger (mean-reversion, ipotesi opposta).
Aurora.Engine.computeDonchianHigh = function computeDonchianHigh(closes, period = 20) {
  if (closes.length < period + 1) return null;
  const windowSlice = closes.slice(-(period + 1), -1);
  return Math.max(...windowSlice);
};

// Raggruppa candele intraday (con .time in epoch ms) per giorno di calendario LOCALE al fuso
// indicato — necessario per ORB: "oggi" e "le 09:30" sono concetti di calendario di New York, non
// di UTC (il fuso del runner CI e' quasi sempre diverso). Ritorna un array ordinato di gruppi
// { dateKey, bars }, dateKey formato YYYY-MM-DD nel fuso richiesto.
Aurora.Engine.groupCandlesByLocalDay = function groupCandlesByLocalDay(candles, timeZone = 'America/New_York') {
  if (!candles || !candles.length) return [];
  const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const groups = new Map();
  candles.forEach((candle) => {
    if (!Number.isFinite(candle.time)) return;
    const dateKey = dayFormatter.format(new Date(candle.time));
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey).push(candle);
  });
  return [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([dateKey, bars]) => ({ dateKey, bars }));
};

// Trova, tra le barre di un giorno, quella dell'apertura NY (09:30 locale) — l'opening range vero
// e proprio per ORB. Tollerante a piccoli buchi dati: accetta anche 09:31-09:34 (prima barra
// disponibile entro i primi 5 minuti), mai una barra successiva spacciata per l'apertura.
Aurora.Engine.findOpeningRangeBar = function findOpeningRangeBar(dayBars, timeZone = 'America/New_York') {
  if (!dayBars || !dayBars.length) return null;
  const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false });
  for (let i = 0; i < dayBars.length; i += 1) {
    const [hh, mm] = timeFormatter.format(new Date(dayBars[i].time)).split(':').map(Number);
    const minutesSinceOpen = (hh * 60 + mm) - (9 * 60 + 30);
    if (minutesSinceOpen >= 0 && minutesSinceOpen <= 4) return { bar: dayBars[i], index: i };
    if (minutesSinceOpen > 4) return null; // nessuna barra vicina alle 09:30: giorno inutilizzabile
  }
  return null;
};

// Pattern a candela: engulfing rialzista/ribassista sulle ultime due candele OHLC.
Aurora.Engine.detectEngulfing = function detectEngulfing(candles) {
  if (!candles || candles.length < 2) return 'none';
  const prev = candles[candles.length - 2];
  const curr = candles[candles.length - 1];
  const prevBearish = prev.close < prev.open;
  const currBullish = curr.close > curr.open;
  const prevBullish = prev.close > prev.open;
  const currBearish = curr.close < curr.open;
  if (prevBearish && currBullish && curr.open <= prev.close && curr.close >= prev.open) return 'bullish';
  if (prevBullish && currBearish && curr.open >= prev.close && curr.close <= prev.open) return 'bearish';
  return 'none';
};
