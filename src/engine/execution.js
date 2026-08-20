// Esecuzione paper trading: unico punto che modifica cash/posizioni/trade del conto demo.
window.Aurora = window.Aurora || {};
Aurora.Engine = Aurora.Engine || {};

Aurora.Engine.registerOutcome = function registerOutcome(realizedPnl) {
  const demoAccount = Aurora.Models.demoAccount;
  if (!Number.isFinite(realizedPnl)) return;
  demoAccount.model.outcomes += 1;
  if (realizedPnl > 0) demoAccount.model.wins += 1;
  const hitRate = demoAccount.model.wins / demoAccount.model.outcomes;
  demoAccount.model.calibration = Math.round(Aurora.Utils.clamp(50 + (hitRate - 0.5) * 32 + Math.min(demoAccount.model.outcomes, 30) * 0.35, 35, 70));
};

Aurora.Engine.executePaperTrade = function executePaperTrade({ symbol, side, quantity, origin = 'Supervisor', stopLoss = null, takeProfit = null, strategyKey = null, decisionSnapshot = null }) {
  const { demoAccount, SIMULATION } = Aurora.Models;
  const { formatMoney } = Aurora.Utils;
  const price = Aurora.Engine.getDemoPrice(symbol);
  const notional = quantity * price;
  // Contabilita' a margine (leva simulata, SIMULATION.leverageMultiplier): il cash si muove solo
  // per il margine impegnato (notional/leva) e per il P&L realizzato, MAI per il notional pieno —
  // stessa meccanica di un conto CFD/forex reale. Vedi il commento su leverageMultiplier in
  // models/state.js per il perche' (senza, il tetto di leva non avrebbe mai effetto pratico) e
  // engine/market.js (getMetrics) per come l'equity resta corretta di conseguenza.
  const marginRequired = notional / SIMULATION.leverageMultiplier;
  let realizedPnl = 0;
  let closedSnapshot = null;
  if (side === 'buy') {
    if (marginRequired > demoAccount.cash + 0.0000001) return false;
    const current = demoAccount.positions[symbol] || { quantity: 0, averagePrice: 0, stopLoss: null, takeProfit: null, strategyKey: null, decisionSnapshot: null, openedAt: null };
    const nextQuantity = current.quantity + quantity;
    demoAccount.positions[symbol] = {
      quantity: nextQuantity,
      averagePrice: (current.quantity * current.averagePrice + quantity * price) / nextQuantity,
      stopLoss: stopLoss !== null ? stopLoss : (current.stopLoss ?? null),
      takeProfit: takeProfit !== null ? takeProfit : (current.takeProfit ?? null),
      strategyKey: strategyKey || current.strategyKey || null,
      // Decisione presa all'apertura (confidenza, score, regime di volatilita', validato/esplorativo)
      // — il Trade Critic la userà alla chiusura per la Failure Attribution, senza rileggerla postuma.
      decisionSnapshot: decisionSnapshot || current.decisionSnapshot || null,
      // Data di apertura (prima entrata, mai aggiornata su un rialzo di posizione successivo): base
      // per il limite massimo di detenzione in engine/autopilot.js — senza un time-stop una
      // posizione senza SL/TP toccati resta aperta indefinitamente e blocca uno slot concorrente,
      // impedendo sia nuovi ingressi normali sia il fallback "sonda forzata" giornaliero.
      openedAt: current.openedAt || new Date().toISOString()
    };
    demoAccount.cash -= marginRequired;
  } else {
    const current = demoAccount.positions[symbol];
    if (!current || quantity > current.quantity + 0.0000001) return false;
    realizedPnl = (price - current.averagePrice) * quantity;
    const returnPct = ((price - current.averagePrice) / current.averagePrice) * 100;
    if (current.strategyKey) Aurora.Engine.recordStrategyOutcome(symbol, current.strategyKey, returnPct);
    closedSnapshot = current.decisionSnapshot || null;
    current.quantity -= quantity;
    // Restituisce il margine impegnato per la quota chiusa (valutato al prezzo di CARICO, e' quello
    // davvero bloccato all'apertura) piu'/meno il P&L realizzato — mai il notional pieno al prezzo
    // di uscita, che ri-accrediterebbe anche la parte a leva mai davvero debitata dal cash.
    const marginReleased = (current.averagePrice * quantity) / SIMULATION.leverageMultiplier;
    demoAccount.cash += marginReleased + realizedPnl;
    if (current.quantity < 0.0000001) delete demoAccount.positions[symbol];
    else demoAccount.positions[symbol] = current;
    Aurora.Engine.registerOutcome(realizedPnl);
  }
  Aurora.Models.orderCount += 1;
  // Esito classificato PRIMA di costruire il record, cosi' tier/strategia/esito viaggiano con lo
  // storico stesso (non solo dentro il testo di "origin") — serve alla pagina Storico & Memoria.
  const outcomeTag = side === 'sell' && closedSnapshot?.strategyKey
    ? Aurora.Engine.classifyTradeOutcome({ origin, realizedPnl }, closedSnapshot)
    : null;
  const record = {
    id: `SIM-${Date.now().toString().slice(-7)}`,
    symbol, side, quantity, price, notional, realizedPnl, origin, at: new Date().toISOString(), stopLoss, takeProfit,
    // Unico conto disponibile oggi: nessun broker reale collegato (vedi ARCHITECTURE.md). Il campo
    // esiste gia' per quando/se un conto reale verra' aggiunto, cosi' lo storico e i filtri non
    // cambiano forma — oggi vale sempre 'demo'.
    accountMode: 'demo',
    tier: (side === 'buy' ? decisionSnapshot?.tier : closedSnapshot?.tier) || null,
    strategyKey: (side === 'buy' ? (strategyKey || decisionSnapshot?.strategyKey) : closedSnapshot?.strategyKey) || null,
    outcomeTag
  };
  demoAccount.trades.unshift(record);

  // Trade Critic + Failure Attribution + Lesson Extraction (solo alla chiusura, solo se sappiamo
  // quale strategia ha generato l'ingresso).
  if (side === 'sell' && closedSnapshot?.strategyKey) {
    const entryPrice = closedSnapshot.entryPrice || (price - realizedPnl / quantity);
    const returnPct = ((price - entryPrice) / entryPrice) * 100;
    Aurora.Engine.recordTradeEpisode({
      strategyKey: closedSnapshot.strategyKey, tradeId: record.id, symbol,
      returnPct, outcomeTag, snapshot: closedSnapshot, at: record.at
    });
  }
  Aurora.Models.logActivity({
    title: `${origin}: ${side === 'buy' ? 'acquisto' : 'vendita'} demo ${quantity.toFixed(6)} ${symbol}`,
    detail: `${formatMoney(notional)} · fill simulato ${formatMoney(price)} · ${record.id}`,
    tag: 'PAPER'
  });
  if (side === 'sell') {
    Aurora.Models.logActivity({
      title: 'Feedback salvato nel calibratore',
      detail: `P&L realizzato ${formatMoney(realizedPnl)}. Il modello adatta solo il peso di confidenza locale.`,
      tag: 'LEARN'
    });
  }
  Aurora.Models.persistDemoAccount();
  Aurora.Views.renderDemoAccount();
  Aurora.Views.renderWalletOverview();
  Aurora.Views.updateQuoteUI();
  Aurora.Views.renderWatchlist();
  Aurora.Views.renderActivity();
  Aurora.Views.updateOrderEstimate();
  Aurora.Views.renderChartLevelsOverlay();
  Aurora.Views.renderMemoryHistory();
  Aurora.Views.renderMemoryLessons();
  return true;
};

Aurora.Engine.checkStopsAndTargets = function checkStopsAndTargets() {
  const demoAccount = Aurora.Models.demoAccount;
  Object.entries(demoAccount.positions).forEach(([symbol, position]) => {
    if (!position.stopLoss && !position.takeProfit) return;
    const price = Aurora.Engine.getDemoPrice(symbol);
    if (position.stopLoss && price <= position.stopLoss) {
      Aurora.Engine.executePaperTrade({ symbol, side: 'sell', quantity: position.quantity, origin: 'Stop Loss' });
    } else if (position.takeProfit && price >= position.takeProfit) {
      Aurora.Engine.executePaperTrade({ symbol, side: 'sell', quantity: position.quantity, origin: 'Take Profit' });
    }
  });
};
