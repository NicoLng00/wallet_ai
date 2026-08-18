import { z } from 'zod';

function computeATR(candles, period = 14) {
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
}

function unavailable(reason) {
  return { available: false, thesis: reason, confidence: null, evidence: [], risk_flags: ['no-data-source'], model_version: null };
}

// Regime di volatilita' reale (ATR14 recente vs ATR14 precedente) da candele OHLC — quando
// disponibili (crypto via CoinGecko OHLC, azionario via Alpha Vantage). Consultivo: segnala uno
// spike anomalo, non blocca mai da solo — il Risk Engine lato client resta l'unico gate.
export const marketRegimeAgentTool = {
  name: 'market_regime',
  config: {
    title: 'Market Regime',
    description: 'Calcola il regime di volatilita\' reale (ATR) da candele OHLC, se disponibili.',
    inputSchema: { symbol: z.string(), candles: z.array(z.object({ open: z.number(), high: z.number(), low: z.number(), close: z.number() })).default([]) },
    outputSchema: {
      available: z.boolean(),
      thesis: z.string(),
      confidence: z.number().nullable(),
      evidence: z.array(z.string()),
      risk_flags: z.array(z.string()),
      model_version: z.string().nullable()
    }
  },
  async handler({ symbol, candles }) {
    if (!candles || candles.length < 30) return unavailable(`Nessuna candela OHLC sufficiente per stimare il regime di volatilita' di ${symbol}.`);
    const recentATR = computeATR(candles, 14);
    const baselineATR = computeATR(candles.slice(0, candles.length - 14), 14);
    if (!recentATR || !baselineATR) return unavailable(`ATR non calcolabile per ${symbol}.`);
    const ratio = recentATR / baselineATR;
    const regime = ratio >= 2.5 ? 'extreme' : ratio >= 1.5 ? 'elevated' : 'normal';
    return {
      available: true,
      thesis: regime === 'normal'
        ? `Volatilita' nella norma per ${symbol} (ATR recente ${ratio.toFixed(2)}x il livello precedente).`
        : `Volatilita' ${regime === 'extreme' ? 'anomala' : 'elevata'} per ${symbol}: ATR recente ${ratio.toFixed(2)}x il livello precedente — momento meno affidabile per un nuovo ingresso.`,
      confidence: null,
      evidence: [`atrRatio=${ratio.toFixed(2)}`, `recentATR=${recentATR.toFixed(4)}`, `baselineATR=${baselineATR.toFixed(4)}`],
      risk_flags: regime === 'normal' ? [] : [`volatility-${regime}`],
      model_version: 'atr-regime-v1'
    };
  }
};
