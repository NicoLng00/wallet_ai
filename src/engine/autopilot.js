// Autopilot: scansiona l'intero watchlist e apre/chiude posizioni paper in base al segnale
// del Supervisor. Supporta più posizioni concorrenti (SIMULATION.maxConcurrentPositions) — la via
// onesta per aumentare la frequenza di trading: più ampiezza di portafoglio, non un singolo
// segnale più permissivo (un test walk-forward ha dimostrato che allargare la regola su un solo
// titolo distrugge l'edge fuori campione).
window.Aurora = window.Aurora || {};
Aurora.Engine = Aurora.Engine || {};

function autopilotOrigin(signal) {
  const base = Aurora.Models.aiEngine.mode === 'gemini' ? 'Autopilot (Gemini)' : 'Autopilot';
  return signal?.tier === 'exploratory' ? `${base} esplorativo` : base;
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
  return Object.keys(instruments)
    .map((symbol) => ({ symbol, signal: Aurora.Agents.supervisor.signalFor(symbol) }))
    .filter(({ signal }) => signal.bullish && signal.confidence >= SIMULATION.minimumConfidence)
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

  // Uscite difensive su ogni posizione aperta, indipendentemente da quante ce ne siano.
  Object.keys(demoAccount.positions).forEach((symbol) => {
    const position = demoAccount.positions[symbol];
    if (!position) return;
    const currentSignal = Aurora.Agents.supervisor.signalFor(symbol);
    if (currentSignal.defensive) {
      Aurora.Engine.executePaperTrade({ symbol, side: 'sell', quantity: position.quantity, origin: autopilotOrigin(currentSignal) });
      actions.push(`chiude ${symbol} per segnale difensivo`);
    }
  });

  // Nuovi ingressi fino al numero di posizioni concorrenti consentite.
  const openCount = Object.keys(demoAccount.positions).length;
  const freeSlots = SIMULATION.maxConcurrentPositions - openCount;
  if (freeSlots > 0) {
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
      const confidenceFactor = clamp((opportunity.signal.confidence - SIMULATION.minimumConfidence) / (100 - SIMULATION.minimumConfidence), 0.4, 1);
      // Taglia ridotta per i candidati esplorativi: si prende il rischio, ma in proporzione a
      // quanto e' ancora incerto — non e' un ingresso a piena taglia su un edge non confermato.
      const tierFactor = opportunity.signal.tier === 'exploratory' ? SIMULATION.exploratorySizeFactor : 1;
      const notional = Math.min(SIMULATION.maximumOrder, demoAccount.cash * 0.25, metrics.equity * 0.25) * confidenceFactor * tierFactor;
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
        actions.push(`apre ${opportunity.symbol} (score ${opportunity.signal.score}${opportunity.signal.tier === 'exploratory' ? ', esplorativo' : ''})`);
        Aurora.Views.showToast(`Autopilot: aperta posizione su ${opportunity.symbol} (score ${opportunity.signal.score}).`, 'success');
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
