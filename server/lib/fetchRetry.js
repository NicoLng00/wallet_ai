// Retry con backoff, condiviso da ogni fetch verso una fonte esterna lato server (Yahoo,
// CoinGecko...). Prima solo StockTwits aveva un retry (misurato ~1/6 di successo al primo
// tentativo, ~4/5 con 3 tentativi) — lo stesso principio si applica a qualunque fonte di rete:
// un singolo tentativo scambia rumore di rete transitorio per "dato non disponibile", lasciando
// un buco che non c'era motivo di lasciare. Mai un numero di tentativi infinito, mai un retry
// su errori che non sono transitori (es. simbolo non trovato — la funzione fetchFn decide cosa
// e' un errore ritentabile lanciando comunque, un errore non gestito qui si propaga al primo giro).
export async function fetchWithRetry(fetchFn, { attempts = 3, delayMs = 400 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetchFn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
  throw lastError;
}
