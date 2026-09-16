import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
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

const MIN_ZOOM = 0.25
const MAX_ZOOM = 8
const ZOOM_STEP = 1.15

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
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

  const frameRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [panning, setPanning] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  const resetView = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  useEffect(() => {
    resetView()
  }, [src, resetView])

  const zoomBy = useCallback((factor: number, origin?: { x: number; y: number }) => {
    setZoom((prev) => {
      const next = clampZoom(prev * factor)
      if (next === prev) return prev

      if (origin && frameRef.current) {
        const rect = frameRef.current.getBoundingClientRect()
        const cx = origin.x - rect.left - rect.width / 2
        const cy = origin.y - rect.top - rect.height / 2
        const ratio = next / prev
        setPan((p) => ({
          x: cx - (cx - p.x) * ratio,
          y: cy - (cy - p.y) * ratio,
        }))
      }
      return next
    })
  }, [])

  // Non-passive wheel listener so we can prevent page scroll while zooming
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const handler = (event: globalThis.WheelEvent) => {
      if (!src) return
      event.preventDefault()
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
      zoomBy(factor, { x: event.clientX, y: event.clientY })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [src, zoomBy])

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!src || event.button !== 0) return
      const target = event.target as HTMLElement
      if (target.closest('.zoom-controls')) return
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: pan.x,
        originY: pan.y,
      }
      setPanning(true)
    },
    [src, pan.x, pan.y],
  )

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setPan({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    })
  }, [])

  const endPan = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setPanning(false)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // already released
    }
  }, [])

  const onDoubleClick = useCallback(() => {
    if (!src) return
    if (zoom !== 1 || pan.x !== 0 || pan.y !== 0) resetView()
    else zoomBy(2)
  }, [src, zoom, pan.x, pan.y, resetView, zoomBy])

  const zoomPercent = Math.round(zoom * 100)

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

      <div
        ref={frameRef}
        className={`preview-frame ${busy ? 'busy' : ''} ${panning ? 'panning' : ''} ${src ? 'has-image' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onDoubleClick={onDoubleClick}
      >
        {error ? (
          <p className="error">{error}</p>
        ) : src ? (
          <div
            className="preview-transform"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            <img
              src={src}
              alt={showOriginal ? t('originalAlt') : t('previewAlt')}
              draggable={false}
            />
          </div>
        ) : (
          <p className="empty-hint">{t('selectCard')}</p>
        )}
        {busy && <div className="busy-overlay">{t('processing')}</div>}

        {src && (
          <div className="zoom-controls" onPointerDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="secondary compact"
              onClick={() => zoomBy(1 / ZOOM_STEP)}
              title={t('zoomOut')}
              aria-label={t('zoomOut')}
            >
              −
            </button>
            <button
              type="button"
              className="secondary compact zoom-label"
              onClick={resetView}
              title={t('zoomReset')}
            >
              {zoomPercent}%
            </button>
            <button
              type="button"
              className="secondary compact"
              onClick={() => zoomBy(ZOOM_STEP)}
              title={t('zoomIn')}
              aria-label={t('zoomIn')}
            >
              +
            </button>
            <span className="zoom-hint">{t('zoomHint')}</span>
          </div>
        )}
      </div>
    </main>
  )
}
