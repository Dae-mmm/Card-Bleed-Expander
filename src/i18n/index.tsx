import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import en from './locales/en'
import it from './locales/it'
import es from './locales/es'
import fr from './locales/fr'
import de from './locales/de'
import ru from './locales/ru'
import zh from './locales/zh'
import {
  DEFAULT_LOCALE,
  LOCALES,
  type Dictionary,
  type Locale,
  type TranslationKey,
} from './types'

const dictionaries: Record<Locale, Dictionary> = { en, it, es, fr, de, ru, zh }

const STORAGE_KEY = 'card-bleed-locale'

function readStoredLocale(): Locale {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && raw in dictionaries) return raw as Locale
  } catch {
    // ignore
  }
  return DEFAULT_LOCALE
}

function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] !== undefined ? String(vars[key]) : `{${key}}`,
  )
}

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
  locales: typeof LOCALES
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale())

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore
    }
  }, [])

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      const dict = dictionaries[locale] ?? dictionaries.en
      const fallback = dictionaries.en[key]
      return format(dict[key] ?? fallback ?? key, vars)
    },
    [locale],
  )

  const value = useMemo(
    () => ({ locale, setLocale, t, locales: LOCALES }),
    [locale, setLocale, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}

export { LOCALES, DEFAULT_LOCALE }
export type { Locale, TranslationKey }
