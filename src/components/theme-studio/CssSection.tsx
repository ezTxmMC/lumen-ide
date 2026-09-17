import { useMemo, useState } from 'react'
import { Check, Copy, Eraser, FilePlus2 } from 'lucide-react'
import { useStore } from '@/state/store'
import { useT } from '@/i18n'
import { registry } from '@/core/registry'
import { TOKEN_KINDS, UI_COLOR_KEYS } from '@/core/types'
import { Button } from '../ui'
import { CodeView } from './CodeView'

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

const EXAMPLE = `:root {
  --c-accent: #ff7ab6;
  --s-keyword: #ffd479;
  --radius: 2px;
  --duration: 0.08s;
}

.cm-line { letter-spacing: 0.02em; }
`

const LAYOUT_VARS = ['--radius', '--radius-sm', '--radius-lg', '--duration', '--duration-slow', '--blur', '--panel-alpha', '--font-mono', '--font-size', '--line-height', '--row-height', '--pad']

/** The “Custom CSS” section: CodeMirror with CSS highlighting and a list of the variables. */
export function CssSection() {
  const t = useT()
  const effects = useStore((s) => s.effects)
  const setEffects = useStore((s) => s.setEffects)
  const themeId = useStore((s) => s.themeId)
  const registryVersion = useStore((s) => s.registryVersion)
  const [copied, setCopied] = useState<string | null>(null)

  const theme = useMemo(
    () => registry.themes().find((entry) => entry.id === themeId) ?? registry.themes()[0],
    [themeId, registryVersion],
  )
  const hasCss = useMemo(() => registry.languages().some((l) => l.id === 'css'), [registryVersion])

  const variables = useMemo(() => [
    ...UI_COLOR_KEYS.map((key) => ({ name: `--c-${kebab(key)}`, value: theme.ui[key] })),
    ...TOKEN_KINDS.filter((kind) => theme.syntax[kind]).map((kind) => {
      const raw = theme.syntax[kind]!
      return { name: `--s-${kind}`, value: typeof raw === 'string' ? raw : raw.color }
    }),
    ...LAYOUT_VARS.map((name) => ({ name, value: getComputedStyle(document.documentElement).getPropertyValue(name).trim() })),
  ], [theme, effects])

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text)
    setCopied(text)
    window.setTimeout(() => setCopied((current) => (current === text ? null : current)), 1200)
  }

  const lines = effects.customCss ? effects.customCss.split('\n').length : 0

  return (
    <div className="flex h-full min-h-0 gap-3 p-4 max-[900px]:flex-col">
      <div className="flex min-h-[360px] min-w-0 flex-1 flex-col">
        <div className="mb-2 flex items-center gap-2">
          <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-subtle">{t('themeStudio.css.intro')}</p>
          <Button size="sm" onClick={() => setEffects({ customCss: effects.customCss ? `${effects.customCss.trimEnd()}\n\n${EXAMPLE}` : EXAMPLE })}>
            <FilePlus2 size={11} /> {t('themeStudio.css.example')}
          </Button>
          <Button size="sm" variant="danger" disabled={!effects.customCss} onClick={() => setEffects({ customCss: '' })}>
            <Eraser size={11} /> {t('themeStudio.css.clear')}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-lumen border border-edge bg-bg focus-within:border-accent">
          <CodeView
            value={effects.customCss}
            languageId={hasCss ? 'css' : 'plaintext'}
            theme={theme}
            effects={effects}
            onChange={(customCss) => setEffects({ customCss })}
          />
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-subtle">
          <span>{t('themeStudio.css.lines', { count: lines })}</span>
          <span className="flex-1" />
          <span>{t('themeStudio.css.liveHint')}</span>
        </div>
      </div>

      <aside className="flex w-[280px] shrink-0 flex-col overflow-hidden rounded-lumen border border-edge max-[900px]:w-full">
        <div className="border-b border-edge px-3 py-2">
          <h4 className="text-[10.5px] font-semibold tracking-[0.09em] text-subtle uppercase">{t('themeStudio.css.variables')}</h4>
          <p className="mt-0.5 text-[11px] text-subtle">{t('themeStudio.css.variablesHint')}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {variables.map(({ name, value }) => (
            <button
              key={name}
              onClick={() => copy(`var(${name})`)}
              title={t('themeStudio.css.copyVar', { name })}
              className="lm-transition group flex w-full items-center gap-2 rounded-lumen-sm px-2 py-1 text-left hover:bg-hover"
            >
              {value.startsWith('#') && <span className="size-3 shrink-0 rounded-[3px] border border-edge" style={{ background: value }} />}
              <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg">{name}</code>
              <span className="max-w-[90px] truncate font-mono text-[10px] text-subtle">{value}</span>
              {copied === `var(${name})`
                ? <Check size={11} className="shrink-0 text-ok" />
                : <Copy size={11} className="shrink-0 text-subtle opacity-0 group-hover:opacity-100" />}
            </button>
          ))}
        </div>
      </aside>
    </div>
  )
}
