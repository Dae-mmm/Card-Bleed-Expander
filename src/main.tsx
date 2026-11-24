import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import App from './App'
import { I18nProvider } from './i18n'
import { isDesktopApp } from './lib/platform'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
      {/* Vercel Analytics only exists on the hosted site */}
      {!isDesktopApp && <Analytics />}
    </I18nProvider>
  </StrictMode>,
)
