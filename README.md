# GT.Code Analytic CAD v1.5.0

Applicazione CAD matematica 2D eseguita interamente nel browser. Permette di inserire funzioni esplicite, equazioni implicite e curve parametriche, calcolare intersezioni numeriche, disegnare entità semplici con snap e trasformare punti o curve campionate in G-code Fanuc G0/G1 sui piani XY, XZ e YZ.

## Novità v1.5.0

- nuovo menu `Piano` e selettore nel postprocessor per lavorare in `XY / G17`, `XZ / G18` o `YZ / G19`;
- rimappatura automatica delle coordinate, delle formule, delle quote, dei dettagli delle entità e dei report quando cambia il piano;
- postprocessor consapevole del piano: movimenti del profilo sui due assi selezionati e avvicinamento/allontanamento sull'asse normale;
- costruzioni geometriche, intersezioni e cerchi tangenti a rette anche inclinate invariati matematicamente e convertiti negli assi fisici del piano scelto;
- progetti precedenti compatibili: in assenza dell'impostazione il piano resta `XY / G17`;
- test automatici aggiunti per trasformazioni di coordinate, formule, report, tangenze inclinate e programmi G-code su tutti e tre i piani.

| Piano | Codice | Assi del profilo | Asse normale / quota sicurezza |
| --- | --- | --- | --- |
| XY | G17 | X, Y | Z |
| XZ | G18 | X, Z | Y |
| YZ | G19 | Y, Z | X |

`G17`, `G18` e `G19` selezionano il piano di interpolazione ma non orientano fisicamente mandrino, testa o utensile. Eventuali assi B/C, testa angolare, TCP e trasformazioni cinematiche macchina devono essere impostati e verificati separatamente. Il post attuale linearizza il profilo con blocchi G0/G1 e mantiene fissa la quota dell'asse normale durante il taglio: non genera una lavorazione simultanea 3D, compensazione raggio utensile o controllo collisioni.

## Correzione v1.4.1

- menu superiori renderizzati sopra il contenitore scorrevole, per garantire apertura e selezione affidabili su Safari/iPhone;
- area del menu mobile estesa all’intera larghezza senza ritaglio del pannello a tendina.

## Novità v1.4.0

- nuovo menu `Interroga` per tangenze, intersezioni, punti, curve e centri di circonferenze;
- ricerca automatica dei contatti fra un cerchio selezionato e tutte le rette tangenti, con marcatori `TG1`, `TG2`…;
- punti interrogati persistenti e nominati sul canvas (`I`, `P`, `Q`, `C`, `E`), rinominabili ed eliminabili;
- creazione automatica dell’equazione analitica implicita di rette e circonferenze disegnate;
- report completo salvabile in `.txt` da `File → Salva report punti intersezione`;
- frecce Undo/Redo visibili anche su iPhone e scorciatoie `Ctrl/⌘+Z`, `Shift+Ctrl/⌘+Z` e `Ctrl+Y`;
- punti interrogati inclusi nei progetti, nel backup locale e nella cronologia Annulla/Ripristina.

## Novità v1.3.0

- costruzione di cerchi tangenti a due rette con raggio noto (`T1 + T2 + R`);
- costruzione equivalente con diametro noto (`T1 + T2 + Ø`);
- fino a quattro tangenze selezionabili direttamente sul canvas: T1/T2 obbligatorie e T3/T4 facoltative;
- calcolo e anteprima delle possibili soluzioni S1–S4, selezionabili anche toccando il cerchio sul disegno;
- shell automaticamente ridotta durante l’acquisizione di punti, rette di tangenza e soluzioni;
- interrogazione completa delle circonferenze con centro X/Y, raggio e diametro;
- caratteri dell’interfaccia aumentati di 2 px.

## Novità v1.2.0

- menu superiori a tendina in stile applicazione desktop (`File`, `Modifica`, `Disegno`, `Interroga`, `Formule`, `Piano`, `Vista`, `Snap`, `CNC`, `Aiuto`);
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
- I report di punti interrogati, tangenze e intersezioni vengono salvati come file `.txt`.
- Il backup automatico locale usa `localStorage` del browser.
- I programmi CNC vengono esportati come file `.NC`.

## Sicurezza CNC

Il G-code generato è un risultato geometrico. Prima dell'esecuzione verificare sempre origine pezzo, unità, piano attivo, quota dell'asse normale, orientamento reale dell'utensile, avanzamenti, staffaggio, direzione, compensazioni e collisioni su un simulatore o sul controllo macchina in modalità sicura.
