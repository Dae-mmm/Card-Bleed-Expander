import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Controls } from './components/Controls'
import { FolderList } from './components/FolderList'
import { Preview } from './components/Preview'
import {
  chooseOutputFolder,
  detectCorners as sampleCornersForCard,
  fileName,
  getOutputLabel,
  hasOutputFolder,
  openFolder,
  processPreview,
  readImageMeta,
  readOriginalDataUrl,
  revokeUrl,
  saveImage,
  supportsDirectoryPicker,
  type LocalCard,
} from './lib/ipc'
import {
  DEFAULT_OPTIONS,
  printDefaultsFrom,
  type CornerColors,
  type FollowingDefaultsPatch,
  type ProcessOptions,
} from './lib/types'
import { useI18n } from './i18n'
import { KofiWidget } from './components/KofiWidget'
import { FeedbackWidget } from './components/FeedbackWidget'
import { ImportListDialog } from './components/ImportListDialog'
import type { CardGame, ImportResult } from './lib/cardImport'

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
  const [files, setFiles] = useState<LocalCard[]>([])
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
  const [importOpen, setImportOpen] = useState(false)

  const requestId = useRef(0)
  const autoSampled = useRef<Set<string>>(new Set())
  const optionsByFileRef = useRef(optionsByFile)
  optionsByFileRef.current = optionsByFile
  const sessionDefaultsRef = useRef(sessionDefaults)
  sessionDefaultsRef.current = sessionDefaults
  const selectedFile = files[selectedIndex] ?? null

  const options = useMemo(() => {
    if (!selectedFile) return DEFAULT_OPTIONS
    return optionsByFile[selectedFile.id] ?? DEFAULT_OPTIONS
  }, [optionsByFile, selectedFile])

  const setOptions = useCallback(
    (next: ProcessOptions) => {
      if (!selectedFile) return
      setOptionsByFile((prev) => ({ ...prev, [selectedFile.id]: next }))
    },
    [selectedFile],
  )

  const detectCorners = useCallback(async (card: LocalCard, current: ProcessOptions) => {
    const detected = await sampleCornersForCard(card, {
      cornerRadiusMm: current.cornerRadiusMm,
      insetPx: current.insetPx,
      dpi: current.dpi,
      resizeToTarget: current.resizeToTarget,
      targetWidthMm: current.targetWidthMm,
      targetHeightMm: current.targetHeightMm,
    })
    const next = applyDetectedColors(current, detected)
    setOptionsByFile((prev) => ({ ...prev, [card.id]: next }))
    autoSampled.current.add(card.id)
    return next
  }, [])

  const handleOpenFolder = useCallback(async () => {
    const result = await openFolder()
    if (!result) return
    const defaults = cloneDefaults()
    const initial: Record<string, ProcessOptions> = {}
    for (const file of result.files) {
      initial[file.id] = cloneDefaults(defaults)
    }
    autoSampled.current = new Set()
    setSessionDefaults(defaults)
    setFolderPath(result.folderPath)
    setFiles(result.files)
    setOptionsByFile(initial)
    setSelectedIndex(0)
    setSaved(new Set())
    setOutputDir(getOutputLabel())
    setPreviewUrl((prev) => {
      revokeUrl(prev)
      return null
    })
    setOriginalUrl((prev) => {
      revokeUrl(prev)
      return null
    })
    setError(null)
  }, [])

  const handleImportedList = useCallback((result: ImportResult, game: CardGame) => {
    const defaults = cloneDefaults()
    // Sensible print defaults per game size
    if (game === 'yugioh') {
      defaults.targetWidthMm = 59
      defaults.targetHeightMm = 86
    } else {
      defaults.targetWidthMm = 63
      defaults.targetHeightMm = 88
    }

    const initial: Record<string, ProcessOptions> = {}
    for (const file of result.cards) {
      initial[file.id] = cloneDefaults(defaults)
    }
    autoSampled.current = new Set()
    setSessionDefaults(defaults)
    setFolderPath(
      game === 'mtg'
        ? 'Imported · Magic (Scryfall)'
        : game === 'pokemon'
          ? 'Imported · Pokémon TCG'
          : 'Imported · Yu-Gi-Oh!',
    )
    setFiles(result.cards)
    setOptionsByFile(initial)
    setSelectedIndex(0)
    setSaved(new Set())
    setOutputDir(getOutputLabel())
    setPreviewUrl((prev) => {
      revokeUrl(prev)
      return null
    })
    setOriginalUrl((prev) => {
      revokeUrl(prev)
      return null
    })
    if (result.failures.length > 0) {
      const sample = result.failures
        .slice(0, 5)
        .map((f) => `${f.name}: ${f.reason}`)
        .join(' · ')
      setError(
        `${result.failures.length} card(s) skipped — ${sample}${result.failures.length > 5 ? '…' : ''}`,
      )
    } else {
      setError(null)
    }
  }, [])

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl((prev) => {
        revokeUrl(prev)
        return null
      })
      setOriginalUrl((prev) => {
        revokeUrl(prev)
        return null
      })
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
        if (id !== requestId.current) {
          revokeUrl(preview)
          revokeUrl(original)
          return
        }
        setPreviewUrl((prev) => {
          revokeUrl(prev)
          return preview
        })
        setOriginalUrl((prev) => {
          revokeUrl(prev)
          return original
        })
        setMetaLabel(`${meta.width}×${meta.height} · ${meta.format}`)
      } catch (err) {
        if (id !== requestId.current) return
        const message = err instanceof Error ? err.message : t('errorPreview')
        setError(message)
        setPreviewUrl((prev) => {
          revokeUrl(prev)
          return null
        })
      } finally {
        if (id === requestId.current) setBusy(false)
      }
    })()
  }, [selectedFile, options, t])

  useEffect(() => {
    if (!selectedFile) return
    if (autoSampled.current.has(selectedFile.id)) return

    const card = selectedFile
    let cancelled = false

    ;(async () => {
      const current = optionsByFileRef.current[card.id] ?? cloneDefaults(sessionDefaultsRef.current)
      try {
        await detectCorners(card, current)
      } catch (err) {
        if (cancelled) return
        autoSampled.current.add(card.id)
        const message = err instanceof Error ? err.message : t('errorDetectFailed')
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
          const current = prev[file.id] ?? cloneDefaults(sessionDefaultsRef.current)
          next[file.id] = {
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
        const current = prev[file.id] ?? cloneDefaults(sessionDefaultsRef.current)
        next[file.id] = {
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
        const result = await saveImage(selectedFile, options)
        setOutputDir(result.outputLabel)
        setSaved((prev) => new Set(prev).add(selectedFile.id))
        if (goNext && selectedIndex < files.length - 1) {
          setSelectedIndex((i) => i + 1)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errorSave'))
      } finally {
        setBusy(false)
      }
    },
    [selectedFile, options, selectedIndex, files.length, t],
  )

  const handleSaveAll = useCallback(async () => {
    if (files.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const newlySaved = new Set<string>()
      let lastLabel = outputDir
      for (const file of files) {
        const fileOptions =
          optionsByFileRef.current[file.id] ?? cloneDefaults(sessionDefaultsRef.current)
        const result = await saveImage(file, fileOptions)
        lastLabel = result.outputLabel
        newlySaved.add(file.id)
      }
      if (lastLabel) setOutputDir(lastLabel)
      setSaved((prev) => {
        const next = new Set(prev)
        for (const id of newlySaved) next.add(id)
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorSaveAll'))
    } finally {
      setBusy(false)
    }
  }, [files, outputDir, t])

  const handleChooseOutput = useCallback(async () => {
    const label = await chooseOutputFolder()
    if (label) setOutputDir(label)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement | null
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (busy) return

      const mod = event.metaKey || event.ctrlKey

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

      if (event.shiftKey && !mod && event.key === 'Enter') {
        if (files.length === 0) return
        event.preventDefault()
        void handleSaveAll()
        return
      }

      if (files.length === 0) return

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

  const fileIds = useMemo(() => files.map((f) => f.id), [files])

  return (
    <div className="app-shell">
      <KofiWidget />
      <FeedbackWidget />
      <FolderList
        folderPath={folderPath}
        files={fileIds}
        fileLabels={files.map((f) => f.name)}
        selectedIndex={selectedIndex}
        saved={saved}
        onSelect={setSelectedIndex}
        onOpenFolder={() => void handleOpenFolder()}
        onImportList={() => setImportOpen(true)}
      />
      <Preview
        previewUrl={previewUrl}
        originalUrl={originalUrl}
        showOriginal={showOriginal}
        onToggleOriginal={setShowOriginal}
        busy={busy}
        fileLabel={selectedFile ? fileName(selectedFile.name) : null}
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
        onOpenOutput={() => void handleChooseOutput()}
        busy={busy}
        hasSelection={Boolean(selectedFile)}
        hasFiles={files.length > 0}
        hasOutput={hasOutputFolder() || Boolean(outputDir)}
        outputLabel={outputDir}
        canPickOutputFolder={supportsDirectoryPicker()}
        hasFollowing={selectedIndex < files.length - 1}
      />
      <ImportListDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={handleImportedList}
      />
    </div>
  )
}
