// Controller: azioni innescate dall'utente. Orchestrano Models + Engine/Agents + Views, mai
// logica di dominio qui dentro.
window.Aurora = window.Aurora || {};
Aurora.Controllers = Aurora.Controllers || {};

Aurora.Controllers.selectSymbol = function selectSymbol(symbol) {
  const { $ } = Aurora.Utils;
  Aurora.Models.activeSymbol = symbol;
  Aurora.Models.analysisReady = false;
  $('order-stop-loss').value = '';
  $('order-take-profit').value = '';
  Aurora.Views.resetDesk();
  Aurora.Views.renderSymbol();
  Aurora.Views.renderActivity();
  Aurora.Views.showToast(`${symbol} caricato: grafico TradingView aggiornato.`, 'success');
};

Aurora.Controllers.runAnalysis = function runAnalysis() {
  const { $ } = Aurora.Utils;
  if ($('desk-status').textContent === 'In esecuzione') return;
  $('desk-status').className = 'status-pill running';
  $('desk-status').textContent = 'In esecuzione';
  $('run-analysis').innerHTML = 'Analisi…';
  Aurora.Views.renderAgents('running');
  Aurora.Models.logActivity({ title: `Desk avviato su ${Aurora.Models.activeSymbol}`, detail: 'Brief distribuito a 8 agenti nel sandbox.', tag: 'RUN' });
  Aurora.Views.renderActivity();
  window.setTimeout(() => {
    const signal = Aurora.Agents.supervisor.signalFor(Aurora.Models.activeSymbol);
    Aurora.Views.showAnalysis(signal);
    $('run-analysis').innerHTML = 'Rianalizza <span>↗</span>';
    Aurora.Models.logActivity({ title: `Audit completato — ${Aurora.Models.activeSymbol}`, detail: `Decisione simulata con score ${signal.score}/100 e confidenza ${signal.confidence}%.`, tag: 'AUDIT' });
    Aurora.Views.renderActivity();
    Aurora.Views.showToast('Desk completato: il Risk Manager ha rivalutato l’ordine.', 'success');
  }, 950);
};

Aurora.Controllers.submitOrder = function submitOrder() {
  const risk = Aurora.Engine.orderRisk();
  if (!risk.allowed) { Aurora.Views.showToast(`Ordine non eseguito: ${risk.reason}.`, 'error'); return; }
  if (Aurora.Engine.executePaperTrade(risk)) Aurora.Views.showToast(`${Aurora.Models.activeSide === 'buy' ? 'Acquisto' : 'Vendita'} eseguito nel conto demo.`, 'success');
};

Aurora.Controllers.setSide = function setSide(side) {
  Aurora.Models.activeSide = side;
  document.querySelectorAll('.side-option').forEach((button) => button.classList.toggle('active', button.dataset.side === side));
  Aurora.Views.updateOrderEstimate();
};

Aurora.Controllers.resetDemoAccount = function resetDemoAccount() {
  const { $, formatMoney } = Aurora.Utils;
  const Models = Aurora.Models;
  window.clearInterval(Models.autopilotTimer);
  Models.autopilotRunning = false;
  Models.demoAccount = Models.makeDemoAccount();
  Models.persistDemoAccount();
  Models.analysisReady = false;
  Models.activity = [];
  Models.persistActivity();
  $('order-stop-loss').value = '';
  $('order-take-profit').value = '';
  Aurora.Views.resetDesk();
  Aurora.Views.renderDemoAccount();
  Aurora.Views.renderWalletOverview();
  Aurora.Views.renderSymbol();
  Aurora.Views.renderActivity();
  $('autopilot-toggle').closest('.autopilot-card').classList.remove('running');
  $('autopilot-status').textContent = 'Pausato';
  $('autopilot-toggle').textContent = 'Avvia';
  $('autopilot-copy').textContent = `Paper only · ciclo ogni 20 s · max ${formatMoney(Models.SIMULATION.maximumOrder)} per trade.`;
  Aurora.Views.showToast(`Conto demo locale riportato a ${formatMoney(Models.SIMULATION.accountSeed)}.`, 'success');
};

Aurora.Controllers.wireEvents = function wireEvents() {
  const { $ } = Aurora.Utils;
  const Models = Aurora.Models;
  const Controllers = Aurora.Controllers;

  $('run-analysis').addEventListener('click', Controllers.runAnalysis);
  $('buy-button').addEventListener('click', () => { Controllers.setSide('buy'); $('order-quantity').focus(); });
  $('sell-button').addEventListener('click', () => { Controllers.setSide('sell'); $('order-quantity').focus(); });
  $('order-quantity').addEventListener('input', Aurora.Views.updateOrderEstimate);
  $('order-stop-loss').addEventListener('input', Aurora.Views.updateOrderEstimate);
  $('order-take-profit').addEventListener('input', Aurora.Views.updateOrderEstimate);
  $('submit-order').addEventListener('click', Controllers.submitOrder);
  $('autopilot-toggle').addEventListener('click', () => Aurora.Engine.setAutopilot(!Models.autopilotRunning));
  const AUTOPILOT_MODE_COPY = {
    coverage: 'Copertura: almeno un trade al giorno anche senza edge misurato (sonda/forzata).',
    quality: 'Qualità: solo validato/esplorativo — zero trade in un giorno senza edge è un esito accettato.'
  };
  document.querySelectorAll('.mode-option').forEach((button) => button.addEventListener('click', () => {
    Models.autopilotMode = button.dataset.mode;
    Models.persistAutopilotMode();
    document.querySelectorAll('.mode-option').forEach((mode) => mode.classList.toggle('active', mode === button));
    $('autopilot-mode-copy').textContent = AUTOPILOT_MODE_COPY[Models.autopilotMode];
    Aurora.Views.showToast(Models.autopilotMode === 'quality'
      ? 'Modalità Qualità: l\'Autopilot ora tratta le sole opportunità validate/esplorative.'
      : 'Modalità Copertura: l\'Autopilot userà anche sonda e fallback forzato per garantire attività giornaliera.', 'success');
  }));
  document.querySelector(`.mode-option[data-mode="${Models.autopilotMode}"]`)?.classList.add('active');
  document.querySelectorAll('.mode-option').forEach((mode) => { if (mode.dataset.mode !== Models.autopilotMode) mode.classList.remove('active'); });
  $('autopilot-mode-copy').textContent = AUTOPILOT_MODE_COPY[Models.autopilotMode];
  $('reset-demo').addEventListener('click', Controllers.resetDemoAccount);
  document.querySelectorAll('.side-option').forEach((button) => button.addEventListener('click', () => Controllers.setSide(button.dataset.side)));
  document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => {
    Models.selectedTab = button.dataset.tab;
    document.querySelectorAll('.tab').forEach((tab) => {
      const isActive = tab === button;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });
    Aurora.Views.renderActivity();
  }));
  document.querySelectorAll('.time-button').forEach((button) => button.addEventListener('click', () => {
    Models.activeTimeframe = button.dataset.timeframe;
    document.querySelectorAll('.time-button').forEach((time) => time.classList.toggle('active', time === button));
    $('timeframe-label').textContent = ({ '1m': '1 minuto', '5m': '5 minuti', '15m': '15 minuti', '1h': '1 ora', '1D': '1 giorno' })[Models.activeTimeframe];
    Aurora.Views.renderTradingViewWidget();
  }));
  $('add-symbol').addEventListener('click', () => Aurora.Views.showToast('La watchlist demo contiene i titoli supportati dal prototipo.'));
  $('open-settings').addEventListener('click', () => $('data-settings').classList.toggle('hidden'));
  $('finnhub-key-input').value = Models.liveData.finnhubKey || '';
  $('save-live-key').addEventListener('click', () => {
    const value = $('finnhub-key-input').value.trim();
    Models.liveData.finnhubKey = value || null;
    Models.persistLiveData();
    Aurora.Views.showToast(value ? 'Chiave Finnhub salvata.' : 'Chiave rimossa.', value ? 'success' : '');
    Aurora.Views.renderLiveDataStatus();
  });
  $('live-data-toggle').textContent = Models.liveData.enabled ? 'Torna a simulati' : 'Attiva Live';
  $('live-data-toggle').addEventListener('click', () => {
    if (!Models.liveData.enabled && !Models.liveData.finnhubKey) {
      Aurora.Views.showToast('Inserisci prima una API key Finnhub gratuita.', 'error');
      return;
    }
    Models.liveData.enabled = !Models.liveData.enabled;
    Models.persistLiveData();
    $('live-data-toggle').textContent = Models.liveData.enabled ? 'Torna a simulati' : 'Attiva Live';
    Aurora.Views.renderLiveDataStatus();
    if (Models.liveData.enabled) { Models.liveCooldownUntil = 0; Aurora.Services.refreshLiveQuotes(); }
    else Aurora.Views.showToast('Tornato alla modalità prezzi simulati.', 'success');
  });
  $('alphavantage-key-input').value = Models.researchData.alphaVantageKey || '';
  $('save-alphavantage-key').addEventListener('click', () => {
    const value = $('alphavantage-key-input').value.trim();
    Models.researchData.alphaVantageKey = value || null;
    Models.persistResearchData();
    Aurora.Views.showToast(value ? 'Chiave Alpha Vantage salvata.' : 'Chiave rimossa.', value ? 'success' : '');
  });
  $('gemini-key-input').value = Models.aiEngine.geminiKey || '';
  $('save-gemini-key').addEventListener('click', () => {
    const value = $('gemini-key-input').value.trim();
    Models.aiEngine.geminiKey = value || null;
    Models.persistAiEngine();
    Aurora.Views.showToast(value ? 'Chiave Gemini salvata.' : 'Chiave rimossa.', value ? 'success' : '');
  });
  $('ai-engine-toggle').textContent = Models.aiEngine.mode === 'gemini' ? 'Torna a Regola tecnica' : 'Attiva AI (Gemini)';
  $('ai-engine-toggle').addEventListener('click', () => {
    if (Models.aiEngine.mode !== 'gemini' && !Models.aiEngine.geminiKey) {
      Aurora.Views.showToast('Inserisci prima una API key Gemini gratuita (Google AI Studio).', 'error');
      return;
    }
    Models.aiEngine.mode = Models.aiEngine.mode === 'gemini' ? 'rule' : 'gemini';
    Models.persistAiEngine();
    $('ai-engine-toggle').textContent = Models.aiEngine.mode === 'gemini' ? 'Torna a Regola tecnica' : 'Attiva AI (Gemini)';
    Aurora.Views.showToast(Models.aiEngine.mode === 'gemini'
      ? 'Modalità AI (Gemini) attiva: giudizio sperimentale, non backtestato.'
      : 'Tornato alla regola tecnica validata da backtest.', 'success');
    if (Models.aiEngine.mode === 'gemini') Aurora.Services.fetchGeminiSignals();
  });
  $('refresh-gemini').addEventListener('click', () => {
    if (!Models.aiEngine.geminiKey) { Aurora.Views.showToast('Inserisci prima una API key Gemini gratuita.', 'error'); return; }
    Aurora.Services.fetchGeminiSignals();
  });
  // XAUUSD ora ha una fonte storica reale (Yahoo Finance via backend, proxy GC=F) — non piu'
  // esclusa a priori. Nessun pre-check bloccante sulla chiave Alpha Vantage: il backend locale
  // (se in esecuzione) da' storico piu' lungo senza alcuna chiave; se il backend non e'
  // raggiungibile e manca la chiave, l'errore reale del backtest lo spiega comunque nello status.
  $('research-symbol').innerHTML = Object.keys(Models.instruments)
    .map((symbol) => `<option value="${symbol}">${symbol}</option>`).join('');
  $('run-backtest').addEventListener('click', () => {
    Aurora.Services.runResearchBacktest($('research-symbol').value);
  });
  ['memory-filter-account', 'memory-filter-symbol', 'memory-filter-tier', 'memory-filter-outcome'].forEach((id) => {
    $(id).addEventListener('change', Aurora.Views.renderMemoryHistory);
  });
  $('view-positions').addEventListener('click', () => {
    Models.selectedTab = 'positions';
    document.querySelectorAll('.tab').forEach((tab) => {
      const isActive = tab.dataset.tab === 'positions';
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });
    Aurora.Views.renderActivity();
    document.querySelector('.activity-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('symbol-search').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const value = event.target.value.trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (Models.instruments[value]) { Controllers.selectSymbol(value); event.target.value = ''; }
    else Aurora.Views.showToast('Ticker non disponibile nella demo.', 'error');
  });
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      $('symbol-search').focus();
    }
  });
  document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item === button));
    const target = document.getElementById(button.dataset.section);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
};
