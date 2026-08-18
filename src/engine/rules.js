// Deriva il segnale per un simbolo dal "pool" di strategie validate o esplorative
// (engine/strategies.js). Nessuna strategia parla se non ha almeno superato la finestra
// in-sample nella sezione Research — per tutti i simboli/strategie senza questa base resta
// esplicitamente neutro, niente bias inventato al posto di un edge non misurato.
window.Aurora = window.Aurora || {};
Aurora.Engine = Aurora.Engine || {};

const LIVE_TRACK_RECORD_MIN_TRADES = 10;

function scoreCandidate(candidate) {
  const ref = candidate.outOfSample.count ? candidate.outOfSample : candidate.inSample;
  const baseline = candidate.outOfSample.count ? candidate.outOfSampleBaseline : candidate.inSampleBaseline;
  const edgeMargin = ref.winRate - baseline.winRate;
  let score = Math.round(Aurora.Utils.clamp(50 + edgeMargin * 1.5 + ref.avgReturn * 4, 20, 90));
  let confidence = Math.round(Aurora.Utils.clamp(50 + Math.abs(ref.winRate - 50), 45, 85));
  if (candidate.exploratory) {
    // Meno certezza di una strategia confermata fuori campione: penalita' esplicita, non nascosta.
    score = Math.round(Aurora.Utils.clamp(score - 8, 20, 90));
    confidence = Math.round(Aurora.Utils.clamp(confidence - 10, 30, 80));
  }
  return { score, confidence };
}

// Selezione adattiva: una strategia che, sui trade REALMENTE eseguiti (non un altro backtest),
// smette di reggere contro la stessa baseline viene esclusa dalla selezione finche' non torna a
// reggere — non e' training di un modello, e' verifica continua sugli esiti reali. Sotto la
// soglia minima di campione, si continua a fidarsi del backtest storico.
function survivesLiveTrackRecord(symbol, candidateKey, candidate) {
  const track = Aurora.Models.researchData.trackRecord?.[symbol]?.[candidateKey];
  if (!track || track.trades.length < LIVE_TRACK_RECORD_MIN_TRADES) return true;
  const liveSummary = Aurora.Engine.summarizeTrades(track.trades);
  return Aurora.Engine.passesEdgeGate(liveSummary, candidate.outOfSampleBaseline);
}

function evaluateCandidates(symbol, keys, candidates, tier) {
  const historyCache = Aurora.Models.historyCache;
  return keys.map((key) => {
    const candidate = candidates[key];
    const strategy = Aurora.Engine.STRATEGIES[candidate.strategyId];
    const history = historyCache[symbol]?.[candidate.timeframe];
    if (!strategy || !history?.closes?.length) return null;
    const closesSoFar = [...history.closes, Aurora.Engine.getDemoPrice(symbol)];
    const signal = strategy.signal({ closes: closesSoFar, candles: history.candles || null });
    const { score, confidence } = scoreCandidate(candidate);
    const rsi = Aurora.Engine.computeRSI(closesSoFar, 14);
    const volatility = history.candles ? Aurora.Engine.computeVolatilityRegime(history.candles) : null;
    return {
      candidateKey: key, strategyId: candidate.strategyId, timeframe: candidate.timeframe, score, confidence,
      bullish: signal === 'bullish', defensive: rsi !== null && rsi > 75, tier,
      volatilityRegime: volatility?.regime || null
    };
  }).filter(Boolean);
}

// Il "team" sceglie, tra tutte le strategie/timeframe validati e ancora affidabili sui risultati
// reali per questo simbolo, quella con lo score piu' alto in questo momento. Se nessuna e'
// validata, ripiega sulle candidate "esplorative" (edge promettente, non ancora confermato
// fuori campione) — mai su una candidata gia' smentita dai dati.
Aurora.Engine.ruleSignalFor = function ruleSignalFor(symbol) {
  const researchData = Aurora.Models.researchData;
  const entry = researchData.validated[symbol];
  const candidates = entry?.candidates || {};
  const neutral = { validated: false, exploratory: false, tier: null, score: 50, confidence: 45, bullish: false, defensive: false, strategyId: null, timeframe: null, candidateKey: null, volatilityRegime: null };

  const validatedKeys = Object.keys(candidates)
    .filter((key) => candidates[key].validated)
    .filter((key) => survivesLiveTrackRecord(symbol, key, candidates[key]));
  const validatedEvaluated = evaluateCandidates(symbol, validatedKeys, candidates, 'validated');
  if (validatedEvaluated.length) {
    validatedEvaluated.sort((a, b) => b.score - a.score);
    return { validated: true, exploratory: false, ...validatedEvaluated[0] };
  }

  const exploratoryKeys = Object.keys(candidates)
    .filter((key) => candidates[key].exploratory)
    .filter((key) => survivesLiveTrackRecord(symbol, key, candidates[key]));
  const exploratoryEvaluated = evaluateCandidates(symbol, exploratoryKeys, candidates, 'exploratory');
  if (exploratoryEvaluated.length) {
    exploratoryEvaluated.sort((a, b) => b.score - a.score);
    return { validated: false, exploratory: true, ...exploratoryEvaluated[0] };
  }

  return neutral;
};
