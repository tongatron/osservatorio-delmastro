# Osservatorio Vicenda Politica

Mini progetto locale per raccogliere articoli recenti su una vicenda politica italiana, aggiungere note editoriali e tenere aggiornata una pagina consultabile nel browser.

## Cosa fa

- cerca articoli via RSS di ricerca di Google News filtrando per keyword e dominio
- conserva titolo, estratto breve, testata, data e link originale
- mostra tutto in una pagina statica leggera
- include un template `launchd` per aggiornare il dataset ogni ora su macOS

## Perche' questo approccio

Lo scraping diretto degli articoli dei giornali e' spesso fragile e puo' scontrarsi con robots, paywall o termini di utilizzo. Qui usiamo un monitoraggio piu' leggero:

- feed RSS di ricerca per intercettare nuovi articoli
- metadati e link, non testo completo
- riassunti e considerazioni scritti in modo originale da te

## Personalizzazione

Modifica [config/watch.json](/Users/tonga/Downloads/Delmastro/config/watch.json):

- `title`, `subtitle`, `topicLabel`
- `keywords`
- `excludedKeywords`
- `googleNewsSites`
- `manualNotes`

La finestra temporale attuale e' di `7` giorni. Con la data di oggi, il progetto raccoglie articoli tra il `24 marzo 2026` e il `31 marzo 2026`.

## Avvio

```bash
npm run update
npm run serve
```

Poi apri `http://localhost:4173`.

## Automazione oraria su macOS

1. Copia [ops/com.delmastro.newswatch.plist](/Users/tonga/Downloads/Delmastro/ops/com.delmastro.newswatch.plist) in `~/Library/LaunchAgents/`.
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
