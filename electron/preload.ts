import { contextBridge, ipcRenderer } from 'electron'
import type { CornerColors, ImageMeta, ProcessOptions } from './imagePipeline'

export interface OpenFolderResult {
  folderPath: string
  files: string[]
}

export interface SaveResult {
  outPath: string
  outputDir: string
}

const api = {
  openFolder: (): Promise<OpenFolderResult | null> =>
    ipcRenderer.invoke('open-folder'),
  readImageMeta: (filePath: string): Promise<ImageMeta> =>
    ipcRenderer.invoke('read-image-meta', filePath),
  sampleCornerColors: (
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
  ): Promise<CornerColors> =>
    ipcRenderer.invoke('sample-corner-colors', filePath, options),
  processPreview: (filePath: string, options: ProcessOptions): Promise<string> =>
    ipcRenderer.invoke('process-preview', filePath, options),
  saveImage: (
    filePath: string,
    options: ProcessOptions,
    outputDir?: string,
  ): Promise<SaveResult> =>
    ipcRenderer.invoke('save-image', { filePath, options, outputDir }),
  openPath: (targetPath: string): Promise<string> =>
    ipcRenderer.invoke('open-path', targetPath),
  readOriginalDataUrl: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('read-original-data-url', filePath),
}

contextBridge.exposeInMainWorld('cardBleed', api)

export type CardBleedApi = typeof api
