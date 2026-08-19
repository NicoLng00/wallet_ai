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
  Views.renderMemoryPage();
  if (Models.liveData.enabled) Services.refreshLiveQuotes();
  if (Models.aiEngine.mode === 'gemini' && Models.aiEngine.geminiKey) {
    Aurora.Utils.$('gemini-status').textContent = 'Motore: AI (Gemini) — aggiorno il giudizio…';
    Services.fetchGeminiSignals();
  } else {
    Aurora.Utils.$('gemini-status').textContent = Models.aiEngine.mode === 'gemini' ? 'Motore: AI (Gemini) — inserisci una chiave per attivarla.' : 'Motore: regola tecnica.';
  }
  Views.updateClock();

  function renderEverything() {
    Views.renderWatchlist();
    Views.renderDemoAccount();
    Views.renderWalletOverview();
    Views.renderSymbol();
    Views.renderActivity();
    Views.renderResearchResults();
    Views.renderMemoryPage();
  }

  // Sul sito pubblicato lo stato del conto e' quello del bot autonomo (job schedulati, vedi
  // server/jobs/), non piu' locale al browser di chi visita — se il fetch va a buon fine il resto
  // del bootstrap (tick demo locale, tocco SL/TP locale) si disattiva: mostrare qui una seconda
  // simulazione indipendente, sopra i dati reali del bot appena caricati, sarebbe fuorviante.
  Services.hydrateFromSharedState().then((hydrated) => {
    Models.sharedStateMode = hydrated;
    if (hydrated) {
      renderEverything();
      Views.showToast('Stato caricato dal bot autonomo (aggiornato ogni ~15 minuti).', 'success');
    }
  });

  window.setInterval(() => {
    Views.updateClock();
    if (Models.sharedStateMode) return; // il refresh periodico e' gestito sotto, via nuovo fetch
    if (!Models.autopilotRunning) {
      if (!Models.liveData.enabled) Aurora.Engine.tickDemoMarket();
      Aurora.Engine.checkStopsAndTargets();
      Views.renderDemoAccount();
      Views.renderWalletOverview();
      Views.updateQuoteUI();
      Views.renderWatchlist();
      Views.updateOrderEstimate();
      Views.renderChartLevelsOverlay();
      Views.renderMemoryHistory();
      Views.renderMemoryLessons();
    }
  }, 6000);
  window.setInterval(Services.refreshLiveQuotes, 20000);
  window.setInterval(() => {
    if (!Models.sharedStateMode) return;
    Services.hydrateFromSharedState().then((hydrated) => { if (hydrated) renderEverything(); });
  }, 60000);
})();
