# Osservatorio Caso Delmastro

Mini progetto per raccogliere articoli recenti sul caso Delmastro, pubblicare una rassegna statica su GitHub Pages e mantenere un dataset leggero di titoli, fonti e link.

## Cosa fa

- cerca articoli via RSS di ricerca di Google News filtrando per keyword e dominio
- conserva titolo, estratto breve, testata, data e link originale
- mostra tutto in una pagina statica servita dalla root del repository
- espone nel masthead l'ultimo controllo automatico del workflow
- include un template `launchd` per aggiornare il dataset ogni ora su macOS
- include una GitHub Action schedulata per aggiornare automaticamente `data/articles.json`

## Perche' questo approccio

Lo scraping diretto degli articoli dei giornali e' spesso fragile e puo' scontrarsi con robots, paywall o termini di utilizzo. Qui usiamo un monitoraggio piu' leggero:

- feed RSS di ricerca per intercettare nuovi articoli
- metadati e link, non testo completo
- riassunti e considerazioni scritti in modo originale da te

## Personalizzazione

Modifica [config/watch.json](./config/watch.json):

- `title`, `subtitle`, `topicLabel`
- `keywords`
- `excludedKeywords`
- `googleNewsSites`
- `manualNotes`

La finestra temporale attuale e' di `8` giorni. Con la data di oggi, il progetto raccoglie articoli tra il `23 marzo 2026` e il `31 marzo 2026`.

## Struttura

- [index.html](./index.html), [app.js](./app.js), [styles.css](./styles.css): frontend pubblicato su GitHub Pages
- [data/articles.json](./data/articles.json): dataset articoli generato
- [data/status.json](./data/status.json): timestamp dell'ultimo controllo automatico
- [scripts/update-news.mjs](./scripts/update-news.mjs): generazione dataset
- [config/watch.json](./config/watch.json): keyword, query e fonti

## Avvio locale

```bash
cd /Users/tonga/Documents/GitHub/osservatorio-delmastro
npm run update
npm run serve
```

Poi apri [http://localhost:4173](http://localhost:4173).

## Pubblicazione

La pagina live e':

[https://tongatron.github.io/osservatorio-delmastro/](https://tongatron.github.io/osservatorio-delmastro/)

GitHub Pages pubblica direttamente la root del branch `main`.

## Aggiornamento automatico su GitHub

Il workflow [update-data.yml](./.github/workflows/update-data.yml) esegue:

- avvio manuale da Actions
- aggiornamento schedulato ogni 30 minuti
- `npm run update`
- aggiornamento di [data/status.json](./data/status.json) a ogni check
- commit automatico di `data/articles.json` e `data/status.json` solo se cambia qualcosa

Il masthead mostra `Ultimo controllo ...` leggendo `data/status.json`.

## Automazione oraria su macOS

1. Copia [ops/com.delmastro.newswatch.plist](./ops/com.delmastro.newswatch.plist) in `~/Library/LaunchAgents/`.
2. Caricalo con:

```bash
launchctl load ~/Library/LaunchAgents/com.delmastro.newswatch.plist
```

3. Per riavviare dopo modifiche:

```bash
launchctl unload ~/Library/LaunchAgents/com.delmastro.newswatch.plist
launchctl load ~/Library/LaunchAgents/com.delmastro.newswatch.plist
```

## Nota importante

Per una pagina pubblica e' prudente non ripubblicare testo integrale degli articoli. Usa titolo, estratto breve e link, poi aggiungi i tuoi riassunti originali.
