# Aurora Markets — MVP

Dashboard statica, senza dipendenze, per esplorare l'interfaccia di una piattaforma di ricerca e **paper trading** assistita da AI.

## Avvio

Il frontend è statico: apri `index.html` in un browser moderno per la sola regola tecnica (nessuna installazione richiesta). Per la modalità AI (Gemini) serve anche il backend locale:

```
cd server
npm install   # solo la prima volta
npm start     # avvia http://localhost:8787
```

Poi apri `index.html` normalmente — il pannello "Impostazioni" resta il posto dove inserire la chiave Gemini (gratuita, Google AI Studio). Senza il backend in esecuzione, la modalità regola tecnica funziona comunque; solo la modalità AI mostra un errore esplicito ("Backend locale non raggiungibile").

## Struttura del codice

**Frontend** (`src/`, script classici caricati da `index.html`, nessun bundler richiesto):

- `src/models/` — stato applicativo e persistenza (`localStorage`): conto demo, dati live, research/backtest, motore AI.
- `src/engine/` — indicatori (SMA/RSI/MACD/Bollinger/ATR/pattern a candela), libreria di strategie (`strategies.js`), backtest walk-forward multi-candidato, selezione adattiva su performance live (`learning.js`), risk gate, esecuzione paper trading, Autopilot multi-posizione con SL/TP adattivi.
- `src/agents/supervisor.js` — decide il segnale finale per un simbolo (regola tecnica o consenso con l'AI); l'orchestrazione dei 7 agenti vive lato server quando la modalità AI è attiva.
- `src/services/` — I/O esterno: provider dati di mercato (Finnhub/CoinGecko/Alpha Vantage) e client verso il backend AI locale (`aiProviders.js`).
- `src/views/` — solo rendering DOM.
- `src/controllers/` — wiring degli eventi utente.

**Backend** (`server/`, Node.js, opzionale — solo per la modalità AI):

- `server/mcp/` — server MCP reale (`@modelcontextprotocol/sdk`) che espone i 7 agenti come tool, e un client MCP collegato in-process via `InMemoryTransport`.
- `server/supervisor.js` — orchestratore: chiama tutti e 7 i tool MCP per ogni simbolo, assembla le evidenze, interroga il provider AI scelto.
- `server/providers/` — registro provider pluggable: Gemini reale (chiave lato utente, mai salvata sul server), interfaccia pronta per provider a pagamento futuri (chiave server-side via `.env`, mai nel browser).
- `server/http/` — endpoint `POST /api/agent-decision` che il frontend chiama al posto di Google direttamente.

Dettagli architetturali e le decisioni dietro questa struttura sono in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Cosa dimostra

- Grafico a candele TradingView embedded, con ticker e timeframe sincronizzati alla watchlist.
- Watchlist, timeframe, ticker search e dettagli del titolo.
- **Pipeline di 7 agenti reali via MCP** (non più solo decorativa): un vero server MCP (backend Node, `@modelcontextprotocol/sdk`) espone Technical Analyst, Risk Manager, **Fundamental** (notizie reali da Finnhub, solo azionario) e **Hedge** (correlazione di Pearson reale con gli altri simboli/posizioni) come tool con dati veri; Market Regime e Liquidity restano gli unici onestamente "nessuna fonte dati collegata". Il Supervisor lato server li chiama tutti via protocollo MCP e ne passa le evidenze al modello principale quando la modalità AI è attiva.
- **Libreria di strategie multi-timeframe** (`src/engine/strategies.js`): non più solo SMA50/RSI14. Anche MACD crossover, Bollinger mean-reversion e pattern Engulfing su candele OHLC reali; per crypto (BTCUSD/ETHUSD) anche timeframe orario oltre al giornaliero. Ogni combinazione strategia+timeframe è validata **indipendentemente** con lo stesso walk-forward in-sample/out-of-sample — il Supervisor sceglie quella con lo score più alto in quel momento ("il team sceglie la più efficace"). Più fonti indipendenti di edge, non una soglia più bassa su una sola regola.
- **SL/TP adattivi**: dove sono disponibili candele OHLC reali, stop e target si calibrano sulla volatilità reale del titolo (ATR14) invece di una percentuale fissa uguale per tutti; fallback alla percentuale fissa dove l'OHLC non è disponibile.
- **Selezione adattiva delle strategie** (`src/engine/learning.js`): non è training di un modello. Ogni trade chiuso aggiorna il track record realizzato della strategia che lo ha generato; quando il campione live è sufficiente (10 trade), una strategia che smette di reggere sui risultati **reali** viene esclusa dalla selezione finché non torna a validare — verifica continua sugli esiti veri, stessa disciplina statistica del backtest.
- **Livello esplorativo + Learning Loop** (`src/engine/rules.js`, `src/engine/memory.js`): una strategia con un edge reale in-sample ma senza ancora abbastanza trade fuori campione per essere confermata *o* smentita può operare in taglia ridotta (40% della taglia normale), etichettata sempre "esplorativa" — mai spacciata per validata. Una strategia che i dati hanno già smentito resta esclusa: lì il rischio non sarebbe ignoranza, sarebbe negare l'evidenza. Ogni trade chiuso passa dal **Trade Critic** (classificazione deterministica dell'esito: stop loss in volatilità normale/elevata, uscita per segnale, esplorativo vinto/perso), alimenta la **Similar Trade Retrieval** e, quando un pattern di fallimento ricorre (≥3 volte, ≥50% dei trade recenti), genera una **lezione versionata** in memoria — mai cancellata, solo superata da una versione più recente o disattivata (reversibile). Le lezioni attive per la strategia scelta diventano contesto per le decisioni future, incluso il prompt a Gemini quando la modalità AI è attiva. Nessun fine-tuning: il modello non cambia, cambia l'evidenza che riceve.
- Conto sandbox locale da **€10,00**, posizioni frazionarie, massimo €2,50 per ordine e kill switch sul drawdown.
- Autopilot opzionale: ogni 20 secondi scansiona l'intera watchlist (azionario, indici, crypto e materie prime come XAUUSD) e può aprire **fino a 3 posizioni concorrenti** nello stesso ciclo (una per ogni titolo che supera la soglia di confidenza), con stop loss/take profit automatici — più ampiezza di portafoglio invece di abbassare la qualità di un singolo segnale, dopo che un test walk-forward ha dimostrato che una regola più permissiva su un solo titolo distrugge l'edge fuori campione.
- Modalità dati Live opzionale (pulsante "Impostazioni"): con una API key Finnhub gratuita (fornita dall'utente) sostituisce i prezzi simulati con quotazioni reali da Finnhub (azioni, oro) e CoinGecko (crypto), in sola lettura. Il conto resta sempre paper: nessun broker, nessun ordine reale, nessun obiettivo di rendimento.
- Sezione "Research": backtest **walk-forward multi-strategia** su storico reale — lo storico è diviso in una finestra di selezione (in-sample) e una mai vista prima (out-of-sample), entrambe confrontate con una baseline a ingressi casuali, per ogni strategia/timeframe candidato. "Validato" richiede di battere il caso in ENTRAMBE le finestre: una regola tarata e verificata sugli stessi dati non prova nulla. **Zero strategie validate su un simbolo in un dato momento è un esito legittimo**, non un difetto.
- Motore segnale alternativo "AI (Gemini)" (opzionale, pulsante in Impostazioni, chiave gratuita Google AI Studio): sostituisce la regola tecnica con il giudizio di un modello linguistico, ora informato dalle evidenze reali di Technical/Risk/Fundamental/Hedge, non solo da prezzo/variazione grezzi. Esplicitamente etichettato come sperimentale e non backtestato. Quando un titolo ha anche un edge validato da backtest, funge da controllo incrociato: un giudizio Gemini rialzista in conflitto con la regola tecnica validata viene bloccato, non solo attenuato; sui titoli senza backtest (es. XAUUSD) il giudizio Gemini resta l'unico segnale disponibile.
- Motore AI **pluggable**: `server/providers/registry.js` espone un registro di provider con un'interfaccia comune. Oggi solo Gemini è implementato (gratuito, chiave inserita dall'utente nel browser e inoltrata al backend per-richiesta, mai salvata lì). Anthropic e un generico OpenAI-compatible sono solo interfaccia predisposta (`implemented:false`) con `keySource:'server-env'`: una chiave a pagamento vivrebbe solo in `server/.env`, mai nel browser — il backend è esattamente il posto sicuro che mancava quando in sessione avevamo scartato Anthropic per il rischio di esporre una chiave a pagamento lato client.

## Limiti intenzionali

Il grafico usa il widget TradingView, mentre i dati usati dal sandbox e dall'Autopilot restano volutamente simulati (o live in sola lettura, su richiesta esplicita): un iframe di terze parti non è un data feed esecutivo affidabile né leggibile dal motore locale. Non vi sono ordini reali, broker o promesse di rendimento. Il backend locale (`server/`) orchestra solo l'analisi (agenti + modello): l'esecuzione dell'ordine e l'unico gate di rischio che conta restano interamente nel browser, dopo la risposta del modello, non prima.

Per la produzione serve comunque un data provider autorizzato, un backend autenticato e indurito (oggi è locale, senza autenticazione, pensato solo per sviluppo), un broker API, controlli di compliance e un processo di validazione/backtest indipendente.

La blueprint tecnica e i gate obbligatori per arrivare al live sono descritti in [ARCHITECTURE.md](./ARCHITECTURE.md).
