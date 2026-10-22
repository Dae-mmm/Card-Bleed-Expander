# Card Bleed Expander

Web app to expand playing-card edges for print bleed, rounded corners, and crop marks.

Everything runs **in the browser**. Card images never leave your device — there is no upload and no server-side storage for card files.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/daemmm)

## Stack

- React + Vite
- Client-side image pipeline (Canvas)
- Deployable on [Vercel](https://vercel.com) (static UI + `/api/feedback`)
- [Vercel Analytics](https://vercel.com/docs/analytics)
- Feedback form via Gmail SMTP (Nodemailer)

## Requirements

- Node.js 20+

## Development

```bash
npm install
npm run dev
```

For the feedback API locally, use `vercel dev` (needs the Gmail env vars below).

## Build

```bash
npm run build
```

Output goes to `dist/` (static files). Preview locally with `npm run preview`.

## Deploy on Vercel

Connect the repo and deploy. `vercel.json` rewrites SPA routes while leaving `/api/*` alone.

### Environment variables

| Name | Required | Purpose |
|---|---|---|
| `GMAIL_USER` | Yes (for feedback) | Gmail address used to send mail (SMTP login) |
| `GMAIL_APP_PASSWORD` | Yes (for feedback) | [Google App Password](https://myaccount.google.com/apppasswords) for that account |

Add them under **Project → Settings → Environment Variables**.

Create the app password with 2FA enabled on the Google account. The feedback recipient stays server-side only (never shipped to the browser).

## Usage

1. **Open…** a folder of cards (Chrome/Edge can use the directory picker; other browsers fall back to a folder file dialog)
2. Adjust border/corners, trim, 63×88 size, bleed, RGB/CMYK
3. Pan/zoom the preview (scroll, drag, or `+` / `−`; double-click to reset)
4. Optionally **Choose save folder** (Chromium) — otherwise files download to your Downloads folder
5. **Save** / **Save & next** / **Save all**
6. Use **Feedbacks / issues report** (bottom center) to send private feedback
7. Or **Import list…** to paste a Magic / Pokémon / Yu-Gi-Oh decklist and download art from Scryfall, Pokémon TCG API, or YGOPRODeck into the browser session

## Privacy

Card processing is 100% local after images are on your device. Network requests from the UI:

- `/api/feedback` when the user submits the feedback form (message only; recipient address stays on the server)
- card-database APIs (Scryfall / Pokémon TCG / YGOPRODeck) only when you import a list — images are downloaded into the browser, not uploaded to our servers
