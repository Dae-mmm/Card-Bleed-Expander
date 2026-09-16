import { useEffect } from 'react'

declare global {
  interface Window {
    kofiWidgetOverlay?: {
      draw: (
        username: string,
        options: Record<string, string>,
      ) => void
    }
  }
}

const KOFI_SCRIPT = 'https://storage.ko-fi.com/cdn/scripts/overlay-widget.js'
const KOFI_STYLE_ID = 'kofi-position-override'

function ensureKofiPositionStyle() {
  if (document.getElementById(KOFI_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = KOFI_STYLE_ID
  style.textContent = `
    .floatingchat-container-wrap,
    .floatingchat-container-wrap-mobi {
      left: 16px !important;
      right: auto !important;
      bottom: 14px !important;
      z-index: 40 !important;
    }
    .floating-chat-kofi-popup-iframe,
    .floating-chat-kofi-popup-iframe-mobi,
    .floating-chat-kofi-popup-iframe-container,
    .floating-chat-kofi-popup-iframe-container-mobi {
      left: 16px !important;
      right: auto !important;
    }
  `
  document.head.appendChild(style)
}

export function KofiWidget() {
  useEffect(() => {
    ensureKofiPositionStyle()

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${KOFI_SCRIPT}"]`)
    const draw = () => {
      window.kofiWidgetOverlay?.draw('daemmm', {
        type: 'floating-chat',
        'floating-chat.donateButton.text': 'Support me',
        'floating-chat.donateButton.background-color': '#fcbf47',
        'floating-chat.donateButton.text-color': '#323842',
      })
      // Widget may inject after draw; re-assert position shortly after.
      window.setTimeout(ensureKofiPositionStyle, 50)
      window.setTimeout(ensureKofiPositionStyle, 400)
    }

    if (existing) {
      if (window.kofiWidgetOverlay) draw()
      else existing.addEventListener('load', draw)
      return
    }

    const script = document.createElement('script')
    script.src = KOFI_SCRIPT
    script.async = true
    script.addEventListener('load', draw)
    document.body.appendChild(script)

    return () => {
      script.removeEventListener('load', draw)
    }
  }, [])

  return null
}
