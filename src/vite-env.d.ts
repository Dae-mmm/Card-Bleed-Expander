/// <reference types="vite/client" />

import type { CardBleedApi } from '../electron/preload'

declare global {
  interface Window {
    cardBleed: CardBleedApi
  }
}

export {}
