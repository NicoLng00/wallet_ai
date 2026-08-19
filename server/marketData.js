// Proxy server-side per storico di mercato reale con piu' anni di dati di quanti Alpha Vantage
// gratuito ne dia (piano free = ~100 barre "compact", il piano con piu' storico e' a pagamento).
// Yahoo Finance (endpoint pubblico, nessuna chiave) non espone CORS per il browser: da qui, lato
// server, non e' un problema — il frontend continua a non parlare mai direttamente con Yahoo.
// Solo lettura, nessuna scrittura, nessun dato inventato: se Yahoo non risponde o il simbolo non
// esiste, l'errore risale al frontend che ricade sulla fonte esistente (Alpha Vantage/CoinGecko).

// I nostri simboli interni non coincidono sempre con i ticker Yahoo (futures, non spot forex).
// XAUUSD non ha mai avuto una fonte storica gratuita in questo progetto (vedi README) — GC=F
// (futures oro) e' un proxy dichiarato, non lo spot esatto, ma e' storico reale e correlato.
const SYMBOL_TO_YAHOO = {
  AAPL: 'AAPL', NVDA: 'NVDA', SPY: 'SPY', QQQ: 'QQQ', TSLA: 'TSLA', TLT: 'TLT',
  WTI: 'CL=F', XAUUSD: 'GC=F', EURUSD: 'EURUSD=X'
};

export function yahooTickerFor(symbol) {
  return SYMBOL_TO_YAHOO[symbol] || null;
}

export async function fetchYahooDailyHistory(symbol, range = '2y') {
  const ticker = yahooTickerFor(symbol);
  if (!ticker) throw new Error(`Nessun ticker Yahoo mappato per il simbolo "${symbol}".`);
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${encodeURIComponent(range)}&interval=1d`;
  // Timeout esplicito per richiesta: senza, una singola risposta lenta/appesa di Yahoo (piu'
  // probabile dagli IP condivisi di un runner CI, osservato in sessione) consuma da sola l'intero
  // budget del job che chiama questa funzione una volta per simbolo, di seguito. Deve restare PIU'
  // CORTO del timeout lato frontend (FETCH_TIMEOUT_MS in dataProviders.js, 15s) — altrimenti il
  // frontend rinuncia sulla propria chiamata al backend prima che il backend stesso abbia potuto
  // fallire in modo pulito e restituire un errore leggibile invece di un timeout generico.
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AuroraMarkets/1.0)' }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Yahoo Finance ha risposto ${res.status} per ${ticker}.`);
  const payload = await res.json();
  const result = payload?.chart?.result?.[0];
  if (!result || payload?.chart?.error) {
    throw new Error(payload?.chart?.error?.description || `Nessun dato Yahoo Finance per ${ticker}.`);
  }
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const dates = [];
  const closes = [];
  const candles = [];
  timestamps.forEach((ts, i) => {
    const close = quote.close?.[i];
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const volume = quote.volume?.[i];
    // Yahoo puo' avere buchi (giorni festivi/dati mancanti): scartiamo solo la barra incompleta,
    // non l'intera serie. Il volume manca piu' spesso di OHLC (es. sui future del proxy oro/WTI) —
    // non e' un motivo per scartare la barra, solo per lasciare quel volume assente (Number.isFinite
    // lo fa risultare "non disponibile" ovunque venga letto, mai un valore inventato).
    if (![close, open, high, low].every((v) => Number.isFinite(v))) return;
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    dates.push(date);
    closes.push(close);
    candles.push({ date, open, high, low, close, volume: Number.isFinite(volume) ? volume : null });
  });
  return { symbol, yahooTicker: ticker, closes, dates, candles, source: 'yahoo-finance-chart-api' };
}
