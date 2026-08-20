// Test della nuova strategia custom hybrid_confluence (src/engine/strategies.js): non ricontrolla
// la correttezza dei singoli indicatori (gia' coperti da indicators.test.js), verifica che la
// combinazione AND delle quattro condizioni sia cablata correttamente confrontando l'output della
// strategia con gli stessi indicatori ricalcolati direttamente, su una serie sintetica deterministica
// (trend + oscillazione, nessuna casualita') abbastanza lunga da attraversare piu' regimi (trend
// su/giu', RSI alto/basso/medio, prezzo dentro/fuori le bande di Bollinger).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/loadEngine.js';

const Aurora = loadEngine([
  'src/utils.js', 'src/config.js', 'src/models/seedData.js', 'src/models/state.js',
  'src/engine/indicators.js', 'src/engine/strategies.js'
]);

// Rumore pseudo-casuale deterministico (LCG, nessun Math.random — stesso output a ogni run, mai
// un test flaky in CI) — un trend + sinusoide pura fa saturare l'RSI a 0/100 quasi ovunque (nessuna
// alternanza guadagno/perdita giorno per giorno, a differenza di una serie di prezzi reale), non
// abbastanza per esercitare il filtro RSI 45-65 della strategia.
function makeSyntheticSeries(length, seed = 42) {
  const closes = [];
  let price = 100;
  let s = seed;
  for (let i = 0; i < length; i += 1) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const noise = (s / 0x7fffffff - 0.5) * 2; // -1..1, deterministico
    price += 0.03 + noise * 1.2;
    closes.push(Number(price.toFixed(4)));
  }
  return closes;
}

test('hybrid_confluence: storico insufficiente -> sempre neutral, mai un errore', () => {
  const result = Aurora.Engine.STRATEGIES.hybrid_confluence.signal({ closes: [100, 101, 102] });
  assert.equal(result, 'neutral');
});

test('hybrid_confluence: bullish SOLO quando trend + momentum + filtro esaurimento sono TUTTI d\'accordo', () => {
  const closes = makeSyntheticSeries(400);
  const strategy = Aurora.Engine.STRATEGIES.hybrid_confluence;
  let sawBullish = false;
  let sawNeutral = false;

  for (let i = 60; i < closes.length; i += 1) {
    const slice = closes.slice(0, i + 1);
    const sma = Aurora.Engine.computeSMA(slice, 50);
    const rsi = Aurora.Engine.computeRSI(slice, 14);
    const macd = Aurora.Engine.computeMACD(slice);
    const bands = Aurora.Engine.computeBollingerBands(slice, 20, 2);
    const price = slice[slice.length - 1];

    const expectedBullish = sma !== null && rsi !== null && macd && bands
      && price > sma && macd.histogram > 0 && rsi >= 45 && rsi <= 65 && price < bands.upper;

    const actual = strategy.signal({ closes: slice });
    assert.equal(actual, expectedBullish ? 'bullish' : 'neutral',
      `indice ${i}: atteso ${expectedBullish ? 'bullish' : 'neutral'} (sma=${sma}, rsi=${rsi}, hist=${macd?.histogram}, upper=${bands?.upper}, price=${price})`);

    if (actual === 'bullish') sawBullish = true; else sawNeutral = true;
  }

  // Prova che il filtro fa davvero qualcosa: su 240 barre di trend+oscillazione deve esserci
  // ALMENO un punto bullish (altrimenti la condizione sarebbe troppo stretta per essere utile,
  // mai verificabile) e almeno un punto neutral (altrimenti equivarrebbe a "sempre bullish",
  // nessun filtro reale).
  assert.ok(sawBullish, 'la serie sintetica deve produrre almeno un bullish reale');
  assert.ok(sawNeutral, 'la serie sintetica deve produrre almeno un neutral reale (il filtro deve escludere qualcosa)');
});

test('hybrid_confluence: RSI overbought oltre 65 blocca il segnale anche con trend e momentum favorevoli', () => {
  // Rally netto e sostenuto: price > sma e macd.histogram > 0 quasi certi, ma RSI tipicamente
  // sopra 65 in un rally ripido senza pause — il filtro deve tenerlo fuori.
  const closes = [];
  let price = 100;
  for (let i = 0; i < 80; i += 1) { price *= 1.02; closes.push(Number(price.toFixed(4))); }

  const rsi = Aurora.Engine.computeRSI(closes, 14);
  const result = Aurora.Engine.STRATEGIES.hybrid_confluence.signal({ closes });
  assert.ok(rsi > 65, `precondizione del test non soddisfatta: RSI atteso overbought, letto ${rsi}`);
  assert.equal(result, 'neutral', 'RSI overbought deve bloccare il segnale anche con trend/momentum favorevoli');
});
