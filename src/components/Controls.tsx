import type {
  ProcessOptions,
  BorderType,
  ColorSpace,
  CornerId,
  CornerColors,
  FollowingDefaultsPatch,
} from '../lib/types'
import { printDefaultsFrom } from '../lib/types'
import { useI18n } from '../i18n'
import type { TranslationKey } from '../i18n'

interface ControlsProps {
  options: ProcessOptions
  onChange: (next: ProcessOptions) => void
  onApplyToAll: () => void
  onApplyToFollowing: (patch: FollowingDefaultsPatch) => void
  onDetectCorners: () => void
  onSave: () => void
  onSaveAndNext: () => void
  onSaveAll: () => void
  onOpenOutput: () => void
  busy: boolean
  hasSelection: boolean
  hasFiles: boolean
  hasOutput: boolean
  hasFollowing: boolean
}

const CORNER_KEYS: { id: CornerId; labelKey: TranslationKey }[] = [
  { id: 'topLeft', labelKey: 'cornerTopLeft' },
  { id: 'topRight', labelKey: 'cornerTopRight' },
  { id: 'bottomLeft', labelKey: 'cornerBottomLeft' },
  { id: 'bottomRight', labelKey: 'cornerBottomRight' },
]

function allCorners(color: string): CornerColors {
  return {
    topLeft: color,
    topRight: color,
    bottomLeft: color,
    bottomRight: color,
  }
}

function roundToStep(value: number, step: number): number {
  const decimals = String(step).includes('.') ? String(step).split('.')[1].length : 0
  const rounded = Math.round(value / step) * step
  return Number(rounded.toFixed(decimals))
}

function StepperField({
  id,
  label,
  value,
  min,
  max,
  step,
  onChange,
  hint,
  integer,
  onSetDefault,
  canSetDefault,
  defaultTitle,
  defaultLabel,
  decreaseLabel,
  increaseLabel,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  hint?: string
  integer?: boolean
  onSetDefault?: () => void
  canSetDefault?: boolean
  defaultTitle: string
  defaultLabel: string
  decreaseLabel: string
  increaseLabel: string
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n))

  const nudge = (dir: -1 | 1) => {
    onChange(clamp(roundToStep(value + dir * step, step)))
  }

  return (
    <section className="control-group">
      <div className="label-row">
        <label htmlFor={id}>{label}</label>
        {onSetDefault ? (
          <button
            type="button"
            className="default-btn"
            disabled={!canSetDefault}
            title={defaultTitle}
            onClick={onSetDefault}
          >
            {defaultLabel}
          </button>
        ) : null}
      </div>
      <div className="stepper">
        <button
          type="button"
          className="stepper-btn"
          aria-label={decreaseLabel}
          onClick={() => nudge(-1)}
        >
          −
        </button>
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const raw = Number(e.target.value)
            if (Number.isNaN(raw)) return
            onChange(clamp(integer ? Math.round(raw) : raw))
          }}
        />
        <button
          type="button"
          className="stepper-btn"
          aria-label={increaseLabel}
          onClick={() => nudge(1)}
        >
          +
        </button>
      </div>
      {hint ? <p className="hint">{hint}</p> : null}
    </section>
  )
}

export function Controls({
  options,
  onChange,
  onApplyToAll,
  onApplyToFollowing,
  onDetectCorners,
  onSave,
  onSaveAndNext,
  onSaveAll,
  onOpenOutput,
  busy,
  hasSelection,
  hasFiles,
  hasOutput,
  hasFollowing,
}: ControlsProps) {
  const { t } = useI18n()

  const set = <K extends keyof ProcessOptions>(key: K, value: ProcessOptions[K]) => {
    onChange({ ...options, [key]: value })
  }

  const setBorderType = (borderType: BorderType) => {
    if (borderType === 'black') {
      onChange({
        ...options,
        borderType,
        sameCorners: true,
        cornerColors: allCorners('#000000'),
      })
      return
    }
    if (borderType === 'white') {
      onChange({
        ...options,
        borderType,
        sameCorners: true,
        cornerColors: allCorners('#ffffff'),
      })
      return
    }
    onChange({ ...options, borderType })
  }

  const setSameCorners = (sameCorners: boolean) => {
    if (sameCorners) {
      const color = options.cornerColors.topLeft
      onChange({
        ...options,
        sameCorners: true,
        borderType: 'none',
        cornerColors: allCorners(color),
      })
      return
    }
    onChange({ ...options, sameCorners: false, borderType: 'none' })
  }

  const setSharedCornerColor = (color: string) => {
    onChange({
      ...options,
      borderType: 'none',
      sameCorners: true,
      cornerColors: allCorners(color),
    })
  }

  const setCornerColor = (id: CornerId, color: string) => {
    onChange({
      ...options,
      borderType: 'none',
      sameCorners: false,
      cornerColors: { ...options.cornerColors, [id]: color },
    })
  }

  const colorsEditable = options.borderType === 'none'
  const defaultLabel = t('applyDefaultShort')
  const defaultTitle = t('setDefaultFollowing')

  return (
    <aside className="panel controls">
      <header className="panel-header">
        <h2>{t('settings')}</h2>
      </header>

      <section className="control-group">
        <label>{t('borderType')}</label>
        <div className="segmented">
          {(
            [
              ['black', 'borderBlack'],
              ['white', 'borderWhite'],
              ['none', 'borderNone'],
            ] as const
          ).map(([value, key]) => (
            <button
              key={value}
              type="button"
              className={options.borderType === value ? 'active' : ''}
              onClick={() => setBorderType(value)}
            >
              {t(key)}
            </button>
          ))}
        </div>
      </section>

      <section className="control-group">
        <label>{t('corners')}</label>
        <div className="segmented">
          <button
            type="button"
            className={options.sameCorners ? 'active' : ''}
            onClick={() => setSameCorners(true)}
            disabled={!colorsEditable}
          >
            {t('cornersSame')}
          </button>
          <button
            type="button"
            className={!options.sameCorners ? 'active' : ''}
            onClick={() => setSameCorners(false)}
            disabled={!colorsEditable}
          >
            {t('cornersDifferent')}
          </button>
        </div>
      </section>

      <section className="control-group">
        <label>{t('cornerColors')}</label>
        {options.sameCorners ? (
          <div className="color-row">
            <input
              type="color"
              aria-label={t('cornerColorAria')}
              value={options.cornerColors.topLeft}
              onChange={(e) => setSharedCornerColor(e.target.value)}
              disabled={!colorsEditable}
            />
            <input
              type="text"
              value={options.cornerColors.topLeft}
              onChange={(e) => setSharedCornerColor(e.target.value)}
              disabled={!colorsEditable}
              spellCheck={false}
            />
          </div>
        ) : (
          <div className="corner-grid">
            {CORNER_KEYS.map(({ id, labelKey }) => (
              <div key={id} className="corner-swatch">
                <span>{t(labelKey)}</span>
                <div className="color-row">
                  <input
                    type="color"
                    aria-label={`${t('cornerColorAria')} ${t(labelKey)}`}
                    value={options.cornerColors[id]}
                    onChange={(e) => setCornerColor(id, e.target.value)}
                    disabled={!colorsEditable}
                  />
                  <input
                    type="text"
                    value={options.cornerColors[id]}
                    onChange={(e) => setCornerColor(id, e.target.value)}
                    disabled={!colorsEditable}
                    spellCheck={false}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="hint">{t('cornerColorsHint')}</p>
        <button
          type="button"
          className="secondary"
          style={{ marginTop: '0.55rem', width: '100%' }}
          onClick={onDetectCorners}
          disabled={!hasSelection || busy}
        >
          {t('detectCorners')}
        </button>
      </section>

      <StepperField
        id="insetPx"
        label={t('insetLabel')}
        value={options.insetPx}
        min={0}
        max={200}
        step={1}
        integer
        onChange={(v) => set('insetPx', v)}
        onSetDefault={() => onApplyToFollowing({ insetPx: options.insetPx })}
        canSetDefault={hasFollowing && !busy}
        defaultTitle={defaultTitle}
        defaultLabel={defaultLabel}
        decreaseLabel={t('decrease', { label: t('insetLabel') })}
        increaseLabel={t('increase', { label: t('insetLabel') })}
        hint={t('insetHint')}
      />

      <section className="control-group">
        <div className="label-row">
          <label>{t('cardSize')}</label>
          <button
            type="button"
            className="default-btn"
            disabled={!hasFollowing || busy}
            title={t('setDefaultSize')}
            onClick={() =>
              onApplyToFollowing({
                resizeToTarget: options.resizeToTarget,
                targetWidthMm: options.targetWidthMm,
                targetHeightMm: options.targetHeightMm,
                dpi: options.dpi,
              })
            }
          >
            {defaultLabel}
          </button>
        </div>
        <div className="control-group row" style={{ padding: 0, marginBottom: '0.45rem' }}>
          <label htmlFor="resizeToTarget">{t('resizeToPrint')}</label>
          <input
            id="resizeToTarget"
            type="checkbox"
            checked={options.resizeToTarget}
            onChange={(e) => set('resizeToTarget', e.target.checked)}
          />
        </div>
        <div className="size-row">
          <input
            type="number"
            min={1}
            max={200}
            step={0.1}
            aria-label={t('widthMm')}
            value={options.targetWidthMm}
            disabled={!options.resizeToTarget}
            onChange={(e) => set('targetWidthMm', Number(e.target.value))}
          />
          <span>×</span>
          <input
            type="number"
            min={1}
            max={200}
            step={0.1}
            aria-label={t('heightMm')}
            value={options.targetHeightMm}
            disabled={!options.resizeToTarget}
            onChange={(e) => set('targetHeightMm', Number(e.target.value))}
          />
        </div>
        <p className="hint">
          {t('cardSizeHint', {
            dpi: options.dpi,
            w: Math.round((options.targetWidthMm / 25.4) * options.dpi),
            h: Math.round((options.targetHeightMm / 25.4) * options.dpi),
          })}
        </p>
      </section>

      <section className="control-group">
        <label htmlFor="dpi">{t('dpi')}</label>
        <input
          id="dpi"
          type="number"
          min={72}
          max={600}
          step={1}
          value={options.dpi}
          onChange={(e) => set('dpi', Number(e.target.value))}
        />
      </section>

      <StepperField
        id="cornerRadius"
        label={t('cornerRadius')}
        value={options.cornerRadiusMm}
        min={0}
        max={20}
        step={0.1}
        onChange={(v) => set('cornerRadiusMm', v)}
        onSetDefault={() => onApplyToFollowing({ cornerRadiusMm: options.cornerRadiusMm })}
        canSetDefault={hasFollowing && !busy}
        defaultTitle={defaultTitle}
        defaultLabel={defaultLabel}
        decreaseLabel={t('decrease', { label: t('cornerRadius') })}
        increaseLabel={t('increase', { label: t('cornerRadius') })}
      />

      <section className="control-group">
        <div className="label-row">
          <label>{t('colorSpace')}</label>
          <button
            type="button"
            className="default-btn"
            disabled={!hasFollowing || busy}
            title={t('setDefaultColorSpace')}
            onClick={() => onApplyToFollowing({ colorSpace: options.colorSpace })}
          >
            {defaultLabel}
          </button>
        </div>
        <div className="segmented">
          {(
            [
              ['rgb', 'RGB'],
              ['cmyk', 'CMYK'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={options.colorSpace === value ? 'active' : ''}
              onClick={() => set('colorSpace', value as ColorSpace)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="hint">{t('colorSpaceHint')}</p>
      </section>

      <StepperField
        id="bleed"
        label={t('bleed')}
        value={options.bleedMm}
        min={0}
        max={20}
        step={0.1}
        onChange={(v) => set('bleedMm', v)}
        onSetDefault={() => onApplyToFollowing({ bleedMm: options.bleedMm })}
        canSetDefault={hasFollowing && !busy}
        defaultTitle={defaultTitle}
        defaultLabel={defaultLabel}
        decreaseLabel={t('decrease', { label: t('bleed') })}
        increaseLabel={t('increase', { label: t('bleed') })}
      />

      <section className="control-group">
        <label htmlFor="threshold">{t('whiteThreshold')}</label>
        <input
          id="threshold"
          type="range"
          min={200}
          max={255}
          value={options.whiteThreshold}
          onChange={(e) => set('whiteThreshold', Number(e.target.value))}
        />
        <div className="range-value">{options.whiteThreshold}</div>
        <p className="hint">{t('whiteThresholdHint')}</p>
      </section>

      <section className="control-group row">
        <label htmlFor="cropMarks">{t('cropMarks')}</label>
        <input
          id="cropMarks"
          type="checkbox"
          checked={options.showCropMarks}
          onChange={(e) => set('showCropMarks', e.target.checked)}
        />
      </section>

      <div className="actions">
        <button
          type="button"
          className="secondary"
          onClick={() => onApplyToFollowing(printDefaultsFrom(options))}
          disabled={!hasFollowing || busy}
        >
          {t('applyDefaultsFollowing')}
        </button>
        <button type="button" className="secondary" onClick={onApplyToAll} disabled={busy}>
          {t('applyToAll')}
        </button>
        <button
          type="button"
          className="primary"
          onClick={onSave}
          disabled={!hasSelection || busy}
        >
          {t('save')}
        </button>
        <button
          type="button"
          className="primary"
          onClick={onSaveAndNext}
          disabled={!hasSelection || busy}
        >
          {t('saveAndNext')}
        </button>
        <button
          type="button"
          className="primary"
          onClick={onSaveAll}
          disabled={!hasFiles || busy}
        >
          {t('saveAll')}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={onOpenOutput}
          disabled={!hasOutput || busy}
        >
          {t('openOutput')}
        </button>
      </div>
    </aside>
  )
}
