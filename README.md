# GT.Code Analytic CAD v1.3.0

Applicazione CAD matematica 2D eseguita interamente nel browser. Permette di inserire funzioni esplicite, equazioni implicite e curve parametriche, calcolare intersezioni numeriche, disegnare entità semplici con snap e trasformare punti o curve campionate in G-code Fanuc G0/G1.

## Novità v1.3.0

- costruzione di cerchi tangenti a due rette con raggio noto (`T1 + T2 + R`);
- costruzione equivalente con diametro noto (`T1 + T2 + Ø`);
- fino a quattro tangenze selezionabili direttamente sul canvas: T1/T2 obbligatorie e T3/T4 facoltative;
- calcolo e anteprima delle possibili soluzioni S1–S4, selezionabili anche toccando il cerchio sul disegno;
- shell automaticamente ridotta durante l’acquisizione di punti, rette di tangenza e soluzioni;
- interrogazione completa delle circonferenze con centro X/Y, raggio e diametro;
- caratteri dell’interfaccia aumentati di 2 px.

## Novità v1.2.0

- menu superiori a tendina in stile applicazione desktop (`File`, `Modifica`, `Disegno`, `Formule`, `Vista`, `Snap`, `CNC`, `Aiuto`);
- shell di costruzione per rette definite da due punti oppure da punto, angolo e lunghezza;
- shell di costruzione per cerchi passanti per tre punti, con centro e due punti equidistanti, oppure con centro e tangenza automatica a una retta selezionata;
- acquisizione dei punti direttamente dal canvas con snap dinamici a estremità, punti medi, centri, intersezioni, punti vicini e tangenze;
- tastiera CAD integrata con numeri, virgola decimale e segno meno;
- anteprima geometrica in tempo reale e validazione prima della creazione;
- guida operativa completa accessibile dal menu `Aiuto`.

## Funzioni già presenti dalla v1.1.0

- barra degli strumenti di disegno verticale sul lato destro;
- selezione evidenziata e cancellazione affidabile di curve, rette, cerchi, punti e profili;
- cancellazione tramite cestino, pannello proprietà e tasti `Canc`/`Backspace`;
- taglio intelligente della porzione scelta tra le intersezioni;
- pannelli laterali su iPhone al posto delle finestre agganciate in basso;
- caratteri e controlli più leggibili.

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
