// Prezzo demo, metriche di conto e simulazione del mercato.
window.Aurora = window.Aurora || {};
Aurora.Engine = Aurora.Engine || {};

Aurora.Engine.getDemoPrice = function getDemoPrice(symbol) {
  const { demoAccount, instruments } = Aurora.Models;
  return Number(demoAccount.market[symbol] || instruments[symbol].price);
};

Aurora.Engine.getMetrics = function getMetrics() {
  const demoAccount = Aurora.Models.demoAccount;
  const positionValue = Object.entries(demoAccount.positions)
    .reduce((sum, [symbol, position]) => sum + position.quantity * Aurora.Engine.getDemoPrice(symbol), 0);
  const equity = demoAccount.cash + positionValue;
  demoAccount.highWater = Math.max(demoAccount.highWater, equity);
  const drawdown = demoAccount.highWater ? (demoAccount.highWater - equity) / demoAccount.highWater * 100 : 0;
  return { equity, positionValue, drawdown, exposure: equity ? positionValue / equity * 100 : 0 };
};

Aurora.Engine.tickDemoMarket = function tickDemoMarket() {
  const { demoAccount, instruments } = Aurora.Models;
  Object.entries(instruments).forEach(([symbol], index) => {
    const price = Aurora.Engine.getDemoPrice(symbol);
    const phase = Date.now() / 8500 + index * 1.91;
    const trend = Math.sin(phase) * 0.0009 + Math.cos(phase * 0.47) * 0.0005;
    const noise = (Math.random() - 0.5) * 0.0008;
    demoAccount.market[symbol] = Math.max(0.00001, price * (1 + trend + noise));
  });
};

Aurora.Engine.symbolChange = function symbolChange(symbol) {
  const { liveData, liveStatus, liveChangePercent, instruments } = Aurora.Models;
  if (liveData.enabled && liveStatus[symbol] === 'live' && Number.isFinite(liveChangePercent[symbol])) {
    return liveChangePercent[symbol];
  }
  return (Aurora.Engine.getDemoPrice(symbol) / instruments[symbol].price - 1) * 100;
};

Aurora.Engine.initials = function initials(symbol) {
  return ({ BTCUSD: '₿', ETHUSD: 'Ξ' })[symbol] || symbol.slice(0, 1);
};

Aurora.Engine.widgetInterval = function widgetInterval() {
  return { '1m': '1', '5m': '5', '15m': '15', '1h': '60', '1D': 'D' }[Aurora.Models.activeTimeframe];
};

// Win rate segmentata per livello: la win rate aggregata mescola trade validati/esplorativi
// (che possono avere un edge reale) con sonda/forzati (per design senza edge misurato, esistono
// solo per generare dati per il Learning Loop) — una singola percentuale sull'insieme nasconde
// quale parte del sistema sta davvero funzionando. Calcolata solo sui trade chiusi (side 'sell').
Aurora.Engine.getWinRateByTier = function getWinRateByTier() {
  const sells = Aurora.Models.demoAccount.trades.filter((trade) => trade.side === 'sell');
  const byTier = {};
  sells.forEach((trade) => {
    const tier = trade.tier || 'manuale';
    byTier[tier] = byTier[tier] || { count: 0, wins: 0 };
    byTier[tier].count += 1;
    if (trade.realizedPnl > 0) byTier[tier].wins += 1;
  });
  return Object.fromEntries(Object.entries(byTier).map(([tier, { count, wins }]) => [tier, { count, wins, winRate: (wins / count) * 100 }]));
};

Aurora.Engine.computeWalletStats = function computeWalletStats() {
  const demoAccount = Aurora.Models.demoAccount;
  const metrics = Aurora.Engine.getMetrics();
  const sells = demoAccount.trades.filter((trade) => trade.side === 'sell');
  const realizedPnl = sells.reduce((sum, trade) => sum + trade.realizedPnl, 0);
  const unrealizedPnl = Object.entries(demoAccount.positions)
    .reduce((sum, [symbol, position]) => sum + (Aurora.Engine.getDemoPrice(symbol) - position.averagePrice) * position.quantity, 0);
  const best = sells.reduce((max, trade) => (!max || trade.realizedPnl > max.realizedPnl ? trade : max), null);
  const worst = sells.reduce((min, trade) => (!min || trade.realizedPnl < min.realizedPnl ? trade : min), null);
  const winRate = demoAccount.model.outcomes ? (demoAccount.model.wins / demoAccount.model.outcomes) * 100 : 0;
  return { metrics, realizedPnl, unrealizedPnl, totalPnl: realizedPnl + unrealizedPnl, best, worst, winRate };
};
