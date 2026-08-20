// Risk Engine: unico gate che autorizza davvero un ordine. Deterministico, non usa mai
// l'output testuale di un modello — invariante ereditato da ARCHITECTURE.md.
window.Aurora = window.Aurora || {};
Aurora.Engine = Aurora.Engine || {};

Aurora.Engine.readStopTarget = function readStopTarget() {
  const $ = Aurora.Utils.$;
  const stopLossRaw = Number($('order-stop-loss').value);
  const takeProfitRaw = Number($('order-take-profit').value);
  return {
    stopLoss: stopLossRaw > 0 ? stopLossRaw : null,
    takeProfit: takeProfitRaw > 0 ? takeProfitRaw : null
  };
};

Aurora.Engine.orderRisk = function orderRisk(
  symbol = Aurora.Models.activeSymbol,
  side = Aurora.Models.activeSide,
  quantity = Number(Aurora.Utils.$('order-quantity').value) || 0
) {
  const { demoAccount, SIMULATION } = Aurora.Models;
  const { formatMoney } = Aurora.Utils;
  const price = Aurora.Engine.getDemoPrice(symbol);
  const notional = quantity * price;
  // Margine richiesto per QUESTO ordine (leva simulata) — e' il vero vincolo di cash, non il
  // notional pieno: stessa contabilita' di engine/execution.js/market.js, vedi il commento su
  // leverageMultiplier in models/state.js per il perche'.
  const marginRequired = notional / SIMULATION.leverageMultiplier;
  const position = demoAccount.positions[symbol];
  const metrics = Aurora.Engine.getMetrics();
  const positionValue = (position?.quantity || 0) * price;
  // La leva alza quanto NOTIONAL un ordine puo' controllare a parita' di equity — e' esattamente
  // cosa vuol dire "1:2": lo stesso capitale ora regge il doppio dell'esposizione.
  const maximumPositionValue = metrics.equity * SIMULATION.maximumPositionPercent / 100 * SIMULATION.leverageMultiplier;
  const maximumOrder = Math.min(SIMULATION.maximumOrder * SIMULATION.leverageMultiplier, maximumPositionValue);
  const { stopLoss, takeProfit } = Aurora.Engine.readStopTarget();
  // "Regola d'oro" richiesta esplicitamente: rischio massimo per trade (sul notional pieno, leva
  // inclusa) = maxRiskPerTradePercent% dell'equity. Calcolabile solo se uno stop e' impostato — un
  // ordine senza stop resta soggetto solo agli altri guardrail, come gia' oggi.
  const stopDistancePct = side === 'buy' && stopLoss !== null && price > 0 ? ((price - stopLoss) / price) * 100 : null;
  const maxRiskNotional = stopDistancePct && stopDistancePct > 0
    ? (metrics.equity * SIMULATION.maxRiskPerTradePercent / 100) / (stopDistancePct / 100)
    : Infinity;
  let reason = 'Tutti i guardrail rispettati';
  let allowed = Aurora.Models.analysisReady && quantity > 0 && notional >= 0.01 && metrics.drawdown < SIMULATION.maximumDrawdownPercent;
  if (!Aurora.Models.analysisReady) reason = 'In attesa analisi';
  else if (quantity <= 0 || notional < 0.01) { allowed = false; reason = `Ordine minimo ${formatMoney(0.01)}`; }
  else if (metrics.drawdown >= SIMULATION.maximumDrawdownPercent) { allowed = false; reason = 'Kill switch drawdown attivo'; }
  else if (notional > maximumOrder) { allowed = false; reason = `Limite per ordine ${formatMoney(maximumOrder)}`; }
  else if (side === 'buy' && notional > maxRiskNotional) { allowed = false; reason = `Rischio oltre la regola del ${SIMULATION.maxRiskPerTradePercent}%: stop troppo largo per questo notional`; }
  else if (side === 'buy' && marginRequired > demoAccount.cash) { allowed = false; reason = 'Cash demo insufficiente (margine richiesto oltre il disponibile)'; }
  else if (side === 'buy' && positionValue + notional > maximumPositionValue) { allowed = false; reason = 'Supera la posizione massima'; }
  else if (side === 'sell' && (!position || quantity > position.quantity + 0.0000001)) { allowed = false; reason = 'Quote demo non disponibili'; }
  else if (side === 'buy' && stopLoss !== null && stopLoss >= price) { allowed = false; reason = 'Stop Loss deve essere sotto il prezzo attuale'; }
  else if (side === 'buy' && takeProfit !== null && takeProfit <= price) { allowed = false; reason = 'Take Profit deve essere sopra il prezzo attuale'; }
  return { symbol, side, quantity, price, notional, marginRequired, maximumOrder, metrics, allowed, reason, stopLoss, takeProfit };
};
