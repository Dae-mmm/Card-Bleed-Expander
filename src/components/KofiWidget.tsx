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

export function KofiWidget() {
  useEffect(() => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${KOFI_SCRIPT}"]`)
    const draw = () => {
      window.kofiWidgetOverlay?.draw('daemmm', {
        type: 'floating-chat',
        'floating-chat.donateButton.text': 'Support me',
        'floating-chat.donateButton.background-color': '#fcbf47',
        'floating-chat.donateButton.text-color': '#323842',
      })
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
