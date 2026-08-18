// Bootstrap: primo render, wiring eventi, timer periodici. Ultimo file caricato — a questo punto
// tutti i moduli (Utils, Models, Engine, Agents, Services, Views, Controllers) sono già definiti su
// window.Aurora.
(function () {
  const Models = Aurora.Models;
  const Views = Aurora.Views;
  const Services = Aurora.Services;

  Views.renderWatchlist();
  Views.renderAgents();
  Views.renderDemoAccount();
  Views.renderWalletOverview();
  Views.renderSymbol();
  Views.renderActivity();
  Aurora.Controllers.wireEvents();
  Views.renderLiveDataStatus();
  Views.renderResearchResults();
  if (Models.liveData.enabled) Services.refreshLiveQuotes();
  if (Models.aiEngine.mode === 'gemini' && Models.aiEngine.geminiKey) {
    Aurora.Utils.$('gemini-status').textContent = 'Motore: AI (Gemini) — aggiorno il giudizio…';
    Services.fetchGeminiSignals();
  } else {
    Aurora.Utils.$('gemini-status').textContent = Models.aiEngine.mode === 'gemini' ? 'Motore: AI (Gemini) — inserisci una chiave per attivarla.' : 'Motore: regola tecnica.';
  }
  Views.updateClock();
  window.setInterval(() => {
    Views.updateClock();
    if (!Models.autopilotRunning) {
      if (!Models.liveData.enabled) Aurora.Engine.tickDemoMarket();
      Aurora.Engine.checkStopsAndTargets();
      Views.renderDemoAccount();
      Views.renderWalletOverview();
      Views.updateQuoteUI();
      Views.renderWatchlist();
      Views.updateOrderEstimate();
      Views.renderChartLevelsOverlay();
    }
  }, 6000);
  window.setInterval(Services.refreshLiveQuotes, 20000);
})();
