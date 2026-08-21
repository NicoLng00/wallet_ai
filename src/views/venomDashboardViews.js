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
    const { instruments, demoAccount } = Models;
    const symbols = Object.keys(instruments);
    $('venom-clubs-count').textContent = `${symbols.length} club`;
    $('venom-club-grid').innerHTML = symbols.map((symbol) => {
      const data = instruments[symbol];
      const price = Aurora.Engine.getDemoPrice(symbol);
      const change = realDayChangePercent(symbol);
      const held = !!demoAccount.positions[symbol];
      const initials = symbol.split('.')[0].slice(0, 2).toUpperCase();
      return `
      <div class="venom-club-card ${held ? 'held' : ''}">
        <div class="venom-club-logo" style="background:${data.color}">${initials}</div>
        <div class="venom-club-info">
          <span class="venom-club-name">${data.name}${held ? '<span class="venom-held-badge">IN POSIZIONE</span>' : ''}</span>
          <span class="venom-club-exchange">${data.exchange}</span>
        </div>
        <div class="venom-club-quote">
          <span class="venom-club-price">${formatMoney(price)}</span>
          <span class="venom-club-change ${change === null ? '' : change >= 0 ? 'positive' : 'negative'}">${change === null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`}</span>
        </div>
      </div>`;
    }).join('');
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

  // Con 13 club x ~7 strategie ciascuno, il totale sfiora i 100 candidati — mostrarli tutti per
  // default renderebbe la pagina illeggibile. Di default solo Validato/Esplorativo (le uniche
  // fasce che contano per l'Autopilot): un pulsante mostra il resto su richiesta, mai nascosto
  // per sempre — stessa onesta' del resto del progetto, solo meno rumore visivo.
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

    const sorted = rows.sort((a, b) => (b.result.validated ? 1 : 0) - (a.result.validated ? 1 : 0));
    const notable = sorted.filter((r) => r.result.validated || r.result.exploratory);
    const rest = sorted.filter((r) => !r.result.validated && !r.result.exploratory);
    const header = `<div class="research-row research-head"><span>Club</span><span>Strategia</span><span>Trade</span><span>Win rate (in/out)</span><span>vs random (out)</span><span>Rend. medio (out)</span><span>Live</span><span>Verdetto</span></div>`;

    container.innerHTML = header + notable.map(researchRowHtml).join('')
      + (rest.length ? `<button id="venom-research-toggle" class="outline-button" style="margin:10px 4px;">Mostra anche i ${rest.length} candidati senza edge</button><div id="venom-research-rest" class="hidden">${rest.map(researchRowHtml).join('')}</div>` : '');

    const toggle = $('venom-research-toggle');
    if (toggle) toggle.addEventListener('click', () => {
      $('venom-research-rest').classList.toggle('hidden');
      const isHidden = $('venom-research-rest').classList.contains('hidden');
      toggle.textContent = isHidden ? `Mostra anche i ${rest.length} candidati senza edge` : 'Nascondi i candidati senza edge';
    });
  }

  function renderMemory() {
    // Guardia: renderAll() (chiamato da venom.html) include renderMemory() per compatibilita', ma
    // il pannello Memoria vive solo su venom-memory.html — su venom.html questi elementi non
    // esistono piu' e la funzione deve restare un no-op sicuro, non lanciare un errore.
    if (!$('venom-memory-status')) return;
    const trades = Models.demoAccount.trades || [];
    $('venom-memory-status').textContent = `${trades.length} trade`;
    const byTier = Aurora.Engine.getWinRateByTier();
    const order = ['validated', 'exploratory', 'probe', 'forced', 'manuale'];
    const labels = { validated: 'Validato', exploratory: 'Esplorativo', probe: 'Sonda', forced: 'Sonda forzata', manuale: 'Manuale' };
    const tiers = order.filter((tier) => byTier[tier]);
    $('venom-memory-tier-stats').innerHTML = tiers.length
      ? tiers.map((tier) => {
          const { count, wins, winRate } = byTier[tier];
          const tone = winRate >= 50 ? 'positive' : 'negative';
          return `<div class="memory-tier-stat"><span>${labels[tier]}</span><strong class="${tone}">${winRate.toFixed(0)}%</strong><small>${wins}/${count} vinti</small></div>`;
        }).join('')
      : '<div class="memory-empty">Nessun trade chiuso ancora.</div>';

    const lessonsByStrategy = Models.researchData.lessons || {};
    const allLessons = [];
    Object.values(lessonsByStrategy).forEach((list) => list.forEach((lesson) => allLessons.push(lesson)));
    allLessons.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    $('venom-memory-lessons-count').textContent = `${allLessons.filter((l) => l.active).length} attive · ${allLessons.length} totali`;
    $('venom-memory-lessons').innerHTML = allLessons.length
      ? allLessons.map((lesson) => `
        <div class="memory-lesson-card ${lesson.active ? '' : 'superseded'}">
          <div class="memory-lesson-head"><strong>${lesson.strategyKey} · v${lesson.version}</strong><span class="status-pill ${lesson.active ? 'ok' : 'idle'}">${lesson.active ? 'attiva' : 'superata'}</span></div>
          <p>${lesson.statement}</p>
          <div class="memory-lesson-foot"><span>${lesson.supportingTradeIds.length} trade collegati</span></div>
        </div>`).join('')
      : '<div class="memory-empty">Nessuna lezione ancora generata dal Learning Loop.</div>';
  }

  function renderAll() {
    renderWalletStats();
    renderClubGrid();
    renderPositions();
    renderActivity();
    renderResearch();
    renderMemory();
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
    bootstrap, renderAll, renderWalletStats, renderClubGrid, renderPositions, renderActivity, renderResearch, renderMemory
  };
})();
