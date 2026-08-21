// Dashboard venom, sola lettura — gemella semplificata di views.js+main.js per il sistema
// principale, ma senza nessuna interattivita' (nessun ordine manuale, nessun autopilot locale:
// venom esiste solo come bot autonomo, vedi server/jobs/venom/). Carica data/venom/account.json e
// data/venom/research.json direttamente (stesso principio di Aurora.Services.hydrateFromSharedState
// in dataProviders.js, mai importato qui per restare un motore minimo: solo utils/config/venomState/
// market/memory, niente engine di esecuzione che questa pagina non usa mai).
(function () {
  const { $, formatMoney } = Aurora.Utils;
  const Models = Aurora.Models;

  async function loadVenomState() {
    const [accountRes, researchRes] = await Promise.all([
      fetch('./data/venom/account.json').catch(() => null),
      fetch('./data/venom/research.json').catch(() => null)
    ]);
    if (!accountRes?.ok || !researchRes?.ok) return null;
    const account = await accountRes.json();
    const research = await researchRes.json();
    if (account.demoAccount) Models.demoAccount = { ...Models.makeDemoAccount(), ...account.demoAccount };
    if (Array.isArray(account.activity)) Models.activity = account.activity;
    if (research.researchData) {
      Models.researchData = {
        alphaVantageKey: null,
        validated: research.researchData.validated || {},
        trackRecord: research.researchData.trackRecord || {},
        tradeEpisodes: research.researchData.tradeEpisodes || {},
        lessons: research.researchData.lessons || {},
        seeded: false
      };
    }
    Models.historyCache = research.historyCache || {};
    return { account, research };
  }

  function renderWalletStats() {
    const stats = Aurora.Engine.computeWalletStats();
    const signed = (value) => `${value >= 0 ? '+' : ''}${formatMoney(value)}`;
    const tone = (value) => (value >= 0 ? 'positive' : 'negative');
    const tiles = [
      ['Equity totale', formatMoney(stats.metrics.equity), ''],
      ['Cash disponibile', formatMoney(Models.demoAccount.cash), ''],
      ['Valore posizioni', formatMoney(stats.metrics.positionValue), ''],
      ['P&L totale', signed(stats.totalPnl), tone(stats.totalPnl)],
      ['P&L realizzato', signed(stats.realizedPnl), tone(stats.realizedPnl)],
      ['Win rate', `${stats.winRate.toFixed(0)}%`, ''],
      ['Trade totali', `${Models.demoAccount.trades.length}`, ''],
      ['Esposizione', `${stats.metrics.exposure.toFixed(1)}%`, ''],
      ['Drawdown attuale', `${stats.metrics.drawdown.toFixed(1)}%`, ''],
      ['Leva', `${Models.SIMULATION.leverageMultiplier}x`, ''],
      ['Miglior trade', stats.best ? `${stats.best.symbol} ${signed(stats.best.realizedPnl)}` : '—', stats.best ? tone(stats.best.realizedPnl) : ''],
      ['Peggior trade', stats.worst ? `${stats.worst.symbol} ${signed(stats.worst.realizedPnl)}` : '—', stats.worst ? tone(stats.worst.realizedPnl) : '']
    ];
    $('venom-wallet-stats').innerHTML = tiles.map(([label, value, cls]) => `<div class="wallet-stat"><span>${label}</span><strong class="${cls}">${value}</strong></div>`).join('');
  }

  // Bug reale trovato guardando la pagina renderizzata (schermata di verifica): Aurora.Engine.
  // symbolChange ricade su (prezzo attuale / instruments[symbol].price - 1) quando i dati live non
  // sono attivi — assunzione valida per SpiderMan (stessa valuta ovunque), ma FALSA qui: il prezzo
  // attuale e' gia' convertito in EUR (refreshVenomQuotes), mentre instruments[symbol].price e' il
  // seed in valuta NATIVA (es. CCP.L: 200, cioe' 200 GBp, non 200 EUR) — un confronto tra unita' di
  // misura diverse, dava variazioni assurde (-98%, clampate a -30% e quindi ancora sbagliate, solo
  // meno vistose). Calcolato qui invece da due chiusure reali consecutive nella STESSA valuta
  // (historyCache, mai convertito) — un confronto onesto, o "—" se lo storico non basta.
  function realDayChangePercent(symbol) {
    const closes = Models.historyCache[symbol]?.['1D']?.closes;
    if (!closes || closes.length < 2) return null;
    const prev = closes[closes.length - 2];
    const last = closes[closes.length - 1];
    if (!prev) return null;
    return ((last - prev) / prev) * 100;
  }

  function renderClubGrid() {
    const { instruments, demoAccount, activeSymbol } = Models;
    const symbols = Object.keys(instruments);
    $('venom-clubs-count').textContent = `${symbols.length} club`;
    $('venom-club-grid').innerHTML = symbols.map((symbol) => {
      const data = instruments[symbol];
      const price = Aurora.Engine.getDemoPrice(symbol);
      const change = realDayChangePercent(symbol);
      const held = !!demoAccount.positions[symbol];
      const initials = symbol.split('.')[0].slice(0, 2).toUpperCase();
      return `
      <button type="button" class="venom-club-card ${held ? 'held' : ''} ${symbol === activeSymbol ? 'selected' : ''}" data-symbol="${symbol}">
        <div class="venom-club-logo" style="background:${data.color}">${initials}</div>
        <div class="venom-club-info">
          <span class="venom-club-name">${data.name}${held ? '<span class="venom-held-badge">IN POSIZIONE</span>' : ''}</span>
          <span class="venom-club-exchange">${data.exchange}</span>
        </div>
        <div class="venom-club-quote">
          <span class="venom-club-price">${formatMoney(price)}</span>
          <span class="venom-club-change ${change === null ? '' : change >= 0 ? 'positive' : 'negative'}">${change === null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`}</span>
        </div>
      </button>`;
    }).join('');
    if ($('venom-chart-title')) {
      document.querySelectorAll('.venom-club-card').forEach((card) => card.addEventListener('click', () => selectVenomSymbol(card.dataset.symbol)));
    }
  }

  // Grafico TradingView del club selezionato dalla watchlist — stessa Aurora.Views.renderTradingViewWidget
  // usata da SpiderMan (src/views/chartWidget.js), qui guidata dal click su una card invece che dalla
  // sidebar: Venom non duplica una seconda lista, la watchlist E' gia' il club-grid.
  function renderVenomChartHeader() {
    const { instruments, activeSymbol } = Models;
    const data = instruments[activeSymbol];
    if (!data) return;
    const price = Aurora.Engine.getDemoPrice(activeSymbol);
    const change = realDayChangePercent(activeSymbol);
    $('venom-chart-title').textContent = `${data.name} · ${activeSymbol}`;
    const priceEl = $('venom-chart-price');
    priceEl.textContent = `${formatMoney(price)}${change === null ? '' : ` · ${change >= 0 ? '+' : ''}${change.toFixed(2)}%`}`;
    priceEl.className = `status-pill ${change === null ? 'idle' : change >= 0 ? 'ok' : 'blocked'}`;
  }

  function selectVenomSymbol(symbol) {
    if (!Models.instruments[symbol]) return;
    Models.activeSymbol = symbol;
    renderVenomChartHeader();
    Aurora.Views.renderTradingViewWidget();
    document.querySelectorAll('.venom-club-card').forEach((card) => card.classList.toggle('selected', card.dataset.symbol === symbol));
  }

  function renderPositions() {
    const { instruments, demoAccount } = Models;
    const entries = Object.entries(demoAccount.positions);
    $('venom-position-count').textContent = `${entries.length}`;
    const container = $('venom-positions');
    if (!entries.length) { container.innerHTML = '<div class="empty-state">Nessuna posizione aperta.</div>'; return; }
    container.innerHTML = entries.map(([symbol, position]) => {
      const tier = position.decisionSnapshot?.tier || '—';
      return `
      <div class="history-row" style="grid-template-columns:84px 1fr 90px 90px 90px 90px;">
        <span>${symbol}</span>
        <span>${position.strategyKey || '—'}</span>
        <span>${position.quantity.toFixed(6)}</span>
        <span>${formatMoney(position.averagePrice)}</span>
        <span>${position.stopLoss ? formatMoney(position.stopLoss) : '—'} / ${position.takeProfit ? formatMoney(position.takeProfit) : '—'}</span>
        <span><span class="memory-tag tier-${tier}">${tier}</span></span>
      </div>`;
    }).join('');
  }

  function renderActivity() {
    const activity = Models.activity || [];
    $('venom-activity-count').textContent = `${activity.length}`;
    const container = $('venom-activity');
    if (!activity.length) { container.innerHTML = '<div class="empty-state">Nessuna attività registrata ancora.</div>'; return; }
    container.innerHTML = activity.slice(0, 30).map((entry) => `
      <div class="audit-row">
        <span class="audit-time">${entry.at ? new Date(entry.at).toLocaleString('it-IT', { hour12: false }) : ''}</span>
        <div class="audit-main"><strong>${entry.title}</strong><span>${entry.detail || ''}</span></div>
        <span class="audit-tag">${entry.tag || ''}</span>
      </div>`).join('');
  }

  function researchRowHtml({ symbol, candidateKey, result }) {
    const winRateLabel = `${result.inSample.winRate.toFixed(1)}% / ${result.outOfSample.winRate.toFixed(1)}%`;
    const baselineLabel = `${result.outOfSampleBaseline.winRate.toFixed(1)}%`;
    const avgReturnValue = result.outOfSample.avgReturn;
    const verdict = result.validated ? 'Validato' : result.exploratory ? 'Esplorativo' : 'Nessun edge';
    const verdictClass = result.validated ? 'ok' : result.exploratory ? 'running' : 'blocked';
    const lessons = Aurora.Engine.getActiveLessons(candidateKey);
    return `
    <div class="research-row">
      <span>${symbol}</span>
      <span>${result.label} · ${result.timeframe}</span>
      <span>${result.count}</span>
      <span>${winRateLabel}</span>
      <span>${baselineLabel}</span>
      <span class="${avgReturnValue >= 0 ? 'positive' : 'negative'}">${avgReturnValue >= 0 ? '+' : ''}${avgReturnValue.toFixed(2)}%</span>
      <span>—</span>
      <span><span class="status-pill ${verdictClass}">${verdict}</span>${lessons.length ? ` <small>${lessons.length} lezione/i</small>` : ''}</span>
    </div>`;
  }

  const VENOM_RESEARCH_PAGE_KEY = 'venom-research-results';

  // Con 13 club x ~7 strategie ciascuno, il totale sfiora i 100 candidati — mostrarli tutti in una
  // sola pagina renderebbe la pagina illeggibile. Validato/Esplorativo prima (le uniche fasce che
  // contano per l'Autopilot), poi il resto, paginati con lo stesso componente usato da SpiderMan
  // (Aurora.Views.Pagination) invece di un pulsante mostra/nascondi dedicato — stessa UX ovunque.
  function renderResearch() {
    const validated = Models.researchData.validated;
    const rows = [];
    Object.entries(validated).forEach(([symbol, entry]) => {
      Object.entries(entry.candidates || {}).forEach(([candidateKey, result]) => rows.push({ symbol, candidateKey, result }));
    });
    const container = $('venom-research-results');
    const validatedCount = rows.filter((r) => r.result.validated).length;
    $('venom-research-status').textContent = rows.length ? `${validatedCount}/${rows.length} validati` : 'Nessun backtest ancora';
    $('venom-research-status').className = `status-pill ${validatedCount ? 'ok' : 'idle'}`;
    if (!rows.length) { container.innerHTML = '<div class="empty-state">Nessun backtest eseguito ancora.</div>'; return; }

    const sorted = [...rows].sort((a, b) => {
      const rank = (r) => (r.result.validated ? 0 : r.result.exploratory ? 1 : 2);
      return rank(a) - rank(b);
    });
    const { pageItems, page, totalPages } = Aurora.Views.Pagination.slice(VENOM_RESEARCH_PAGE_KEY, sorted);
    const header = `<div class="research-row research-head"><span>Club</span><span>Strategia</span><span>Trade</span><span>Win rate (in/out)</span><span>vs random (out)</span><span>Rend. medio (out)</span><span>Live</span><span>Verdetto</span></div>`;

    container.innerHTML = header + pageItems.map(researchRowHtml).join('')
      + Aurora.Views.Pagination.controlsHtml(VENOM_RESEARCH_PAGE_KEY, page, totalPages);
    Aurora.Views.Pagination.wire(container, VENOM_RESEARCH_PAGE_KEY, renderResearch);
  }

  function renderAll() {
    renderWalletStats();
    renderClubGrid();
    renderPositions();
    renderActivity();
    renderResearch();
    // Grafico del club selezionato — solo su venom.html, dove esiste #venom-chart-title;
    // venom-memory.html non ha questo pannello, la guardia evita un riferimento a un elemento assente.
    if ($('venom-chart-title')) selectVenomSymbol(Models.activeSymbol);
  }

  // bootstrap(renderFn): carica lo stato condiviso, aggiorna badge/timestamp (presenti su ogni
  // pagina venom con lo stesso topbar), poi chiama SOLO il render richiesto da questa pagina —
  // cosi' venom-memory.html non tenta mai di popolare #venom-club-grid o #venom-positions, che li'
  // non esistono.
  async function bootstrap(renderFn) {
    const badge = $('venom-live-badge');
    const updatedEl = $('venom-updated');
    const loaded = await loadVenomState();
    if (!loaded) {
      if (badge) { badge.textContent = 'Stato non disponibile'; badge.className = 'status-pill blocked'; }
      if (updatedEl) updatedEl.textContent = 'Impossibile caricare data/venom/*.json — il bot autonomo non ha ancora prodotto uno stato, o la pagina è aperta da file:// (il fetch è bloccato dal browser su GitHub Pages funziona).';
      return;
    }
    if (badge) { badge.textContent = 'Bot autonomo attivo'; badge.className = 'status-pill ok'; }
    const updatedAt = loaded.account.updatedAt || loaded.research.updatedAt;
    if (updatedEl) updatedEl.textContent = updatedAt
      ? `Aggiornato ${new Date(updatedAt).toLocaleString('it-IT', { hour12: false })} — cicli ogni ~20 minuti, setup ogni giorno prima dell'apertura dei mercati europei.`
      : 'Stato caricato.';
    renderFn();
  }

  Aurora.VenomDashboard = {
    bootstrap, renderAll, renderWalletStats, renderClubGrid, renderPositions, renderActivity, renderResearch
  };
})();
