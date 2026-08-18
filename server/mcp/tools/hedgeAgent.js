import { z } from 'zod';

function pearsonCorrelation(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 10) return null;
  const aSlice = a.slice(-n);
  const bSlice = b.slice(-n);
  const meanA = aSlice.reduce((sum, value) => sum + value, 0) / n;
  const meanB = bSlice.reduce((sum, value) => sum + value, 0) / n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i += 1) {
    const da = aSlice[i] - meanA;
    const db = bSlice[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA === 0 || varB === 0) return null;
  return cov / Math.sqrt(varA * varB);
}

function dailyReturns(closes) {
  const returns = [];
  for (let i = 1; i < closes.length; i += 1) returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  return returns;
}

// Correlazione reale (Pearson sui rendimenti giornalieri) tra il simbolo candidato e gli altri
// simboli con storico disponibile — l'evidenza dice se aprire QUESTA posizione concentra il
// rischio su qualcosa gia' in portafoglio. Consultivo: non blocca mai un ordine da solo, il
// Risk Engine lato client resta l'unico gate esecutivo.
export const hedgeAgentTool = {
  name: 'hedge',
  config: {
    title: 'Hedge Strategist',
    description: 'Calcola la correlazione storica reale tra il simbolo candidato e gli altri simboli gia\' in posizione.',
    inputSchema: {
      symbol: z.string(),
      candidateCloses: z.array(z.number()).default([]),
      otherSymbols: z.array(z.object({ symbol: z.string(), closes: z.array(z.number()), heldPosition: z.boolean() })).default([])
    },
    outputSchema: {
      available: z.boolean(),
      thesis: z.string(),
      confidence: z.number().nullable(),
      evidence: z.array(z.string()),
      risk_flags: z.array(z.string()),
      model_version: z.string().nullable()
    }
  },
  async handler({ symbol, candidateCloses, otherSymbols }) {
    if (!candidateCloses || candidateCloses.length < 11 || !otherSymbols?.length) {
      return { available: false, thesis: 'Storico insufficiente per calcolare correlazioni.', confidence: null, evidence: [], risk_flags: ['no-data-source'], model_version: null };
    }
    const candidateReturns = dailyReturns(candidateCloses);
    const correlations = otherSymbols
      .map((other) => ({ symbol: other.symbol, heldPosition: other.heldPosition, correlation: pearsonCorrelation(candidateReturns, dailyReturns(other.closes)) }))
      .filter((entry) => entry.correlation !== null)
      .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
    if (!correlations.length) {
      return { available: false, thesis: 'Nessuna correlazione calcolabile con gli altri simboli disponibili.', confidence: null, evidence: [], risk_flags: ['no-data-source'], model_version: null };
    }
    const concentrationRisk = correlations.find((entry) => entry.heldPosition && Math.abs(entry.correlation) > 0.6);
    const top = correlations[0];
    return {
      available: true,
      thesis: concentrationRisk
        ? `Correlazione alta (${concentrationRisk.correlation.toFixed(2)}) con ${concentrationRisk.symbol}, gia' in posizione: rischio di concentrazione, non di diversificazione.`
        : `Correlazione piu' alta: ${top.symbol} (${top.correlation.toFixed(2)}). Nessuna posizione aperta fortemente correlata.`,
      confidence: null,
      evidence: correlations.slice(0, 4).map((entry) => `${entry.symbol}: r=${entry.correlation.toFixed(2)}${entry.heldPosition ? ' (in posizione)' : ''}`),
      risk_flags: concentrationRisk ? ['correlation-concentration'] : [],
      model_version: 'pearson-daily-returns'
    };
  }
};
