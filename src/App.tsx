import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Controls } from './components/Controls'
import { FolderList } from './components/FolderList'
import { Preview } from './components/Preview'
import {
  fileName,
  openFolder,
  openPath,
  processPreview,
  readImageMeta,
  readOriginalDataUrl,
  sampleCornerColors,
  saveImage,
} from './lib/ipc'
import {
  DEFAULT_OPTIONS,
  printDefaultsFrom,
  type CornerColors,
  type FollowingDefaultsPatch,
  type ProcessOptions,
} from './lib/types'
import { useI18n } from './i18n'

function cloneDefaults(base: ProcessOptions = DEFAULT_OPTIONS): ProcessOptions {
  return {
    ...base,
    cornerColors: { ...base.cornerColors },
  }
}

function allCorners(color: string): CornerColors {
  return {
    topLeft: color,
    topRight: color,
    bottomLeft: color,
    bottomRight: color,
  }
}

function hexDistance(a: string, b: string): number {
  const parse = (hex: string) => {
    const c = hex.replace('#', '').padEnd(6, '0').slice(0, 6)
    const n = Number.parseInt(c, 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }
  const pa = parse(a)
  const pb = parse(b)
  return Math.abs(pa.r - pb.r) + Math.abs(pa.g - pb.g) + Math.abs(pa.b - pb.b)
}

function applyDetectedColors(
  current: ProcessOptions,
  detected: CornerColors,
): ProcessOptions {
  const values = Object.values(detected)
  const similar = values.every((c) => hexDistance(c, detected.topLeft) < 36)

  if (current.sameCorners || similar) {
    return {
      ...current,
      borderType: 'none',
      sameCorners: true,
      cornerColors: allCorners(detected.topLeft),
    }
  }

  return {
    ...current,
    borderType: 'none',
    sameCorners: false,
    cornerColors: { ...detected },
  }
}

export default function App() {
  const { t } = useI18n()
  const [folderPath, setFolderPath] = useState<string | null>(null)
  const [files, setFiles] = useState<string[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [optionsByFile, setOptionsByFile] = useState<Record<string, ProcessOptions>>({})
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [outputDir, setOutputDir] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [metaLabel, setMetaLabel] = useState<string | null>(null)
  const [sessionDefaults, setSessionDefaults] = useState<ProcessOptions>(() =>
    cloneDefaults(),
  )

  const requestId = useRef(0)
  const autoSampled = useRef<Set<string>>(new Set())
  const optionsByFileRef = useRef(optionsByFile)
  optionsByFileRef.current = optionsByFile
  const sessionDefaultsRef = useRef(sessionDefaults)
  sessionDefaultsRef.current = sessionDefaults
  const selectedFile = files[selectedIndex] ?? null

  const options = useMemo(() => {
    if (!selectedFile) return DEFAULT_OPTIONS
    return optionsByFile[selectedFile] ?? DEFAULT_OPTIONS
  }, [optionsByFile, selectedFile])

  const setOptions = useCallback(
    (next: ProcessOptions) => {
      if (!selectedFile) return
      setOptionsByFile((prev) => ({ ...prev, [selectedFile]: next }))
    },
    [selectedFile],
  )

  const detectCorners = useCallback(async (filePath: string, current: ProcessOptions) => {
    const detected = await sampleCornerColors(filePath, {
      cornerRadiusMm: current.cornerRadiusMm,
      insetPx: current.insetPx,
      dpi: current.dpi,
      resizeToTarget: current.resizeToTarget,
      targetWidthMm: current.targetWidthMm,
      targetHeightMm: current.targetHeightMm,
    })
    const next = applyDetectedColors(current, detected)
    setOptionsByFile((prev) => ({ ...prev, [filePath]: next }))
    autoSampled.current.add(filePath)
    return next
  }, [])

  const handleOpenFolder = useCallback(async () => {
    const result = await openFolder()
    if (!result) return
    const defaults = cloneDefaults()
    const initial: Record<string, ProcessOptions> = {}
    for (const file of result.files) {
      initial[file] = cloneDefaults(defaults)
    }
    autoSampled.current = new Set()
    setSessionDefaults(defaults)
    setFolderPath(result.folderPath)
    setFiles(result.files)
    setOptionsByFile(initial)
    setSelectedIndex(0)
    setSaved(new Set())
    setOutputDir(null)
    setPreviewUrl(null)
    setOriginalUrl(null)
    setError(null)
  }, [])

  // Anteprima: non dipende dal sample (che può fallire senza bloccare l’UI)
  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null)
      setOriginalUrl(null)
      setMetaLabel(null)
      return
    }

    const id = ++requestId.current
    setBusy(true)
    setError(null)

    ;(async () => {
      try {
        const [preview, original, meta] = await Promise.all([
          processPreview(selectedFile, options),
          readOriginalDataUrl(selectedFile),
          readImageMeta(selectedFile),
        ])
        if (id !== requestId.current) return
        setPreviewUrl(preview)
        setOriginalUrl(original)
        setMetaLabel(`${meta.width}×${meta.height} · ${meta.format}`)
      } catch (err) {
        if (id !== requestId.current) return
        const message = err instanceof Error ? err.message : t('errorPreview')
        setError(message)
        setPreviewUrl(null)
      } finally {
        if (id === requestId.current) setBusy(false)
      }
    })()
  }, [selectedFile, options, t])

  // Auto-rileva colori spigolo (best-effort, non blocca l’anteprima)
  useEffect(() => {
    if (!selectedFile) return
    if (autoSampled.current.has(selectedFile)) return

    const filePath = selectedFile
    let cancelled = false

    ;(async () => {
      const current = optionsByFileRef.current[filePath] ?? cloneDefaults(sessionDefaultsRef.current)
      try {
        await detectCorners(filePath, current)
      } catch (err) {
        if (cancelled) return
        autoSampled.current.add(filePath)
        const message =
          err instanceof Error ? err.message : t('errorDetectFailed')
        setError((prev) => prev ?? message)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectedFile, detectCorners, t])

  const handleApplyToFollowing = useCallback(
    (patch: FollowingDefaultsPatch) => {
      setSessionDefaults((prev) => ({
        ...prev,
        ...patch,
        cornerColors: { ...prev.cornerColors },
      }))
      setOptionsByFile((prev) => {
        const next: Record<string, ProcessOptions> = { ...prev }
        for (let i = selectedIndex + 1; i < files.length; i++) {
          const file = files[i]
          const current = prev[file] ?? cloneDefaults(sessionDefaultsRef.current)
          next[file] = {
            ...current,
            ...patch,
            cornerColors: { ...current.cornerColors },
          }
        }
        return next
      })
    },
    [selectedIndex, files],
  )

  const handleApplyToAll = () => {
    const patch = printDefaultsFrom(options)
    setSessionDefaults((prev) => ({
      ...prev,
      ...patch,
      cornerColors: { ...prev.cornerColors },
    }))
    setOptionsByFile((prev) => {
      const next: Record<string, ProcessOptions> = {}
      for (const file of files) {
        const current = prev[file] ?? cloneDefaults(sessionDefaultsRef.current)
        next[file] = {
          ...current,
          ...patch,
          showCropMarks: options.showCropMarks,
          cropMarkLengthMm: options.cropMarkLengthMm,
          cornerColors: { ...current.cornerColors },
        }
      }
      return next
    })
  }

  const handleDetectCorners = useCallback(async () => {
    if (!selectedFile) return
    setBusy(true)
    setError(null)
    try {
      await detectCorners(selectedFile, options)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorDetect'))
    } finally {
      setBusy(false)
    }
  }, [selectedFile, options, detectCorners, t])

  const handleSave = useCallback(
    async (goNext: boolean) => {
      if (!selectedFile) return
      setBusy(true)
      setError(null)
      try {
        const result = await saveImage(selectedFile, options, outputDir ?? undefined)
        setOutputDir(result.outputDir)
        setSaved((prev) => new Set(prev).add(selectedFile))
        if (goNext && selectedIndex < files.length - 1) {
          setSelectedIndex((i) => i + 1)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errorSave'))
      } finally {
        setBusy(false)
      }
    },
    [selectedFile, options, outputDir, selectedIndex, files.length, t],
  )

  const handleSaveAll = useCallback(async () => {
    if (files.length === 0) return
    setBusy(true)
    setError(null)
    try {
      let lastOutputDir = outputDir
      const newlySaved = new Set<string>()
      for (const file of files) {
        const fileOptions = optionsByFileRef.current[file] ?? cloneDefaults(sessionDefaultsRef.current)
        const result = await saveImage(file, fileOptions, lastOutputDir ?? undefined)
        lastOutputDir = result.outputDir
        newlySaved.add(file)
      }
      if (lastOutputDir) setOutputDir(lastOutputDir)
      setSaved((prev) => {
        const next = new Set(prev)
        for (const file of newlySaved) next.add(file)
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorSaveAll'))
    } finally {
      setBusy(false)
    }
  }, [files, outputDir, t])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement | null
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (busy) return

      const mod = event.metaKey || event.ctrlKey

      // Shift + ←/→ : taglio interno
      if (event.shiftKey && !mod && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
        if (!selectedFile) return
        event.preventDefault()
        const delta = event.key === 'ArrowRight' ? 1 : -1
        setOptions({
          ...options,
          insetPx: Math.max(0, Math.min(200, options.insetPx + delta)),
        })
        return
      }

      // Shift+Invio : salva tutto
      if (event.shiftKey && !mod && event.key === 'Enter') {
        if (files.length === 0) return
        event.preventDefault()
        void handleSaveAll()
        return
      }

      if (files.length === 0) return

      // 1 = un colore, 2 = quattro colori
      if (event.key === '1' && !mod && !event.shiftKey && !event.altKey) {
        event.preventDefault()
        setOptions({
          ...options,
          borderType: 'none',
          sameCorners: true,
          cornerColors: allCorners(options.cornerColors.topLeft),
        })
        return
      }
      if (event.key === '2' && !mod && !event.shiftKey && !event.altKey) {
        event.preventDefault()
        setOptions({
          ...options,
          borderType: 'none',
          sameCorners: false,
        })
        return
      }

      // Shift+C : campiona colori
      if (event.shiftKey && !mod && (event.key === 'C' || event.key === 'c')) {
        event.preventDefault()
        void handleDetectCorners()
        return
      }

      if (mod || event.shiftKey) return

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex((i) => Math.min(files.length - 1, i + 1))
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex((i) => Math.max(0, i - 1))
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        void handleSave(true)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    busy,
    files.length,
    handleSave,
    handleSaveAll,
    handleDetectCorners,
    selectedFile,
    options,
    setOptions,
  ])

  return (
    <div className="app-shell">
      <FolderList
        folderPath={folderPath}
        files={files}
        selectedIndex={selectedIndex}
        saved={saved}
        onSelect={setSelectedIndex}
        onOpenFolder={handleOpenFolder}
      />
      <Preview
        previewUrl={previewUrl}
        originalUrl={originalUrl}
        showOriginal={showOriginal}
        onToggleOriginal={setShowOriginal}
        busy={busy}
        fileLabel={selectedFile ? fileName(selectedFile) : null}
        metaLabel={metaLabel}
        error={error}
      />
      <Controls
        options={options}
        onChange={setOptions}
        onApplyToAll={handleApplyToAll}
        onApplyToFollowing={handleApplyToFollowing}
        onDetectCorners={() => void handleDetectCorners()}
        onSave={() => void handleSave(false)}
        onSaveAndNext={() => void handleSave(true)}
        onSaveAll={() => void handleSaveAll()}
        onOpenOutput={() => {
          if (outputDir) void openPath(outputDir)
        }}
        busy={busy}
        hasSelection={Boolean(selectedFile)}
        hasFiles={files.length > 0}
        hasOutput={Boolean(outputDir)}
        hasFollowing={selectedIndex < files.length - 1}
      />
    </div>
  )
}
