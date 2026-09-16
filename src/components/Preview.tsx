import { useI18n } from '../i18n'

interface PreviewProps {
  previewUrl: string | null
  originalUrl: string | null
  showOriginal: boolean
  onToggleOriginal: (value: boolean) => void
  busy: boolean
  fileLabel: string | null
  metaLabel: string | null
  error: string | null
}

export function Preview({
  previewUrl,
  originalUrl,
  showOriginal,
  onToggleOriginal,
  busy,
  fileLabel,
  metaLabel,
  error,
}: PreviewProps) {
  const { t, locale, setLocale, locales } = useI18n()
  const src = showOriginal ? originalUrl : previewUrl

  return (
    <main className="preview-stage">
      <header className="preview-toolbar">
        <div>
          <h1>{t('appTitle')}</h1>
          {fileLabel && (
            <p className="preview-meta">
              {fileLabel}
              {metaLabel ? ` · ${metaLabel}` : ''}
            </p>
          )}
        </div>
        <div className="toolbar-right">
          <label className="lang-select">
            <span className="lang-label">{t('language')}</span>
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as typeof locale)}
              aria-label={t('language')}
            >
              {locales.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showOriginal}
              onChange={(e) => onToggleOriginal(e.target.checked)}
              disabled={!originalUrl}
            />
            {t('showOriginal')}
          </label>
        </div>
      </header>

      <div className={`preview-frame ${busy ? 'busy' : ''}`}>
        {error ? (
          <p className="error">{error}</p>
        ) : src ? (
          <img src={src} alt={showOriginal ? t('originalAlt') : t('previewAlt')} />
        ) : (
          <p className="empty-hint">{t('selectCard')}</p>
        )}
        {busy && <div className="busy-overlay">{t('processing')}</div>}
      </div>
    </main>
  )
}
