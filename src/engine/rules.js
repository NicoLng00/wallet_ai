// Deriva il segnale per un simbolo dal "pool" di strategie validate, esplorative o sonda
// (engine/strategies.js). Tre livelli, mai confusi tra loro:
//  - validated: edge confermato walk-forward (in-sample E out-of-sample).
//  - exploratory: edge in-sample reale, dati fuori campione insufficienti per confermare/smentire.
//  - probe ("sonda"): la MENO PEGGIO tra le strategie gia' scartate dal gate — nessun edge
//    misurato, taglia minima, usata solo quando non c'e' nient'altro, esplicitamente per generare
//    episodi che il Learning Loop possa analizzare. Mai spacciata per un segnale reale.
window.Aurora = window.Aurora || {};
Aurora.Engine = Aurora.Engine || {};

const LIVE_TRACK_RECORD_MIN_TRADES = 10;
// Finestra mobile, non l'intero storico live: prima survivesLiveTrackRecord valutava TUTTI i
// trade mai eseguiti per quel candidato — una strategia con 40 trade buoni in passato poteva
// mascherare 10 trade recenti gia' in peggioramento, perche' la media cumulativa restava ancora
// sopra soglia. Con una finestra recente, un cambio di regime si vede in settimane, non in mesi.
const LIVE_TRACK_RECORD_WINDOW = 15;

function scoreCandidate(candidate, tier) {
  const ref = candidate.outOfSample.count ? candidate.outOfSample : candidate.inSample;
  const baseline = candidate.outOfSample.count ? candidate.outOfSampleBaseline : candidate.inSampleBaseline;
  const edgeMargin = ref.winRate - baseline.winRate;
  if (tier === 'probe') {
    // Punteggio deliberatamente basso e confidenza deliberatamente bassa: non e' un edge misurato,
    // e' la meno peggio tra le opzioni scartate. "Ponderato" significa scegliere la migliore delle
    // scartate, non scegliere a caso.
    const score = Math.round(Aurora.Utils.clamp(35 + edgeMargin * 1.5 + ref.avgReturn * 4, 5, 55));
    const confidence = Math.round(Aurora.Utils.clamp(30 + Math.max(0, edgeMargin) * 0.4, 25, 45));
    return { score, confidence };
  }
  let score = Math.round(Aurora.Utils.clamp(50 + edgeMargin * 1.5 + ref.avgReturn * 4, 20, 90));
  let confidence = Math.round(Aurora.Utils.clamp(50 + Math.abs(ref.winRate - 50), 45, 85));
  if (tier === 'exploratory') {
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
  const recentTrades = track.trades.slice(-LIVE_TRACK_RECORD_WINDOW);
  const liveSummary = Aurora.Engine.summarizeTrades(recentTrades);
  return Aurora.Engine.passesEdgeGate(liveSummary, candidate.outOfSampleBaseline);
}
// Esposta su Aurora.Engine solo per renderla testabile in isolamento (server/tests/regression.test.js,
// guardia contro la regressione della finestra mobile) — nessun punto di chiamata interno a questo
// file cambiato, resta comunque richiamata come funzione locale qui sotto.
Aurora.Engine.survivesLiveTrackRecord = survivesLiveTrackRecord;

// Decadimento graduale della taglia PRIMA del taglio netto a LIVE_TRACK_RECORD_MIN_TRADES:
// survivesLiveTrackRecord sopra e' binaria (dentro/fuori) e scatta solo a campione pieno (10
// trade) — fino ad allora una strategia che sta gia' perdendo sui risultati REALI viene comunque
// giocata a taglia piena. Qui invece, appena il campione live minimo (3 trade) mostra un
// rendimento medio recente negativo, la taglia si riduce proporzionalmente (mai sotto il 50%):
// meno esposizione a un pattern che si sta gia' rivelando negativo, senza escluderlo del tutto
// prima che ci sia campione sufficiente per esserne certi.
const LIVE_DECAY_MIN_TRADES = 3;
const LIVE_DECAY_WINDOW = 8; // stessa finestra recente del Learning Loop, vedi engine/memory.js
Aurora.Engine.liveConfidenceFactor = function liveConfidenceFactor(symbol, candidateKey) {
  const track = Aurora.Models.researchData.trackRecord?.[symbol]?.[candidateKey];
  if (!track || track.trades.length < LIVE_DECAY_MIN_TRADES) return 1;
  const recent = track.trades.slice(-LIVE_DECAY_WINDOW);
  const summary = Aurora.Engine.summarizeTrades(recent);
  if (summary.avgReturn >= 0) return 1;
  return Aurora.Utils.clamp(1 + summary.avgReturn * 0.15, 0.5, 1);
};

function evaluateCandidates(symbol, keys, candidates, tier) {
  const historyCache = Aurora.Models.historyCache;
  return keys.map((key) => {
    const candidate = candidates[key];
    const strategy = Aurora.Engine.STRATEGIES[candidate.strategyId];
    const history = historyCache[symbol]?.[candidate.timeframe];
    if (!strategy || !history?.closes?.length) return null;
    const closesSoFar = [...history.closes, Aurora.Engine.getDemoPrice(symbol)];
    const signal = strategy.signal({ closes: closesSoFar, candles: history.candles || null });
    const { score, confidence } = scoreCandidate(candidate, tier);
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
// validata, ripiega sulle candidate "esplorative"; se nemmeno quelle esistono, ripiega su una
// sonda — mai su una candidata gia' smentita da dati SUFFICIENTI a smentirla (quella resta
// esclusa a qualunque livello: li' il rischio sarebbe negare un fatto misurato, non ignoranza).
// Tra le candidate valutate per un livello, preferisce quella bullish OGGI con lo score piu'
// alto invece del semplice top-score assoluto: prima scegliere-per-score-e-poi-controllare-
// bullish (come faceva questa funzione) significava che una candidata validata/esplorativa/sonda
// con score leggermente piu' alto ma NEUTRA oggi nascondeva un'altra candidata, con score minore,
// che invece oggi e' realmente bullish — un'opportunita' reale scartata senza motivo, non solo un
// problema di frequenza. Se nessuna e' bullish oggi, si ripiega comunque sul top-score assoluto:
// il tier (validated/exploratory) resta segnalato correttamente anche a segnale neutro, che serve
// al confronto con l'AI (agents/supervisor.js blocca un giudizio Gemini rialzista in conflitto con
// una regola validata anche quando quella regola oggi tace).
function pickBestCandidate(evaluated) {
  const byScoreDesc = (a, b) => b.score - a.score;
  const bullish = evaluated.filter((candidate) => candidate.bullish).sort(byScoreDesc);
  if (bullish.length) return bullish[0];
  return [...evaluated].sort(byScoreDesc)[0];
}

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
    return { validated: true, exploratory: false, ...pickBestCandidate(validatedEvaluated) };
  }

  const exploratoryKeys = Object.keys(candidates)
    .filter((key) => candidates[key].exploratory)
    .filter((key) => survivesLiveTrackRecord(symbol, key, candidates[key]));
  const exploratoryEvaluated = evaluateCandidates(symbol, exploratoryKeys, candidates, 'exploratory');
  if (exploratoryEvaluated.length) {
    return { validated: false, exploratory: true, ...pickBestCandidate(exploratoryEvaluated) };
  }

  // Sonda: solo tra le candidate gia' SMENTITE da dati sufficienti (mai tra quelle senza base —
  // se manca completamente lo storico non c'e' nulla, nemmeno da sondare, e resta neutro) o tra
  // quelle scartate per campione insufficiente. La piu' vicina ad avere avuto un edge, non una a caso.
  const probeKeys = Object.keys(candidates)
    .filter((key) => !candidates[key].validated && !candidates[key].exploratory)
    .filter((key) => survivesLiveTrackRecord(symbol, key, candidates[key]));
  const probeEvaluated = evaluateCandidates(symbol, probeKeys, candidates, 'probe');
  if (probeEvaluated.length) {
    return { validated: false, exploratory: false, ...pickBestCandidate(probeEvaluated) };
  }

  return neutral;
};

// --- Livello "forzato" (fallback giornaliero) --------------------------------------------------
// Diverso dalla sonda: la sonda ha comunque una direzione tecnica letta OGGI (bullish=true su
// almeno una strategia scartata). Qui anche quel requisito cade — scatta solo come ultima
// risorsa quando, entro la giornata, nessun livello (validato/esplorativo/sonda) ha aperto nulla
// su NESSUN simbolo del watchlist. Sceglie comunque nel modo piu' ponderato possibile disponibile:
// il candidato con lo score piu' alto sull'intero watchlist, a prescindere dalla direzione — mai
// a caso, ma esplicitamente senza alcuna pretesa di edge o di lettura direzionale confermata.
// Un simbolo senza NESSUN candidato (nessun backtest mai eseguito, storico assente) resta escluso:
// qui non c'e' proprio nulla su cui essere "meno peggio".
Aurora.Engine.pickForcedDailyCandidate = function pickForcedDailyCandidate(symbols) {
  const candidates = symbols
    .map((symbol) => ({ symbol, signal: Aurora.Engine.ruleSignalFor(symbol) }))
    .filter(({ signal }) => signal.candidateKey);
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.signal.score - a.signal.score);
  return candidates[0];
};
