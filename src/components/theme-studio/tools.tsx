import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Layers, Palette, Sparkles, Wand2 } from 'lucide-react'
import { useT } from '@/i18n'
import {
  applyAccentHarmony, contrastIssues, contrastRatio, deriveSurfaces, fixContrast, fixIssue, HARMONIES,
  harmonyColors, isHexColor, syntaxColor, syntaxMinContrast, UI_MIN_CONTRAST, type Harmony,
} from '@/core/theme-colors'
import { readableOn, splitAlpha } from '@/core/theme'
import { TOKEN_KINDS, type Theme, type UIColorKey } from '@/core/types'
import { Button } from '../ui'
import { ContrastBadge } from './ColorField'
import { colorOf, type ColorKey } from './keys'

function ToolSection({ icon: Icon, title, hint, children }: { icon: typeof Palette; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h4 className="mb-0.5 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.09em] text-subtle uppercase">
        <Icon size={11} /> {title}
      </h4>
      {hint && <p className="mb-2 text-[11px] leading-relaxed text-subtle">{hint}</p>}
      {children}
    </section>
  )
}

function ColorInput({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <span className="flex items-center gap-1.5">
      <label className="relative size-6 shrink-0 cursor-pointer overflow-hidden rounded-lumen-sm border border-edge" style={{ background: value }}>
        <input type="color" aria-label={label} value={splitAlpha(value).base} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
      <input
        value={text}
        spellCheck={false}
        aria-label={label}
        onChange={(e) => {
          setText(e.target.value)
          if (isHexColor(e.target.value)) onChange(e.target.value.trim())
        }}
        className="lm-transition w-[82px] rounded-lumen-sm border border-edge bg-input px-1.5 py-0.5 font-mono text-[11px] outline-none focus:border-accent"
      />
    </span>
  )
}

/* ------------------------------------------------------------------ *
 * Kontraste
 * ------------------------------------------------------------------ */

const TEXT_ROWS: UIColorKey[] = ['text', 'textMuted', 'textSubtle', 'accent', 'success', 'warning', 'danger']
const SURFACE_COLUMNS: UIColorKey[] = ['bg', 'bgElevated', 'bgOverlay', 'bgInput', 'bgActive']

export function ContrastTools({
  draft, change, labelOf, onSelect,
}: {
  draft: Theme
  change: (next: Theme, mark?: string) => void
  labelOf: (key: ColorKey) => string
  onSelect: (key: ColorKey) => void
}) {
  const t = useT()
  const issues = contrastIssues(draft)

  return (
    <>
      <ToolSection icon={AlertTriangle} title={t('themeStudio.tools.issuesTitle')} hint={t('themeStudio.tools.issuesHint')}>
        {issues.length === 0 && (
          <div className="flex items-center gap-2 rounded-lumen-sm border border-ok/30 bg-ok/8 px-2.5 py-2 text-[12px] text-ok">
            <CheckCircle2 size={13} /> {t('themeStudio.tools.noIssues')}
          </div>
        )}
        {issues.length > 0 && (
          <>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11.5px] text-bad">{t('themeStudio.tools.issueCount', { count: issues.length })}</span>
              <Button size="sm" variant="outline" onClick={() => change(issues.reduce(fixIssue, draft), 'fix-all')}>
                <Wand2 size={11} /> {t('themeStudio.tools.fixAll')}
              </Button>
            </div>
            <div className="flex flex-col gap-1">
              {issues.map((issue) => {
                const fg = colorOf(draft, issue.key as ColorKey)
                const bg = draft.ui[issue.against]
                return (
                  <div key={issue.key} className="lm-anim-fade flex items-center gap-2 rounded-lumen-sm border border-edge px-2 py-1.5">
                    <button
                      onClick={() => onSelect(issue.key as ColorKey)}
                      className="flex size-7 shrink-0 items-center justify-center rounded-[5px] border border-edge font-semibold"
                      style={{ background: bg, color: fg }}
                      title={t('themeStudio.tools.select')}
                    >
                      Aa
                    </button>
                    <button onClick={() => onSelect(issue.key as ColorKey)} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-[12px] text-fg">{labelOf(issue.key as ColorKey)}</div>
                      <div className="truncate text-[10.5px] text-subtle">
                        {t('themeStudio.tools.onSurface', { surface: labelOf(`ui:${issue.against}`), min: issue.min })}
                      </div>
                    </button>
                    <ContrastBadge fg={fg} bg={bg} min={issue.min} />
                    <Button size="sm" onClick={() => change(fixIssue(draft, issue), `fix:${issue.key}`)}>
                      {t('themeStudio.tools.fix')}
                    </Button>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </ToolSection>

      <ToolSection icon={Layers} title={t('themeStudio.tools.matrixTitle')} hint={t('themeStudio.tools.matrixHint')}>
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-[3px] text-[10.5px]">
            <thead>
              <tr>
                <th />
                {SURFACE_COLUMNS.map((col) => (
                  <th key={col} className="truncate font-normal text-subtle" title={labelOf(`ui:${col}`)}>{labelOf(`ui:${col}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TEXT_ROWS.map((row) => (
                <tr key={row}>
                  <td className="truncate pr-1 text-muted">{labelOf(`ui:${row}`)}</td>
                  {SURFACE_COLUMNS.map((col) => {
                    const ratio = contrastRatio(draft.ui[row], draft.ui[col])
                    const min = UI_MIN_CONTRAST[row] ?? 3
                    return (
                      <td key={col} className="rounded-[4px] px-1 py-1 text-center font-mono" style={{ background: draft.ui[col], color: draft.ui[row], outline: ratio < min ? `1px solid ${draft.ui.danger}` : undefined }}>
                        {ratio.toFixed(1)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ToolSection>

      <ToolSection icon={Sparkles} title={t('themeStudio.tools.syntaxTitle')}>
        <div className="grid grid-cols-2 gap-1">
          {TOKEN_KINDS.filter((kind) => draft.syntax[kind]).map((kind) => {
            const color = syntaxColor(draft, kind)
            return (
              <button
                key={kind}
                onClick={() => onSelect(`syntax:${kind}`)}
                className="lm-transition flex items-center gap-1.5 rounded-[5px] px-1.5 py-1 text-left hover:bg-hover"
                style={{ background: draft.ui.bg }}
              >
                <span className="min-w-0 flex-1 truncate font-mono text-[11px]" style={{ color }}>{labelOf(`syntax:${kind}`)}</span>
                <ContrastBadge fg={color} bg={draft.ui.bg} min={syntaxMinContrast(kind)} compact />
              </button>
            )
          })}
        </div>
      </ToolSection>
    </>
  )
}

/* ------------------------------------------------------------------ *
 * Paletten
 * ------------------------------------------------------------------ */

const PRESETS = ['#7c8cff', '#22d3ee', '#5ecf8f', '#fbbf24', '#f472b6', '#fb7185', '#c084fc', '#e6e6e8']

export function PaletteTools({ draft, change }: { draft: Theme; change: (next: Theme, mark?: string) => void }) {
  const t = useT()
  const [accent, setAccent] = useState(draft.ui.accent)
  const [harmony, setHarmony] = useState<Harmony>('analogous')
  const [base, setBase] = useState(draft.ui.bg)

  return (
    <>
      <ToolSection icon={Palette} title={t('themeStudio.tools.accentTitle')} hint={t('themeStudio.tools.accentHint')}>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {PRESETS.map((color) => (
            <button
              key={color}
              title={t('themeStudio.tools.setAccent', { color })}
              onClick={() => {
                setAccent(color)
                change({ ...draft, ui: { ...draft.ui, accent: color, cursor: color, accentText: readableOn(color) } }, 'preset')
              }}
              className="lm-transition size-5 rounded-full border border-edge hover:scale-110"
              style={{ background: color }}
            />
          ))}
        </div>
        <div className="mb-2 flex items-center gap-2">
          <ColorInput value={accent} onChange={setAccent} label={t('themeStudio.tools.accentColor')} />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {HARMONIES.map((id) => (
            <button
              key={id}
              onClick={() => setHarmony(id)}
              aria-pressed={harmony === id}
              className={[
                'lm-transition flex flex-col gap-1 rounded-lumen-sm border px-2 py-1.5 text-left',
                harmony === id ? 'border-accent bg-active' : 'border-edge hover:bg-hover',
              ].join(' ')}
            >
              <span className="text-[11px] text-fg">{t(`themeStudio.harmony.${id}`)}</span>
              <span className="flex gap-0.5">
                {harmonyColors(accent, id).map((color, i) => (
                  <span key={i} className="h-2.5 flex-1 rounded-sm" style={{ background: color }} />
                ))}
              </span>
            </button>
          ))}
        </div>
        <Button size="sm" variant="solid" className="mt-2" onClick={() => change(applyAccentHarmony(draft, accent, harmony), 'harmony')}>
          <Wand2 size={11} /> {t('themeStudio.tools.applyHarmony')}
        </Button>
      </ToolSection>

      <ToolSection icon={Layers} title={t('themeStudio.tools.surfacesTitle')} hint={t('themeStudio.tools.surfacesHint')}>
        <div className="flex items-center gap-2">
          <ColorInput value={base} onChange={setBase} label={t('themeStudio.tools.baseColor')} />
          <Button size="sm" variant="outline" onClick={() => change(deriveSurfaces(draft, base), 'surfaces')}>
            <Wand2 size={11} /> {t('themeStudio.tools.derive')}
          </Button>
        </div>
        <div className="mt-2 flex overflow-hidden rounded-lumen-sm border border-edge">
          {(['bg', 'bgElevated', 'bgOverlay', 'bgInput', 'bgHover', 'bgActive', 'border', 'borderStrong'] as const).map((key) => (
            <span key={key} title={key} className="h-5 flex-1" style={{ background: draft.ui[key] }} />
          ))}
        </div>
      </ToolSection>

      <ToolSection icon={Wand2} title={t('themeStudio.tools.autoTitle')} hint={t('themeStudio.tools.autoHint')}>
        <Button size="sm" variant="outline" onClick={() => change(fixContrast(draft), 'fix-contrast')}>
          <Wand2 size={11} /> {t('themeStudio.tools.fixContrast')}
        </Button>
      </ToolSection>
    </>
  )
}
