// Puro: nessuna chiamata di rete qui, solo la matematica del retrieval (similarita' coseno +
// selezione top-K) — testabile senza nessuna chiave API. La generazione degli embedding vive
// separata in embeddings.js, cosi' questa logica resta verificabile in isolamento, con vettori
// finti, senza dipendere da Gemini rispondendo o meno.
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// items: [{ text, embedding }]. Ritorna gli item ordinati per rilevanza decrescente rispetto a
// queryEmbedding, solo i primi k. Un item con embedding null/mancante prende punteggio 0 (finisce
// in fondo, non esclude nulla — degrado, mai un errore).
export function retrieveTopK(items, queryEmbedding, k) {
  if (!Array.isArray(items) || !items.length || !Array.isArray(queryEmbedding)) return [];
  return items
    .map((item) => ({ ...item, score: cosineSimilarity(item.embedding, queryEmbedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, k));
}
