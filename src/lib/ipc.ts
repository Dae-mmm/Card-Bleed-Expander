import type { ProcessOptions, CornerColors } from './types'

export async function openFolder() {
  return window.cardBleed.openFolder()
}

export async function processPreview(filePath: string, options: ProcessOptions) {
  return window.cardBleed.processPreview(filePath, options)
}

export async function saveImage(
  filePath: string,
  options: ProcessOptions,
  outputDir?: string,
) {
  return window.cardBleed.saveImage(filePath, options, outputDir)
}

export async function openPath(targetPath: string) {
  return window.cardBleed.openPath(targetPath)
}

export async function readOriginalDataUrl(filePath: string) {
  return window.cardBleed.readOriginalDataUrl(filePath)
}

export async function readImageMeta(filePath: string) {
  return window.cardBleed.readImageMeta(filePath)
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
  return window.cardBleed.sampleCornerColors(filePath, options)
}

export function fileName(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  return parts[parts.length - 1] ?? filePath
}
