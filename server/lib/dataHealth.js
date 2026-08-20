// Puro: nessuna chiamata di rete — trasforma un "buco" silenzioso (uno storico che smette di
// aggiornarsi perche' una fonte fallisce ripetutamente, ma il sistema continua a servire l'ultima
// copia buona senza dirlo a nessuno) in un avviso visibile. Non riempie il buco — lo rende noto.
// Soglia di default 26h, non 24h: il job gira una volta al giorno, un margine oltre le 24h evita
// falsi allarmi per normale variazione dell'orario di esecuzione di GitHub Actions (cron
// schedulato, non garantito al minuto — vedi audit architetturale).
export const DEFAULT_STALE_HOURS = 26;

export function findStaleEntries(historyCache, nowMs = Date.now(), maxAgeHours = DEFAULT_STALE_HOURS) {
  const stale = [];
  Object.entries(historyCache || {}).forEach(([symbol, timeframes]) => {
    Object.entries(timeframes || {}).forEach(([timeframe, entry]) => {
      if (!entry?.fetchedAt) { stale.push({ symbol, timeframe, ageHours: null, reason: 'mai aggiornato' }); return; }
      const ageHours = (nowMs - new Date(entry.fetchedAt).getTime()) / 3600000;
      if (ageHours > maxAgeHours) stale.push({ symbol, timeframe, ageHours: Math.round(ageHours * 10) / 10, reason: 'oltre soglia' });
    });
  });
  return stale;
}
