// Puro: nessuna chiamata di rete o al filesystem — sposta i trade/episodi PIU' VECCHI di quelli
// che le funzioni live guardano davvero in un archivio separato, cosi' data/research.json
// smette di crescere senza limite (Fase 2 della roadmap di ottimizzazione).
//
// Margine di sicurezza sopra le soglie minime REALMENTE lette dal motore (mai a ridosso, per non
// rischiare di intaccare comportamento vivo per un arrotondamento):
//   - survivesLiveTrackRecord (src/engine/rules.js) legge le ultime 15 (LIVE_TRACK_RECORD_WINDOW)
//   - il Learning Loop (src/engine/memory.js) legge gli ultimi 8 (RECENT_WINDOW)
// Qui si tiene rispettivamente 20 e 15 — un margine esplicito, non i minimi esatti.
export const KEEP_TRACK_RECORD_TRADES = 20;
export const KEEP_EPISODES = 15;

// archive: { trackRecord: {[symbol]: {[candidateKey]: [...trade]}}, tradeEpisodes: {[candidateKey]: [...episode]} }
// Muta l'oggetto archive passato (append), ritorna il trackRecord/tradeEpisodes ACCORCIATI da
// scrivere al posto degli originali — mai muta gli originali.
export function archiveTrackRecord(trackRecord, archive) {
  const next = {};
  let archivedCount = 0;
  Object.entries(trackRecord || {}).forEach(([symbol, byStrategy]) => {
    next[symbol] = {};
    Object.entries(byStrategy || {}).forEach(([key, data]) => {
      const trades = data?.trades || [];
      if (trades.length > KEEP_TRACK_RECORD_TRADES) {
        const toArchive = trades.slice(0, trades.length - KEEP_TRACK_RECORD_TRADES);
        archive.trackRecord[symbol] = archive.trackRecord[symbol] || {};
        archive.trackRecord[symbol][key] = [...(archive.trackRecord[symbol][key] || []), ...toArchive];
        archivedCount += toArchive.length;
        next[symbol][key] = { trades: trades.slice(-KEEP_TRACK_RECORD_TRADES) };
      } else {
        next[symbol][key] = data;
      }
    });
  });
  return { trackRecord: next, archivedCount };
}

export function archiveEpisodes(tradeEpisodes, archive) {
  const next = {};
  let archivedCount = 0;
  Object.entries(tradeEpisodes || {}).forEach(([key, episodes]) => {
    const list = episodes || [];
    if (list.length > KEEP_EPISODES) {
      const toArchive = list.slice(0, list.length - KEEP_EPISODES);
      archive.tradeEpisodes[key] = [...(archive.tradeEpisodes[key] || []), ...toArchive];
      archivedCount += toArchive.length;
      next[key] = list.slice(-KEEP_EPISODES);
    } else {
      next[key] = list;
    }
  });
  return { tradeEpisodes: next, archivedCount };
}

export function makeEmptyArchive() {
  return { trackRecord: {}, tradeEpisodes: {} };
}
