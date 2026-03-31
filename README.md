# Osservatorio Caso Delmastro

Mini progetto locale per raccogliere articoli recenti sul caso Delmastro, tenere aggiornata una pagina pubblicabile su GitHub Pages e conservare un dataset leggero di titoli, fonti e link.

## Cosa fa

- cerca articoli via RSS di ricerca di Google News filtrando per keyword e dominio
- conserva titolo, estratto breve, testata, data e link originale
- mostra tutto in una pagina statica leggera
- include un template `launchd` per aggiornare il dataset ogni ora su macOS
- include una GitHub Action schedulata per aggiornare `data/articles.json` automaticamente

## Perche' questo approccio

Lo scraping diretto degli articoli dei giornali e' spesso fragile e puo' scontrarsi con robots, paywall o termini di utilizzo. Qui usiamo un monitoraggio piu' leggero:

- feed RSS di ricerca per intercettare nuovi articoli
- metadati e link, non testo completo
- riassunti e considerazioni scritti in modo originale da te

## Personalizzazione

Modifica [config/watch.json](/Users/tonga/Documents/GitHub/osservatorio-delmastro/config/watch.json):

- `title`, `subtitle`, `topicLabel`
- `keywords`
- `excludedKeywords`
- `googleNewsSites`
- `manualNotes`

La finestra temporale attuale e' di `8` giorni. Con la data di oggi, il progetto raccoglie articoli tra il `23 marzo 2026` e il `31 marzo 2026`.

## Avvio

```bash
npm run update
npm run serve
```

Poi apri `http://localhost:4173`.

## Aggiornamento automatico su GitHub

Il workflow [update-data.yml](/Users/tonga/Documents/GitHub/osservatorio-delmastro/.github/workflows/update-data.yml) esegue:

- avvio manuale da Actions
- aggiornamento schedulato ogni ora al minuto `17`
- commit automatico del solo `data/articles.json` quando cambia

## Automazione oraria su macOS

1. Copia [ops/com.delmastro.newswatch.plist](/Users/tonga/Documents/GitHub/osservatorio-delmastro/ops/com.delmastro.newswatch.plist) in `~/Library/LaunchAgents/`.
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
