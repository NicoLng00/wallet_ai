// Storico & Learning Loop — estratto da views.js perche' ora e' condiviso da memory.html (SpiderMan)
// e venom-memory.html (Venom): stessa funzione, stessa classificazione delle righe (conto/livello/
// esito/origine), cosi' lo storico di Venom e' "catalogato come in SpiderMan" per costruzione, non
// per convenzione duplicata in due file diversi. Richiede Aurora.Models.demoAccount/researchData/
// instruments e Aurora.Engine.getWinRateByTier/getActiveLessons/deactivateLesson gia' caricati, piu'
// Aurora.Views.Pagination (pagination.js) e Aurora.Views.showToast (views.js).
window.Aurora = window.Aurora || {};
Aurora.Views = Aurora.Views || {};

const MEMORY_TIER_LABELS = { validated: 'Validato', exploratory: 'Esplorativo', probe: 'Sonda', forced: 'Sonda forzata' };
const MEMORY_ACCOUNT_LABELS = { demo: 'Demo', live: 'Reale', backtest: 'Backtest' };
const MEMORY_HISTORY_PAGE_KEY = 'memory-history';

// I casi "seed"/backtest (tradeId con prefisso SEED-) sono un backtest reale eseguito in fase di
// sviluppo o dal job di setup giornaliero, mai un trade del conto dell'utente: li rendiamo come righe
// a parte (accountMode 'backtest', P&L in percentuale di rendimento invece che in euro, perche' non
// hanno una size/notional reale associata) cosi' lo Storico non parte vuoto alla prima apertura ma
// resta sempre visivamente distinto dal conto demo reale.
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

  const { pageItems, page, totalPages } = Aurora.Views.Pagination.slice(MEMORY_HISTORY_PAGE_KEY, filtered);

  container.innerHTML = pageItems.length
    ? pageItems.map((row) => {
        const time = new Date(row.at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const tierLabel = row.tier ? (MEMORY_TIER_LABELS[row.tier] || row.tier) : null;
        const isBacktest = row.kind === 'backtest';
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
      }).join('') + Aurora.Views.Pagination.controlsHtml(MEMORY_HISTORY_PAGE_KEY, page, totalPages)
    : '<div class="empty-state">Nessuna riga corrisponde ai filtri selezionati.</div>';

  Aurora.Views.Pagination.wire(container, MEMORY_HISTORY_PAGE_KEY, Aurora.Views.renderMemoryHistory);
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
