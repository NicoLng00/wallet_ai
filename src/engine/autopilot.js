// Autopilot: scansiona l'intero watchlist e apre/chiude posizioni paper in base al segnale
// del Supervisor. Supporta più posizioni concorrenti (SIMULATION.maxConcurrentPositions) — la via
// onesta per aumentare la frequenza di trading: più ampiezza di portafoglio, non un singolo
// segnale più permissivo (un test walk-forward ha dimostrato che allargare la regola su un solo
// titolo distrugge l'edge fuori campione).
window.Aurora = window.Aurora || {};
Aurora.Engine = Aurora.Engine || {};

function autopilotOrigin(signal) {
  const base = Aurora.Models.aiEngine.mode === 'gemini' ? 'Autopilot (Gemini)' : 'Autopilot';
  if (signal?.tier === 'exploratory') return `${base} esplorativo`;
  if (signal?.tier === 'probe') return `${base} sonda`;
  if (signal?.tier === 'forced') return `${base} sonda forzata (giornaliera)`;
  return base;
}

// SL/TP adattivi: quando il candidato scelto ha candele OHLC reali disponibili, lo stop/target
// si calibra sulla volatilita' reale del titolo (ATR14) invece di una percentuale fissa uguale
// per tutti. Stesso rapporto rischio/rendimento ~1:1.75 gia' in uso, ora calibrato sul titolo.
function computeStopTarget(symbol, price, signal) {
  const SIMULATION = Aurora.Models.SIMULATION;
  const history = signal.timeframe ? Aurora.Models.historyCache[symbol]?.[signal.timeframe] : null;
  const atr = history?.candles ? Aurora.Engine.computeATR(history.candles, 14) : null;
  if (atr && atr > 0 && atr < price) {
    return { stopLoss: price - atr, takeProfit: price + atr * 1.75 };
  }
  return {
    stopLoss: price * (1 - SIMULATION.autopilotStopPercent / 100),
    takeProfit: price * (1 + SIMULATION.autopilotTargetPercent / 100)
  };
}

// Circuit breaker consultivo: se una qualunque serie OHLC reale disponibile per il simbolo mostra
// un regime di volatilita' "extreme" (ATR14 recente >= 2.5x il livello precedente), l'Autopilot
// salta il nuovo ingresso quel ciclo — non abbassa la validazione, aspetta solo un momento piu'
// stabile. Se non ci sono candele disponibili per il simbolo, il filtro semplicemente non si applica.
function isExtremeVolatility(symbol) {
  const timeframes = Aurora.Models.historyCache[symbol] || {};
  return Object.values(timeframes).some((entry) => {
    if (!entry.candles?.length) return false;
    const regime = Aurora.Engine.computeVolatilityRegime(entry.candles);
    return regime?.regime === 'extreme';
  });
}

Aurora.Engine.scanOpportunities = function scanOpportunities() {
  const { instruments, SIMULATION } = Aurora.Models;
  // Interruttore copertura/qualita' (vedi models/state.js autopilotMode): in "qualita'" la sonda
  // non si propone affatto — solo validato/esplorativo, gli unici livelli con un edge misurato o
  // almeno promettente. Meno trade, ma nessuno di loro e' un colpo alla cieca.
  const qualityMode = Aurora.Models.autopilotMode === 'quality';
  return Object.keys(instruments)
    .map((symbol) => ({ symbol, signal: Aurora.Agents.supervisor.signalFor(symbol) }))
    .filter(({ signal }) => {
      if (!signal.bullish) return false;
      if (qualityMode) return signal.tier === 'validated' || signal.tier === 'exploratory';
      // Sonda ED esplorativo sono per definizione a confidenza ridotta (scoreCandidate in
      // engine/rules.js applica una penalita' esplicita a entrambi, -10pp per l'esplorativo) — la
      // soglia minima di confidenza non si applica a nessuno dei due, altrimenti l'esplorativo
      // potrebbe non proporsi mai nonostante abbia gia' il proprio controllo di rischio dedicato
      // (taglia ridotta via exploratorySizeFactor). Bug reale trovato analizzando il codice: prima
      // solo la sonda era esentata, un candidato esplorativo con confidenza sotto soglia restava
      // silenziosamente escluso pur avendo un edge in-sample reale.
      return signal.tier === 'probe' || signal.tier === 'exploratory' || signal.confidence >= SIMULATION.minimumConfidence;
    })
    .sort((a, b) => b.signal.score - a.signal.score);
};

Aurora.Engine.runAutopilotCycle = function runAutopilotCycle() {
  const Models = Aurora.Models;
  const { instruments, SIMULATION, demoAccount } = Models;
  const { formatMoney, clamp } = Aurora.Utils;
  if (!Models.autopilotRunning) return;
  if (!Models.liveData.enabled) Aurora.Engine.tickDemoMarket();
  Aurora.Engine.checkStopsAndTargets();
  Aurora.Views.showAnalysis(Aurora.Agents.supervisor.signalFor(Models.activeSymbol), true);

  const actions = [];

  // Uscite difensive su ogni posizione aperta, indipendentemente da quante ce ne siano — piu' un
  // time-stop, ma SOLO su posizioni esplorative/sonda/forzate: una strategia validata ha un edge
  // misurato e si e' guadagnata il diritto di aspettare il proprio SL/TP reale, quanto ci mette;
  // una posizione senza edge misurato no, e non deve occupare uno slot concorrente a tempo
  // indeterminato impedendo sia nuovi ingressi sia il fallback "sonda forzata" giornaliero (vedi
  // SIMULATION.maxHoldingDays in models/state.js per il perche').
  Object.keys(demoAccount.positions).forEach((symbol) => {
    const position = demoAccount.positions[symbol];
    if (!position) return;
    const currentSignal = Aurora.Agents.supervisor.signalFor(symbol);
    const isValidatedPosition = position.decisionSnapshot?.tier === 'validated';
    // Una posizione senza openedAt (salvata prima che questo campo esistesse) va trattata come
    // "eta' sconosciuta = vecchia", non come "appena aperta": altrimenti il time-stop non
    // scatterebbe mai per lei, restando aperta a tempo indeterminato — lo stesso bug che il
    // time-stop dovrebbe risolvere.
    const heldDays = position.openedAt ? (Date.now() - new Date(position.openedAt).getTime()) / 86400000 : Infinity;
    const staleExit = !isValidatedPosition && heldDays >= SIMULATION.maxHoldingDays;
    if (currentSignal.defensive) {
      Aurora.Engine.executePaperTrade({ symbol, side: 'sell', quantity: position.quantity, origin: autopilotOrigin(currentSignal) });
      actions.push(`chiude ${symbol} per segnale difensivo`);
    } else if (staleExit) {
      Aurora.Engine.executePaperTrade({ symbol, side: 'sell', quantity: position.quantity, origin: 'Autopilot chiusura per limite di tempo' });
      actions.push(`chiude ${symbol} per limite di detenzione (${SIMULATION.maxHoldingDays}g)`);
    }
  });

  // Kill switch sul drawdown: prima valeva solo per l'ordine manuale (engine/riskGate.js
  // orderRisk) — l'Autopilot apriva comunque nuove posizioni anche oltre la soglia di drawdown
  // massimo, un bug reale rispetto alla garanzia documentata in README. Blocca solo NUOVI
  // ingressi (normali E fallback forzato): le uscite (difensive, time-stop, SL/TP) restano
  // sempre attive, servono proprio a far rientrare il drawdown.
  const killSwitchActive = Aurora.Engine.getMetrics().drawdown >= SIMULATION.maximumDrawdownPercent;
  if (killSwitchActive) actions.push(`kill switch drawdown attivo, nessun nuovo ingresso`);

  // Nuovi ingressi fino al numero di posizioni concorrenti consentite.
  const openCount = Object.keys(demoAccount.positions).length;
  const freeSlots = SIMULATION.maxConcurrentPositions - openCount;
  if (!killSwitchActive && freeSlots > 0) {
    const heldSymbols = new Set(Object.keys(demoAccount.positions));
    const opportunities = Aurora.Engine.scanOpportunities().filter((o) => !heldSymbols.has(o.symbol));
    let opened = 0;
    for (const opportunity of opportunities) {
      if (opened >= freeSlots) break;
      if (isExtremeVolatility(opportunity.symbol)) {
        actions.push(`salta ${opportunity.symbol} per volatilità anomala (ATR)`);
        continue;
      }
      const price = Aurora.Engine.getDemoPrice(opportunity.symbol);
      const metrics = Aurora.Engine.getMetrics();
      const isProbe = opportunity.signal.tier === 'probe';
      // Le sonde non passano dal fattore-confidenza normale (la loro confidenza e' bassa per
      // definizione, non misura un edge): restano comunque al minimo del fattore per non sparire.
      const confidenceFactor = isProbe ? 0.4 : clamp((opportunity.signal.confidence - SIMULATION.minimumConfidence) / (100 - SIMULATION.minimumConfidence), 0.4, 1);
      // Taglia ridotta per i candidati esplorativi/sonda: si prende il rischio, ma in proporzione
      // a quanto e' ancora incerto — mai un ingresso a piena taglia su un edge non confermato.
      const tierFactor = opportunity.signal.tier === 'exploratory' ? SIMULATION.exploratorySizeFactor
        : isProbe ? SIMULATION.probeSizeFactor : 1;
      // Decadimento sui risultati live REALI di questa strategia su questo simbolo (vedi
      // engine/rules.js liveConfidenceFactor): riduce ulteriormente la taglia se il track record
      // recente e' gia' negativo, prima ancora del taglio netto a 10 trade.
      const liveFactor = Aurora.Engine.liveConfidenceFactor(opportunity.symbol, opportunity.signal.candidateKey);
      const notional = Math.min(SIMULATION.maximumOrder, demoAccount.cash * 0.25, metrics.equity * 0.25) * confidenceFactor * tierFactor * liveFactor;
      if (notional < 0.01) continue;
      const { stopLoss, takeProfit } = computeStopTarget(opportunity.symbol, price, opportunity.signal);
      const decisionSnapshot = {
        strategyKey: opportunity.signal.candidateKey || null,
        entryPrice: price,
        confidence: opportunity.signal.confidence,
        score: opportunity.signal.score,
        tier: opportunity.signal.tier,
        volatilityRegime: opportunity.signal.volatilityRegime,
        aiEngine: Models.aiEngine.mode
      };
      const executed = Aurora.Engine.executePaperTrade({
        symbol: opportunity.symbol, side: 'buy', quantity: notional / price,
        origin: autopilotOrigin(opportunity.signal), stopLoss, takeProfit,
        strategyKey: opportunity.signal.candidateKey || null, decisionSnapshot
      });
      if (executed) {
        opened += 1;
        const tierLabel = opportunity.signal.tier === 'exploratory' ? ', esplorativo' : isProbe ? ', sonda' : '';
        actions.push(`apre ${opportunity.symbol} (score ${opportunity.signal.score}${tierLabel})`);
        Aurora.Views.showToast(`Autopilot: aperta posizione su ${opportunity.symbol} (score ${opportunity.signal.score}).`, 'success');
      }
    }
  }

  // Fallback "forzato": se entro oggi (data reale) nessun livello ha ancora aperto nulla su nessun
  // simbolo del watchlist, forza un ingresso a taglia minima sul candidato con lo score piu' alto
  // sull'intero watchlist, a prescindere dalla direzione — mai spacciato per un segnale, sempre
  // etichettato "sonda forzata" e distinto dal livello sonda ordinario nel Trade Critic (vedi
  // engine/memory.js) proprio perche' qui manca anche il minimo requisito che la sonda mantiene
  // (una direzione tecnica letta oggi). Un solo trade forzato al giorno, mai piu' di uno. In
  // modalita' "qualita'" (vedi models/state.js autopilotMode) questo fallback non scatta affatto:
  // zero trade quel giorno e' un esito accettato, non un difetto, quando non c'e' nulla di
  // validato o esplorativo — coerente con lo scopo dichiarato della modalita'.
  const qualityMode = Aurora.Models.autopilotMode === 'quality';
  const openCountAfterEntries = Object.keys(demoAccount.positions).length;
  const remainingSlots = SIMULATION.maxConcurrentPositions - openCountAfterEntries;
  const today = new Date().toISOString().slice(0, 10);
  const tradedToday = demoAccount.trades.some((trade) => trade.side === 'buy' && trade.at.slice(0, 10) === today);
  if (!qualityMode && !killSwitchActive && !tradedToday && remainingSlots > 0) {
    const heldSymbols = new Set(Object.keys(demoAccount.positions));
    const candidateSymbols = Object.keys(instruments).filter((symbol) => !heldSymbols.has(symbol));
    const forced = Aurora.Engine.pickForcedDailyCandidate(candidateSymbols);
    if (forced && !isExtremeVolatility(forced.symbol)) {
      const { symbol, signal } = forced;
      const price = Aurora.Engine.getDemoPrice(symbol);
      const metrics = Aurora.Engine.getMetrics();
      const liveFactor = Aurora.Engine.liveConfidenceFactor(symbol, signal.candidateKey);
      const notional = Math.min(SIMULATION.maximumOrder, demoAccount.cash * 0.25, metrics.equity * 0.25) * 0.3 * SIMULATION.forcedSizeFactor * liveFactor;
      if (notional >= 0.01) {
        const { stopLoss, takeProfit } = computeStopTarget(symbol, price, signal);
        const decisionSnapshot = {
          strategyKey: signal.candidateKey || null, entryPrice: price, confidence: signal.confidence,
          score: signal.score, tier: 'forced', volatilityRegime: signal.volatilityRegime, aiEngine: Models.aiEngine.mode
        };
        const executed = Aurora.Engine.executePaperTrade({
          symbol, side: 'buy', quantity: notional / price,
          origin: autopilotOrigin({ tier: 'forced' }), stopLoss, takeProfit,
          strategyKey: signal.candidateKey || null, decisionSnapshot
        });
        if (executed) {
          actions.push(`apre ${symbol} forzato (nessun trade ancora oggi, score ${signal.score})`);
          Aurora.Views.showToast(`Autopilot: trade forzato del giorno su ${symbol} — nessun segnale valido oggi, apertura minima per garantire l'attività giornaliera.`, '');
        }
      }
    }
  }

  const action = actions.length ? actions.join(' · ') : 'monitora';
  const detail = actions.length
    ? actions.join('; ')
    : `${Object.keys(instruments).length} titoli scansionati, nessun segnale sopra soglia confidenza ${SIMULATION.minimumConfidence}%.`;

  Models.activity.unshift({ title: `Autopilot: ${action}`, detail, tag: actions.length ? 'AUTO' : 'HOLD' });
  Aurora.Views.renderDemoAccount();
  Aurora.Views.renderWalletOverview();
  Aurora.Views.updateQuoteUI();
  Aurora.Views.renderWatchlist();
  Aurora.Views.renderActivity();
  Aurora.Views.updateOrderEstimate();
  Aurora.Views.renderChartLevelsOverlay();
  Aurora.Utils.$('autopilot-copy').textContent = `Ultimo ciclo ${new Date().toLocaleTimeString('it-IT', { hour12: false })} · ${action}.`;
};

Aurora.Engine.setAutopilot = function setAutopilot(nextState) {
  const Models = Aurora.Models;
  const { formatMoney } = Aurora.Utils;
  Models.autopilotRunning = nextState;
  window.clearInterval(Models.autopilotTimer);
  const card = Aurora.Utils.$('autopilot-toggle').closest('.autopilot-card');
  card.classList.toggle('running', Models.autopilotRunning);
  Aurora.Utils.$('autopilot-status').textContent = Models.autopilotRunning ? 'In esecuzione' : 'Pausato';
  Aurora.Utils.$('autopilot-toggle').textContent = Models.autopilotRunning ? 'Pausa' : 'Avvia';
  if (Models.autopilotRunning) {
    Models.activity.unshift({ title: 'Autopilot demo attivato', detail: `Ordini frazionari esclusivamente nel sandbox locale da ${formatMoney(Models.SIMULATION.accountSeed)}.`, tag: 'AUTO' });
    Aurora.Engine.runAutopilotCycle();
    Models.autopilotTimer = window.setInterval(Aurora.Engine.runAutopilotCycle, Models.SIMULATION.autopilotCadenceMs);
  } else {
    Models.activity.unshift({ title: 'Autopilot demo in pausa', detail: 'Nessun nuovo ordine simulato verrà generato.', tag: 'AUTO' });
    Aurora.Utils.$('autopilot-copy').textContent = `Paper only · ciclo ogni 20 s · max ${formatMoney(Models.SIMULATION.maximumOrder)} per trade.`;
  }
  Aurora.Views.renderActivity();
};
