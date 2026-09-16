# Card Bleed Expander

Web app to expand playing-card edges for print bleed, rounded corners, and crop marks.

Everything runs **in the browser**. Card images never leave your device — there is no upload and no server-side storage.

## Stack

- React + Vite
- Client-side image pipeline (Canvas)
- Deployable as a static site on [Vercel](https://vercel.com)

> If Electron doesn’t start and you see errors about `app.whenReady`, make sure `ELECTRON_RUN_AS_NODE` is not set (the `dev` script already clears it).

### Package for distribution

Prepare typecheck + build + native sharp binaries (Mac arm64/x64 + Windows x64):

```bash
npm install
npm run dev
```

This produces:

- `dist/` (UI)
- `dist-electron/` (main/preload)
- `@img/sharp-*` modules for Mac and Windows under `node_modules`

Then create installers:

```bash
# Mac only
npm run dist:mac

# Windows only
npm run dist:win

# Both
npm run dist
```

Artifacts land in `release/` (current version **1.1.0**):

| Platform | Typical files |
|---|---|
| Mac Apple Silicon | `Card Bleed Expander-1.1.0-arm64.dmg` |
| Mac Intel | `Card Bleed Expander-1.1.0.dmg` |
| Windows installer | `Card Bleed Expander Setup 1.1.0.exe` |
| Windows portable | `Card Bleed Expander 1.1.0.exe` |

### Packaging notes

- The `sharp:platforms` script is required before Windows/Mac cross-builds: otherwise Darwin binaries remain and the app won’t process images on PC.
- On Mac, Gatekeeper may warn on first launch (unsigned app). Right-click → **Open**, or:
  ```bash
  xattr -cr "/Applications/Card Bleed Expander.app"
  ```
- On Windows, SmartScreen may show a warning until the exe is signed.

---

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/M5Y42735ZD)
