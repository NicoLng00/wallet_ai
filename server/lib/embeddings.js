// Chiamata reale a Gemini per generare embedding testuali (stesso account gratuito gia' usato
// per generateContent — nessuna nuova chiave, nessun nuovo provider). NON verificata con dati
// reali in questa sessione: nessuna chiave Gemini disponibile in locale al momento di scriverlo.
// Degrada in sicurezza (null) se la chiamata fallisce per qualunque motivo — a valle, chi chiama
// deve gia' sapere gestire "nessun embedding disponibile" ricadendo sull'ordine cronologico
// esistente, mai bloccarsi o inventare un punteggio.
const EMBEDDING_MODEL = 'text-embedding-004';

export async function embedText(apiKey, text) {
  if (!apiKey || !text) return null;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ content: { parts: [{ text }] } }),
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const values = data?.embedding?.values;
    return Array.isArray(values) && values.length ? values : null;
  } catch {
    return null;
  }
}

// Embedda una lista di testi in parallelo — usato per una query + N candidati evidenza in un
// solo giro. Ogni fallimento individuale resta null nella posizione corrispondente (mai
// propagato come eccezione globale: un embedding fallito su 8 non deve buttare via gli altri 7).
export async function embedBatch(apiKey, texts) {
  return Promise.all(texts.map((text) => embedText(apiKey, text)));
}
