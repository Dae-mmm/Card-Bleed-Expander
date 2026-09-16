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
  /** true = un solo colore per tutti gli angoli */
  sameCorners: boolean
  cornerColors: CornerColors
  cornerRadiusMm: number
  /** Taglio verso l’interno (px) con maschera stondata */
  insetPx: number
  /** Ridimensiona alla misura fisica di stampa */
  resizeToTarget: boolean
  targetWidthMm: number
  targetHeightMm: number
  bleedMm: number
  dpi: number
  /** Spazio colore in export: RGB→PNG, CMYK→TIFF */
  colorSpace: ColorSpace
  whiteThreshold: number
  showCropMarks: boolean
  cropMarkLengthMm?: number
}

export const DEFAULT_CORNER_COLORS: CornerColors = {
  topLeft: '#000000',
  topRight: '#000000',
  bottomLeft: '#000000',
  bottomRight: '#000000',
}

export const DEFAULT_OPTIONS: ProcessOptions = {
  borderType: 'black',
  sameCorners: true,
  cornerColors: { ...DEFAULT_CORNER_COLORS },
  cornerRadiusMm: 2.5,
  insetPx: 0,
  resizeToTarget: true,
  targetWidthMm: 63,
  targetHeightMm: 88,
  bleedMm: 2,
  dpi: 300,
  colorSpace: 'rgb',
  whiteThreshold: 245,
  showCropMarks: true,
  cropMarkLengthMm: 3,
}

/** Valori di stampa propagabili come predefiniti alle carte successive. */
export type FollowingDefaultsPatch = Partial<
  Pick<
    ProcessOptions,
    | 'insetPx'
    | 'cornerRadiusMm'
    | 'bleedMm'
    | 'targetWidthMm'
    | 'targetHeightMm'
    | 'resizeToTarget'
    | 'dpi'
    | 'colorSpace'
  >
>

export function printDefaultsFrom(options: ProcessOptions): FollowingDefaultsPatch {
  return {
    insetPx: options.insetPx,
    cornerRadiusMm: options.cornerRadiusMm,
    bleedMm: options.bleedMm,
    targetWidthMm: options.targetWidthMm,
    targetHeightMm: options.targetHeightMm,
    resizeToTarget: options.resizeToTarget,
    dpi: options.dpi,
    colorSpace: options.colorSpace,
  }
}

/** Pixel attesi per la misura di stampa (senza bleed). */
export function targetPixels(widthMm: number, heightMm: number, dpi: number) {
  const mmToPx = (mm: number) => Math.max(1, Math.round((mm / 25.4) * dpi))
  return { width: mmToPx(widthMm), height: mmToPx(heightMm) }
}
