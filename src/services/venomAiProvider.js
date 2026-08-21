// Gemello di services/aiProviders.js per la pipeline venom: stessa architettura (contesto di
// mercato -> POST al backend -> agenti via MCP -> Gemini), endpoint e campi di contesto diversi
// (clubName/newsLocale al posto di finnhubKey, niente fundamental/social/macro). Sostituisce
// aiProviders.js nel manifest venom (src/venom-engine-manifest.json) — mai caricato insieme.
window.Aurora = window.Aurora || {};
Aurora.Services = Aurora.Services || {};

function buildVenomMarketContext() {
  const Models = Aurora.Models;
  const context = {};
  Object.keys(Models.instruments).forEach((symbol) => {
    const instrument = Models.instruments[symbol];
    const rule = Aurora.Engine.ruleSignalFor(symbol);
    const history = rule.timeframe ? Models.historyCache[symbol]?.[rule.timeframe] : Models.historyCache[symbol]?.['1D'];
    const ohlcHistory = Models.historyCache[symbol]?.[rule.timeframe]?.candles ? history
      : Object.values(Models.historyCache[symbol] || {}).find((entry) => entry.candles?.length);
    const hasTechnicalOpinion = rule.validated || rule.exploratory || rule.tier === 'probe';
    const lessons = rule.candidateKey ? Aurora.Engine.getActiveLessons(rule.candidateKey).map((lesson) => lesson.statement) : [];
    const confluence = Aurora.Engine.computeConfluence(symbol, rule.candidateKey)
      .map((c) => `${c.strategyLabel} (${c.timeframe}, ${c.tier === 'validated' ? 'validata' : 'esplorativa'}): ${c.bullish ? 'rialzista' : 'neutra'}`);
    context[symbol] = {
      price: Number(Aurora.Engine.getDemoPrice(symbol).toFixed(6)),
      changePercent: Number(Aurora.Utils.clamp(Aurora.Engine.symbolChange(symbol), -30, 30).toFixed(2)),
      closes: history?.closes?.length ? [...history.closes, Aurora.Engine.getDemoPrice(symbol)] : [],
      candles: ohlcHistory?.candles || [],
      validated: rule.validated,
      tier: rule.tier,
      strategyLabel: hasTechnicalOpinion ? (Aurora.Engine.STRATEGIES[rule.strategyId]?.label || rule.strategyId) : null,
      timeframe: rule.timeframe || null,
      bullish: rule.bullish,
      confidenceHint: hasTechnicalOpinion ? rule.confidence : null,
      lessons,
      confluence,
      clubName: instrument.newsQuery,
      newsLocale: instrument.newsLocale
    };
  });
  return context;
}

function buildVenomRiskSnapshot() {
  const Models = Aurora.Models;
  const metrics = Aurora.Engine.getMetrics();
  return {
    equity: metrics.equity,
    cash: Models.demoAccount.cash,
    exposurePercent: metrics.exposure,
    drawdownPercent: metrics.drawdown,
    maxExposurePercent: Models.SIMULATION.maximumPositionPercent,
    maxDrawdownPercent: Models.SIMULATION.maximumDrawdownPercent,
    openPositions: Object.keys(Models.demoAccount.positions).length,
    maxConcurrentPositions: Models.SIMULATION.maxConcurrentPositions
  };
}

Aurora.Services.fetchVenomGeminiSignals = async function fetchVenomGeminiSignals() {
  const Models = Aurora.Models;
  if (!Models.aiEngine.geminiKey) return;
  if (Models.geminiFetchInFlight || Date.now() < Models.geminiCooldownUntil) return;
  Models.geminiFetchInFlight = true;
  const statusEl = Aurora.Utils.$('gemini-status');
  if (statusEl) statusEl.textContent = 'Interrogo gli agenti venom e il modello principale…';
  try {
    const symbols = Object.keys(Models.instruments);
    const res = await fetch(`${Aurora.Config.backendUrl}/api/venom-agent-decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: Models.aiEngine.geminiKey,
        symbols,
        marketContext: buildVenomMarketContext(),
        risk: buildVenomRiskSnapshot(),
        heldPositions: Object.keys(Models.demoAccount.positions)
      })
    });
    if (res.status === 429) { Models.geminiCooldownUntil = Date.now() + 60000; throw new Error('Limite richieste Gemini raggiunto, nuovo tentativo tra 60s.'); }
    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      throw new Error(errorBody.error || `Errore backend (http ${res.status})`);
    }
    const data = await res.json();
    Object.entries(data.signals || {}).forEach(([symbol, entry]) => { Models.geminiSignals[symbol] = entry; });
    if (statusEl) statusEl.textContent = `Giudizio venom aggiornato (${Object.keys(data.signals || {}).length} club, agenti + Gemini) alle ${new Date().toLocaleTimeString('it-IT', { hour12: false })}.`;
    if (data.contextTrimmed && Models.logActivity) {
      Models.logActivity({ title: 'Contesto Gemini venom troncato per budget', detail: `Notizie ridotte per: ${(data.trimmedSymbols || []).join(', ')}.`, tag: 'JOB' });
    }
  } catch (error) {
    if (statusEl) {
      const isNetworkError = error instanceof TypeError;
      statusEl.textContent = isNetworkError
        ? 'Backend locale non raggiungibile: avvia "npm start" nella cartella server/.'
        : (error.message || 'Errore nel contattare il backend.');
    }
  } finally {
    Models.geminiFetchInFlight = false;
  }
};
