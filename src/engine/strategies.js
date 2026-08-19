// Libreria di strategie candidate. Ognuna riceve un contesto { closes, candles } (candles puo'
// essere null se non disponibile) e restituisce 'bullish'|'neutral'. Nessuna strategia qui
// autorizza da sola un trade: ognuna deve prima superare runSplitBacktest/passesEdgeGate
// (in-sample E out-of-sample) nella sezione Research prima di poter alimentare un segnale —
// stessa disciplina di sempre, solo su piu' fonti indipendenti di edge invece di una sola.
window.Aurora = window.Aurora || {};
Aurora.Engine = Aurora.Engine || {};

Aurora.Engine.STRATEGIES = {
  sma_rsi: {
    id: 'sma_rsi',
    label: 'SMA50/RSI14 (trend)',
    requiresOhlc: false,
    signal({ closes }) {
      const sma = Aurora.Engine.computeSMA(closes, 50);
      const rsi = Aurora.Engine.computeRSI(closes, 14);
      if (sma === null || rsi === null) return 'neutral';
      const price = closes[closes.length - 1];
      return price > sma && rsi >= 40 && rsi <= 70 ? 'bullish' : 'neutral';
    }
  },
  macd_cross: {
    id: 'macd_cross',
    label: 'MACD crossover (12/26/9)',
    requiresOhlc: false,
    signal({ closes }) {
      const macd = Aurora.Engine.computeMACD(closes);
      if (!macd) return 'neutral';
      return macd.histogram > 0 ? 'bullish' : 'neutral';
    }
  },
  bollinger_reversion: {
    id: 'bollinger_reversion',
    label: 'Bollinger mean-reversion (20,2σ)',
    requiresOhlc: false,
    signal({ closes }) {
      const bands = Aurora.Engine.computeBollingerBands(closes, 20, 2);
      if (!bands) return 'neutral';
      const price = closes[closes.length - 1];
      return price < bands.lower ? 'bullish' : 'neutral';
    }
  },
  donchian_breakout: {
    id: 'donchian_breakout',
    label: 'Donchian breakout (20)',
    requiresOhlc: false,
    signal({ closes }) {
      const donchianHigh = Aurora.Engine.computeDonchianHigh(closes, 20);
      if (donchianHigh === null) return 'neutral';
      const price = closes[closes.length - 1];
      return price > donchianHigh ? 'bullish' : 'neutral';
    }
  },
  engulfing: {
    id: 'engulfing',
    label: 'Pattern Engulfing (candela)',
    requiresOhlc: true,
    signal({ candles }) {
      if (!candles || candles.length < 2) return 'neutral';
      return Aurora.Engine.detectEngulfing(candles) === 'bullish' ? 'bullish' : 'neutral';
    }
  }
};

// Retro-compatibilita': smaRsiRule resta disponibile come alias della strategia sma_rsi con la
// vecchia firma a solo-closes, usata da eventuali test/script che non passano ancora un contesto.
Aurora.Engine.smaRsiRule = function smaRsiRule(closesSoFar) {
  return Aurora.Engine.STRATEGIES.sma_rsi.signal({ closes: closesSoFar, candles: null });
};

// Fabbrica di regole SMA/RSI parametrizzate — usata dalla ricerca walk-forward per confrontare varianti.
Aurora.Engine.makeRule = function makeRule(smaPeriod, rsiPeriod, low, high) {
  return ({ closes }) => {
    const sma = Aurora.Engine.computeSMA(closes, smaPeriod);
    const rsi = Aurora.Engine.computeRSI(closes, rsiPeriod);
    if (sma === null || rsi === null) return 'neutral';
    const price = closes[closes.length - 1];
    return price > sma && rsi >= low && rsi <= high ? 'bullish' : 'neutral';
  };
};
