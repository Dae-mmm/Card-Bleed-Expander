import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
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
const FIT_PADDING = 16
const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_SLOP = 28

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
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
  const imgRef = useRef<HTMLImageElement>(null)

  /** User zoom relative to fit (1 = fit). */
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [panning, setPanning] = useState(false)
  const [pinching, setPinching] = useState(false)
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })
  const [frameSize, setFrameSize] = useState({ w: 0, h: 0 })

  const pointersRef = useRef(
    new Map<number, { x: number; y: number }>(),
  )
  const panDragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const pinchRef = useRef<{
    startDistance: number
    startZoom: number
    startPan: { x: number; y: number }
    startMid: { x: number; y: number }
  } | null>(null)
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null)
  const zoomRef = useRef(zoom)
  const panRef = useRef(pan)
  zoomRef.current = zoom
  panRef.current = pan

  const fitScale = useMemo(() => {
    if (!imgSize.w || !imgSize.h || !frameSize.w || !frameSize.h) return 1
    const availW = Math.max(1, frameSize.w - FIT_PADDING)
    const availH = Math.max(1, frameSize.h - FIT_PADDING)
    return Math.min(availW / imgSize.w, availH / imgSize.h)
  }, [imgSize, frameSize])

  const displayScale = fitScale * zoom

  const zoomToFit = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  // Measure frame
  useLayoutEffect(() => {
    const el = frameRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setFrameSize({ w: rect.width, h: rect.height })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Reset to fit whenever the displayed image changes
  useEffect(() => {
    zoomToFit()
    setImgSize({ w: 0, h: 0 })
  }, [src, zoomToFit])

  const onImgLoad = useCallback(() => {
    const img = imgRef.current
    if (!img) return
    setImgSize({
      w: img.naturalWidth || img.width,
      h: img.naturalHeight || img.height,
    })
    zoomToFit()
  }, [zoomToFit])

  const applyZoomAt = useCallback(
    (nextZoom: number, clientOrigin?: { x: number; y: number }) => {
      const prev = zoomRef.current
      const next = clampZoom(nextZoom)
      if (next === prev) return

      if (clientOrigin && frameRef.current) {
        const rect = frameRef.current.getBoundingClientRect()
        const cx = clientOrigin.x - rect.left - rect.width / 2
        const cy = clientOrigin.y - rect.top - rect.height / 2
        const ratio = next / prev
        const p = panRef.current
        setPan({
          x: cx - (cx - p.x) * ratio,
          y: cy - (cy - p.y) * ratio,
        })
      }
      setZoom(next)
    },
    [],
  )

  const zoomBy = useCallback(
    (factor: number, origin?: { x: number; y: number }) => {
      applyZoomAt(zoomRef.current * factor, origin)
    },
    [applyZoomAt],
  )

  // Wheel zoom
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const handler = (event: WheelEvent) => {
      if (!src) return
      event.preventDefault()
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
      zoomBy(factor, { x: event.clientX, y: event.clientY })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [src, zoomBy])

  // Native touch listeners for pinch (non-passive) + prevent browser page zoom
  useEffect(() => {
    const el = frameRef.current
    if (!el) return

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length >= 2) event.preventDefault()
    }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [])

  const syncPointersFromEvent = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
  }

  const beginPinch = () => {
    const pts = [...pointersRef.current.values()]
    if (pts.length < 2) return
    const [a, b] = pts
    pinchRef.current = {
      startDistance: Math.max(1, distance(a, b)),
      startZoom: zoomRef.current,
      startPan: { ...panRef.current },
      startMid: midpoint(a, b),
    }
    panDragRef.current = null
    setPinching(true)
    setPanning(false)
  }

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!src) return
      const target = event.target as HTMLElement
      if (target.closest('.zoom-controls')) return

      // Double-tap → zoom to fit (mobile + desktop)
      if (event.pointerType !== 'mouse' || event.detail === 0) {
        const now = performance.now()
        const last = lastTapRef.current
        if (
          last &&
          now - last.t < DOUBLE_TAP_MS &&
          Math.hypot(event.clientX - last.x, event.clientY - last.y) < DOUBLE_TAP_SLOP
        ) {
          lastTapRef.current = null
          zoomToFit()
          event.preventDefault()
          return
        }
        lastTapRef.current = { t: now, x: event.clientX, y: event.clientY }
      }

      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // ignore
      }
      syncPointersFromEvent(event)

      if (pointersRef.current.size >= 2) {
        beginPinch()
        return
      }

      if (event.button !== 0 && event.pointerType === 'mouse') return
      panDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: panRef.current.x,
        originY: panRef.current.y,
      }
      setPanning(true)
    },
    [src, zoomToFit],
  )

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId) && !panDragRef.current) return
    if (pointersRef.current.has(event.pointerId)) {
      syncPointersFromEvent(event)
    }

    const pts = [...pointersRef.current.values()]
    if (pts.length >= 2 && pinchRef.current) {
      const [a, b] = pts
      const pinch = pinchRef.current
      const dist = Math.max(1, distance(a, b))
      const mid = midpoint(a, b)
      const nextZoom = clampZoom(pinch.startZoom * (dist / pinch.startDistance))

      const frame = frameRef.current
      if (frame) {
        const rect = frame.getBoundingClientRect()
        const startCx = pinch.startMid.x - rect.left - rect.width / 2
        const startCy = pinch.startMid.y - rect.top - rect.height / 2
        const cx = mid.x - rect.left - rect.width / 2
        const cy = mid.y - rect.top - rect.height / 2
        const ratio = nextZoom / pinch.startZoom
        // Keep the content under the pinch midpoint stable, then follow finger mid movement
        setPan({
          x: cx - (startCx - pinch.startPan.x) * ratio,
          y: cy - (startCy - pinch.startPan.y) * ratio,
        })
      }
      setZoom(nextZoom)
      return
    }

    const drag = panDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setPan({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    })
  }, [])

  const endPointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // already released
    }

    if (panDragRef.current?.pointerId === event.pointerId) {
      panDragRef.current = null
      setPanning(false)
    }

    if (pointersRef.current.size < 2) {
      pinchRef.current = null
      setPinching(false)
    }

    // If one pointer remains, resume pan from current position
    if (pointersRef.current.size === 1) {
      const [id, pt] = [...pointersRef.current.entries()][0]
      panDragRef.current = {
        pointerId: id,
        startX: pt.x,
        startY: pt.y,
        originX: panRef.current.x,
        originY: panRef.current.y,
      }
      setPanning(true)
    }
  }, [])

  const onDoubleClick = useCallback(
    (event: ReactMouseEvent) => {
      if (!src) return
      event.preventDefault()
      zoomToFit()
    },
    [src, zoomToFit],
  )

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
        className={`preview-frame ${busy ? 'busy' : ''} ${panning ? 'panning' : ''} ${pinching ? 'pinching' : ''} ${src ? 'has-image' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onDoubleClick={onDoubleClick}
      >
        {error ? (
          <p className="error">{error}</p>
        ) : src ? (
          <div
            className="preview-transform"
            style={{
              width: imgSize.w || undefined,
              height: imgSize.h || undefined,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${displayScale})`,
            }}
          >
            <img
              ref={imgRef}
              src={src}
              alt={showOriginal ? t('originalAlt') : t('previewAlt')}
              draggable={false}
              onLoad={onImgLoad}
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
              onClick={zoomToFit}
              title={t('zoomFit')}
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
            <button
              type="button"
              className="secondary compact zoom-fit-btn"
              onClick={zoomToFit}
              title={t('zoomFit')}
              aria-label={t('zoomFit')}
            >
              {t('zoomFit')}
            </button>
            <span className="zoom-hint">{t('zoomHint')}</span>
          </div>
        )}
      </div>
    </main>
  )
}
