/** True when running inside the Tauri desktop app (Windows build). */
export const isDesktopApp =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** Public site — the desktop app calls its serverless API (feedback). */
const WEB_ORIGIN = 'https://card-bleed-expander.vercel.app'

/** Resolve an `/api/...` path: relative on the web, absolute in the desktop app. */
export function apiUrl(path: string): string {
  return isDesktopApp ? `${WEB_ORIGIN}${path}` : path
}
