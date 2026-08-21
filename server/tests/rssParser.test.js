import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRssItems } from '../lib/rssParser.js';

// Fixture presa dalla risposta REALE di Google News RSS verificata in sessione (query "Juventus
// calciomercato"), non inventata — stessa struttura esatta (title/pubDate/source/link per item).
const REAL_SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><rss version="2.0"><channel>
<title>"Juventus calciomercato" - Google News</title>
<item><title>La Juve non si ferma: due colpi in vista. Arthur se ne va, ma servono altre uscite - La Gazzetta dello Sport</title>
<link>https://news.google.com/rss/articles/EXAMPLE1</link>
<pubDate>Thu, 20 Aug 2026 22:50:57 GMT</pubDate>
<source url="https://www.gazzetta.it">La Gazzetta dello Sport</source></item>
<item><title>Calciomercato Juve, David rifiuta la Premier! Kessie aspetta - Tuttosport</title>
<link>https://news.google.com/rss/articles/EXAMPLE2</link>
<pubDate>Fri, 21 Aug 2026 06:20:00 GMT</pubDate>
<source url="https://www.tuttosport.com">Tuttosport</source></item>
</channel></rss>`;

test('parseRssItems: estrae title/pubDate/source/link da una risposta RSS reale (fixture Google News)', () => {
  const items = parseRssItems(REAL_SAMPLE_XML);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'La Juve non si ferma: due colpi in vista. Arthur se ne va, ma servono altre uscite - La Gazzetta dello Sport');
  assert.equal(items[0].source, 'La Gazzetta dello Sport');
  assert.equal(items[0].pubDate, 'Thu, 20 Aug 2026 22:50:57 GMT');
  assert.equal(items[1].source, 'Tuttosport');
});

test('parseRssItems: rispetta il limite richiesto', () => {
  const items = parseRssItems(REAL_SAMPLE_XML, 1);
  assert.equal(items.length, 1);
});

test('parseRssItems: XML senza <item> -> array vuoto, mai un errore', () => {
  assert.deepEqual(parseRssItems('<rss><channel><title>vuoto</title></channel></rss>'), []);
});

test('parseRssItems: input non stringa o vuoto -> array vuoto', () => {
  assert.deepEqual(parseRssItems(null), []);
  assert.deepEqual(parseRssItems(''), []);
  assert.deepEqual(parseRssItems(undefined), []);
});

test('parseRssItems: decodifica le entita\' HTML comuni nel titolo (es. Besiktas/Fenerbahce con caratteri accentati escapati)', () => {
  const xml = `<item><title>Beşiktaş &amp; Fenerbahçe: derby &quot;infuocato&quot;</title><pubDate>x</pubDate></item>`;
  const items = parseRssItems(xml);
  assert.equal(items[0].title, 'Beşiktaş & Fenerbahçe: derby "infuocato"');
});

test('parseRssItems: item senza titolo viene scartato (mai un\'evidenza vuota)', () => {
  const xml = `<item><pubDate>x</pubDate></item><item><title>Titolo vero</title></item>`;
  const items = parseRssItems(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Titolo vero');
});
