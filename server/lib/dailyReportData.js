// Puro: nessuna chiamata di rete/filesystem — aggrega lo stato reale di SpiderMan e venom in una
// forma compatta per il report (email o altro). Chi chiama passa gia' i JSON letti da
// data/account.json, data/research.json, data/venom/account.json, data/venom/research.json.
// Stessa disciplina statistica del resto del progetto: nessun numero inventato, solo quello che
// e' davvero nei file di stato — se un sistema non ha ancora dati, il report lo dice, non lo
// nasconde con uno zero.

function computeEquitySnapshot(demoAccount) {
  if (!demoAccount) return null;
  const positionValue = Object.entries(demoAccount.positions || {})
    .reduce((sum, [symbol, position]) => sum + position.quantity * (demoAccount.market?.[symbol] ?? position.averagePrice), 0);
  const equity = demoAccount.cash + positionValue;
  const highWater = demoAccount.highWater || equity;
  const drawdownPercent = highWater ? ((highWater - equity) / highWater) * 100 : 0;
  return { equity, cash: demoAccount.cash, positionValue, highWater, drawdownPercent, openPositions: Object.keys(demoAccount.positions || {}).length };
}

function summarizeTrades(trades, sinceIso) {
  const since = sinceIso ? new Date(sinceIso).getTime() : 0;
  const recent = (trades || []).filter((t) => new Date(t.at).getTime() >= since);
  const closed = recent.filter((t) => t.side === 'sell');
  const wins = closed.filter((t) => t.realizedPnl > 0).length;
  const realizedPnl = closed.reduce((sum, t) => sum + t.realizedPnl, 0);
  return { newTradesCount: recent.length, closedCount: closed.length, wins, realizedPnl };
}

function summarizeValidated(validated) {
  const rows = [];
  Object.entries(validated || {}).forEach(([symbol, entry]) => {
    Object.entries(entry.candidates || {}).forEach(([candidateKey, result]) => {
      if (result.validated) rows.push({ symbol, candidateKey, label: result.label, timeframe: result.timeframe, winRate: result.outOfSample.winRate, avgReturn: result.outOfSample.avgReturn });
    });
  });
  return rows.sort((a, b) => b.avgReturn - a.avgReturn);
}

function recentActivity(activity, limit = 6) {
  return (activity || []).slice(0, limit).map((entry) => ({ title: entry.title, detail: entry.detail, tag: entry.tag }));
}

// sinceIso: confine "da quando" per i trade nuovi (tipicamente 24h prima del report) — passato
// dal chiamante, mai calcolato qui (questo modulo resta puro, senza Date.now() al suo interno,
// per restare testabile in modo deterministico).
export function buildDailyReport({ spiderman, venom, sinceIso, generatedAtIso }) {
  const spidermanEquity = computeEquitySnapshot(spiderman?.account?.demoAccount);
  const venomEquity = computeEquitySnapshot(venom?.account?.demoAccount);
  return {
    generatedAt: generatedAtIso,
    spiderman: spiderman?.account?.demoAccount ? {
      equity: spidermanEquity,
      trades: summarizeTrades(spiderman.account.demoAccount.trades, sinceIso),
      validated: summarizeValidated(spiderman.research?.researchData?.validated),
      activity: recentActivity(spiderman.account.activity),
      symbolCount: spiderman.research?.researchData?.validated ? Object.keys(spiderman.research.researchData.validated).length : 0,
      accountUpdatedAt: spiderman.account.updatedAt || null
    } : null,
    venom: venom?.account?.demoAccount ? {
      equity: venomEquity,
      trades: summarizeTrades(venom.account.demoAccount.trades, sinceIso),
      validated: summarizeValidated(venom.research?.researchData?.validated),
      activity: recentActivity(venom.account.activity),
      symbolCount: venom.research?.researchData?.validated ? Object.keys(venom.research.researchData.validated).length : 0,
      accountUpdatedAt: venom.account.updatedAt || null
    } : null
  };
}
