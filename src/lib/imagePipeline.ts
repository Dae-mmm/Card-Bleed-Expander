import type { CornerColors, ProcessOptions } from './types'
import { encodePngRgba } from './pngEncode'
import { encodeCmykTiff } from './cmykTiff'

export type CornerId = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

export interface ImageMeta {
  width: number
  height: number
  hasAlpha: boolean
  format: string
}

type Rgb = { r: number; g: number; b: number }
type RgbaBuffer = { data: Uint8Array; width: number; height: number }

function mmToPx(mm: number, dpi: number): number {
  return Math.max(0, Math.round((mm / 25.4) * dpi))
}

function parseHexColor(hex: string): Rgb {
  const cleaned = hex.replace('#', '').trim()
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned.padEnd(6, '0').slice(0, 6)
  const n = Number.parseInt(full, 16)
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  }
}

function isNearWhite(r: number, g: number, b: number, threshold: number): boolean {
  return r >= threshold && g >= threshold && b >= threshold
}

function cornerOutsideSilhouette(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): CornerId | null {
  const r = Math.min(radius, Math.floor(Math.min(width, height) / 2))
  if (r <= 0) return null
  if (x >= r && x < width - r) return null
  if (y >= r && y < height - r) return null

  let corner: CornerId
  let cx: number
  let cy: number

  if (x < r && y < r) {
    corner = 'topLeft'
    cx = r
    cy = r
  } else if (x >= width - r && y < r) {
    corner = 'topRight'
    cx = width - 1 - r
    cy = r
  } else if (x < r && y >= height - r) {
    corner = 'bottomLeft'
    cx = r
    cy = height - 1 - r
  } else if (x >= width - r && y >= height - r) {
    corner = 'bottomRight'
    cx = width - 1 - r
    cy = height - 1 - r
  } else {
    return null
  }

  const dx = x - cx
  const dy = y - cy
  if (dx * dx + dy * dy <= r * r) return null
  return corner
}

function isOutsideRoundedRect(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) return true
  return cornerOutsideSilhouette(x, y, width, height, radius) !== null
}

function resolveCornerFill(corner: CornerId, options: ProcessOptions): Rgb {
  if (options.borderType === 'black') return { r: 0, g: 0, b: 0 }
  if (options.borderType === 'white') return { r: 255, g: 255, b: 255 }
  const colors = options.cornerColors
  const hex =
    options.sameCorners !== false
      ? colors?.topLeft || '#000000'
      : colors?.[corner] || colors?.topLeft || '#000000'
  return parseHexColor(hex)
}

function oppositeRgb(color: Rgb): Rgb {
  const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b
  return luminance < 128 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 }
}

function cropMarkInk(corner: CornerId, options: ProcessOptions): Rgb {
  return oppositeRgb(resolveCornerFill(corner, options))
}

const CORNER_SAMPLE_DIAGONAL_PX = 3

function rgbToHex({ r, g, b }: Rgb): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function cornerSamplePoint(
  corner: CornerId,
  width: number,
  height: number,
  radius: number,
): { x: number; y: number } {
  const r = Math.min(Math.max(0, radius), Math.floor(Math.min(width, height) / 2))
  const d = CORNER_SAMPLE_DIAGONAL_PX
  const inv = Math.SQRT1_2

  const clamp = (x: number, y: number) => ({
    x: Math.max(0, Math.min(width - 1, Math.round(x))),
    y: Math.max(0, Math.min(height - 1, Math.round(y))),
  })

  if (r <= d) {
    switch (corner) {
      case 'topLeft':
        return clamp(d, d)
      case 'topRight':
        return clamp(width - 1 - d, d)
      case 'bottomLeft':
        return clamp(d, height - 1 - d)
      case 'bottomRight':
        return clamp(width - 1 - d, height - 1 - d)
    }
  }

  const along = r - d
  switch (corner) {
    case 'topLeft':
      return clamp(r - along * inv, r - along * inv)
    case 'topRight':
      return clamp(width - 1 - r + along * inv, r - along * inv)
    case 'bottomLeft':
      return clamp(r - along * inv, height - 1 - r + along * inv)
    case 'bottomRight':
      return clamp(width - 1 - r + along * inv, height - 1 - r + along * inv)
  }
}

function readPixel(data: Uint8Array, width: number, x: number, y: number): Rgb {
  const i = (y * width + x) * 4
  return { r: data[i], g: data[i + 1], b: data[i + 2] }
}

function formatFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg'
  if (ext === 'png' || ext === 'webp') return ext
  return ext || 'unknown'
}

async function decodeBitmap(source: Blob): Promise<ImageBitmap> {
  return createImageBitmap(source)
}

function canvas2d(width: number, height: number): {
  canvas: OffscreenCanvas | HTMLCanvasElement
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
} {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('2D canvas unavailable')
    return { canvas, ctx }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas unavailable')
  return { canvas, ctx }
}

function resolveTargetSize(
  srcW: number,
  srcH: number,
  options: ProcessOptions,
): { width: number; height: number } {
  const targetW = mmToPx(options.targetWidthMm ?? 63, options.dpi)
  const targetH = mmToPx(options.targetHeightMm ?? 88, options.dpi)

  const targetPortrait = targetW <= targetH
  const sourceLandscape = srcW > srcH
  if (targetPortrait && sourceLandscape) {
    return { width: targetH, height: targetW }
  }
  if (!targetPortrait && srcH > srcW) {
    return { width: targetH, height: targetW }
  }
  return { width: targetW, height: targetH }
}

async function loadCardRgba(
  source: Blob,
  options: ProcessOptions,
  overscanPx = 0,
): Promise<RgbaBuffer> {
  const bitmap = await decodeBitmap(source)
  try {
    let outW = bitmap.width
    let outH = bitmap.height

    if (options.resizeToTarget !== false) {
      const target = resolveTargetSize(bitmap.width, bitmap.height, options)
      const pad = Math.max(0, overscanPx)
      outW = target.width + pad * 2
      outH = target.height + pad * 2
    }

    const { ctx } = canvas2d(outW, outH)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.clearRect(0, 0, outW, outH)
    ctx.drawImage(bitmap, 0, 0, outW, outH)
    const imageData = ctx.getImageData(0, 0, outW, outH)
    return { data: new Uint8Array(imageData.data), width: outW, height: outH }
  } finally {
    bitmap.close()
  }
}

function roundedInsetCrop(
  src: Uint8Array,
  width: number,
  height: number,
  inset: number,
  radius: number,
): { data: Uint8Array; width: number; height: number; radius: number } {
  const maxInset = Math.floor(Math.min(width, height) / 2) - 1
  const n = Math.max(0, Math.min(inset, Math.max(0, maxInset)))
  if (n <= 0) {
    return { data: src, width, height, radius }
  }

  const outW = width - n * 2
  const outH = height - n * 2
  const outR = Math.max(0, radius - n)
  const out = new Uint8Array(outW * outH * 4)

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const di = (y * outW + x) * 4
      if (isOutsideRoundedRect(x, y, outW, outH, outR)) {
        out[di] = 0
        out[di + 1] = 0
        out[di + 2] = 0
        out[di + 3] = 0
        continue
      }
      const si = ((y + n) * width + (x + n)) * 4
      out[di] = src[si]
      out[di + 1] = src[si + 1]
      out[di + 2] = src[si + 2]
      out[di + 3] = src[si + 3]
    }
  }

  return { data: out, width: outW, height: outH, radius: outR }
}

function fixCorners(
  data: Uint8Array,
  width: number,
  height: number,
  options: ProcessOptions,
  radiusPx: number,
): void {
  if (radiusPx <= 0) return

  const threshold = Math.max(0, Math.min(255, Math.round(options.whiteThreshold)))
  const forceFill = options.borderType !== 'none'

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const corner = cornerOutsideSilhouette(x, y, width, height, radiusPx)
      if (!corner) continue

      const i = (y * width + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const a = data[i + 3]

      const transparentOutside = a < 250
      const whiteMatte = isNearWhite(r, g, b, threshold)

      if (forceFill || transparentOutside || whiteMatte) {
        const fill = resolveCornerFill(corner, options)
        data[i] = fill.r
        data[i + 1] = fill.g
        data[i + 2] = fill.b
        data[i + 3] = 255
      }
    }
  }
}

function edgeExtend(
  src: Uint8Array,
  width: number,
  height: number,
  bleed: number,
): RgbaBuffer {
  const outW = width + bleed * 2
  const outH = height + bleed * 2
  const out = new Uint8Array(outW * outH * 4)

  for (let y = 0; y < outH; y++) {
    const sy = Math.min(height - 1, Math.max(0, y - bleed))
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(width - 1, Math.max(0, x - bleed))
      const si = (sy * width + sx) * 4
      const di = (y * outW + x) * 4
      out[di] = src[si]
      out[di + 1] = src[si + 1]
      out[di + 2] = src[si + 2]
      out[di + 3] = src[si + 3]
    }
  }

  return { data: out, width: outW, height: outH }
}

function drawCropMarks(
  data: Uint8Array,
  width: number,
  height: number,
  bleed: number,
  markLen: number,
  options: ProcessOptions,
): void {
  if (bleed <= 0 || markLen <= 0) return

  const thickness = Math.max(1, Math.round(bleed / 12))
  let ink: Rgb = { r: 40, g: 40, b: 40 }

  const setPixel = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    if (x >= bleed && x < width - bleed && y >= bleed && y < height - bleed) return
    const i = (y * width + x) * 4
    data[i] = ink.r
    data[i + 1] = ink.g
    data[i + 2] = ink.b
    data[i + 3] = 255
  }

  const drawH = (x0: number, y: number, len: number, dir: 1 | -1) => {
    for (let t = 0; t < thickness; t++) {
      for (let i = 0; i < len; i++) {
        setPixel(x0 + dir * i, y + t)
      }
    }
  }

  const drawV = (x: number, y0: number, len: number, dir: 1 | -1) => {
    for (let t = 0; t < thickness; t++) {
      for (let i = 0; i < len; i++) {
        setPixel(x + t, y0 + dir * i)
      }
    }
  }

  const len = Math.min(markLen, bleed - 1)
  if (len <= 0) return

  const left = bleed
  const right = width - bleed - 1
  const top = bleed
  const bottom = height - bleed - 1

  ink = cropMarkInk('topLeft', options)
  drawH(left - 1, top, len, -1)
  drawV(left, top - 1, len, -1)

  ink = cropMarkInk('topRight', options)
  drawH(right + 1, top, len, 1)
  drawV(right - thickness + 1, top - 1, len, -1)

  ink = cropMarkInk('bottomLeft', options)
  drawH(left - 1, bottom - thickness + 1, len, -1)
  drawV(left, bottom + 1, len, 1)

  ink = cropMarkInk('bottomRight', options)
  drawH(right + 1, bottom - thickness + 1, len, 1)
  drawV(right - thickness + 1, bottom + 1, len, 1)
}

export async function readImageMeta(source: Blob, fileName = 'card.png'): Promise<ImageMeta> {
  const bitmap = await decodeBitmap(source)
  try {
    return {
      width: bitmap.width,
      height: bitmap.height,
      hasAlpha: true,
      format: formatFromName(fileName),
    }
  } finally {
    bitmap.close()
  }
}

export async function processCardRgba(
  source: Blob,
  options: ProcessOptions,
): Promise<RgbaBuffer> {
  const insetPx = Math.max(0, Math.round(options.insetPx || 0))
  const radiusPx = mmToPx(options.cornerRadiusMm, options.dpi)
  const overscan = options.resizeToTarget !== false ? insetPx : 0
  const loaded = await loadCardRgba(source, options, overscan)

  const radiusBeforeCrop =
    options.resizeToTarget !== false && insetPx > 0 ? radiusPx + insetPx : radiusPx

  const cropped = roundedInsetCrop(
    loaded.data,
    loaded.width,
    loaded.height,
    insetPx,
    radiusBeforeCrop,
  )

  fixCorners(cropped.data, cropped.width, cropped.height, options, cropped.radius)

  const bleed = mmToPx(options.bleedMm, options.dpi)
  const extended = edgeExtend(cropped.data, cropped.width, cropped.height, bleed)

  if (options.showCropMarks) {
    const markLen = mmToPx(options.cropMarkLengthMm ?? 3, options.dpi)
    drawCropMarks(extended.data, extended.width, extended.height, bleed, markLen, options)
  }

  return extended
}

export async function sampleCornerColors(
  source: Blob,
  options: Pick<
    ProcessOptions,
    | 'cornerRadiusMm'
    | 'insetPx'
    | 'dpi'
    | 'resizeToTarget'
    | 'targetWidthMm'
    | 'targetHeightMm'
  >,
): Promise<CornerColors> {
  const full = options as ProcessOptions
  const insetPx = Math.max(0, Math.round(full.insetPx || 0))
  const radiusPx = mmToPx(full.cornerRadiusMm, full.dpi)
  const overscan = full.resizeToTarget !== false ? insetPx : 0
  const loaded = await loadCardRgba(source, full, overscan)

  const radiusBeforeCrop =
    full.resizeToTarget !== false && insetPx > 0 ? radiusPx + insetPx : radiusPx

  const cropped = roundedInsetCrop(
    loaded.data,
    loaded.width,
    loaded.height,
    insetPx,
    radiusBeforeCrop,
  )

  const corners: CornerId[] = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']
  const result = {} as CornerColors
  for (const corner of corners) {
    const pt = cornerSamplePoint(corner, cropped.width, cropped.height, cropped.radius)
    result[corner] = rgbToHex(readPixel(cropped.data, cropped.width, pt.x, pt.y))
  }
  return result
}

export async function encodeCardExport(
  rgba: RgbaBuffer,
  options: ProcessOptions,
): Promise<{ blob: Blob; extension: 'png' | 'tif' }> {
  if (options.colorSpace === 'cmyk') {
    return {
      blob: encodeCmykTiff(rgba.data, rgba.width, rgba.height, options.dpi || 300),
      extension: 'tif',
    }
  }
  return {
    blob: encodePngRgba(rgba.data, rgba.width, rgba.height, options.dpi || 300),
    extension: 'png',
  }
}

export async function processPreviewDataUrl(
  source: Blob,
  options: ProcessOptions,
  maxEdge = 1200,
): Promise<string> {
  const rgba = await processCardRgba(source, options)
  let { data, width, height } = rgba

  const maxDim = Math.max(width, height)
  if (maxDim > maxEdge) {
    const scale = maxEdge / maxDim
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))
    const { ctx } = canvas2d(width, height)
    const img = new ImageData(new Uint8ClampedArray(data), width, height)
    ctx.putImageData(img, 0, 0)
    const { canvas: outCanvas, ctx: outCtx } = canvas2d(w, h)
    outCtx.imageSmoothingEnabled = true
    outCtx.imageSmoothingQuality = 'high'
    outCtx.drawImage(ctx.canvas as CanvasImageSource, 0, 0, w, h)
    const scaled = outCtx.getImageData(0, 0, w, h)
    data = new Uint8Array(scaled.data)
    width = w
    height = h
    void outCanvas
  }

  const blob = encodePngRgba(data, width, height, options.dpi || 300)
  return URL.createObjectURL(blob)
}

export async function readOriginalDataUrl(source: Blob, maxEdge = 1200): Promise<string> {
  const bitmap = await decodeBitmap(source)
  try {
    let w = bitmap.width
    let h = bitmap.height
    const maxDim = Math.max(w, h)
    if (maxDim > maxEdge) {
      const scale = maxEdge / maxDim
      w = Math.max(1, Math.round(w * scale))
      h = Math.max(1, Math.round(h * scale))
    }
    const { canvas, ctx } = canvas2d(w, h)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, w, h)

    if ('convertToBlob' in canvas) {
      const blob = await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' })
      return URL.createObjectURL(blob)
    }
    return (canvas as HTMLCanvasElement).toDataURL('image/png')
  } finally {
    bitmap.close()
  }
}
