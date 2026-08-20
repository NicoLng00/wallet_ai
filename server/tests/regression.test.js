// Test di regressione su tre bug reali già trovati e corretti in sessione — se qualcuno li
// reintroduce per errore, questi test devono fallire in CI, non farsi scoprire in produzione.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/loadEngine.js';
import { resolveDailyRange, resolveIntradayInterval, resolveIntradayRange } from '../lib/rangeResolvers.js';

// --- Bug 1: /api/history ricadeva silenziosamente su "2y" per qualunque range non in whitelist,
// invece di segnalare l'errore — scoperto testando storici più ampi (10y), mai propagato come
// bug visibile perché nessuno aveva mai chiesto un range diverso dal default in produzione.
test('resolveDailyRange: accetta 10y (il valore che mancava nel bug originale)', () => {
  assert.equal(resolveDailyRange('10y'), '10y');
});

test('resolveDailyRange: tutti i valori dichiarati validi passano invariati', () => {
  ['1y', '2y', '5y', '10y'].forEach((r) => assert.equal(resolveDailyRange(r), r));
});

test('resolveDailyRange: valore non valido o mancante ricade sul default dichiarato', () => {
  assert.equal(resolveDailyRange('3y'), '2y');
  assert.equal(resolveDailyRange(undefined), '2y');
});

test('resolveIntradayInterval/Range: stessa disciplina, stessi valori dichiarati validi', () => {
  ['30m', '15m', '5m'].forEach((v) => assert.equal(resolveIntradayInterval(v), v));
  ['5d', '30d', '60d'].forEach((v) => assert.equal(resolveIntradayRange(v), v));
  assert.equal(resolveIntradayInterval('1h'), '30m');
  assert.equal(resolveIntradayRange('1y'), '60d');
});

// --- Bug 2: survivesLiveTrackRecord valutava l'INTERO storico live invece della finestra
// mobile recente — una strategia con molti trade vecchi negativi restava esclusa anche dopo
// essere tornata a reggere sui trade recenti, perché la media cumulativa restava sotto soglia.
const Aurora = loadEngine([
  'src/utils.js', 'src/config.js', 'src/models/seedData.js', 'src/models/state.js',
  'src/engine/indicators.js', 'src/engine/rules.js', 'src/engine/backtest.js', 'src/engine/market.js',
  'src/engine/strategies.js'
]);

function makeTrades(count, returnPct) {
  return Array.from({ length: count }, () => ({ returnPct, at: new Date().toISOString() }));
}

test('survivesLiveTrackRecord: usa la finestra mobile recente, non l\'intero storico', () => {
  const symbol = 'AAPL'; // simbolo reale già in Aurora.Models.instruments, serve a getDemoPrice
  const candidateKey = 'sma_rsi@1D';
  // 25 trade vecchi in perdita, poi 15 trade recenti in vincita — nell'ordine cronologico reale.
  const trades = [...makeTrades(25, -2), ...makeTrades(15, 3)];
  Aurora.Models.researchData = Aurora.Models.researchData || {};
  Aurora.Models.researchData.trackRecord = { [symbol]: { [candidateKey]: { trades } } };
  const candidate = { outOfSampleBaseline: { winRate: 50, avgReturn: 0 } };

  const survives = Aurora.Engine.survivesLiveTrackRecord(symbol, candidateKey, candidate);
  assert.equal(survives, true, 'gli ultimi 15 trade (tutti vincenti) devono bastare a superare il gate, anche con 25 trade vecchi perdenti prima');
});

test('survivesLiveTrackRecord: campione live sotto la soglia minima -> si fida ancora del backtest storico', () => {
  const symbol = 'AAPL';
  const candidateKey = 'macd_cross@1D';
  Aurora.Models.researchData.trackRecord = { [symbol]: { [candidateKey]: { trades: makeTrades(3, -50) } } }; // sotto LIVE_TRACK_RECORD_MIN_TRADES (10)
  const candidate = { outOfSampleBaseline: { winRate: 50, avgReturn: 0 } };
  assert.equal(Aurora.Engine.survivesLiveTrackRecord(symbol, candidateKey, candidate), true);
});

// --- Bug 3 (invariante, non un bug specifico): una candidata VALIDATA deve restare segnalata
// come tale anche quando è neutra oggi — mai far ricadere la selezione su esplorativa/sonda solo
// perché quella validata non è bullish in questo momento (il confronto incrociato con Gemini in
// server/providers/gemini.js dipende da questo: deve sapere che una regola validata esiste anche
// quando oggi tace).
// --- Bug 4: refreshLiveQuotes moltiplicava EURUSD (gia' un tasso di cambio) per usdToEurRate
// una seconda volta, corrompendolo verso ~1.0 — un crollo apparente del ~14% dalla quotazione
// reale (~1.16) che avrebbe sfondato uno stop loss reale (ATR-based, tipicamente a ~0.4% di
// distanza) per un motivo del tutto fittizio. Trovato testando il comportamento con EURUSD.
// Nota: dopo il fix con la chiave Finnhub reale (OANDA:* rifiuta con 403 su questo piano),
// EURUSD e usdToEurRate sono passati da Finnhub a fetchUsdToEurRate (Frankfurter con fallback
// open.er-api.com, vedi dataProviders.js) — il test mocka fetchUsdToEurRate invece di
// fetchFinnhubQuote('OANDA:USD_EUR'/'OANDA:EUR_USD').
const dataProvidersAurora = loadEngine([
  'src/utils.js', 'src/config.js', 'src/models/seedData.js', 'src/models/state.js', 'src/services/dataProviders.js'
]);
// I test successivi sovrascrivono fetchUsdToEurRate come mock per refreshLiveQuotes — la vera
// implementazione (con la logica di fallback) va salvata subito, prima che venga rimpiazzata.
const realFetchUsdToEurRate = dataProvidersAurora.Services.fetchUsdToEurRate;

function setupLiveQuotesTest() {
  const Models = dataProvidersAurora.Models;
  dataProvidersAurora.Views = new Proxy({}, { get: () => function () {} });
  dataProvidersAurora.Utils.$ = () => ({ textContent: '', classList: { toggle() {}, add() {}, remove() {} } });
  Models.liveData = { enabled: true, finnhubKey: 'fake-key-for-test' };
  Models.liveStatus = {};
  Models.liveChangePercent = {};
  Models.liveFetchInFlight = false;
  Models.liveCooldownUntil = 0;
  Models.usdToEurRate = 1;
  Models.usdToEurAvailable = false;
  dataProvidersAurora.Services.fetchCoinGeckoPrices = async () => ({});
  return Models;
}

test('refreshLiveQuotes: EURUSD (gia\' un tasso di cambio, ora via Frankfurter) non viene convertito una seconda volta', async () => {
  const Models = setupLiveQuotesTest();
  dataProvidersAurora.Services.fetchUsdToEurRate = async () => 0.862;
  dataProvidersAurora.Services.fetchFinnhubQuote = async () => ({ price: 100, previousClose: 99 });

  await dataProvidersAurora.Services.refreshLiveQuotes();

  assert.ok(Math.abs(Models.demoAccount.market.EURUSD - (1 / 0.862)) < 1e-9, 'EURUSD deve essere il reciproco esatto del tasso USD/EUR, non ri-convertita una seconda volta');
  assert.ok(Math.abs(Models.demoAccount.market.WTI - 86.2) < 1e-9, 'un asset genuinamente quotato in USD (WTI) deve invece restare convertito correttamente');
});

// --- Bug 5: il piano Finnhub gratuito rifiuta con HTTP 403 i soli simboli OANDA: (materie
// prime/forex) pur restando valido per le azioni sullo stesso piano — scoperto testando con una
// chiave reale (EURUSD/WTI/XAUUSD 403, AAPL/TLT 200 sulla STESSA chiave). Il codice trattava 403
// come "chiave invalida" a livello globale, innescando un cooldown di 60s che bloccava anche i
// simboli funzionanti per un problema che riguardava solo 3 simboli specifici.
test('refreshLiveQuotes: un 403 su un simbolo specifico non deve invalidare l\'intera chiave se altri simboli riescono', async () => {
  const Models = setupLiveQuotesTest();
  dataProvidersAurora.Services.fetchUsdToEurRate = async () => 0.862;
  dataProvidersAurora.Services.fetchFinnhubQuote = async (apiSymbol) => {
    if (apiSymbol === 'OANDA:XAU_USD' || apiSymbol === 'OANDA:WTICO_USD') throw new Error('unauthorized');
    return { price: 100, previousClose: 99 };
  };

  await dataProvidersAurora.Services.refreshLiveQuotes();

  assert.equal(Models.liveStatus.AAPL, 'live', 'i simboli che rispondono davvero devono restare vivi');
  assert.equal(Models.liveStatus.WTI, 'error', 'il simbolo senza diritti resta onestamente in errore');
  assert.equal(Models.liveCooldownUntil, 0, 'nessun cooldown globale: il 403 era per-simbolo, non un problema della chiave');
});

test('refreshLiveQuotes: se TUTTI i simboli Finnhub falliscono con unauthorized, la chiave e\' davvero considerata invalida', async () => {
  const Models = setupLiveQuotesTest();
  dataProvidersAurora.Services.fetchUsdToEurRate = async () => 0.862;
  dataProvidersAurora.Services.fetchFinnhubQuote = async () => { throw new Error('unauthorized'); };

  await dataProvidersAurora.Services.refreshLiveQuotes();

  assert.ok(Models.liveCooldownUntil > 0, 'zero successi Finnhub su tutto il batch -> chiave davvero invalida, cooldown corretto');
});

// --- fetchUsdToEurRate: verificato in sessione con dati reali che Frankfurter puo' essere
// irraggiungibile da alcune reti (TLS intercettato da un proxy aziendale) pur essendo online per
// altri — deve ricadere su open.er-api.com invece di lasciare il tasso a 1 (il default che ha
// sovrastimato ogni prezzo USD->EUR del ~16-17% finche' la fonte Finnhub era rotta).
test('fetchUsdToEurRate: se Frankfurter fallisce, ricade su open.er-api.com invece di restare senza tasso', async () => {
  dataProvidersAurora.Services.fetchFrankfurterUsdEurRate = async () => { throw new Error('network'); };
  dataProvidersAurora.Services.fetchOpenErApiUsdEurRate = async () => 0.858;

  const rate = await realFetchUsdToEurRate();

  assert.equal(rate, 0.858, 'il fallback deve fornire comunque un tasso reale, non propagare l\'errore');
});

test('ruleSignalFor: una candidata validata resta in fascia "validata" anche se neutra oggi', () => {
  const symbol = 'NVDA';
  const flatCloses = Array(60).fill(100); // prezzo piatto: sma_rsi resta neutro (price > sma e' falso)
  Aurora.Models.historyCache = { [symbol]: { '1D': { closes: flatCloses, candles: null } } };
  Aurora.Models.researchData.validated = {
    [symbol]: {
      candidates: {
        'sma_rsi@1D': {
          validated: true, exploratory: false, strategyId: 'sma_rsi', timeframe: '1D', label: 'test',
          inSample: { count: 10, winRate: 70, avgReturn: 1 },
          outOfSample: { count: 8, winRate: 65, avgReturn: 0.8 },
          inSampleBaseline: { winRate: 50, avgReturn: 0 },
          outOfSampleBaseline: { winRate: 50, avgReturn: 0 }
        }
      }
    }
  };
  Aurora.Models.researchData.trackRecord = {};

  const signal = Aurora.Engine.ruleSignalFor(symbol);
  assert.equal(signal.validated, true, 'deve restare "validata" anche se il segnale tecnico di oggi e\' neutro');
  assert.equal(signal.bullish, false, 'il prezzo piatto non genera un segnale rialzista oggi — coerente, non un difetto');
});
