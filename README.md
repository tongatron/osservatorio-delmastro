# Osservatorio Caso Delmastro

**[→ tongatron.github.io/osservatorio-delmastro](https://tongatron.github.io/osservatorio-delmastro/)**

Raccoglie articoli recenti sul caso Delmastro da Google News RSS, li pubblica in una pagina statica su GitHub Pages e li aggiorna automaticamente ogni 30 minuti tramite GitHub Actions.

## Come funziona

- GitHub Actions interroga Google News RSS ogni 30 minuti
- salva titolo, estratto, testata, data e link in `data/articles.json`
- fa il deploy su GitHub Pages solo se ci sono articoli nuovi

## Configurazione

Modifica [`config/watch.json`](./config/watch.json) per cambiare keyword, fonti e finestra temporale.

## Workflow

| File | Funzione |
|---|---|
| [`.github/workflows/update-data.yml`](./.github/workflows/update-data.yml) | aggiornamento automatico ogni 30 minuti |
| [`.github/workflows/backfill.yml`](./.github/workflows/backfill.yml) | recupero articoli storici da una data specifica |

## Anteprima locale

```bash
npm run update   # aggiorna articles.json
npm run serve    # avvia server su localhost:4173
```
