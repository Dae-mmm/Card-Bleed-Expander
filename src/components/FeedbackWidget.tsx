import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useI18n } from '../i18n'
import { apiUrl } from '../lib/platform'

type SubmitState = 'idle' | 'sending' | 'sent' | 'error'

export function FeedbackWidget() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('') // honeypot
  const [status, setStatus] = useState<SubmitState>('idle')
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const close = useCallback(() => {
    setOpen(false)
    setStatus('idle')
    setError(null)
  }, [])

  const onSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (status === 'sending') return
      setStatus('sending')
      setError(null)
      try {
        const res = await fetch(apiUrl('/api/feedback'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, contact, message, website }),
        })
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          throw new Error(data.error || t('feedbackError'))
        }
        setStatus('sent')
        setName('')
        setContact('')
        setMessage('')
        setWebsite('')
      } catch (err) {
        setStatus('error')
        setError(err instanceof Error ? err.message : t('feedbackError'))
      }
    },
    [contact, message, name, status, t, website],
  )

  return (
    <>
      <button
        type="button"
        className="feedback-fab"
        onClick={() => setOpen(true)}
      >
        {t('feedbackFab')}
      </button>

      <dialog
        ref={dialogRef}
        className="feedback-dialog"
        aria-labelledby={titleId}
        onClose={close}
        onClick={(event) => {
          if (event.target === dialogRef.current) close()
        }}
      >
        <form className="feedback-form" onSubmit={(e) => void onSubmit(e)}>
          <header className="feedback-header">
            <h2 id={titleId}>{t('feedbackTitle')}</h2>
            <button type="button" className="secondary compact" onClick={close}>
              {t('feedbackClose')}
            </button>
          </header>

          <p className="hint">{t('feedbackIntro')}</p>

          <label className="feedback-field">
            <span>{t('feedbackName')}</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              maxLength={200}
            />
          </label>

          <label className="feedback-field">
            <span>{t('feedbackContact')}</span>
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              autoComplete="email"
              maxLength={200}
              placeholder={t('feedbackContactPlaceholder')}
            />
          </label>

          <label className="feedback-field">
            <span>{t('feedbackMessage')}</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              minLength={5}
              maxLength={5000}
              rows={6}
            />
          </label>

          {/* Honeypot for bots */}
          <label className="feedback-honeypot" aria-hidden="true">
            <span>Website</span>
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>

          {status === 'sent' && <p className="feedback-success">{t('feedbackSent')}</p>}
          {status === 'error' && error && <p className="error">{error}</p>}

          <div className="feedback-actions">
            <button type="button" className="secondary" onClick={close}>
              {t('feedbackClose')}
            </button>
            <button type="submit" className="primary" disabled={status === 'sending'}>
              {status === 'sending' ? t('feedbackSending') : t('feedbackSend')}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
