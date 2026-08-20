// Puro: nessuna chiamata di rete — whitelist esplicita dei parametri accettati dagli endpoint
// storici (server/http/routes.js). Estratto qui dopo un bug reale trovato in sessione: la
// whitelist di /api/history escludeva "10y" senza errore, ricadendo silenziosamente su "2y" —
// chi chiamava l'endpoint non aveva modo di accorgersene. Testato (server/tests/regression.test.js)
// cosi' un futuro cambio alla whitelist che dimentica un valore valido fallisce in CI, non in
// silenzio in produzione.
const VALID_DAILY_RANGES = ['1y', '2y', '5y', '10y'];
const DEFAULT_DAILY_RANGE = '2y';

const VALID_INTRADAY_INTERVALS = ['30m', '15m', '5m'];
const DEFAULT_INTRADAY_INTERVAL = '30m';
const VALID_INTRADAY_RANGES = ['5d', '30d', '60d'];
const DEFAULT_INTRADAY_RANGE = '60d';

export function resolveDailyRange(requested) {
  return VALID_DAILY_RANGES.includes(requested) ? requested : DEFAULT_DAILY_RANGE;
}

export function resolveIntradayInterval(requested) {
  return VALID_INTRADAY_INTERVALS.includes(requested) ? requested : DEFAULT_INTRADAY_INTERVAL;
}

export function resolveIntradayRange(requested) {
  return VALID_INTRADAY_RANGES.includes(requested) ? requested : DEFAULT_INTRADAY_RANGE;
}
