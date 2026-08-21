// Paginazione generica riusata da ogni tabella che puo' crescere senza limite (Research/Backtest,
// Storico & Memoria — sia per SpiderMan sia per Venom): un'unica implementazione cosi' il
// comportamento (dimensione pagina, etichette, reset sui filtri) resta identico ovunque compaia.
window.Aurora = window.Aurora || {};
Aurora.Views = Aurora.Views || {};

const PAGE_STATE = {};

Aurora.Views.Pagination = {
  DEFAULT_PAGE_SIZE: 20,

  reset(key) {
    delete PAGE_STATE[key];
  },

  slice(key, items, pageSize = Aurora.Views.Pagination.DEFAULT_PAGE_SIZE) {
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    let page = PAGE_STATE[key] || 1;
    page = Math.min(Math.max(1, page), totalPages);
    PAGE_STATE[key] = page;
    const start = (page - 1) * pageSize;
    return { pageItems: items.slice(start, start + pageSize), page, totalPages, total: items.length };
  },

  controlsHtml(key, page, totalPages) {
    if (totalPages <= 1) return '';
    return `<div class="pagination-controls" data-pagination-key="${key}">
      <button type="button" class="pagination-prev outline-button" ${page <= 1 ? 'disabled' : ''} aria-label="Pagina precedente">← Precedente</button>
      <span class="pagination-label">Pagina ${page} di ${totalPages}</span>
      <button type="button" class="pagination-next outline-button" ${page >= totalPages ? 'disabled' : ''} aria-label="Pagina successiva">Successiva →</button>
    </div>`;
  },

  // Da chiamare subito dopo aver scritto controlsHtml() dentro `container.innerHTML`: collega i due
  // pulsanti, muove lo stato di pagina e richiama onChange() (tipicamente il renderer stesso) per
  // ridisegnare con la nuova pagina.
  wire(container, key, onChange) {
    const controls = container.querySelector(`[data-pagination-key="${key}"]`);
    if (!controls) return;
    const prev = controls.querySelector('.pagination-prev');
    const next = controls.querySelector('.pagination-next');
    if (prev) prev.addEventListener('click', () => { PAGE_STATE[key] = Math.max(1, (PAGE_STATE[key] || 1) - 1); onChange(); });
    if (next) next.addEventListener('click', () => { PAGE_STATE[key] = (PAGE_STATE[key] || 1) + 1; onChange(); });
  }
};
