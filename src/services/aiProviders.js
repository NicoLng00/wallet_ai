// Motore AI pluggable. Il giudizio del "modello principale" non arriva più da una chiamata
// diretta del browser a Google: passa dal backend locale (server/), che orchestra gli 8 agenti
// via MCP reale (server+client in-process, protocollo MCP autentico) e poi interroga il
// provider scelto. Se il backend non è in esecuzione, l'errore lo dice esplicitamente —
// nessun fallback silenzioso a un giudizio inventato.
window.Aurora = window.Aurora || {};
Aurora.Services = Aurora.Services || {};

function buildMarketContext() {
  const Models = Aurora.Models;
  const context = {};
  Object.keys(Models.instruments).forEach((symbol) => {
    // Il client ha gia' fatto girare la selezione multi-strategia (engine/rules.js): il backend
    // riceve il verdetto gia' verificato walk-forward, non ricalcola SMA/RSI da zero.
    const rule = Aurora.Engine.ruleSignalFor(symbol);
    const history = rule.timeframe ? Models.historyCache[symbol]?.[rule.timeframe] : Models.historyCache[symbol]?.['1D'];
    // Per il regime di volatilita' (ATR) serve una serie di candele OHLC reali quando disponibile,
    // anche se la strategia scelta non le richiede direttamente.
    const ohlcHistory = Models.historyCache[symbol]?.[rule.timeframe]?.candles ? history
      : Object.values(Models.historyCache[symbol] || {}).find((entry) => entry.candles?.length);
    const hasTechnicalOpinion = rule.validated || rule.exploratory || rule.tier === 'probe';
    // Evidence Retrieval: le lezioni attive del Learning Loop per la strategia scelta (se ce n'è
    // una) diventano contesto per il modello — mai un fine-tuning, solo memoria consultabile.
    const lessons = rule.candidateKey ? Aurora.Engine.getActiveLessons(rule.candidateKey).map((lesson) => lesson.statement) : [];
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
      lessons
    };
  });
  return context;
}

function buildRiskSnapshot() {
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

Aurora.Services.fetchGeminiSignals = async function fetchGeminiSignals() {
  const Models = Aurora.Models;
  if (!Models.aiEngine.geminiKey) return;
  if (Models.geminiFetchInFlight || Date.now() < Models.geminiCooldownUntil) return;
  Models.geminiFetchInFlight = true;
  const statusEl = Aurora.Utils.$('gemini-status');
  if (statusEl) statusEl.textContent = 'Interrogo gli agenti e il modello principale…';
  try {
    const symbols = Object.keys(Models.instruments);
    const res = await fetch(`${Aurora.Config.backendUrl}/api/agent-decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: 'gemini',
        apiKey: Models.aiEngine.geminiKey,
        finnhubKey: Models.liveData.finnhubKey || null,
        symbols,
        marketContext: buildMarketContext(),
        risk: buildRiskSnapshot(),
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
    if (statusEl) statusEl.textContent = `Giudizio aggiornato (${Object.keys(data.signals || {}).length} titoli, agenti + Gemini) alle ${new Date().toLocaleTimeString('it-IT', { hour12: false })}.`;
    // Visibilita' esplicita quando il budget del context scatta (lib/contextBudget.js) — non un
    // evento silenzioso: a 12 simboli oggi non dovrebbe mai succedere, se succede va saputo.
    if (data.contextTrimmed && Models.logActivity) {
      Models.logActivity({ title: 'Contesto Gemini troncato per budget', detail: `Notizie/social ridotti per: ${(data.trimmedSymbols || []).join(', ')}.`, tag: 'JOB' });
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

// Interfaccia comune per un provider AI pluggable (rispecchia server/providers/registry.js).
function providerTemplate(id, label) {
  return {
    id, label, costTier: 'paid', keySource: 'server-env', requiresKey: true, implemented: false,
    async call() {
      throw new Error(`Provider "${id}" non ancora implementato: solo interfaccia predisposta.`);
    }
  };
}

Aurora.Services.aiProviderRegistry = {
  gemini: { id: 'gemini', label: 'Google Gemini', costTier: 'free', keySource: 'client', requiresKey: true, implemented: true, call: Aurora.Services.fetchGeminiSignals },
  anthropic: providerTemplate('anthropic', 'Anthropic Claude'),
  openaiCompatible: providerTemplate('openai-compatible', 'OpenAI-compatible')
};
