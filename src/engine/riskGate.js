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
  const position = demoAccount.positions[symbol];
  const metrics = Aurora.Engine.getMetrics();
  const positionValue = (position?.quantity || 0) * price;
  const maximumPositionValue = metrics.equity * SIMULATION.maximumPositionPercent / 100;
  const maximumOrder = Math.min(SIMULATION.maximumOrder, maximumPositionValue);
  const { stopLoss, takeProfit } = Aurora.Engine.readStopTarget();
  let reason = 'Tutti i guardrail rispettati';
  let allowed = Aurora.Models.analysisReady && quantity > 0 && notional >= 0.01 && metrics.drawdown < SIMULATION.maximumDrawdownPercent;
  if (!Aurora.Models.analysisReady) reason = 'In attesa analisi';
  else if (quantity <= 0 || notional < 0.01) { allowed = false; reason = `Ordine minimo ${formatMoney(0.01)}`; }
  else if (metrics.drawdown >= SIMULATION.maximumDrawdownPercent) { allowed = false; reason = 'Kill switch drawdown attivo'; }
  else if (notional > maximumOrder) { allowed = false; reason = `Limite per ordine ${formatMoney(maximumOrder)}`; }
  else if (side === 'buy' && notional > demoAccount.cash) { allowed = false; reason = 'Cash demo insufficiente'; }
  else if (side === 'buy' && positionValue + notional > maximumPositionValue) { allowed = false; reason = 'Supera la posizione massima'; }
  else if (side === 'sell' && (!position || quantity > position.quantity + 0.0000001)) { allowed = false; reason = 'Quote demo non disponibili'; }
  else if (side === 'buy' && stopLoss !== null && stopLoss >= price) { allowed = false; reason = 'Stop Loss deve essere sotto il prezzo attuale'; }
  else if (side === 'buy' && takeProfit !== null && takeProfit <= price) { allowed = false; reason = 'Take Profit deve essere sopra il prezzo attuale'; }
  return { symbol, side, quantity, price, notional, maximumOrder, metrics, allowed, reason, stopLoss, takeProfit };
};
