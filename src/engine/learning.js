// Selezione adattiva delle strategie: non e' training di un modello generativo, e' un
// tracciamento delle performance REALIZZATE per (simbolo, strategia+timeframe), riusato dal
// gate di onesta' in engine/rules.js per escludere dalla selezione una strategia che smette
// di reggere sui risultati veri — coerente con la stessa disciplina statistica del backtest.
window.Aurora = window.Aurora || {};
Aurora.Engine = Aurora.Engine || {};

Aurora.Engine.recordStrategyOutcome = function recordStrategyOutcome(symbol, candidateKey, returnPct) {
  if (!candidateKey || !Number.isFinite(returnPct)) return;
  const researchData = Aurora.Models.researchData;
  researchData.trackRecord[symbol] = researchData.trackRecord[symbol] || {};
  researchData.trackRecord[symbol][candidateKey] = researchData.trackRecord[symbol][candidateKey] || { trades: [] };
  researchData.trackRecord[symbol][candidateKey].trades.push({ returnPct, at: new Date().toISOString() });
  Aurora.Models.persistResearchData();
};

// Riepilogo per la UI: per ogni candidato validato mostra anche l'esito live se ne ha abbastanza.
Aurora.Engine.getStrategyTrackRecordSummary = function getStrategyTrackRecordSummary(symbol, candidateKey) {
  const track = Aurora.Models.researchData.trackRecord?.[symbol]?.[candidateKey];
  if (!track || !track.trades.length) return null;
  return { ...Aurora.Engine.summarizeTrades(track.trades), sampleTrades: track.trades.length };
};
