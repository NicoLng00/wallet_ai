# Sandbox di ricerca (Python) — isolata dal sistema live

## Garanzia di isolamento, non negoziabile

Nessuno script in questa cartella:
- scrive mai su `data/account.json` o `data/research.json`;
- gira mai in un job GitHub Actions esistente (`daily-setup.yml`, `trading-cycle.yml`);
- è mai importato da `server/` o da `src/`.

Se un giorno questa cartella venisse cancellata per intero, il sistema live (bot autonomo,
dashboard pubblicata, conto demo) non se ne accorgerebbe in nessun modo. È una sandbox di
esplorazione per uso umano (o di Claude su richiesta esplicita), non una dipendenza di
produzione — coerente con la decisione già presa di non riscrivere il motore in Python (vedi
l'audit architetturale e la roadmap di ottimizzazione).

## Perché esiste

Il motore JS di produzione (`src/engine/*`) reimplementa a mano indicatori, split walk-forward e
gate statistico. Va bene per un motore che deve girare identico nel browser e in un job headless
— ma per **esplorare** ipotesi in fretta, con rigore statistico maggiore (correzione per test
multipli, backtest di portafoglio con correlazioni reali), un ecosistema maturo (pandas, NumPy,
statsmodels, un framework di backtest testato) è più adatto. Un'idea che nasce qui non diventa
mai automaticamente una strategia live: deve prima essere riportata a mano in
`src/engine/strategies.js` e superare lo stesso gate walk-forward di sempre.

## Prima regola: non fidarti di questa sandbox finché non si è dimostrata corretta

Prima di usarla per qualunque nuova ipotesi, esegui `verify/reproduce_spy_bollinger.py` — rifà,
in modo indipendente, il backtest walk-forward reale di `bollinger_reversion@1D` su SPY (oggi
**validato** in produzione) usando dati scaricati di nuovo dalle stesse fonti gratuite (Yahoo
Finance). Se il risultato non torna, entro un margine di arrotondamento ragionevole, con quello
del motore JS — **la sandbox non è ancora affidabile**, si corregge lì prima di fare qualunque
altra cosa.

## Setup

```bash
cd research
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python verify/reproduce_spy_bollinger.py
```

## Stato

Non ancora eseguito: **Python non è installato sulla macchina usata per costruire questa
sandbox** (verificato: `python3`/`python` non trovati). Lo scaffolding e la logica sono pronti e
scritti con la stessa disciplina del resto del progetto (stessa formula di Bollinger, stesso
stop/target percentuale, stesso split 70/30 di `runSplitBacktest`), ma la verifica di
riproducibilità — il passo che rende questa sandbox affidabile — **deve ancora essere eseguita**
su una macchina con Python, prima di usarla per qualunque nuova esplorazione.
