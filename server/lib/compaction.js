// Compattazione della cronologia vecchia — stesso principio della compattazione di contesto di
// una conversazione lunga: invece di trascinare per intero episodi ormai fuori dalla finestra
// recente che il Learning Loop guarda davvero (RECENT_WINDOW=8 in engine/memory.js), li si
// riassume in un digest breve prima di archiviarli (vedi Fase 2 della roadmap — questa funzione
// e' pronta per essere agganciata li', non gira ancora da sola in nessun job).
// NON verificata con dati reali in questa sessione (nessuna chiave Gemini locale). Degrada a un
// riassunto puramente statistico (nessuna chiamata AI) se la chiave manca o la chiamata fallisce
// — mai un digest inventato: se Gemini non risponde, il digest resta onestamente numerico.
import { GEMINI_MODEL } from './geminiConfig.js';

function statisticalDigest(strategyKey, episodes) {
  const wins = episodes.filter((e) => e.returnPct > 0).length;
  const avgReturn = episodes.reduce((sum, e) => sum + e.returnPct, 0) / episodes.length;
  return `${strategyKey}: ${episodes.length} episodi archiviati, ${wins} vinti (${Math.round((wins / episodes.length) * 100)}%), rendimento medio ${avgReturn.toFixed(2)}%. Digest statistico (Gemini non disponibile per il riassunto discorsivo).`;
}

export async function compactEpisodes(apiKey, strategyKey, episodes) {
  if (!episodes.length) return null;
  if (!apiKey) return statisticalDigest(strategyKey, episodes);
  try {
    const prompt = `Riassumi in 2-3 frasi fattuali, senza consigli né giudizi di valore, il pattern di questi ${episodes.length} trade passati della strategia ${strategyKey}: `
      + `${JSON.stringify(episodes.map((e) => ({ symbol: e.symbol, returnPct: Number(e.returnPct.toFixed(2)), outcomeTag: e.outcomeTag })))}. `
      + `Solo fatti osservabili (percentuale di vittorie, rendimento medio, eventuali simboli/condizioni ricorrenti nei fallimenti) — nessuna previsione.`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return statisticalDigest(strategyKey, episodes);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? text.trim() : statisticalDigest(strategyKey, episodes);
  } catch {
    return statisticalDigest(strategyKey, episodes);
  }
}
