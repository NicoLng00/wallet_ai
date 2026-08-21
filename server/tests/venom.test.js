// Pipeline "Venom" (branch dedicato, 2026-08-21): modulo multi-valuta, prerequisito per i 13 club
// calcistici europei quotati verificati in sessione (EUR/USD/GBp/TRY). Generalizza
// fetchUsdToEurRate (gia' testato in regression.test.js) a piu' valute in una sola chiamata,
// stesso fallback Frankfurter -> open.er-api.com verificato dal vivo nella stessa sessione.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/loadEngine.js';

const Aurora = loadEngine([
  'src/utils.js', 'src/config.js', 'src/models/seedData.js', 'src/models/state.js', 'src/services/dataProviders.js'
]);
const realFetchEurExchangeRates = Aurora.Services.fetchEurExchangeRates;

test('convertToEur: EUR passa invariato (nessuna conversione necessaria)', () => {
  assert.equal(Aurora.Services.convertToEur(2.05, 'EUR', {}), 2.05);
});

test('convertToEur: USD/TRY si convertono dividendo per il tasso EUR->valuta', () => {
  const rates = { USD: 1.168175, TRY: 56.134409 };
  assert.ok(Math.abs(Aurora.Services.convertToEur(24.02, 'USD', rates) - (24.02 / 1.168175)) < 1e-9);
  assert.ok(Math.abs(Aurora.Services.convertToEur(3.17, 'TRY', rates) - (3.17 / 56.134409)) < 1e-9);
});

// Bug plausibile prevenuto esplicitamente: GBp (penny sterling, es. Celtic CCP.L) non e' GBP.
// 100 GBp = 1 GBP - confondere le due unita' sposta il prezzo di un fattore 100.
test('convertToEur: GBp (penny) NON e\' GBP — deve dividere anche per 100 prima del tasso', () => {
  const rates = { GBP: 0.856976 };
  const priceInPence = 200; // Celtic, prezzo reale verificato in sessione: 200 GBp
  const expectedEur = (200 / 100) / 0.856976; // 2 GBP -> EUR
  const actual = Aurora.Services.convertToEur(priceInPence, 'GBp', rates);
  assert.ok(Math.abs(actual - expectedEur) < 1e-9, `atteso ${expectedEur}, letto ${actual}`);
  // Prova diretta che confondere GBp con GBP darebbe un risultato 100 volte piu' grande (il bug
  // che questa funzione previene): se qualcuno chiamasse convertToEur(200,'GBP',rates) per errore,
  // otterrebbe 200/0.856976 invece di 2/0.856976 — un prezzo assurdo per un titolo LSE reale.
  const wrongIfMisusedAsGBP = priceInPence / rates.GBP;
  assert.ok(wrongIfMisusedAsGBP > actual * 50, 'la differenza tra GBp e GBP deve essere ordini di grandezza, non arrotondamento');
});

test('convertToEur: valuta senza tasso disponibile -> errore esplicito, mai un prezzo inventato', () => {
  assert.throws(() => Aurora.Services.convertToEur(100, 'TRY', {}), /missing-rate-TRY/);
});

test('fetchEurExchangeRates: se Frankfurter fallisce, ricade su open.er-api.com per tutte le valute richieste', async () => {
  Aurora.Services.fetchFrankfurterRates = async () => { throw new Error('network'); };
  Aurora.Services.fetchOpenErApiRates = async (currencies) => {
    const all = { USD: 1.168175, GBP: 0.856976, TRY: 56.134409 };
    return Object.fromEntries(currencies.map((c) => [c, all[c]]));
  };
  const rates = await realFetchEurExchangeRates(['USD', 'GBP', 'TRY']);
  assert.deepEqual(rates, { USD: 1.168175, GBP: 0.856976, TRY: 56.134409 });
});

test('fetchEurExchangeRates: usa Frankfurter quando risponde, nessun fallback superfluo', async () => {
  let openErApiCalled = false;
  Aurora.Services.fetchFrankfurterRates = async (currencies) => Object.fromEntries(currencies.map((c) => [c, 99]));
  Aurora.Services.fetchOpenErApiRates = async () => { openErApiCalled = true; return {}; };
  const rates = await realFetchEurExchangeRates(['USD']);
  assert.equal(rates.USD, 99);
  assert.equal(openErApiCalled, false, 'non deve chiamare il fallback se la fonte primaria risponde');
});

// --- venomState.js: stessa forma di Aurora.Models di state.js, caricata al posto sua ---
const VenomAurora = loadEngine([
  'src/utils.js', 'src/config.js', 'src/models/venomState.js',
  'src/engine/indicators.js', 'src/engine/rules.js', 'src/engine/backtest.js', 'src/engine/market.js', 'src/engine/strategies.js',
  'src/services/dataProviders.js'
]);

test('venomState: 13 club europei realmente verificati, nessuno riusato dal sistema principale', () => {
  const symbols = Object.keys(VenomAurora.Models.instruments);
  assert.equal(symbols.length, 13);
  assert.ok(symbols.includes('JUVE.MI') && symbols.includes('SSL.MI') && symbols.includes('CCP.L'));
});

// Bug reale trovato e corretto in sessione: fetchHistoricalCloses (dataProviders.js) instrada un
// simbolo su Yahoo-per-primo SOLO se e' elencato in ALPHA_VANTAGE_STOCK_SYMBOLS (nome fuorviante,
// e' davvero un "instrada su Yahoo" gate) — con l'elenco vuoto ogni simbolo venom falliva con
// "Nessuna fonte storica disponibile" nonostante Yahoo avesse i dati reali, verificato con un
// backtest live prima di questo fix.
test('venomState: ogni club e\' instradabile su Yahoo (ALPHA_VANTAGE_STOCK_SYMBOLS deve contenere ogni simbolo, altrimenti fetchHistoricalCloses lo rifiuta)', () => {
  const symbols = Object.keys(VenomAurora.Models.instruments);
  symbols.forEach((symbol) => {
    assert.ok(VenomAurora.Models.ALPHA_VANTAGE_STOCK_SYMBOLS.includes(symbol), `${symbol} manca da ALPHA_VANTAGE_STOCK_SYMBOLS: fetchHistoricalCloses lo rifiuterebbe anche se Yahoo ha i dati`);
  });
});

test('venomState: conto paper 50€, leva 2x e regola del 5% ereditate dal sistema principale (stessa disciplina di rischio)', () => {
  const S = VenomAurora.Models.SIMULATION;
  assert.equal(S.accountSeed, 50);
  assert.equal(S.leverageMultiplier, 2);
  assert.equal(S.maxRiskPerTradePercent, 5);
  assert.equal(VenomAurora.Models.demoAccount.cash, 50);
});

test('venomState: storageKey/RESEARCH_KEY separati dal sistema principale (mai la stessa chiave localStorage)', () => {
  assert.equal(VenomAurora.Models.SIMULATION.storageKey, 'aurora-venom-account-v1');
  assert.notEqual(VenomAurora.Models.SIMULATION.storageKey, 'aurora-demo-account-v2');
});

test('venomState: ogni club ha una valuta dichiarata, GBp (Celtic) resta distinta da GBP', () => {
  const instruments = VenomAurora.Models.instruments;
  Object.entries(instruments).forEach(([symbol, data]) => {
    assert.ok(['EUR', 'USD', 'GBp', 'TRY'].includes(data.currency), `${symbol}: valuta mancante o non riconosciuta (${data.currency})`);
  });
  assert.equal(instruments['CCP.L'].currency, 'GBp');
});

// --- refreshVenomQuotes: bug reale trovato eseguendo il job end-to-end per la prima volta ---
test('refreshVenomQuotes: converte in EUR il prezzo nativo (TRY/GBp/USD), non lo scrive mai grezzo', async () => {
  VenomAurora.Services.fetchEurExchangeRates = async () => ({ USD: 1.168175, GBP: 0.856976, TRY: 56.134409 });
  VenomAurora.Services.fetchYahooDaily = async (symbol) => {
    const lastCloseBySymbol = { 'JUVE.MI': 2.05, MANU: 24.02, 'CCP.L': 200, 'GSRAY.IS': 1.14 };
    return { closes: [lastCloseBySymbol[symbol] ?? 1] };
  };
  const result = await VenomAurora.Services.refreshVenomQuotes();
  assert.equal(result.updated, 13);
  // Object.keys invece di assert.deepEqual(result.errors, {}): result.errors e' creato dentro il
  // contesto vm (realm diverso da questo file di test) — deepStrictEqual confronta anche il
  // prototipo, due oggetti vuoti di realm diversi non risultano "uguali" pur essendo entrambi {}.
  assert.equal(Object.keys(result.errors).length, 0);

  const market = VenomAurora.Models.demoAccount.market;
  assert.ok(Math.abs(market['JUVE.MI'] - 2.05) < 1e-9, 'EUR nativo: nessuna conversione');
  assert.ok(Math.abs(market.MANU - (24.02 / 1.168175)) < 1e-9, 'USD convertito in EUR');
  assert.ok(Math.abs(market['CCP.L'] - ((200 / 100) / 0.856976)) < 1e-9, 'GBp (penny) convertito correttamente, non trattato come GBP');
  assert.ok(Math.abs(market['GSRAY.IS'] - (1.14 / 56.134409)) < 1e-9, 'TRY convertito in EUR — MAI scritto come 1.14 grezzo (sarebbe un errore di unita\' di misura reale nel sizing)');
});

test('refreshVenomQuotes: un simbolo che fallisce non blocca gli altri, l\'errore e\' riportato per nome', async () => {
  VenomAurora.Services.fetchEurExchangeRates = async () => ({ USD: 1.168175, GBP: 0.856976, TRY: 56.134409 });
  VenomAurora.Services.fetchYahooDaily = async (symbol) => {
    if (symbol === 'MANU') throw new Error('http-500');
    return { closes: [2.5] };
  };
  const result = await VenomAurora.Services.refreshVenomQuotes();
  assert.equal(result.updated, 12);
  assert.equal(result.errors.MANU, 'http-500');
});
