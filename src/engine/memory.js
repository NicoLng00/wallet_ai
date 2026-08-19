// Learning Loop: Trade Critic -> Failure Attribution -> Similar Trade Retrieval -> Lesson
// Extraction -> Memory -> Evidence Retrieval nelle decisioni future.
//
// Deliberatamente deterministico (classificazione a regole sui dati REALI del trade, non
// un'altra chiamata a un modello per ogni trade chiuso): resta evidence-based, tracciabile,
// riproducibile e funziona anche senza Gemini/backend. Il modello principale RICEVE queste
// lezioni come contesto nelle decisioni future (services/aiProviders.js) — non le genera.
//
// Nessun fine-tuning: qui non si tocca mai il modello Gemini. "Imparare" significa che le
// decisioni future vedono le evidenze delle passate, non che i pesi di un modello cambiano.
window.Aurora = window.Aurora || {};
Aurora.Engine = Aurora.Engine || {};

const RECENT_WINDOW = 8; // ampiezza della finestra su cui si cerca un pattern ricorrente
const MIN_PATTERN_OCCURRENCES = 3;
const MIN_PATTERN_SHARE = 0.5;

// --- Trade Critic + Failure Attribution -------------------------------------------------
// Classifica in modo deterministico l'esito di un trade chiuso, usando SOLO dati registrati
// al momento dell'apertura (decisionSnapshot) e l'esito reale — mai un giudizio postumo inventato.
Aurora.Engine.classifyTradeOutcome = function classifyTradeOutcome(trade, snapshot) {
  const win = trade.realizedPnl > 0;
  if (snapshot?.tier === 'forced') return win ? 'forced_win' : 'forced_loss';
  if (snapshot?.tier === 'probe') return win ? 'probe_win' : 'probe_loss';
  if (snapshot?.tier === 'exploratory') return win ? 'exploratory_win' : 'exploratory_loss';
  if (trade.origin?.includes('Take Profit')) return 'take_profit_hit';
  if (trade.origin?.includes('Stop Loss')) {
    const badRegime = snapshot?.volatilityRegime === 'elevated' || snapshot?.volatilityRegime === 'extreme';
    return badRegime ? 'stop_loss_hit_elevated_regime' : 'stop_loss_hit_normal_regime';
  }
  return win ? 'signal_flip_profit' : 'signal_flip_loss';
};

const FAILURE_MODES = new Set([
  'stop_loss_hit_normal_regime', 'stop_loss_hit_elevated_regime', 'signal_flip_loss', 'exploratory_loss', 'probe_loss', 'forced_loss'
]);
Aurora.Engine.isFailureOutcome = function isFailureOutcome(outcomeTag) { return FAILURE_MODES.has(outcomeTag); };

// --- Memory: episodi di trade -------------------------------------------------------------
function ensureEpisodeList(strategyKey) {
  const tradeEpisodes = Aurora.Models.researchData.tradeEpisodes;
  tradeEpisodes[strategyKey] = tradeEpisodes[strategyKey] || [];
  return tradeEpisodes[strategyKey];
}

// Registra l'episodio (Outcome reale) e fa girare il resto del loop: Failure Attribution gia'
// fatta dal chiamante (outcomeTag), poi Lesson Extraction su questo strategyKey.
Aurora.Engine.recordTradeEpisode = function recordTradeEpisode({ strategyKey, tradeId, symbol, returnPct, outcomeTag, snapshot, at }) {
  if (!strategyKey) return;
  const episodes = ensureEpisodeList(strategyKey);
  episodes.push({ tradeId, symbol, returnPct, outcomeTag, snapshot: snapshot || null, at: at || new Date().toISOString() });
  Aurora.Engine.extractLessons(strategyKey);
  Aurora.Models.persistResearchData();
};

// --- Similar Trade Retrieval ---------------------------------------------------------------
// Cerca episodi passati per la stessa strategia (stesso "grain" della validazione walk-forward),
// piu' recenti prima. Nessuna ricerca semantica: il match e' sulla chiave che ha generato la
// decisione, il criterio piu' onesto disponibile senza un database vettoriale.
Aurora.Engine.findSimilarTrades = function findSimilarTrades(strategyKey, limit = RECENT_WINDOW) {
  const episodes = Aurora.Models.researchData.tradeEpisodes[strategyKey] || [];
  return episodes.slice(-limit).reverse();
};

// --- Lesson Extraction -----------------------------------------------------------------------
// Se un modo di fallimento ricorre abbastanza spesso nella finestra recente, genera (o aggiorna,
// come nuova versione) una lezione. Puramente statistico sui dati registrati — "evidence-based"
// per costruzione, non un'interpretazione del modello.
Aurora.Engine.extractLessons = function extractLessons(strategyKey) {
  const episodes = Aurora.Models.researchData.tradeEpisodes[strategyKey] || [];
  const recent = episodes.slice(-RECENT_WINDOW);
  if (recent.length < MIN_PATTERN_OCCURRENCES) return;

  const counts = {};
  recent.forEach((episode) => { counts[episode.outcomeTag] = (counts[episode.outcomeTag] || 0) + 1; });

  Aurora.Models.researchData.lessons[strategyKey] = Aurora.Models.researchData.lessons[strategyKey] || [];
  const lessons = Aurora.Models.researchData.lessons[strategyKey];

  Object.entries(counts).forEach(([outcomeTag, occurrences]) => {
    if (!Aurora.Engine.isFailureOutcome(outcomeTag)) return;
    const share = occurrences / recent.length;
    if (occurrences < MIN_PATTERN_OCCURRENCES || share < MIN_PATTERN_SHARE) return;

    const matching = recent.filter((e) => e.outcomeTag === outcomeTag);
    const supportingTradeIds = matching.map((e) => e.tradeId);
    const avgReturn = matching.reduce((sum, e) => sum + e.returnPct, 0) / occurrences;
    // Regime di volatilita' dominante tra i trade di supporto: prima le lezioni non dicevano MAI
    // "quando" un pattern si manifesta, solo "che" si manifesta — un dato (snapshot.volatilityRegime)
    // gia' registrato a ogni trade ma mai usato per il Learning Loop. Soglia al 70%: sotto, il
    // pattern non e' abbastanza legato al regime da poterlo affermare onestamente, resta "mixed".
    const dominantRegime = computeDominantRegime(matching);
    const statement = describeFailureMode(outcomeTag, strategyKey, occurrences, recent.length, avgReturn, dominantRegime);

    // Aggiorna in place la lezione gia' attiva invece di versionare a ogni singolo trade: la
    // finestra recente scorre di continuo, quindi occurrences/avgReturn cambiano leggermente
    // quasi a ogni episodio anche quando il pattern non e' cambiato qualitativamente — versionare
    // comunque gonfia la cronologia senza aggiungere informazione reale (bug trovato analizzando
    // il seed di sessione: 149 episodi avevano generato 70 versioni, quasi una a trade). Una nuova
    // versione nasce solo quando la lezione era stata disattivata (reversibile) e si ripresenta.
    const existingActive = lessons.find((lesson) => lesson.active && lesson.failureMode === outcomeTag);
    if (existingActive) {
      existingActive.occurrences = occurrences;
      existingActive.sampleSize = recent.length;
      existingActive.avgReturn = Number(avgReturn.toFixed(3));
      existingActive.statement = statement;
      existingActive.supportingTradeIds = supportingTradeIds;
      existingActive.dominantRegime = dominantRegime;
      existingActive.updatedAt = new Date().toISOString();
      return;
    }

    const version = lessons.filter((lesson) => lesson.failureMode === outcomeTag).length + 1;
    lessons.push({
      id: `${strategyKey}::${outcomeTag}::v${version}`,
      version,
      strategyKey,
      failureMode: outcomeTag,
      statement,
      dominantRegime,
      sampleSize: recent.length,
      occurrences,
      avgReturn: Number(avgReturn.toFixed(3)),
      supportingTradeIds,
      createdAt: new Date().toISOString(),
      supersedes: null,
      active: true
    });
  });
};

// Regime dominante tra i trade di supporto di una lezione — 'mixed' se nessun regime raggiunge
// il 70% (sotto quella soglia il pattern non e' abbastanza legato al regime da poterlo affermare
// onestamente). Il dato (snapshot.volatilityRegime) e' gia' registrato a ogni episodio ma prima
// non veniva mai riletto per il Learning Loop — le lezioni non dicevano mai "quando", solo "che".
const REGIME_DOMINANCE_THRESHOLD = 0.7;
function computeDominantRegime(episodes) {
  const counts = {};
  let known = 0;
  episodes.forEach((e) => {
    const regime = e.snapshot?.volatilityRegime;
    if (!regime) return;
    counts[regime] = (counts[regime] || 0) + 1;
    known += 1;
  });
  if (!known) return null;
  const [topRegime, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return topCount / known >= REGIME_DOMINANCE_THRESHOLD ? topRegime : 'mixed';
}

const REGIME_LABELS_IT = { normal: 'volatilità normale', elevated: 'volatilità elevata', extreme: 'volatilità estrema' };

function describeFailureMode(outcomeTag, strategyKey, occurrences, sampleSize, avgReturn, dominantRegime) {
  const pct = Math.round((occurrences / sampleSize) * 100);
  const labels = {
    stop_loss_hit_normal_regime: `Negli ultimi ${sampleSize} trade di ${strategyKey}, ${occurrences} (${pct}%) hanno chiuso in stop loss in condizioni di volatilità normale — il segnale d'ingresso, non la volatilità, sembra la causa.`,
    stop_loss_hit_elevated_regime: `Negli ultimi ${sampleSize} trade di ${strategyKey}, ${occurrences} (${pct}%) hanno chiuso in stop loss durante volatilità elevata/anomala — valutare un filtro più severo per questa strategia.`,
    signal_flip_loss: `Negli ultimi ${sampleSize} trade di ${strategyKey}, ${occurrences} (${pct}%) sono usciti in perdita per segnale non più favorevole prima di raggiungere lo stop — possibile uscita tardiva o soglia di conferma debole.`,
    exploratory_loss: `Negli ultimi ${sampleSize} trade esplorativi di ${strategyKey}, ${occurrences} (${pct}%) hanno chiuso in perdita (rendimento medio ${avgReturn.toFixed(2)}%) — campione ancora piccolo, da tenere d'occhio prima di una eventuale validazione.`,
    probe_loss: `Negli ultimi ${sampleSize} trade sonda di ${strategyKey}, ${occurrences} (${pct}%) hanno chiuso in perdita (rendimento medio ${avgReturn.toFixed(2)}%) — coerente con l'assenza di un edge misurato: la sonda sta facendo il suo lavoro, non è un errore da correggere.`,
    forced_loss: `Negli ultimi ${sampleSize} trade forzati (fallback giornaliero) di ${strategyKey}, ${occurrences} (${pct}%) hanno chiuso in perdita (rendimento medio ${avgReturn.toFixed(2)}%) — atteso: qui non c'è nemmeno una direzione tecnica letta il giorno dell'ingresso, solo la garanzia di un episodio quotidiano per il Learning Loop.`
  };
  const base = labels[outcomeTag] || `Pattern ricorrente (${outcomeTag}) su ${strategyKey}: ${occurrences}/${sampleSize} trade recenti.`;
  // Il regime e' gia' nel nome per i due tag stop_loss_hit_*_regime — aggiungerlo di nuovo sarebbe
  // ridondante. Per tutti gli altri, se dominante (non 'mixed'), e' informazione nuova reale.
  const alreadyMentionsRegime = outcomeTag.startsWith('stop_loss_hit_');
  if (!alreadyMentionsRegime && dominantRegime && dominantRegime !== 'mixed') {
    return `${base} Concentrato in ${REGIME_LABELS_IT[dominantRegime] || dominantRegime}.`;
  }
  return base;
}

// --- Evidence Retrieval nelle decisioni future -----------------------------------------------
Aurora.Engine.getActiveLessons = function getActiveLessons(strategyKey) {
  return (Aurora.Models.researchData.lessons[strategyKey] || []).filter((lesson) => lesson.active);
};

// Reversibilità esplicita: disattiva una lezione senza cancellarla (resta nello storico/versioni).
Aurora.Engine.deactivateLesson = function deactivateLesson(strategyKey, lessonId) {
  const lessons = Aurora.Models.researchData.lessons[strategyKey] || [];
  const lesson = lessons.find((entry) => entry.id === lessonId);
  if (lesson) { lesson.active = false; Aurora.Models.persistResearchData(); }
};
