// Rendering DOM puro — nessuna logica di stato qui, solo lettura di Aurora.Models e scrittura nel DOM.
window.Aurora = window.Aurora || {};
Aurora.Views = Aurora.Views || {};

Aurora.Views.renderWatchlist = function renderWatchlist() {
  const { $, formatMoney } = Aurora.Utils;
  const { instruments, activeSymbol } = Aurora.Models;
  $('watchlist').innerHTML = Object.entries(instruments).map(([symbol, data]) => {
    const change = Aurora.Engine.symbolChange(symbol);
    return `<button class="watch-item ${symbol === activeSymbol ? 'active' : ''}" data-symbol="${symbol}">
      <span class="watch-icon" style="background:${data.color}">${Aurora.Engine.initials(symbol)}</span>
      <span><b class="watch-symbol">${symbol}</b><small class="watch-name">${data.name.replace(' Inc.', '')}</small></span>
      <span class="watch-quote">${formatMoney(Aurora.Engine.getDemoPrice(symbol))}<em class="watch-change ${change < 0 ? 'negative' : ''}">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</em></span>
    </button>`;
  }).join('');
  document.querySelectorAll('.watch-item').forEach((button) => button.addEventListener('click', () => Aurora.Controllers.selectSymbol(button.dataset.symbol)));
};

Aurora.Views.renderTradingViewWidget = function renderTradingViewWidget() {
  const { $ } = Aurora.Utils;
  const instrument = Aurora.Models.instruments[Aurora.Models.activeSymbol];
  const target = $('tradingview-chart');
  const wrapper = document.createElement('div');
  wrapper.className = 'tradingview-widget-container';
  const slot = document.createElement('div');
  slot.className = 'tradingview-widget-container__widget';
  const attribution = document.createElement('div');
  attribution.className = 'tradingview-widget-copyright';
  attribution.innerHTML = `<a href="https://www.tradingview.com/symbols/${instrument.tv.replace(':', '-')}/" rel="noopener nofollow" target="_blank">${instrument.tv} chart</a> by TradingView`;
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
  script.async = true;
  script.textContent = JSON.stringify({
    autosize: true,
    symbol: instrument.tv,
    interval: Aurora.Engine.widgetInterval(),
    timezone: 'Europe/Rome',
    theme: 'dark',
    style: '1',
    locale: 'it',
    allow_symbol_change: true,
    calendar: false,
    details: true,
    hotlist: false,
    hide_side_toolbar: false,
    hide_top_toolbar: false,
    hide_legend: false,
    hide_volume: false,
    save_image: false,
    withdateranges: true,
    backgroundColor: '#0d1b2d',
    gridColor: 'rgba(126, 157, 189, 0.12)',
    support_host: 'https://www.tradingview.com'
  });
  script.addEventListener('load', () => { $('chart-live-status').textContent = 'Widget connesso'; });
  script.addEventListener('error', () => { $('chart-live-status').textContent = 'Widget non disponibile — verifica la connessione'; });
  wrapper.append(slot, attribution, script);
  target.replaceChildren(wrapper);
  $('chart-live-status').textContent = 'Connessione al grafico…';
  $('chart-symbol-label').textContent = instrument.tv;
  Aurora.Views.renderChartLevelsOverlay();
};

Aurora.Views.renderChartLevelsOverlay = function renderChartLevelsOverlay() {
  const { $, formatMoney, clamp } = Aurora.Utils;
  const overlay = $('chart-levels-overlay');
  const position = Aurora.Models.demoAccount.positions[Aurora.Models.activeSymbol];
  if (!position || (!position.stopLoss && !position.takeProfit)) { overlay.innerHTML = ''; return; }
  const entry = position.averagePrice;
  const { stopLoss, takeProfit } = position;
  const levels = [entry, stopLoss, takeProfit].filter((value) => value !== null && value !== undefined);
  const spread = (Math.max(...levels) - Math.min(...levels)) || entry * 0.02;
  const margin = spread * 0.35;
  const rangeTop = Math.max(...levels) + margin;
  const rangeBottom = Math.min(...levels) - margin;
  const toPercent = (value) => clamp(((rangeTop - value) / (rangeTop - rangeBottom)) * 100, 4, 96);

  const lines = [{ type: 'entry', label: `Entry ${formatMoney(entry)}`, value: entry }];
  if (stopLoss) lines.push({ type: 'sl', label: `SL ${formatMoney(stopLoss)}`, value: stopLoss });
  if (takeProfit) lines.push({ type: 'tp', label: `TP ${formatMoney(takeProfit)}`, value: takeProfit });

  overlay.innerHTML = lines
    .map((line) => `<div class="chart-level-line ${line.type}" style="top:${toPercent(line.value).toFixed(2)}%"><span class="chart-level-label">${line.label}</span></div>`)
    .join('') + '<div class="chart-levels-note">TP/SL indicativi — non allineati alla scala nativa del widget</div>';
};

Aurora.Views.updateQuoteUI = function updateQuoteUI() {
  const { $, formatMoney } = Aurora.Utils;
  const { activeSymbol, instruments } = Aurora.Models;
  const data = instruments[activeSymbol];
  const price = Aurora.Engine.getDemoPrice(activeSymbol);
  const change = Aurora.Engine.symbolChange(activeSymbol);
  $('symbol-name').childNodes[0].nodeValue = `${data.name} `;
  $('symbol-ticker').textContent = activeSymbol;
  $('symbol-exchange').textContent = `${data.exchange} · modello demo`;
  $('symbol-logo').textContent = Aurora.Engine.initials(activeSymbol);
  $('symbol-logo').style.background = data.color;
  $('quote-price').textContent = formatMoney(price);
  $('quote-change').textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}% simulato`;
  $('quote-change').className = change >= 0 ? 'positive' : 'negative';
  $('quote-time').textContent = 'Feed simulato · grafico separato';
};

Aurora.Views.renderSymbol = function renderSymbol() {
  Aurora.Views.updateQuoteUI();
  Aurora.Views.renderWatchlist();
  Aurora.Views.renderTradingViewWidget();
  Aurora.Views.updateOrderEstimate();
};

Aurora.Views.renderAgents = function renderAgents(status = 'idle') {
  const { $ } = Aurora.Utils;
  $('agent-list').innerHTML = Aurora.Models.deskAgents.map(([icon, name, detail]) => `<div class="agent-row"><span class="agent-orb">${icon}</span><div class="agent-detail"><strong>${name}</strong><span>${detail}</span></div><span class="agent-state ${status === 'done' ? 'done' : status === 'running' ? 'running' : ''}">${status === 'done' ? 'pronto' : status === 'running' ? 'analizza' : 'in attesa'}</span></div>`).join('');
  $('agent-progress').textContent = status === 'done' ? '7 / 7' : status === 'running' ? '4 / 7' : '0 / 7';
};

Aurora.Views.showAnalysis = function showAnalysis(signal, autonomous = false) {
  const { $ } = Aurora.Utils;
  Aurora.Models.analysisReady = true;
  $('desk-status').className = 'status-pill ok';
  $('desk-status').textContent = autonomous ? 'Autopilot' : 'Completato';
  $('signal-score').textContent = signal.score;
  $('signal-score').className = `signal-score ${signal.bullish ? 'buy' : signal.defensive ? 'sell' : 'neutral'}`;
  $('signal-title').textContent = signal.bullish ? 'Bias long controllato' : signal.defensive ? 'Setup difensivo' : 'Nessun vantaggio netto';
  $('signal-copy').textContent = signal.rationale
    ? `AI (Gemini, non backtestato): ${signal.rationale}`
    : signal.bullish ? 'Momentum simulato positivo; il gate decide il sizing.' : signal.defensive ? 'Volatilità simulata avversa; nessuna nuova esposizione.' : 'Il desk monitora senza inviare ordini.';
  $('confidence-value').textContent = `${signal.confidence}%`;
  $('confidence-bar').style.width = `${signal.confidence}%`;
  Aurora.Views.renderAgents('done');
  Aurora.Views.updateOrderEstimate();
};

Aurora.Views.resetDesk = function resetDesk() {
  const { $ } = Aurora.Utils;
  $('desk-status').className = 'status-pill idle';
  $('desk-status').textContent = 'In attesa';
  $('signal-score').textContent = '—';
  $('signal-score').className = 'signal-score neutral';
  $('signal-title').textContent = 'Analisi non eseguita';
  $('signal-copy').textContent = 'Avvia il desk per una tesi simulata.';
  $('confidence-value').textContent = '—';
  $('confidence-bar').style.width = '0%';
  $('risk-status').className = 'status-pill idle';
  $('risk-status').textContent = 'In attesa';
  $('risk-verdict').className = 'risk-verdict neutral';
  $('risk-verdict').innerHTML = '<span>◇</span><p><strong>Gate chiuso</strong> — esegui l’analisi per valutare l’ordine.</p>';
  $('submit-order').disabled = true;
  $('order-risk-summary').textContent = 'In attesa del Risk Manager';
  Aurora.Views.renderAgents();
};

Aurora.Views.updateOrderEstimate = function updateOrderEstimate() {
  const { $, formatMoney } = Aurora.Utils;
  const risk = Aurora.Engine.orderRisk();
  const SIMULATION = Aurora.Models.SIMULATION;
  $('order-value').textContent = formatMoney(risk.notional);
  $('order-limit').innerHTML = `${formatMoney(risk.notional)} <small>/ ${formatMoney(risk.maximumOrder)}</small>`;
  $('exposure-value').innerHTML = `${risk.metrics.exposure.toFixed(1)}% <small>/ ${SIMULATION.maximumPositionPercent}%</small>`;
  $('drawdown-value').innerHTML = `${risk.metrics.drawdown.toFixed(1)}% <small>/ ${SIMULATION.maximumDrawdownPercent}%</small>`;
  $('order-meter').style.width = `${Math.min(100, risk.maximumOrder ? risk.notional / risk.maximumOrder * 100 : 100)}%`;
  $('exposure-meter').style.width = `${Math.min(100, risk.metrics.exposure / SIMULATION.maximumPositionPercent * 100)}%`;
  $('drawdown-meter').style.width = `${Math.min(100, risk.metrics.drawdown / SIMULATION.maximumDrawdownPercent * 100)}%`;
  $('order-meter').style.background = risk.notional > risk.maximumOrder ? 'var(--red)' : 'var(--green)';
  $('exposure-meter').style.background = risk.metrics.exposure > SIMULATION.maximumPositionPercent ? 'var(--red)' : 'var(--green)';
  $('submit-order').disabled = !risk.allowed;
  $('order-risk-summary').textContent = risk.reason;
  if (Aurora.Models.analysisReady) {
    $('risk-status').className = `status-pill ${risk.allowed ? 'ok' : 'blocked'}`;
    $('risk-status').textContent = risk.allowed ? 'Approvato' : 'Bloccato';
    $('risk-verdict').className = `risk-verdict ${risk.allowed ? 'ok' : 'blocked'}`;
    $('risk-verdict').innerHTML = `<span>${risk.allowed ? '✓' : '!'}</span><p><strong>${risk.allowed ? 'Approvato' : 'Ordine bloccato'}</strong> — ${risk.reason}.</p>`;
  }
};

Aurora.Views.renderDemoAccount = function renderDemoAccount() {
  const { $, formatMoney } = Aurora.Utils;
  const { demoAccount, SIMULATION } = Aurora.Models;
  const metrics = Aurora.Engine.getMetrics();
  const change = metrics.equity - SIMULATION.accountSeed;
  const positions = Object.entries(demoAccount.positions);
  $('demo-equity').textContent = formatMoney(metrics.equity);
  $('demo-equity-change').textContent = `${change >= 0 ? '+' : ''}${formatMoney(change)} simulato`;
  $('demo-equity-change').className = change >= 0 ? 'positive' : 'negative';
  $('demo-cash').textContent = formatMoney(demoAccount.cash);
  $('demo-exposure').textContent = `${metrics.exposure.toFixed(1)}%`;
  $('demo-allocation').style.width = `${Math.min(100, metrics.exposure)}%`;
  $('model-calibration').textContent = `${demoAccount.model.calibration}%`;
  $('model-observations').textContent = `${demoAccount.model.outcomes} esiti`;
  $('positions-summary').textContent = `${positions.length} posizion${positions.length === 1 ? 'e' : 'i'} aperte`;
  $('position-count').textContent = positions.length;
  Aurora.Models.persistDemoAccount();
};

Aurora.Views.renderWalletOverview = function renderWalletOverview() {
  const { $, formatMoney } = Aurora.Utils;
  const { demoAccount } = Aurora.Models;
  const stats = Aurora.Engine.computeWalletStats();
  const signed = (value) => `${value >= 0 ? '+' : ''}${formatMoney(value)}`;
  const tone = (value) => (value >= 0 ? 'positive' : 'negative');
  const tiles = [
    ['Equity totale', formatMoney(stats.metrics.equity), ''],
    ['Cash disponibile', formatMoney(demoAccount.cash), ''],
    ['Valore posizioni', formatMoney(stats.metrics.positionValue), ''],
    ['P&L totale', signed(stats.totalPnl), tone(stats.totalPnl)],
    ['P&L realizzato', signed(stats.realizedPnl), tone(stats.realizedPnl)],
    ['P&L non realizzato', signed(stats.unrealizedPnl), tone(stats.unrealizedPnl)],
    ['Win rate', `${stats.winRate.toFixed(0)}%`, ''],
    ['Trade totali', `${demoAccount.trades.length}`, ''],
    ['Drawdown attuale', `${stats.metrics.drawdown.toFixed(1)}%`, ''],
    ['Calibrazione modello', `${demoAccount.model.calibration}%`, ''],
    ['Miglior trade', stats.best ? `${stats.best.symbol} ${signed(stats.best.realizedPnl)}` : '—', stats.best ? tone(stats.best.realizedPnl) : ''],
    ['Peggior trade', stats.worst ? `${stats.worst.symbol} ${signed(stats.worst.realizedPnl)}` : '—', stats.worst ? tone(stats.worst.realizedPnl) : '']
  ];
  $('wallet-stats').innerHTML = tiles.map(([label, value, cls]) => `<div class="wallet-stat"><span>${label}</span><strong class="${cls}">${value}</strong></div>`).join('');

  const trades = demoAccount.trades;
  $('history-count').textContent = `${trades.length} ordin${trades.length === 1 ? 'e' : 'i'}`;
  $('order-history').innerHTML = trades.length
    ? trades.map((trade) => {
        const time = new Date(trade.at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const pnlText = trade.side === 'sell' ? signed(trade.realizedPnl) : '—';
        const pnlClass = trade.side === 'sell' ? tone(trade.realizedPnl) : '';
        return `<div class="history-row">
          <span>${time}</span>
          <span>${trade.symbol}</span>
          <span><span class="history-side ${trade.side}">${trade.side === 'buy' ? 'Buy' : 'Sell'}</span></span>
          <span>${trade.quantity.toFixed(6)}</span>
          <span>${formatMoney(trade.price)}</span>
          <span>${formatMoney(trade.notional)}</span>
          <span class="${pnlClass}">${pnlText}</span>
          <span><span class="history-origin">${trade.origin}</span></span>
        </div>`;
      }).join('')
    : '<div class="empty-state">Nessun ordine ancora. Esegui un ordine manuale o avvia l’Autopilot.</div>';
};

Aurora.Views.renderActivity = function renderActivity() {
  const { $, formatMoney } = Aurora.Utils;
  const { activity, demoAccount, selectedTab, SIMULATION } = Aurora.Models;
  const target = $('activity-content');
  $('audit-count').textContent = activity.length + demoAccount.trades.length;
  if (selectedTab === 'activity') {
    target.innerHTML = activity.length
      ? activity.slice(0, 4).map((entry, index) => `<div class="audit-row"><span class="audit-time">${index === 0 ? 'ORA' : `${index + 1} min fa`}</span><span class="audit-main"><strong>${entry.title}</strong><span>${entry.detail}</span></span><span class="audit-tag">${entry.tag}</span></div>`).join('')
      : '<div class="empty-state">Nessun evento ancora. Avvia l’AI Autopilot per il primo ciclo demo.</div>';
  } else if (selectedTab === 'positions') {
    const rows = Object.entries(demoAccount.positions);
    target.innerHTML = rows.length ? rows.map(([symbol, position]) => {
      const price = Aurora.Engine.getDemoPrice(symbol);
      const value = position.quantity * price;
      const pnl = (price - position.averagePrice) / position.averagePrice * 100;
      return `<div class="position-row"><span><b>${symbol}</b><small>${position.quantity.toFixed(6)} quote · demo</small></span><span>${formatMoney(value)}</span><span>${formatMoney(position.averagePrice)}</span><span class="${pnl >= 0 ? 'positive' : 'negative'}">${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%</span></div>`;
    }).join('') : `<div class="empty-state">Nessuna posizione nel conto demo da ${formatMoney(SIMULATION.accountSeed)}.</div>`;
  } else {
    target.innerHTML = '<div class="research-note"><strong>Come si adatta il modello.</strong> L’autopilot registra esclusivamente gli esiti del sandbox in questo browser e modifica una piccola calibrazione di confidenza. Non addestra un modello fondazionale, non accede al conto reale e non usa i prezzi dell’iframe TradingView come feed esecutivo. Per il live serviranno un data provider autorizzato, backtest e un backend con policy riproducibili.</div>';
  }
};

Aurora.Views.renderResearchResults = function renderResearchResults() {
  const { $ } = Aurora.Utils;
  const container = $('research-results');
  if (!container) return;
  const validated = Aurora.Models.researchData.validated;
  const rows = [];
  Object.entries(validated).forEach(([symbol, entry]) => {
    Object.entries(entry.candidates || {}).forEach(([candidateKey, result]) => rows.push({ symbol, candidateKey, result }));
  });
  if (!rows.length) {
    container.innerHTML = '<div class="empty-state">Nessun backtest eseguito ancora.</div>';
    return;
  }
  container.innerHTML = `<div class="research-row research-head"><span>Simbolo</span><span>Strategia</span><span>Trade</span><span>Win rate (in/out)</span><span>vs random (out)</span><span>Rend. medio (out)</span><span>Live</span><span>Verdetto</span></div>`
    + rows.map(({ symbol, candidateKey, result }) => {
      const winRateLabel = `${result.inSample.winRate.toFixed(1)}% / ${result.outOfSample.winRate.toFixed(1)}%`;
      const baselineLabel = `${result.outOfSampleBaseline.winRate.toFixed(1)}%`;
      const avgReturnValue = result.outOfSample.avgReturn;
      const live = Aurora.Engine.getStrategyTrackRecordSummary(symbol, candidateKey);
      const liveLabel = live ? `${live.sampleTrades} trade · ${live.winRate.toFixed(0)}%` : '—';
      const verdict = result.validated ? 'Validato' : result.exploratory ? 'Esplorativo' : 'Nessun edge';
      const verdictClass = result.validated ? 'ok' : result.exploratory ? 'running' : 'blocked';
      const lessons = Aurora.Engine.getActiveLessons(candidateKey);
      // Giorni consecutivi validato (server/jobs/dailySetup.js appendValidationHistory): distingue
      // un edge persistente da uno che e' un artefatto statistico di un solo giorno — senza questo
      // ogni run del setup giornaliero mostra solo lo snapshot di oggi, senza storia.
      const streakDays = result.validatedStreakDays;
      const streakLabel = result.validated && streakDays > 1 ? ` <small>· ${streakDays}g consecutivi</small>` : '';
      return `
      <div class="research-row">
        <span>${symbol}</span>
        <span>${result.label} · ${result.timeframe}</span>
        <span>${result.count}</span>
        <span>${winRateLabel}</span>
        <span>${baselineLabel}</span>
        <span class="${avgReturnValue >= 0 ? 'positive' : 'negative'}">${avgReturnValue >= 0 ? '+' : ''}${avgReturnValue.toFixed(2)}%</span>
        <span>${liveLabel}</span>
        <span><span class="status-pill ${verdictClass}">${verdict}</span>${streakLabel}${lessons.length ? ` <small>${lessons.length} lezione/i</small>` : ''}</span>
      </div>`;
    }).join('')
    + renderLessonsPanel(rows);
};

// Learning Loop — Memory: mostra le lezioni attive (versionate, tracciabili fino ai trade che
// le hanno generate) estratte dai trade realmente chiusi, per ogni candidato.
function renderLessonsPanel(rows) {
  const entries = [];
  rows.forEach(({ candidateKey }) => {
    Aurora.Engine.getActiveLessons(candidateKey).forEach((lesson) => entries.push(lesson));
  });
  if (!entries.length) return '';
  return `<div class="research-lessons"><strong>Lezioni attive (Learning Loop)</strong>`
    + entries.map((lesson) => `<div class="research-lesson"><span class="status-pill idle">v${lesson.version}</span> ${lesson.statement} <small>(${lesson.supportingTradeIds.length} trade collegati)</small></div>`).join('')
    + `</div>`;
}

const MEMORY_TIER_LABELS = { validated: 'Validato', exploratory: 'Esplorativo', probe: 'Sonda', forced: 'Sonda forzata' };

// Storico & Memoria: unica vista che espone lo storico trade (filtrabile per conto/simbolo/
// livello/esito) e le lezioni del Learning Loop, cosi' l'utente puo' controllarle senza leggere
// localStorage a mano.
Aurora.Views.renderMemoryPage = function renderMemoryPage() {
  const { $ } = Aurora.Utils;
  const symbolSelect = $('memory-filter-symbol');
  if (symbolSelect && symbolSelect.options.length <= 1) {
    const symbols = Object.keys(Aurora.Models.instruments);
    symbolSelect.innerHTML = '<option value="all">Tutti i simboli</option>' + symbols.map((symbol) => `<option value="${symbol}">${symbol}</option>`).join('');
  }
  Aurora.Views.renderMemoryHistory();
  Aurora.Views.renderMemoryLessons();
};

const MEMORY_ACCOUNT_LABELS = { demo: 'Demo', live: 'Reale', backtest: 'Backtest' };

// I casi "seed" (src/models/seedData.js, tradeId con prefisso SEED-) sono un backtest reale
// eseguito in fase di sviluppo, mai un trade del conto dell'utente: li rendiamo come righe a
// parte (accountMode 'backtest', P&L in percentuale di rendimento invece che in euro, perche' non
// hanno una size/notional reale associata) cosi' lo Storico non parte vuoto alla prima apertura
// ma resta sempre visivamente distinto dal conto demo reale dell'utente.
function collectBacktestCaseRows() {
  const tradeEpisodes = Aurora.Models.researchData.tradeEpisodes || {};
  const rows = [];
  Object.entries(tradeEpisodes).forEach(([strategyKey, episodes]) => {
    (episodes || []).forEach((episode) => {
      if (!episode.tradeId?.startsWith('SEED-')) return;
      rows.push({
        kind: 'backtest', at: episode.at, symbol: episode.symbol, accountMode: 'backtest',
        tier: episode.snapshot?.tier || null, strategyKey, returnPct: episode.returnPct,
        origin: 'Backtest (caso storico)'
      });
    });
  });
  return rows;
}

// Win rate segmentata per livello (Aurora.Engine.getWinRateByTier): la percentuale aggregata
// mescola trade sonda/forzati (senza edge misurato per design) con validati/esplorativi (dove un
// edge reale, se c'e', si vede) — mostrarle separate rende visibile quale parte del sistema sta
// davvero funzionando, invece di nascondersi dentro una media.
Aurora.Views.renderMemoryTierStats = function renderMemoryTierStats() {
  const { $ } = Aurora.Utils;
  const container = $('memory-tier-stats');
  if (!container) return;
  const byTier = Aurora.Engine.getWinRateByTier();
  const order = ['validated', 'exploratory', 'probe', 'forced', 'manuale'];
  const tiers = order.filter((tier) => byTier[tier]);
  container.innerHTML = tiers.length
    ? tiers.map((tier) => {
        const { count, wins, winRate } = byTier[tier];
        const label = MEMORY_TIER_LABELS[tier] || (tier === 'manuale' ? 'Manuale' : tier);
        const tone = winRate >= 50 ? 'positive' : 'negative';
        return `<div class="memory-tier-stat"><span>${label}</span><strong class="${tone}">${winRate.toFixed(0)}%</strong><small>${wins}/${count} vinti</small></div>`;
      }).join('')
    : '<div class="memory-empty">Nessun trade chiuso ancora.</div>';
};

Aurora.Views.renderMemoryHistory = function renderMemoryHistory() {
  const { $, formatMoney } = Aurora.Utils;
  const container = $('memory-history');
  if (!container) return;
  Aurora.Views.renderMemoryTierStats();
  const liveRows = Aurora.Models.demoAccount.trades.map((trade) => ({ kind: 'live', ...trade }));
  const backtestRows = collectBacktestCaseRows();
  const allRows = [...liveRows, ...backtestRows].sort((a, b) => new Date(b.at) - new Date(a.at));

  const accountFilter = $('memory-filter-account')?.value || 'all';
  const symbolFilter = $('memory-filter-symbol')?.value || 'all';
  const tierFilter = $('memory-filter-tier')?.value || 'all';
  const outcomeFilter = $('memory-filter-outcome')?.value || 'all';

  const filtered = allRows.filter((row) => {
    if (accountFilter !== 'all' && row.accountMode !== accountFilter) return false;
    if (symbolFilter !== 'all' && row.symbol !== symbolFilter) return false;
    if (tierFilter !== 'all' && row.tier !== tierFilter) return false;
    if (outcomeFilter !== 'all') {
      const win = row.kind === 'backtest' ? row.returnPct > 0 : row.side === 'sell' ? row.realizedPnl > 0 : null;
      if (win === null) return false;
      if (outcomeFilter === 'win' && !win) return false;
      if (outcomeFilter === 'loss' && win) return false;
    }
    return true;
  });

  $('memory-status').textContent = `${liveRows.length} trade demo · ${backtestRows.length} casi storici`;
  $('memory-count').textContent = `${filtered.length} righe`;

  container.innerHTML = filtered.length
    ? filtered.map((row) => {
        const time = new Date(row.at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const tierLabel = row.tier ? (MEMORY_TIER_LABELS[row.tier] || row.tier) : null;
        const isBacktest = row.kind === 'backtest';
        const isSell = isBacktest || row.side === 'sell';
        const win = isBacktest ? row.returnPct > 0 : (row.side === 'sell' ? row.realizedPnl > 0 : null);
        const pnlText = isBacktest
          ? `${row.returnPct >= 0 ? '+' : ''}${row.returnPct.toFixed(2)}%`
          : (row.side === 'sell' ? `${row.realizedPnl >= 0 ? '+' : ''}${formatMoney(row.realizedPnl)}` : '—');
        const pnlClass = win === null ? '' : (win ? 'positive' : 'negative');
        const outcomeLabel = win === null ? null : (win ? 'Vinto' : 'Perso');
        const outcomeClass = win === null ? null : (win ? 'outcome-win' : 'outcome-loss');
        const sideLabel = isBacktest ? 'Backtest' : (row.side === 'buy' ? 'Buy' : 'Sell');
        return `<div class="memory-row">
          <span>${time}</span>
          <span><span class="memory-tag account-${row.accountMode}">${MEMORY_ACCOUNT_LABELS[row.accountMode] || row.accountMode}</span></span>
          <span>${row.symbol}</span>
          <span><span class="history-side ${isBacktest ? '' : row.side}">${sideLabel}</span></span>
          <span>${tierLabel ? `<span class="memory-tag tier-${row.tier}">${tierLabel}</span>` : '—'}</span>
          <span>${row.strategyKey || '—'}</span>
          <span class="${pnlClass}">${pnlText}</span>
          <span>${outcomeLabel ? `<span class="memory-tag ${outcomeClass}">${outcomeLabel}</span>` : '—'}</span>
          <span><span class="history-origin">${row.origin}</span></span>
        </div>`;
      }).join('')
    : '<div class="empty-state">Nessuna riga corrisponde ai filtri selezionati.</div>';
};

Aurora.Views.renderMemoryLessons = function renderMemoryLessons() {
  const { $ } = Aurora.Utils;
  const container = $('memory-lessons');
  if (!container) return;
  const lessonsByStrategy = Aurora.Models.researchData.lessons || {};
  const allLessons = [];
  Object.values(lessonsByStrategy).forEach((list) => list.forEach((lesson) => allLessons.push(lesson)));
  allLessons.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  $('memory-lessons-count').textContent = `${allLessons.filter((lesson) => lesson.active).length} attive · ${allLessons.length} totali`;

  container.innerHTML = allLessons.length
    ? allLessons.map((lesson) => {
        const isSeed = (lesson.supportingTradeIds || []).every((id) => id.startsWith('SEED-'));
        return `
      <div class="memory-lesson-card ${lesson.active ? '' : 'superseded'}">
        <div class="memory-lesson-head"><strong>${lesson.strategyKey} · v${lesson.version}</strong><span class="status-pill ${lesson.active ? 'ok' : 'idle'}">${lesson.active ? 'attiva' : 'superata/disattivata'}</span></div>
        ${isSeed ? '<span class="memory-tag account-backtest">Backtest (caso storico)</span>' : ''}
        <p>${lesson.statement}</p>
        <div class="memory-lesson-foot">
          <span>${lesson.supportingTradeIds.length} trade collegati</span>
          <button class="memory-lesson-deactivate" data-strategy="${lesson.strategyKey}" data-lesson="${lesson.id}" ${lesson.active ? '' : 'disabled'}>${lesson.active ? 'Disattiva' : 'Già disattivata'}</button>
        </div>
      </div>`;
      }).join('')
    : '<div class="memory-empty">Nessuna lezione ancora generata dal Learning Loop: servono almeno 3 trade con lo stesso esito, su almeno metà dei trade recenti di una strategia.</div>';

  container.querySelectorAll('.memory-lesson-deactivate').forEach((button) => button.addEventListener('click', () => {
    if (button.disabled) return;
    Aurora.Engine.deactivateLesson(button.dataset.strategy, button.dataset.lesson);
    Aurora.Views.renderMemoryLessons();
    Aurora.Views.showToast('Lezione disattivata (resta nello storico, reversibile).', 'success');
  }));
};

Aurora.Views.renderLiveDataStatus = function renderLiveDataStatus(errorType) {
  const { $ } = Aurora.Utils;
  const { liveData, instruments, liveStatus, usdToEurAvailable } = Aurora.Models;
  const badge = $('live-data-badge');
  const statusEl = $('live-data-status');
  if (!badge || !statusEl) return;
  if (!liveData.enabled) {
    badge.textContent = 'Simulati';
    badge.className = 'status-pill idle';
    statusEl.textContent = 'Modalità simulata attiva.';
    return;
  }
  if (errorType === 'unauthorized') {
    badge.textContent = 'Chiave non valida';
    badge.className = 'status-pill blocked';
    statusEl.textContent = 'Finnhub ha rifiutato la chiave: controllala qui sopra.';
    return;
  }
  if (errorType === 'rate-limit') {
    badge.textContent = 'Rate limit';
    badge.className = 'status-pill blocked';
    statusEl.textContent = 'Limite richieste raggiunto: nuovo tentativo tra 60s.';
    return;
  }
  const symbols = Object.keys(instruments);
  const liveCount = symbols.filter((symbol) => liveStatus[symbol] === 'live').length;
  badge.textContent = `Live ${liveCount}/${symbols.length}`;
  badge.className = liveCount === symbols.length ? 'status-pill ok' : liveCount === 0 ? 'status-pill idle' : 'status-pill running';
  const missing = symbols.filter((symbol) => liveStatus[symbol] !== 'live');
  const base = missing.length
    ? `Fallback simulato per: ${missing.join(', ')}.`
    : 'Tutti i titoli aggiornati con prezzi reali.';
  statusEl.textContent = usdToEurAvailable
    ? base
    : `${base} Cambio USD→EUR non disponibile: uso l'ultimo tasso noto.`;
};

Aurora.Views.showToast = function showToast(message, tone = '') {
  const { $ } = Aurora.Utils;
  const toast = $('toast');
  toast.textContent = message;
  toast.className = `toast ${tone} show`;
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => { toast.className = 'toast'; }, 3200);
};

Aurora.Views.updateClock = function updateClock() {
  Aurora.Utils.$('quote-time').textContent = `Feed demo · ${new Date().toLocaleTimeString('it-IT', { hour12: false })}`;
};
