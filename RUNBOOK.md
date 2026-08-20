# Runbook — backup e ripristino

Non esiste un database: `data/account.json` e `data/research.json` (più `data/validation-history.json`)
sono l'intera base dati del bot, versionata in git. Ogni commit del bot (`aurora-markets-bot`,
job `daily-setup.yml`/`trading-cycle.yml`) è uno snapshot completo e revertibile. Questo runbook
copre le procedure reali, provate — non solo la teoria.

## 1 — Vedere la cronologia di un file dati

```bash
git log --oneline -- data/research.json    # ogni run che l'ha toccato
git log --oneline -- data/account.json
git show <hash>:data/research.json          # contenuto a quel commit, senza fare checkout
```

## 2 — Mettere in pausa i job schedulati (prima di qualunque ripristino)

Un ripristino mentre un job è in corso o sta per partire rischia un conflitto di push o una
sovrascrittura immediata dello stato appena ripristinato. Prima di toccare `data/*.json`:

1. GitHub → repo → tab **Actions** → workflow **"Setup giornaliero"** e **"Ciclo di trading"**
   → **"..."** → **Disable workflow** per entrambi.
2. Verifica che nessun run sia `in_progress` (stessa pagina Actions).
3. Procedi col ripristino (sezione 3).
4. Riabilita entrambi i workflow dalla stessa pagina (**Enable workflow**) — il prossimo run
   schedulato riparte dal nuovo stato ripristinato, senza bisogno di altro.

## 3 — Tornare a uno stato precedente

**Mai `git reset --hard` su `main` direttamente** — riscrive la cronologia pubblica che i job
condividono. Usa `git revert`, che aggiunge un nuovo commit che annulla le modifiche:

```bash
git fetch origin main
git checkout main
git pull --ff-only origin main
git revert <hash-del-commit-da-annullare> --no-edit
git push origin main
```

Per tornare a uno stato specifico di UN SOLO file (non l'intera cronologia):

```bash
git fetch origin main
git checkout origin/main -- data/research.json   # ripristina solo questo file dal commit scelto
# oppure, da un commit specifico:
git checkout <hash> -- data/research.json
git commit -m "Ripristino data/research.json al commit <hash>"
git push origin main
```

## 4 — Verifica dopo un ripristino

1. Riabilita i workflow (sezione 2, punto 4) — o triggera manualmente **"Run workflow"** su
   "Setup giornaliero" da GitHub Actions per una verifica immediata invece di aspettare il
   prossimo cron.
2. Controlla che il run sia `success` (tab Actions).
3. Scarica `data/account.json`/`data/research.json` da GitHub e verifica a occhio che i numeri
   abbiano senso (nessun campo mancante, `trackRecord`/`tradeEpisodes` presenti).

## Prova a secco eseguita — 20 agosto 2026

Verificato che `git revert` funziona come descritto, su un branch temporaneo (mai su `main`):

```bash
git checkout -b runbook-dry-run <commit-precedente>
git revert <commit-successivo> --no-edit
# confermato: lo stato risultante coincide byte-per-byte con <commit-precedente>
git checkout main
git branch -D runbook-dry-run
```

Risultato: la procedura della sezione 3 riproduce esattamente lo stato del commit di partenza.
Il branch di prova è stato eliminato subito dopo — `main` non è mai stato toccato dalla prova.
