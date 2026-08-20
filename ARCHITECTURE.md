# Architettura di produzione — Aurora Markets

## Principio operativo

L'AI può generare ipotesi e classificare opportunità; non deve mai essere l'unico componente autorizzato a inviare un ordine. L'esecuzione reale è possibile solo quando una policy deterministica, un controllo utente e un adapter broker hanno tutti esito positivo.

## Implementazione demo presente

- Il client monta l'Advanced Chart Widget di TradingView per la visualizzazione di ticker e timeframe. Il widget è una superficie grafica e non un feed affidabile per l'esecuzione.
- Il conto `Demo €10` è salvato solo nel `localStorage` del browser: cash, frazioni, posizioni, P&L e audit non lasciano il dispositivo.
- Modalità dati opzionale "Live": su richiesta esplicita dell'utente (chiave Finnhub personale, mai inclusa nel codice), il generatore di prezzi simulato viene sostituito da quotazioni reali (Finnhub + CoinGecko) in sola lettura. Cambia solo la fonte dei prezzi: esecuzione, sizing e conto restano interamente paper. Non introduce e non deve mai introdurre un obiettivo di rendimento: nessun sistema automatico può puntare in modo responsabile a un rendimento garantito.
- L'Autopilot è opzionale e opera ogni 20 secondi con un prezzo **simulato** (o reale in modalità Live), importo massimo €2,50 per posizione, **fino a `SIMULATION.maxConcurrentPositions` posizioni concorrenti** (default 3), esposizione massima 25% e kill switch al 20% di drawdown. La via scelta per aumentare la frequenza di trading è l'ampiezza di portafoglio (più titoli validati possono essere in posizione insieme), non una soglia di segnale più permissiva su un singolo titolo: un test walk-forward ha dimostrato che allargare la regola per generare più trade su un solo simbolo distrugge l'edge fuori campione (in-sample positivo, out-of-sample fortemente negativo).
- Il segnale non è più inventato: la sezione **Research** esegue un backtest **walk-forward** (SMA50/RSI14) su storico reale (Alpha Vantage/CoinGecko): la serie è divisa in una finestra di selezione (in-sample, 70%) e una mai vista prima (out-of-sample, 30%), entrambe confrontate con una baseline a ingressi casuali. "Validato" richiede di battere il caso in **entrambe** le finestre — una regola che fitta bene solo la finestra usata per sceglierla non prova un edge reale. Solo i simboli validati alimentano `Aurora.Engine.ruleSignalFor()`; tutti gli altri restano esplicitamente neutri.
- Motore segnale alternativo opzionale: un LLM (Gemini, chiave gratuita dell'utente) può sostituire la regola tecnica su richiesta esplicita. Non è validato da backtest — l'interfaccia lo etichetta sempre come giudizio sperimentale, mai come segnale verificato, e non introduce alcun obiettivo di rendimento. Sui titoli che hanno anche un edge misurato da backtest, la regola tecnica funge da controllo incrociato obbligatorio: un giudizio Gemini rialzista che la contraddice viene bloccato (mai eseguito), mentre l'accordo tra i due motori rafforza lo score. Sui titoli senza copertura di backtest il giudizio Gemini resta l'unico segnale, invariato.
- La “calibrazione” aggiorna un piccolo peso di confidenza in base agli esiti chiusi nel sandbox. Non è addestramento di un modello generativo e non dimostra redditività futura.

Per alimentare agenti e ordini con dati reali occorre sostituire il generatore demo con un servizio dati server-side autorizzato, con timestamp, qualità feed, licenza e riconciliazione.

## Agenti reali via MCP e pattern "agenti → modello principale"

Node.js è ora disponibile su questa macchina: `server/` è un vero backend MCP (`@modelcontextprotocol/sdk`), non più una simulazione client-side.

- `server/mcp/server.js` — un `McpServer` reale che registra gli 8 agenti come tool MCP (`technical_analyst`, `risk_manager`, `market_regime`, `liquidity`, `fundamental`, `hedge`, `audit_sentinel`, `social_sentiment`), ciascuno con `inputSchema`/`outputSchema` Zod e lo stesso contratto strutturato di sempre (`available`, `thesis`, `confidence`, `evidence[]`, `risk_flags[]`, `model_version`).
- `server/mcp/client.js` — un `Client` MCP reale, collegato al server in-process via `InMemoryTransport.createLinkedPair()`: handshake, JSON-RPC e tool-calling autentici del protocollo, senza bisogno di un processo separato o di stdio piping.
- `server/supervisor.js` — orchestratore: per ogni simbolo chiama sempre tutti e 7 i tool MCP (`runAgentsForSymbol`), assembla le evidenze di Technical Analyst e Risk Manager in un contesto compatto, poi lo passa al provider AI scelto (`generateDecision`). È il punto concreto in cui "gli agenti comunicano con il modello": non testo libero, ma il risultato tipizzato di una chiamata a tool MCP.

Cinque agenti su sette hanno oggi una fonte dati reale:

- **Technical Analyst** (`server/mcp/tools/technicalAgent.js`): il frontend gestisce una libreria di più strategie/timeframe (`src/engine/strategies.js` — SMA/RSI, MACD, Bollinger, pattern Engulfing su candele OHLC reali; per crypto anche orario oltre a giornaliero), ciascuna validata walk-forward indipendentemente, e sceglie quella con lo score più alto (`src/engine/rules.js`). Il tool non ricalcola l'indicatore: riporta il verdetto già verificato dal client (quale strategia ha vinto, se è rialzista, la confidenza dal win rate fuori campione) — non lo inventa, lo formatta. `available:false` se nessuna strategia è validata per quel simbolo in quel momento.
- **Risk Manager** (`server/mcp/tools/riskManagerAgent.js`): riceve un'istantanea del conto demo (equity, cash, esposizione, drawdown, posizioni aperte/slot liberi) e produce una tesi. Consultivo soltanto — vedi invariante sotto.
- **Fundamental** (`server/mcp/tools/fundamentalAgent.js`): notizie reali (Finnhub `/company-news`, solo titoli azionari, stessa chiave gratuita già supportata per i prezzi live) passate come evidenza qualitativa al modello — mai un gate quantitativo, non ha senso backtestare un titolo di giornale.
- **Hedge** (`server/mcp/tools/hedgeAgent.js`): correlazione di Pearson reale sui rendimenti giornalieri tra il simbolo candidato e gli altri simboli/posizioni aperte — segnala rischio di concentrazione, mai un blocco automatico.
- **Market Regime, Liquidity** (`server/mcp/tools/unavailableAgents.js`): unici ancora onestamente `available:false, risk_flags:['no-data-source']` — nessun feed gratuito di regime/volatilità o order-flow collegato oggi.
- **Audit Sentinel**: prepara il record di decisione (timestamp, simbolo) che l'audit trail dell'app salva già lato client.

**Selezione adattiva delle strategie** (`src/engine/learning.js`): ogni trade chiuso aggiorna il track record realizzato (non un backtest) della strategia+timeframe che lo ha generato; quando il campione live raggiunge 10 trade, una strategia che smette di reggere sui risultati **reali** contro la stessa baseline viene esclusa dalla selezione finché non torna a validare. Non è training di un modello generativo — è verifica continua sugli esiti veri, stessa disciplina statistica del backtest walk-forward.

Il frontend (`src/services/aiProviders.js`) non chiama più Google direttamente: invia `POST /api/agent-decision` al backend locale con simboli, contesto di mercato (prezzo, variazione, storico, flag di validazione) e istantanea di rischio; il backend fa girare l'intera pipeline MCP → modello principale e restituisce i segnali nella stessa forma di prima (`{bullish, defensive, confidence, rationale, fetchedAt}`), verificata end-to-end con una chiamata Gemini reale.

**Invariante non negoziabile, invariato dal design originale**: l'agente Risk Manager (tool MCP) e il Risk Engine (`src/engine/riskGate.js`, lato client) sono cose diverse. Il primo è consultivo, entra nel prompt del modello. Il secondo è l'**unico gate che autorizza davvero un ordine**, eseguito in modo deterministico nel browser dopo qualunque risposta del modello — nessun agente, tool MCP o modello può mai autorizzare da solo un'esecuzione. Il backend genera solo proposte di giudizio, mai ordini.

## Motore AI pluggable

`server/providers/registry.js` espone `providerRegistry`, un registro con la stessa interfaccia per ogni provider (`id`, `label`, `costTier`, `keySource`, `call()`) — ora lato server, non più nel browser. Oggi solo `gemini` è `implemented:true`: `keySource:'client'`, perché è gratuita e l'utente la inserisce nel pannello Impostazioni; il backend la riceve per-richiesta e non la persiste mai. `anthropic` e `openaiCompatible` sono solo interfaccia predisposta (`implemented:false`, lanciano un errore esplicito se chiamati) con `keySource:'server-env'` — una chiave a pagamento vivrebbe solo in `server/.env`, mai nel browser: è la soluzione che mancava quando in sessione avevamo scartato Anthropic proprio per il rischio economico di una chiave esposta lato client. Il frontend (`src/services/aiProviders.js`) mantiene una copia identica del registro solo per riflettere nella UI quali provider sono disponibili — la chiamata vera avviene sempre lato server.

```text
Market data ──> Data & feature service ──> Research agents ──> Supervisor
                                                     │              │
News / fundamentals ─────────────────────────────────┘              v
                                                              Risk Engine (hard gate)
                                                                     │
Audit ledger <── Evidence + decision record <───────────────────────┤
                                                                     v
                                                          Execution gateway
                                                                     │
                                                     Broker adapter / paper broker
                                                                     │
                                                     Trading Platform UI / account
```

## Servizi

| Servizio | Responsabilità | Non può fare |
|---|---|---|
| Market-data | Normalizza prezzi, spread, profondità, corporate actions e news con timestamp | Inventare quotazioni o coprire buchi silenziosamente |
| Research orchestrator | Distribuisce un brief, raccoglie evidenze e produce una tesi strutturata | Inviare ordini |
| Specialist agents | Regime, liquidità, technicals, fondamentali/eventi, correlazioni, hedge | Modificare limiti di rischio |
| Risk engine | Sizing, esposizione, drawdown, stop obbligatorio, slippage, limiti di perdita e kill switch | Usare output testuale AI senza regole verificabili |
| Audit sentinel | Salva input, versione modello, fonti, motivazione, policy ed esito immutabile | Approvare un ordine |
| Execution gateway | Idempotenza, rate limit, doppia conferma live, invio/cancellazione e riconciliazione | Decidere una strategia |
| Broker adapter | Traduce il modello d'ordine interno nelle API di un broker autorizzato | Esporre chiavi API al browser |

## Contratto tra agenti

Ogni agente restituisce JSON validato, non testo libero: `symbol`, `as_of`, `horizon`, `thesis`, `confidence`, `evidence[]`, `invalidation`, `suggested_stop`, `risk_flags[]` e `model_version`.

Il supervisor può proporre un ordine solo se:

1. i dati sono freschi entro la soglia stabilita;
2. sono disponibili evidenze e un livello di confidenza minimo;
3. il Risk Engine approva una proposta completa di size, stop e limite di perdita;
4. l'Audit Sentinel ha salvato il record;
5. in live mode, il titolare dell'account conferma l'ordine.

## Percorso di rilascio

1. **Research-only** — grafici, watchlist, segnali spiegabili e replay storico.
2. **Paper trading** — adapter sandbox, simulazione di slippage/commissioni e riconciliazione giornaliera.
3. **Shadow mode** — confronta gli ordini proposti con il mercato senza inviarli.
4. **Live con limiti stretti** — un broker, un mercato, cap giornaliero, stop automatico e kill switch.
5. **Espansione** — solo dopo metriche out-of-sample, stress test e audit umano indipendente.

## Misure minime prima del live

- Backtest con costi, slippage e periodi fuori campione; evitare leakage e overfitting.
- Paper/shadow trading continuativo e riconciliazione di ordini, posizioni e P&L.
- Segreti solo in vault server-side, MFA e autorizzazioni minime.
- Append-only audit ledger con `decision_id` e `broker_order_id`.
- Kill switch manuale e automatico: perdita giornaliera, anomalie dei dati, volatilità e disconnessione broker.
- Validazione legale/compliance nel Paese del cliente prima di offrire esecuzione o segnali personalizzati.
