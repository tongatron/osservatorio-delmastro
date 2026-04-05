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
- `npm run update`
- aggiornamento di [data/status.json](./data/status.json) a ogni check
- commit automatico di `data/articles.json` e `data/status.json` solo se cambia qualcosa

Il masthead mostra `Ultimo controllo ...` leggendo `data/status.json`.

La schedulazione automatica da GitHub Actions e' stata disattivata per evitare due writer sul branch `main` quando il job periodico gira sulla Raspberry. La Action resta come fallback manuale.

## Deploy su Raspberry

Percorso previsto sulla Raspberry:

```bash
/srv/apps/osservatorio-delmastro
```

File aggiunti per l'automazione:

- [ops/run-on-raspberry.sh](./ops/run-on-raspberry.sh): fa `git pull --rebase`, aggiorna il dataset, registra `data/status.json`, committa e prova il push
- [ops/delmastro-newswatch.service](./ops/delmastro-newswatch.service): unita' `systemd`
- [ops/delmastro-newswatch.timer](./ops/delmastro-newswatch.timer): timer `systemd` ogni 30 minuti

Flusso previsto:

1. la Raspberry sincronizza sempre `origin/main` prima dell'update
2. esegue `npm run update`
3. aggiorna `data/status.json` con timestamp e origine (`raspberry.local` o `github-actions`)
4. committa solo se `data/articles.json` o `data/status.json` sono cambiati
5. esegue `git push`

Questo copre anche eventuali articoli gia' caricati in remoto prima dell'esecuzione del job sulla Raspberry, perche' il repository viene riallineato a `origin/main` prima di generare il nuovo dataset.

## Installazione del timer sulla Raspberry

Dopo il clone del repository sulla Raspberry:

```bash
cd /srv/apps/osservatorio-delmastro
chmod +x ops/run-on-raspberry.sh
sudo cp ops/delmastro-newswatch.service /etc/systemd/system/
sudo cp ops/delmastro-newswatch.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now delmastro-newswatch.timer
sudo systemctl start delmastro-newswatch.service
```

Prima di attivare davvero il timer serve una credenziale GitHub non interattiva sulla Raspberry, altrimenti il `git push` fallisce. La strada piu' semplice e' usare una deploy key SSH con permesso di scrittura sul repository:

1. genera una chiave dedicata sulla Raspberry
2. aggiungi la chiave pubblica nelle impostazioni GitHub del repository come deploy key con `Allow write access`
3. verifica il push manuale
4. abilita il timer con `sudo systemctl enable --now delmastro-newswatch.timer`

Verifica:

```bash
systemctl status delmastro-newswatch.timer
systemctl list-timers --all | grep delmastro
journalctl -u delmastro-newswatch.service -f
```

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
