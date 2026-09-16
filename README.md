# Card Bleed Expander

Web app to expand playing-card edges for print bleed, rounded corners, and crop marks.

Everything runs **in the browser**. Card images never leave your device — there is no upload and no server-side storage.

## Stack

- React + Vite
- Client-side image pipeline (Canvas)
- Deployable as a static site on [Vercel](https://vercel.com)

## Requirements

- Node.js 20+

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Output goes to `dist/` (static files). Preview locally with `npm run preview`.

## Deploy on Vercel

Connect the repo and deploy. `vercel.json` is already set for SPA routing. No serverless functions or storage required.

## Usage

1. **Open…** a folder of cards (Chrome/Edge can use the directory picker; other browsers fall back to a folder file dialog)
2. Adjust border/corners, trim, 63×88 size, bleed, RGB/CMYK
3. Optionally **Choose save folder** (Chromium) — otherwise files download to your Downloads folder
4. **Save** / **Save & next** / **Save all**

## Privacy

Processing is 100% local. The only network request from the app UI is the optional Ko-fi support widget script.
