import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useI18n } from '../i18n'
import {
  importCardList,
  type CardGame,
  type ImportProgress,
  type ImportResult,
} from '../lib/cardImport'

interface ImportListDialogProps {
  open: boolean
  onClose: () => void
  onImported: (result: ImportResult, game: CardGame) => void
}

const GAMES: { id: CardGame; labelKey: 'importGameMtg' | 'importGamePokemon' | 'importGameYugioh' }[] =
  [
    { id: 'mtg', labelKey: 'importGameMtg' },
    { id: 'pokemon', labelKey: 'importGamePokemon' },
    { id: 'yugioh', labelKey: 'importGameYugioh' },
  ]

const PLACEHOLDERS: Record<CardGame, string> = {
  mtg: `4 Lightning Bolt
1 Sol Ring (C21)
1 Black Lotus (LEB) 232
1 Swords to Plowshares (MH3) 42`,
  pokemon: `4 Pikachu
2 Charizard (sv3)
1 Pikachu (base1) 58`,
  yugioh: `3 Dark Magician
2 Blue-Eyes White Dragon (LOB)
1 Monster Reborn`,
}

export function ImportListDialog({ open, onClose, onImported }: ImportListDialogProps) {
  const { t } = useI18n()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [game, setGame] = useState<CardGame>('mtg')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const progressLabel = useMemo(() => {
    if (!progress) return null
    const phase =
      progress.phase === 'resolve' ? t('importPhaseResolve') : t('importPhaseDownload')
    return `${phase} ${progress.current}/${progress.total} — ${progress.label}`
  }, [progress, t])

  const close = useCallback(() => {
    if (busy) return
    setError(null)
    setProgress(null)
    onClose()
  }, [busy, onClose])

  const onSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (busy) return
      setBusy(true)
      setError(null)
      setProgress(null)
      try {
        const result = await importCardList(text, game, setProgress)
        if (result.cards.length === 0) {
          setError(
            result.failures[0]?.reason
              ? `${t('importNoneFound')}: ${result.failures[0].reason}`
              : t('importNoneFound'),
          )
          return
        }
        onImported(result, game)
        setText('')
        setProgress(null)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : t('importError'))
      } finally {
        setBusy(false)
      }
    },
    [busy, game, onClose, onImported, t, text],
  )

  return (
    <dialog
      ref={dialogRef}
      className="import-dialog"
      aria-labelledby={titleId}
      onClose={close}
      onClick={(event) => {
        if (event.target === dialogRef.current && !busy) close()
      }}
    >
      <form className="import-form" onSubmit={(e) => void onSubmit(e)}>
        <header className="import-header">
          <h2 id={titleId}>{t('importTitle')}</h2>
          <button type="button" className="secondary compact" onClick={close} disabled={busy}>
            {t('feedbackClose')}
          </button>
        </header>

        <p className="hint">{t('importIntro')}</p>

        <div className="segmented import-games">
          {GAMES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={game === item.id ? 'active' : ''}
              disabled={busy}
              onClick={() => setGame(item.id)}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>

        <label className="import-field">
          <span>{t('importListLabel')}</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDERS[game]}
            rows={12}
            required
            disabled={busy}
          />
        </label>

        <p className="hint">{t('importFormatHint')}</p>

        {progressLabel && <p className="import-progress">{progressLabel}</p>}
        {error && <p className="error">{error}</p>}

        <div className="import-actions">
          <button type="button" className="secondary" onClick={close} disabled={busy}>
            {t('feedbackClose')}
          </button>
          <button type="submit" className="primary" disabled={busy || !text.trim()}>
            {busy ? t('importWorking') : t('importStart')}
          </button>
        </div>
      </form>
    </dialog>
  )
}
