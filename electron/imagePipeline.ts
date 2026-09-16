export type BorderType = 'black' | 'white' | 'none'
export type ColorSpace = 'rgb' | 'cmyk'

export type CornerId = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

export interface CornerColors {
  topLeft: string
  topRight: string
  bottomLeft: string
  bottomRight: string
}

export interface ProcessOptions {
  borderType: BorderType
  sameCorners: boolean
  cornerColors: CornerColors
  cornerRadiusMm: number
  insetPx: number
  resizeToTarget: boolean
  targetWidthMm: number
  targetHeightMm: number
  bleedMm: number
  dpi: number
  colorSpace: ColorSpace
  whiteThreshold: number
  showCropMarks: boolean
  cropMarkLengthMm?: number
}

export interface ImageMeta {
  width: number
  height: number
  hasAlpha: boolean
  format: string
}

type Rgb = { r: number; g: number; b: number }

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

/** Pixel fuori dalla silhouette a rettangolo stondato (nei soli angoli). */
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

/** Colore ad alto contrasto rispetto al riempimento angolo (per i crocini). */
function oppositeRgb(color: Rgb): Rgb {
  const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b
  return luminance < 128
    ? { r: 255, g: 255, b: 255 }
    : { r: 0, g: 0, b: 0 }
}

function cropMarkInk(corner: CornerId, options: ProcessOptions): Rgb {
  return oppositeRgb(resolveCornerFill(corner, options))
}

const CORNER_SAMPLE_DIAGONAL_PX = 3

function rgbToHex({ r, g, b }: Rgb): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/** Punto di campionamento: 3px in diagonale dal bordo dello spigolo verso il centro. */
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

  // Se il raggio è troppo piccolo, campiona 3px in diagonale dall'angolo del bounding box.
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

  // Dal bordo arrotondato (arco) indietro di d px verso il centro carta, lungo la diagonale.
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

function readPixel(data: Buffer, width: number, x: number, y: number): Rgb {
  const i = (y * width + x) * 4
  return { r: data[i], g: data[i + 1], b: data[i + 2] }
}

export async function sampleCornerColors(
  filePath: string,
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
  const loaded = await loadCardRgba(filePath, full, overscan)

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

/**
 * Taglia n px verso l’interno con maschera a rettangolo stondato.
 * I pixel fuori dalla maschera restano trasparenti (poi fixCorners li riempie).
 */
function roundedInsetCrop(
  src: Buffer,
  width: number,
  height: number,
  inset: number,
  radius: number,
): { data: Buffer; width: number; height: number; radius: number } {
  const maxInset = Math.floor(Math.min(width, height) / 2) - 1
  const n = Math.max(0, Math.min(inset, Math.max(0, maxInset)))
  if (n <= 0) {
    return { data: src, width, height, radius }
  }

  const outW = width - n * 2
  const outH = height - n * 2
  const outR = Math.max(0, radius - n)
  const out = Buffer.alloc(outW * outH * 4)

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
  data: Buffer,
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
  src: Buffer,
  width: number,
  height: number,
  bleed: number,
): { data: Buffer; width: number; height: number } {
  const outW = width + bleed * 2
  const outH = height + bleed * 2
  const out = Buffer.alloc(outW * outH * 4)

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
  data: Buffer,
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

export async function readImageMeta(filePath: string): Promise<ImageMeta> {
  const sharp = (await import('sharp')).default
  const image = sharp(filePath)
  const meta = await image.metadata()
  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    hasAlpha: Boolean(meta.hasAlpha),
    format: meta.format ?? 'unknown',
  }
}

/**
 * Dimensioni trim finali (dopo eventuale taglio interno).
 * Se l’originale è landscape e il target è portrait, scambia i lati.
 */
async function resolveTargetSize(
  filePath: string,
  options: ProcessOptions,
): Promise<{ width: number; height: number }> {
  const targetW = mmToPx(options.targetWidthMm ?? 63, options.dpi)
  const targetH = mmToPx(options.targetHeightMm ?? 88, options.dpi)
  const sharp = (await import('sharp')).default
  const meta = await sharp(filePath).metadata()
  const srcW = meta.width ?? targetW
  const srcH = meta.height ?? targetH

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

/**
 * Carica la carta in RGBA.
 * Con resize attivo: porta l’immagine alla misura di stampa.
 * Se serve un taglio interno, ridimensiona più grande di 2×inset così che
 * DOPO il taglio la carta sia esattamente la misura scelta.
 */
async function loadCardRgba(
  filePath: string,
  options: ProcessOptions,
  overscanPx = 0,
): Promise<{ data: Buffer; width: number; height: number }> {
  const sharp = (await import('sharp')).default
  let pipeline = sharp(filePath).ensureAlpha()

  if (options.resizeToTarget !== false) {
    const target = await resolveTargetSize(filePath, options)
    const pad = Math.max(0, overscanPx)
    pipeline = pipeline.resize(target.width + pad * 2, target.height + pad * 2, {
      fit: 'fill',
      kernel: 'lanczos3',
    })
  }

  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true })
  return { data: Buffer.from(data), width: info.width, height: info.height }
}

export async function processCardImage(
  filePath: string,
  options: ProcessOptions,
): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const insetPx = Math.max(0, Math.round(options.insetPx || 0))
  const radiusPx = mmToPx(options.cornerRadiusMm, options.dpi)

  // Con resize: overscan = inset, così dopo il taglio resta la misura scelta.
  // Senza resize: taglio sull’originale (la misura finale sarà minore).
  const overscan = options.resizeToTarget !== false ? insetPx : 0
  const loaded = await loadCardRgba(filePath, options, overscan)

  // Raggio sulla superficie pre-taglio: se abbiamo fatto overscan, il raggio
  // “esterno” è R+inset così dopo il crop resta R sulla misura finale.
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

  return sharp(extended.data, {
    raw: {
      width: extended.width,
      height: extended.height,
      channels: 4,
    },
  })
    .withMetadata({ density: options.dpi })
    .png()
    .toBuffer()
}

/** Converte l’export RGB in CMYK TIFF se richiesto; altrimenti PNG. */
export async function encodeCardExport(
  rgbPng: Buffer,
  options: ProcessOptions,
): Promise<{ buffer: Buffer; extension: 'png' | 'tif' }> {
  if (options.colorSpace !== 'cmyk') {
    return { buffer: rgbPng, extension: 'png' }
  }

  const sharp = (await import('sharp')).default
  // Non usare withMetadata qui: allega un profilo sRGB e annulla il CMYK.
  const dpi = options.dpi || 300
  const buffer = await sharp(rgbPng)
    .removeAlpha()
    .toColorspace('cmyk')
    .tiff({
      compression: 'lzw',
      xres: dpi / 25.4,
      yres: dpi / 25.4,
      resolutionUnit: 'inch',
    })
    .toBuffer()

  return { buffer, extension: 'tif' }
}

export async function processPreviewDataUrl(
  filePath: string,
  options: ProcessOptions,
  maxEdge = 1200,
): Promise<string> {
  const sharp = (await import('sharp')).default
  const png = await processCardImage(filePath, options)
  const resized = await sharp(png)
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer()
  return `data:image/png;base64,${resized.toString('base64')}`
}
