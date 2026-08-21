// Parser RSS minimo, solo per i campi che servono (title/pubDate/source di ogni <item>) — niente
// dipendenza nuova solo per parsare tre tag: lo stesso principio gia' seguito per il test runner
// (node --test invece di una libreria). Google News RSS (verificato in sessione, vedi
// mcp/tools/venomNewsAgent.js) e' XML ben formato senza CDATA sui campi che leggiamo, un parser
// a espressioni regolari sull'item è sufficiente e non introduce un parser XML generico non
// necessario altrove nel progetto.
export function parseRssItems(xml, limit = 20) {
  if (typeof xml !== 'string' || !xml.includes('<item>')) return [];
  const rawItems = xml.split('<item>').slice(1);
  return rawItems.slice(0, limit).map((chunk) => {
    const title = decodeEntities(chunk.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() || '');
    const pubDate = chunk.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || null;
    const source = decodeEntities(chunk.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.trim() || '');
    const link = chunk.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() || null;
    return { title, pubDate, source: source || null, link };
  }).filter((item) => item.title);
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'');
}
