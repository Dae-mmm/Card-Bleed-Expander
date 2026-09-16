# Card Bleed Expander

Web app to expand playing-card edges for print bleed, rounded corners, and crop marks.

Everything runs **in the browser**. Card images never leave your device — there is no upload and no server-side storage for card files.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/daemmm)

## Stack

- React + Vite
- Client-side image pipeline (Canvas)
- Deployable on [Vercel](https://vercel.com) (static UI + `/api/feedback`)
- [Vercel Analytics](https://vercel.com/docs/analytics)
- Feedback form via [Resend](https://resend.com)

## Requirements

- Node.js 20+

## Development

```bash
npm install
npm run dev
```

For the feedback API locally, use `vercel dev` (needs `RESEND_API_KEY` in the environment).

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
| `RESEND_API_KEY` | Yes (for feedback) | Resend API key |
| `RESEND_FROM_EMAIL` | Optional | Verified sender, e.g. `Card Bleed <noreply@yourdomain.com>`. Defaults to `beth.t@example.com` for testing. |

Add them under **Project → Settings → Environment Variables**.

## Usage

1. **Open…** a folder of cards (Chrome/Edge can use the directory picker; other browsers fall back to a folder file dialog)
2. Adjust border/corners, trim, 63×88 size, bleed, RGB/CMYK
3. Pan/zoom the preview (scroll, drag, or `+` / `−`; double-click to reset)
4. Optionally **Choose save folder** (Chromium) — otherwise files download to your Downloads folder
5. **Save** / **Save & next** / **Save all**
6. Use **Feedbacks / issues report** (bottom center) to send private feedback

## Privacy

Card processing is 100% local. Network requests from the UI:

- optional Ko-fi widget script
- Vercel Analytics
- `/api/feedback` when the user submits the feedback form (message only; recipient address stays on the server)
