# GT.Code Analytic CAD v1.0.0

Applicazione CAD matematica 2D eseguita interamente nel browser. Permette di inserire funzioni esplicite, equazioni implicite e curve parametriche, calcolare intersezioni numeriche, disegnare entità semplici con snap e trasformare punti o curve campionate in G-code Fanuc G0/G1.

- Repository: https://github.com/lucata76-beep/gtcode-analytic-cad
- Applicazione: https://lucata76-beep.github.io/gtcode-analytic-cad/

## Avvio locale

Requisiti: Node.js 22 o successivo.

```bash
npm install
npm run dev
```

Build verificata:

```bash
npm ci
npm run build
npm run preview
```

## Pubblicazione con GitHub Pages

Il workflow `.github/workflows/deploy-pages.yml` compila e pubblica automaticamente l'app a ogni push sul branch `main`.

Nel repository GitHub aprire **Settings → Pages** e impostare **Source: GitHub Actions**. Il sito sarà disponibile all'indirizzo:

```text
https://NOME-UTENTE.github.io/NOME-REPOSITORY/
```

## File e dati

- I progetti vengono salvati come file `.gtcad`/JSON tramite il selettore file o il menu Condividi del dispositivo.
- Il backup automatico locale usa `localStorage` del browser.
- I programmi CNC vengono esportati come file `.NC`.

## Sicurezza CNC

Il G-code generato è un risultato geometrico. Prima dell'esecuzione verificare sempre origine pezzo, unità, quote Z, utensile, avanzamenti, staffaggio, direzione, compensazioni e collisioni su un simulatore o sul controllo macchina in modalità sicura.
