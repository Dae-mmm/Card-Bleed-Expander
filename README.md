# Card Bleed Expander

App desktop per espandere i bordi delle carte da gioco con margini di stampa (bleed), correzione angoli stondati e crocini di taglio.

## Requisiti

- Node.js 20+
- macOS (per creare anche i pacchetti Mac)

## Avvio sviluppo

```bash
npm install
npm run dev
```

> Se Electron non parte e vedi errori su `app.whenReady`, assicurati che `ELECTRON_RUN_AS_NODE` non sia impostata (lo script `dev` la azzera già).

## Pacchetto pronto per la dist

Prepara typecheck + build + binari nativi sharp (Mac arm64/x64 + Windows x64):

```bash
npm install
npm run pack
```

Questo produce:
- `dist/` (UI)
- `dist-electron/` (main/preload)
- moduli `@img/sharp-*` per Mac e Windows in `node_modules`

Poi crea gli installabili:

```bash
# Solo Mac
npm run dist:mac

# Solo Windows
npm run dist:win

# Entrambi
npm run dist
```

Gli artefatti finiscono in `release/` (versione attuale **1.1.0**):

| Piattaforma | File tipici |
|---|---|
| Mac Apple Silicon | `Card Bleed Expander-1.1.0-arm64.dmg` |
| Mac Intel | `Card Bleed Expander-1.1.0.dmg` |
| Windows installer | `Card Bleed Expander Setup 1.1.0.exe` |
| Windows portable | `Card Bleed Expander 1.1.0.exe` |

### Note packaging

- Lo script `sharp:platforms` è obbligatorio prima della dist Windows/Mac cross: altrimenti su PC restano i binari Darwin e l’app non elabora le immagini.
- Su Mac, al primo avvio Gatekeeper può avvisare (app non firmata). Tasto destro → Apri, oppure:
  ```bash
  xattr -cr "/Applications/Card Bleed Expander.app"
  ```
- Su Windows SmartScreen può mostrare un avviso finché l’exe non è firmato.

## Uso rapido

1. **Apri…** una cartella di carte
2. Regola bordo/angoli, taglio, misura 63×88, bleed, RGB/CMYK
3. **Salva** / **Salva e successiva** / **Salva tutto** (⇧Invio)
4. Output in `output/` accanto alla cartella sorgente (PNG o TIFF CMYK)
