import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Code2, Columns2, Component, Eye, LayoutDashboard, Minus, MousePointerClick, Plus, SquareSplitHorizontal,
  Terminal as TerminalIcon,
} from 'lucide-react'
import { useT } from '@/i18n'
import type { Effects } from '@/core/theme'
import { svgColorMatrix, VISION_MODES, type VisionMode } from '@/core/theme-colors'
import type { Theme } from '@/core/types'
import { CodeView } from '../CodeView'
import { readStorage, STORAGE, uses, writeStorage, type ColorKey } from '../keys'
import { SAMPLES, sampleSelection } from '../samples'
import { ElementsPreview } from './ElementsPreview'
import { IdePreview } from './IdePreview'
import { TerminalPreview } from './TerminalPreview'

export type PreviewMode = 'ide' | 'editor' | 'elements' | 'terminal'
type Compare = 'off' | 'split' | 'slider'
type Backdrop = 'app' | 'checker' | 'black' | 'white'

interface StageSettings {
  mode: PreviewMode
  zoom: number
  compare: Compare
  backdrop: Backdrop
  vision: VisionMode
  language: string
}

const DEFAULTS: StageSettings = {
  mode: 'ide', zoom: 100, compare: 'off', backdrop: 'app', vision: 'none', language: 'typescript',
}

const MODES: { id: PreviewMode; icon: typeof Code2 }[] = [
  { id: 'ide', icon: LayoutDashboard },
  { id: 'editor', icon: Code2 },
  { id: 'elements', icon: Component },
  { id: 'terminal', icon: TerminalIcon },
]

const COMPARE_ICON: Record<Compare, typeof Code2> = { off: Eye, split: Columns2, slider: SquareSplitHorizontal }

const BACKDROP_CLASS: Record<Backdrop, string> = {
  app: 'bg-bg',
  checker: 'lm-ts-checker',
  black: 'bg-black',
  white: 'bg-white',
}

/** CodeMirror elements belonging to an interface colour, for highlighting and clicking. */
const EDITOR_SELECTORS: [string, ColorKey][] = [
  ['.cm-matchingBracket', 'ui:accent'],
  ['.cm-selectionBackground', 'ui:selection'],
  ['.cm-cursor', 'ui:cursor'],
  ['.cm-activeLineGutter', 'ui:text'],
  ['.cm-gutters', 'ui:gutter'],
  ['.cm-activeLine', 'ui:lineHighlight'],
]

const HIT_RULE = `outline: 2px solid #ff3ea5 !important; outline-offset: -1px; border-radius: 3px;
  animation: lm-ts-flash 1.1s ease-in-out infinite !important; position: relative; z-index: 1;`

/** CSS that makes every place a colour appears light up in the preview. */
function highlightCss(key: ColorKey | null): string {
  if (!key) return ''
  const selectors = [`.lm-ts-stage [data-c~="${key}"]`]
  if (key.startsWith('syntax:')) selectors.push(`.lm-ts-stage .lm-tk-${key.slice(7)}`)
  for (const [selector, owner] of EDITOR_SELECTORS) {
    if (owner === key) selectors.push(`.lm-ts-stage ${selector}`)
  }
  return `${selectors.join(',\n')} { ${HIT_RULE} }`
}

/** Colour key of an element that was clicked or hovered. */
function keysAt(target: EventTarget | null): ColorKey[] {
  const el = target as HTMLElement | null
  if (!el?.closest) return []
  const token = el.closest('[class*="lm-tk-"]')
  const tokenKind = token && /lm-tk-(\w+)/.exec(token.className)?.[1]
  if (tokenKind) return [`syntax:${tokenKind}` as ColorKey]
  for (const [selector, key] of EDITOR_SELECTORS) {
    if (el.closest(selector)) return [key]
  }
  const tagged = el.closest('[data-c]')
  if (!tagged) return []
  return (tagged.getAttribute('data-c') ?? '').split(' ').filter(Boolean) as ColorKey[]
}

function EditorPreview({ theme, effects, language }: { theme: Theme; effects: Effects; language: string }) {
  const sample = SAMPLES.find((s) => s.languageId === language) ?? SAMPLES[0]
  const selection = useMemo(() => sampleSelection(sample), [sample])
  return (
    <div
      {...uses('ui:bg', 'ui:text')}
      className="flex h-full min-h-[380px] flex-col overflow-hidden rounded-lumen border"
      style={{ background: theme.ui.bg, borderColor: theme.ui.border, color: theme.ui.text }}
    >
      <div {...uses('ui:bgElevated', 'ui:border')} className="flex h-8 shrink-0 items-stretch border-b" style={{ background: theme.ui.bgElevated, borderColor: theme.ui.border }}>
        <span {...uses('ui:bg', 'ui:text', 'ui:accent')} className="relative flex items-center px-3 text-[11.5px]" style={{ background: theme.ui.bg, color: theme.ui.text }}>
          <span className="absolute top-0 right-0 left-0 h-[2px]" style={{ background: theme.ui.accent }} />
          {sample.file}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <CodeView
          key={sample.languageId}
          value={sample.code}
          languageId={sample.languageId}
          theme={theme}
          effects={effects}
          selection={selection}
          readOnly
        />
      </div>
    </div>
  )
}

function ToolButton({ active, title, onClick, children }: { active?: boolean; title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={[
        'lm-transition flex h-6 shrink-0 items-center gap-1 rounded-[5px] px-1.5 text-[11.5px]',
        active ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-hover hover:text-fg',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

/**
 * The Studio's preview area: mode, zoom, before/after, background and the
 * colour-blindness simulation. Hovering a swatch lights up here, and clicking
 * an element selects its colour.
 */
export function PreviewStage({
  draft, original, effects, highlight, onPick, labelOf,
}: {
  draft: Theme
  original: Theme
  effects: Effects
  highlight: ColorKey | null
  onPick: (key: ColorKey) => void
  labelOf: (key: ColorKey) => string
}) {
  const t = useT()
  const [settings, setSettings] = useState<StageSettings>(() => ({ ...DEFAULTS, ...readStorage<Partial<StageSettings>>(STORAGE.preview, {}) }))
  const [split, setSplit] = useState(50)
  const [hover, setHover] = useState<ColorKey[]>([])
  const filterId = useRef(`lm-ts-vision-${Math.random().toString(36).slice(2, 8)}`).current

  const update = (patch: Partial<StageSettings>) => setSettings((s) => ({ ...s, ...patch }))
  useEffect(() => writeStorage(STORAGE.preview, settings), [settings])

  const render = (theme: Theme) => {
    if (settings.mode === 'editor') return <EditorPreview theme={theme} effects={effects} language={settings.language} />
    if (settings.mode === 'elements') return <ElementsPreview theme={theme} />
    if (settings.mode === 'terminal') return <TerminalPreview theme={theme} />
    return <IdePreview theme={theme} />
  }

  const pick = (event: React.MouseEvent) => {
    const keys = keysAt(event.target)
    if (!keys.length) return
    event.preventDefault()
    onPick(keys[0])
  }

  const zoomBy = (delta: number) => update({ zoom: Math.min(200, Math.max(50, settings.zoom + delta)) })
  const zoomStyle = { zoom: settings.zoom / 100 }
  const visionFilter = settings.vision === 'none' ? undefined : `url(#${filterId}-${settings.vision})`

  const caption = (text: string, side = 'left-2') => (
    <span className={`lm-glass pointer-events-none absolute top-2 z-10 rounded-full border border-edge px-2 py-0.5 text-[10.5px] text-muted ${side}`}>
      {text}
    </span>
  )

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Filter für die Farbenblindheits-Simulation */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        {VISION_MODES.filter((m) => m !== 'none').map((mode) => (
          <filter key={mode} id={`${filterId}-${mode}`} colorInterpolationFilters="linearRGB">
            <feColorMatrix type="matrix" values={svgColorMatrix(mode as Exclude<VisionMode, 'none'>)} />
          </filter>
        ))}
      </svg>
      <style>{highlightCss(highlight)}</style>

      {/* Werkzeugleiste */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-edge px-2 py-1.5">
        <div className="flex items-center gap-0.5 rounded-lumen-sm border border-edge p-0.5">
          {MODES.map(({ id, icon: Icon }) => (
            <ToolButton key={id} active={settings.mode === id} title={t(`themeStudio.stage.mode.${id}`)} onClick={() => update({ mode: id })}>
              <Icon size={12} /> <span className="max-[1100px]:hidden">{t(`themeStudio.stage.mode.${id}`)}</span>
            </ToolButton>
          ))}
        </div>

        {settings.mode === 'editor' && (
          <select
            value={settings.language}
            onChange={(e) => update({ language: e.target.value })}
            aria-label={t('themeStudio.stage.language')}
            className="lm-transition h-6 rounded-lumen-sm border border-edge bg-input px-1.5 text-[11.5px] hover:border-edge-strong"
          >
            {SAMPLES.map((s) => <option key={s.languageId} value={s.languageId}>{s.label}</option>)}
          </select>
        )}

        <span className="flex-1" />

        <div className="flex items-center gap-0.5" title={t('themeStudio.stage.zoom')}>
          <ToolButton title={t('themeStudio.stage.zoomOut')} onClick={() => zoomBy(-10)}><Minus size={11} /></ToolButton>
          <button
            onClick={() => update({ zoom: 100 })}
            title={t('themeStudio.stage.zoomReset')}
            className="lm-transition h-6 w-11 rounded-[5px] font-mono text-[10.5px] tabular-nums text-muted hover:bg-hover"
          >
            {settings.zoom}%
          </button>
          <ToolButton title={t('themeStudio.stage.zoomIn')} onClick={() => zoomBy(10)}><Plus size={11} /></ToolButton>
        </div>

        <span className="mx-1 h-4 w-px bg-edge" />

        <div className="flex items-center gap-0.5 rounded-lumen-sm border border-edge p-0.5">
          {(['off', 'split', 'slider'] as const).map((id) => {
            const Icon = COMPARE_ICON[id]
            return (
              <ToolButton key={id} active={settings.compare === id} title={t(`themeStudio.stage.compare.${id}`)} onClick={() => update({ compare: id })}>
                <Icon size={12} />
              </ToolButton>
            )
          })}
        </div>

        <select
          value={settings.backdrop}
          onChange={(e) => update({ backdrop: e.target.value as Backdrop })}
          title={t('themeStudio.stage.backdrop')}
          aria-label={t('themeStudio.stage.backdrop')}
          className="lm-transition h-6 rounded-lumen-sm border border-edge bg-input px-1.5 text-[11.5px] hover:border-edge-strong"
        >
          {(['app', 'checker', 'black', 'white'] as const).map((id) => (
            <option key={id} value={id}>{t(`themeStudio.stage.backdrops.${id}`)}</option>
          ))}
        </select>

        <select
          value={settings.vision}
          onChange={(e) => update({ vision: e.target.value as VisionMode })}
          title={t('themeStudio.stage.vision')}
          aria-label={t('themeStudio.stage.vision')}
          className={[
            'lm-transition h-6 rounded-lumen-sm border bg-input px-1.5 text-[11.5px] hover:border-edge-strong',
            settings.vision === 'none' ? 'border-edge' : 'border-accent text-accent',
          ].join(' ')}
        >
          {VISION_MODES.map((id) => <option key={id} value={id}>{t(`themeStudio.vision.${id}`)}</option>)}
        </select>
      </div>

      {/* Bühne */}
      <div
        className={`lm-ts-stage lm-transition relative min-h-0 flex-1 overflow-auto p-4 ${BACKDROP_CLASS[settings.backdrop]}`}
        onClickCapture={pick}
        onMouseOver={(e) => {
          const next = keysAt(e.target)
          setHover((prev) => (prev.join() === next.join() ? prev : next))
        }}
        onMouseLeave={() => setHover([])}
      >
        <div className="h-full" style={{ filter: visionFilter }}>
          {settings.compare === 'off' && (
            <div key={settings.mode} className="lm-anim-fade h-full" style={zoomStyle}>{render(draft)}</div>
          )}

          {settings.compare === 'split' && (
            <div className="grid h-full grid-cols-2 gap-3">
              <div className="relative h-full min-w-0">
                {caption(t('themeStudio.stage.before'))}
                <div className="h-full" style={zoomStyle}>{render(original)}</div>
              </div>
              <div className="relative h-full min-w-0">
                {caption(t('themeStudio.stage.after'))}
                <div className="h-full" style={zoomStyle}>{render(draft)}</div>
              </div>
            </div>
          )}

          {settings.compare === 'slider' && (
            <div className="relative h-full">
              <div className="absolute inset-0" style={zoomStyle}>{render(original)}</div>
              <div className="absolute inset-0" style={{ ...zoomStyle, clipPath: `inset(0 0 0 ${split}%)` }}>{render(draft)}</div>
              <span className="pointer-events-none absolute inset-y-0 z-10 w-[2px] bg-accent shadow-[0_0_0_1px_rgb(0_0_0/30%)]" style={{ left: `${split}%` }} />
              {caption(t('themeStudio.stage.before'))}
              {caption(t('themeStudio.stage.after'), 'right-2')}
            </div>
          )}
        </div>
      </div>

      {/* Fußzeile: Schieberegler für den Vergleich und Hinweis zur überfahrenen Farbe */}
      <div className="flex h-7 shrink-0 items-center gap-2 border-t border-edge px-3 text-[11px] text-subtle">
        {settings.compare === 'slider' && (
          <label className="flex w-64 items-center gap-2">
            <span className="shrink-0">{t('themeStudio.stage.before')}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={split}
              onChange={(e) => setSplit(Number(e.target.value))}
              className="lm-range flex-1"
              aria-label={t('themeStudio.stage.compare.slider')}
            />
            <span className="shrink-0">{t('themeStudio.stage.after')}</span>
          </label>
        )}
        <span className="flex-1" />
        <MousePointerClick size={11} className="shrink-0" />
        <span className="truncate">
          {hover.length ? hover.map(labelOf).join(' · ') : t('themeStudio.stage.pickHint')}
        </span>
      </div>
    </div>
  )
}
