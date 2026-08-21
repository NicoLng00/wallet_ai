// Bootstrap dedicato a memory.html — pagina separata per non far scorrere lo Storico &amp;
// Learning Loop (potenzialmente centinaia di righe) dentro l'unica pagina lunga del sistema
// principale (index.html). Motore identico a index.html (stesso Aurora.Models/Engine, stessa
// hydrateFromSharedState) ma bootstrap ridotto: solo cio' che questa pagina mostra davvero, mai
// Aurora.Controllers.wireEvents() per intero (chiamerebbe $('id').addEventListener su elementi che
// qui non esistono, es. run-analysis/buy-button, e romperebbe a meta' funzione).
(function () {
  const { $ } = Aurora.Utils;
  const Views = Aurora.Views;
  const Services = Aurora.Services;
  const Models = Aurora.Models;

  Views.renderMemoryPage();
  ['memory-filter-account', 'memory-filter-symbol', 'memory-filter-tier', 'memory-filter-outcome'].forEach((id) => {
    $(id).addEventListener('change', () => { Views.Pagination.reset('memory-history'); Views.renderMemoryHistory(); });
  });

  function setStatus(hydrated) {
    const badge = $('memory-page-badge');
    const updated = $('memory-page-updated');
    if (hydrated) {
      badge.textContent = 'Bot autonomo attivo';
      badge.className = 'status-pill ok';
      updated.textContent = `Stato del bot autonomo — aggiornato ${new Date().toLocaleString('it-IT', { hour12: false })} (rilettura ogni ~60s).`;
    } else {
      badge.textContent = 'Conto locale';
      badge.className = 'status-pill idle';
      updated.textContent = 'Nessuno stato condiviso trovato (sviluppo locale o file://): mostra il conto demo simulato in questo browser.';
    }
  }

  Services.hydrateFromSharedState().then((hydrated) => {
    Models.sharedStateMode = hydrated;
    setStatus(hydrated);
    if (hydrated) {
      Views.renderMemoryPage();
      Views.showToast('Stato caricato dal bot autonomo (aggiornato ogni ~15 minuti).', 'success');
    }
  });

  window.setInterval(() => {
    if (!Models.sharedStateMode) return;
    Services.hydrateFromSharedState().then((hydrated) => {
      if (hydrated) { setStatus(true); Views.renderMemoryPage(); }
    });
  }, 60000);
})();
