import type { ProcessOptions } from './types'
import {
  encodeCardExport,
  processCardRgba,
  processPreviewDataUrl,
  readImageMeta,
  readOriginalDataUrl,
  sampleCornerColors,
  type ImageMeta,
} from './imagePipeline'
import type { CornerColors } from './types'

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp'])

export interface LocalCard {
  /** Stable id within the session (relative path or name). */
  id: string
  name: string
  file: File
}

export interface OpenFolderResult {
  folderPath: string
  files: LocalCard[]
}

export interface SaveResult {
  outName: string
  outputLabel: string
}

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string
    mode?: 'read' | 'readwrite'
  }) => Promise<FileSystemDirectoryHandle>
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

function isImageName(name: string): boolean {
  return IMAGE_EXT.has(extOf(name))
}

export function supportsDirectoryPicker(): boolean {
  return typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function'
}

export function fileName(idOrPath: string): string {
  const parts = idOrPath.split(/[/\\]/)
  return parts[parts.length - 1] ?? idOrPath
}

async function collectFromDirectoryHandle(
  root: FileSystemDirectoryHandle,
  base = '',
): Promise<LocalCard[]> {
  const cards: LocalCard[] = []
  const iterable = root as FileSystemDirectoryHandle & {
    entries: () => AsyncIterableIterator<[string, FileSystemHandle]>
  }

  for await (const [name, handle] of iterable.entries()) {
    const rel = base ? `${base}/${name}` : name
    if (handle.kind === 'file' && isImageName(name)) {
      const fileHandle = handle as FileSystemFileHandle
      const file = await fileHandle.getFile()
      cards.push({ id: rel, name, file })
    } else if (handle.kind === 'directory') {
      // Only flatten one level of nested folders if present; skip deep trees for UX
      if (!base) {
        const nested = await collectFromDirectoryHandle(
          handle as FileSystemDirectoryHandle,
          name,
        )
        cards.push(...nested)
      }
    }
  }

  cards.sort((a, b) => a.id.localeCompare(b.id, undefined, { sensitivity: 'base' }))
  return cards
}

function pickFolderViaInput(): Promise<OpenFolderResult | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp'
    input.setAttribute('webkitdirectory', '')
    input.setAttribute('directory', '')

    let settled = false
    const finish = (value: OpenFolderResult | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    input.addEventListener('change', () => {
      const list = input.files
      if (!list || list.length === 0) {
        finish(null)
        return
      }

      const cards: LocalCard[] = []
      let folderLabel = 'Selected files'
      for (const file of Array.from(list)) {
        if (!isImageName(file.name)) continue
        const rel =
          (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
        if (rel.includes('/')) {
          folderLabel = rel.split('/')[0] || folderLabel
        }
        cards.push({ id: rel, name: file.name, file })
      }
      cards.sort((a, b) => a.id.localeCompare(b.id, undefined, { sensitivity: 'base' }))
      if (cards.length === 0) {
        finish(null)
        return
      }
      finish({ folderPath: folderLabel, files: cards })
    })

    input.addEventListener('cancel', () => finish(null))
    // Some browsers don't fire cancel; user may dismiss without change
    window.addEventListener(
      'focus',
      () => {
        window.setTimeout(() => {
          if (!settled && (!input.files || input.files.length === 0)) finish(null)
        }, 500)
      },
      { once: true },
    )

    input.click()
  })
}

let outputDirHandle: FileSystemDirectoryHandle | null = null
let outputLabel: string | null = null

export function getOutputLabel(): string | null {
  return outputLabel
}

export function hasOutputFolder(): boolean {
  return Boolean(outputDirHandle) || Boolean(outputLabel)
}

export async function chooseOutputFolder(): Promise<string | null> {
  const w = window as DirectoryPickerWindow
  if (!w.showDirectoryPicker) {
    outputDirHandle = null
    outputLabel = 'Downloads'
    return outputLabel
  }
  try {
    const handle = await w.showDirectoryPicker({
      id: 'card-bleed-output',
      mode: 'readwrite',
    })
    outputDirHandle = handle
    outputLabel = handle.name
    return outputLabel
  } catch {
    return outputLabel
  }
}

export async function openFolder(): Promise<OpenFolderResult | null> {
  const w = window as DirectoryPickerWindow
  if (w.showDirectoryPicker) {
    try {
      const handle = await w.showDirectoryPicker({
        id: 'card-bleed-source',
        mode: 'read',
      })
      const files = await collectFromDirectoryHandle(handle)
      if (files.length === 0) return null
      return { folderPath: handle.name, files }
    } catch {
      // User cancelled or permission denied — try input fallback only if not abort
      return null
    }
  }
  return pickFolderViaInput()
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function writeToOutput(name: string, blob: Blob): Promise<string> {
  if (outputDirHandle) {
    const fileHandle = await outputDirHandle.getFileHandle(name, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(blob)
    await writable.close()
    return outputLabel || outputDirHandle.name
  }

  // No folder chosen → download locally (never upload). Optional folder via "Choose save folder".
  downloadBlob(blob, name)
  outputLabel = outputLabel || 'Downloads'
  return outputLabel
}

export async function saveCard(
  card: LocalCard,
  options: ProcessOptions,
): Promise<SaveResult> {
  const rgba = await processCardRgba(card.file, options)
  const encoded = await encodeCardExport(rgba, options)
  const base = card.name.replace(/\.[^.]+$/, '')
  const outName = `${base}-bleed.${encoded.extension}`
  const label = await writeToOutput(outName, encoded.blob)
  return { outName, outputLabel: label }
}

export async function processPreview(card: LocalCard, options: ProcessOptions): Promise<string> {
  return processPreviewDataUrl(card.file, options)
}

export async function readOriginal(card: LocalCard): Promise<string> {
  return readOriginalDataUrl(card.file)
}

export async function readMeta(card: LocalCard): Promise<ImageMeta> {
  return readImageMeta(card.file, card.name)
}

export async function detectCorners(
  card: LocalCard,
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
  return sampleCornerColors(card.file, options)
}

export function revokeUrl(url: string | null | undefined) {
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url)
}
