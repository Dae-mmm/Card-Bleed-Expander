import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
} from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  encodeCardExport,
  processCardImage,
  processPreviewDataUrl,
  readImageMeta,
  sampleCornerColors,
  type ProcessOptions,
} from './imagePipeline'

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp'])

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Card Bleed Expander',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function listImagesInFolder(folderPath: string): Promise<string[]> {
  const entries = await fs.readdir(folderPath, { withFileTypes: true })
  return entries
    .filter((e) => e.isFile() && IMAGE_EXT.has(path.extname(e.name).toLowerCase()))
    .map((e) => path.join(folderPath, e.name))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

function registerIpc() {
  ipcMain.handle('open-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    const folderPath = result.filePaths[0]
    const files = await listImagesInFolder(folderPath)
    return { folderPath, files }
  })

  ipcMain.handle('read-image-meta', async (_event, filePath: string) => {
    return readImageMeta(filePath)
  })

  ipcMain.handle(
    'sample-corner-colors',
    async (
      _event,
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
    ) => {
      return sampleCornerColors(filePath, options)
    },
  )

  ipcMain.handle(
    'process-preview',
    async (_event, filePath: string, options: ProcessOptions) => {
      return processPreviewDataUrl(filePath, options)
    },
  )

  ipcMain.handle(
    'save-image',
    async (
      _event,
      payload: {
        filePath: string
        options: ProcessOptions
        outputDir?: string
      },
    ) => {
      const { filePath, options } = payload
      const sourceDir = path.dirname(filePath)
      const outputDir = payload.outputDir || path.join(sourceDir, 'output')
      await fs.mkdir(outputDir, { recursive: true })

      const base = path.basename(filePath, path.extname(filePath))
      const rgbPng = await processCardImage(filePath, options)
      const encoded = await encodeCardExport(rgbPng, options)
      const outPath = path.join(outputDir, `${base}-bleed.${encoded.extension}`)
      await fs.writeFile(outPath, encoded.buffer)
      return { outPath, outputDir }
    },
  )

  ipcMain.handle('open-path', async (_event, targetPath: string) => {
    await shell.openPath(targetPath)
  })

  ipcMain.handle('read-original-data-url', async (_event, filePath: string) => {
    const sharp = (await import('sharp')).default
    const buf = await sharp(filePath)
      .resize({
        width: 1200,
        height: 1200,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer()
    return `data:image/png;base64,${buf.toString('base64')}`
  })
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
