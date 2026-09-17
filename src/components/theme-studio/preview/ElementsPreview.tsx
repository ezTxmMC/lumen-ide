import type { CSSProperties, ReactNode } from 'react'
import {
  AlertTriangle, Box, Braces, CheckCircle2, ChevronDown, CornerDownLeft, FileCode2, Hash, Info, Search,
  Terminal, Variable, X, XCircle,
} from 'lucide-react'
import { useT } from '@/i18n'
import { readableOn } from '@/core/theme'
import { withAlpha } from '@/core/theme-colors'
import type { Theme } from '@/core/types'
import { tokenCss, uses, type ColorKey } from '../keys'

/** A tile with a heading; defined outside the preview so dragging does not rebuild it. */
function Card({ theme, title, children, className = '' }: { theme: Theme; title: string; children: ReactNode; className?: string }) {
  const ui = theme.ui
  return (
    <section
      {...uses('ui:bgElevated', 'ui:border')}
      className={`flex flex-col gap-2.5 rounded-lumen border p-3 ${className}`}
      style={{ background: ui.bgElevated, borderColor: ui.border }}
    >
      <h4 {...uses('ui:textSubtle')} className="text-[9.5px] font-semibold tracking-[0.1em] uppercase" style={{ color: ui.textSubtle }}>
        {title}
      </h4>
      {children}
    </section>
  )
}

/** Interface elements in every state, drawn with the draft's colours. */
export function ElementsPreview({ theme }: { theme: Theme }) {
  const t = useT()
  const ui = theme.ui
  const mono: CSSProperties = { fontFamily: 'var(--font-mono)' }
  const tk = (kind: Parameters<typeof tokenCss>[1], text: string, extra: CSSProperties = {}, keys: ColorKey[] = []) => (
    <span {...uses(`syntax:${kind}`, ...keys)} style={{ ...tokenCss(theme, kind), ...extra }}>{text}</span>
  )

  const button = (variant: 'solid' | 'outline' | 'ghost' | 'danger' | 'disabled', label: string) => {
    const styles: Record<typeof variant, { style: CSSProperties; keys: ColorKey[] }> = {
      solid: { style: { background: ui.accent, color: ui.accentText }, keys: ['ui:accent', 'ui:accentText'] },
      outline: { style: { border: `1px solid ${ui.border}`, color: ui.text }, keys: ['ui:border', 'ui:text'] },
      ghost: { style: { background: ui.bgHover, color: ui.text }, keys: ['ui:bgHover', 'ui:text'] },
      danger: { style: { color: ui.danger, background: withAlpha(ui.danger, 0.12) }, keys: ['ui:danger'] },
      disabled: { style: { background: ui.accent, color: ui.accentText, opacity: 0.4 }, keys: ['ui:accent'] },
    }
    return (
      <span {...uses(...styles[variant].keys)} className="inline-flex h-7 items-center rounded-lumen-sm px-2.5 text-[12px] font-medium" style={styles[variant].style}>
        {label}
      </span>
    )
  }

  const codeBox = (children: ReactNode) => (
    <div {...uses('ui:bg')} className="rounded-lumen-sm px-2.5 py-2 text-[12px] leading-[1.75]" style={{ ...mono, background: ui.bg }}>
      {children}
    </div>
  )

  const toast = (kind: 'info' | 'success' | 'warning' | 'error', Icon: typeof Info, color: string, key: ColorKey) => (
    <div {...uses('ui:bgOverlay', 'ui:border')} className="flex items-center gap-2 rounded-lumen border px-2.5 py-1.5 text-[12px]" style={{ background: ui.bgOverlay, borderColor: ui.border, color: ui.text }}>
      <Icon size={13} {...uses(key)} style={{ color }} />
      {t(`themeStudio.preview.toast.${kind}`)}
    </div>
  )

  return (
    <div
      {...uses('ui:bg')}
      className="grid h-full content-start gap-3 overflow-auto rounded-lumen border p-3 text-[12px] [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]"
      style={{ background: ui.bg, borderColor: ui.border, color: ui.text }}
    >
      <Card theme={theme} title={t('themeStudio.preview.buttons')}>
        <div className="flex flex-wrap gap-1.5">
          {button('solid', t('common.save'))}
          {button('outline', t('common.cancel'))}
          {button('ghost', t('common.edit'))}
          {button('danger', t('common.delete'))}
          {button('disabled', t('themeStudio.preview.disabled'))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span {...uses('ui:accent', 'ui:accentText')} className="inline-flex h-7 items-center rounded-lumen-sm px-2.5 text-[12px] font-medium" style={{ background: ui.accent, color: ui.accentText, boxShadow: `0 0 0 1px ${withAlpha(ui.accent, 0.35)}, 0 0 18px -4px ${withAlpha(ui.accent, 0.5)}` }}>
            {t('themeStudio.preview.glow')}
          </span>
          <span {...uses('ui:bgActive', 'ui:text')} className="inline-flex h-7 items-center rounded-lumen-sm px-2.5 text-[12px]" style={{ background: ui.bgActive, color: ui.text }}>
            {t('themeStudio.preview.pressed')}
          </span>
          <span {...uses('ui:accent')} className="inline-flex h-7 items-center rounded-lumen-sm px-2.5 text-[12px]" style={{ color: ui.accent, outline: `2px solid ${ui.accent}`, outlineOffset: 1 }}>
            {t('themeStudio.preview.focused')}
          </span>
        </div>
      </Card>

      <Card theme={theme} title={t('themeStudio.preview.inputs')}>
        <span {...uses('ui:bgInput', 'ui:border', 'ui:textSubtle')} className="flex h-7 items-center gap-2 rounded-lumen-sm border px-2" style={{ background: ui.bgInput, borderColor: ui.border, color: ui.textSubtle }}>
          <Search size={12} /> {t('common.searchPlaceholder')}
        </span>
        <span {...uses('ui:bgInput', 'ui:accent', 'ui:text')} className="flex h-7 items-center rounded-lumen-sm border px-2" style={{ background: ui.bgInput, borderColor: ui.accent, color: ui.text }}>
          lumen-theme<span {...uses('ui:cursor')} className="ml-px inline-block h-3.5 w-px" style={{ background: ui.cursor }} />
        </span>
        <div>
          <span {...uses('ui:bgInput', 'ui:danger')} className="flex h-7 items-center rounded-lumen-sm border px-2" style={{ background: ui.bgInput, borderColor: ui.danger, color: ui.text }}>
            #12g
          </span>
          <span {...uses('ui:danger')} className="mt-1 block text-[11px]" style={{ color: ui.danger }}>{t('themeStudio.preview.invalidColor')}</span>
        </div>
      </Card>

      <Card theme={theme} title={t('themeStudio.preview.controls')}>
        {[true, false].map((on) => (
          <div key={String(on)} className="flex items-center justify-between">
            <span {...uses('ui:text')}>{on ? t('themeStudio.preview.toggleOn') : t('themeStudio.preview.toggleOff')}</span>
            <span {...uses(on ? 'ui:accent' : 'ui:bgActive')} className="relative h-5 w-[34px] rounded-full" style={{ background: on ? ui.accent : ui.bgActive }}>
              <span className="absolute top-[3px] size-[14px] rounded-full bg-white shadow" style={{ left: on ? 17 : 3 }} />
            </span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <span {...uses('ui:bgActive')} className="relative h-1 flex-1 rounded-full" style={{ background: ui.bgActive }}>
            <span {...uses('ui:accent')} className="absolute inset-y-0 left-0 w-3/5 rounded-full" style={{ background: ui.accent }} />
            <span {...uses('ui:accent', 'ui:bgElevated')} className="absolute top-1/2 left-3/5 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ background: ui.accent, borderColor: ui.bgElevated }} />
          </span>
          <span {...uses('ui:textMuted')} className="text-[11px]" style={{ ...mono, color: ui.textMuted }}>60 %</span>
        </div>
        <div className="relative">
          <span {...uses('ui:bgInput', 'ui:borderStrong')} className="flex h-7 items-center justify-between rounded-lumen-sm border px-2" style={{ background: ui.bgInput, borderColor: ui.borderStrong }}>
            TypeScript <ChevronDown size={12} />
          </span>
          <div {...uses('ui:bgOverlay', 'ui:border')} className="mt-1 rounded-lumen-sm border p-1" style={{ background: ui.bgOverlay, borderColor: ui.border }}>
            {['JavaScript', 'TypeScript', 'Rust'].map((name) => {
              const active = name === 'TypeScript'
              return (
                <div key={name} {...uses(active ? 'ui:bgActive' : 'ui:textMuted')} className="rounded-[4px] px-2 py-0.5" style={{ background: active ? ui.bgActive : undefined, color: active ? ui.text : ui.textMuted }}>
                  {name}
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      <Card theme={theme} title={t('themeStudio.preview.palette')}>
        <div {...uses('ui:bgOverlay', 'ui:border')} className="overflow-hidden rounded-lumen border" style={{ background: ui.bgOverlay, borderColor: ui.border }}>
          <div className="flex items-center gap-2 border-b px-2.5 py-1.5" style={{ borderColor: ui.border }}>
            <Terminal size={12} {...uses('ui:accent')} style={{ color: ui.accent }} />
            <span {...uses('ui:text')}>&gt;theme</span>
            <span {...uses('ui:cursor')} className="inline-block h-3.5 w-px" style={{ background: ui.cursor }} />
          </div>
          <div className="p-1">
            {[
              [t('themeStudio.preview.cmdNewTheme'), 'Ctrl+K T'],
              [t('themeStudio.preview.cmdEditTheme'), ''],
              [t('themeStudio.preview.cmdToggleType'), 'Ctrl+Alt+L'],
            ].map(([label, keys], index) => {
              const active = index === 0
              return (
                <div
                  key={label}
                  {...uses(...(active ? ['ui:accent', 'ui:accentText'] as ColorKey[] : ['ui:text'] as ColorKey[]))}
                  className="flex items-center gap-2 rounded-[5px] px-2 py-1"
                  style={{ background: active ? ui.accent : undefined, color: active ? ui.accentText : ui.text }}
                >
                  <span className="flex-1 truncate">{label}</span>
                  {keys && (
                    <kbd {...uses('ui:border')} className="rounded border px-1 text-[10px]" style={{ ...mono, borderColor: active ? withAlpha(ui.accentText, 0.35) : ui.border, color: active ? ui.accentText : ui.textMuted }}>
                      {keys}
                    </kbd>
                  )}
                  {active && <CornerDownLeft size={11} />}
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      <Card theme={theme} title={t('themeStudio.preview.toasts')}>
        {toast('info', Info, ui.accent, 'ui:accent')}
        {toast('success', CheckCircle2, ui.success, 'ui:success')}
        {toast('warning', AlertTriangle, ui.warning, 'ui:warning')}
        {toast('error', XCircle, ui.danger, 'ui:danger')}
      </Card>

      <Card theme={theme} title={t('themeStudio.preview.dialog')}>
        <div className="relative overflow-hidden rounded-lumen-sm p-3" style={{ background: withAlpha('#000000', 0.45) }}>
          <div {...uses('ui:bgOverlay', 'ui:border')} className="rounded-lumen border shadow-lg" style={{ background: ui.bgOverlay, borderColor: ui.border }}>
            <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: ui.border }}>
              <span {...uses('ui:text')} className="font-medium">{t('themeStudio.preview.dialogTitle')}</span>
              <X size={12} {...uses('ui:textSubtle')} style={{ color: ui.textSubtle }} />
            </div>
            <p {...uses('ui:textMuted')} className="px-3 py-2 text-[11.5px] leading-relaxed" style={{ color: ui.textMuted }}>
              {t('themeStudio.preview.dialogBody')}
            </p>
            <div className="flex justify-end gap-1.5 border-t px-3 py-2" style={{ borderColor: ui.border }}>
              {button('ghost', t('common.cancel'))}
              {button('danger', t('common.delete'))}
            </div>
          </div>
        </div>
      </Card>

      <Card theme={theme} title={t('themeStudio.preview.tooltip')}>
        <div className="flex flex-col items-start gap-1">
          <div {...uses('ui:bgOverlay', 'ui:border', 'ui:text')} className="relative rounded-lumen-sm border px-2 py-1 text-[11.5px]" style={{ background: ui.bgOverlay, borderColor: ui.border, color: ui.text }}>
            {t('themeStudio.preview.tooltipText')} <kbd className="ml-1 rounded border px-1 text-[10px]" style={{ ...mono, borderColor: ui.border, color: ui.textMuted }}>Ctrl+S</kbd>
          </div>
          {button('outline', t('common.save'))}
        </div>
        <div {...uses('ui:bgOverlay', 'ui:border')} className="rounded-lumen-sm border px-2.5 py-2 text-[11.5px]" style={{ background: ui.bgOverlay, borderColor: ui.border }}>
          <div style={mono}>{tk('keyword', 'function ')}{tk('function', 'load')}{tk('punctuation', '(')}{tk('variable', 'id')}{tk('operator', ': ')}{tk('type', 'number')}{tk('punctuation', ')')}</div>
          <div {...uses('ui:textMuted')} className="mt-1 border-t pt-1" style={{ borderColor: ui.border, color: ui.textMuted }}>{t('themeStudio.preview.hoverDoc')}</div>
        </div>
      </Card>

      <Card theme={theme} title={t('themeStudio.preview.completion')}>
        {codeBox(<>{tk('variable', 'store')}{tk('punctuation', '.')}{tk('property', 'se')}<span {...uses('ui:cursor')} className="inline-block h-3.5 w-[2px] align-middle" style={{ background: ui.cursor }} /></>)}
        <div {...uses('ui:bgOverlay', 'ui:border')} className="overflow-hidden rounded-lumen border" style={{ ...mono, background: ui.bgOverlay, borderColor: ui.border }}>
          {[
            { icon: Braces, label: 'sessions', kind: 'Map<string, Session>' },
            { icon: Variable, label: 'selected', kind: 'Session | null' },
            { icon: Box, label: 'setTheme', kind: '(id: string) => void' },
            { icon: Hash, label: 'serialize', kind: '() => string' },
          ].map((item, index) => {
            const active = index === 0
            const Icon = item.icon
            return (
              <div
                key={item.label}
                {...uses(...(active ? ['ui:accent', 'ui:accentText'] as ColorKey[] : ['ui:text'] as ColorKey[]))}
                className="flex items-center gap-2 px-2.5 py-[3px] text-[11.5px]"
                style={{ background: active ? ui.accent : undefined, color: active ? ui.accentText : ui.text }}
              >
                <Icon size={11} style={{ opacity: 0.75 }} />
                <span><b className="font-semibold">se</b>{item.label.slice(2)}</span>
                <span className="ml-auto truncate text-[10px]" style={{ opacity: 0.7 }}>{item.kind}</span>
              </div>
            )
          })}
        </div>
      </Card>

      <Card theme={theme} title={t('themeStudio.preview.diagnostics')} className="[grid-column:span_2] max-[700px]:[grid-column:auto]">
        {codeBox(
          <>
            <div>
              {tk('keyword', 'const ')}
              <span {...uses('syntax:variable', 'ui:danger')} style={{ ...tokenCss(theme, 'variable'), textDecoration: `underline wavy ${ui.danger}`, textDecorationSkipInk: 'none' }}>total</span>
              {tk('operator', ' = ')}{tk('function', 'sum')}{tk('punctuation', '(')}
              <span {...uses('syntax:variable', 'ui:warning')} style={{ ...tokenCss(theme, 'variable'), textDecoration: `underline wavy ${ui.warning}`, textDecorationSkipInk: 'none' }}>items</span>
              {tk('punctuation', ')')}
            </div>
            <div>
              <span {...uses('syntax:keyword', 'ui:textMuted')} style={{ ...tokenCss(theme, 'keyword'), textDecoration: `underline dotted ${ui.textMuted}` }}>var</span>
              {tk('variable', ' legacy')}{tk('operator', ' = ')}{tk('number', '0')}
            </div>
          </>,
        )}
        <div {...uses('ui:bgOverlay', 'ui:border')} className="rounded-lumen border text-[11.5px]" style={{ background: ui.bgOverlay, borderColor: ui.border }}>
          <div {...uses('ui:danger')} className="border-l-[3px] px-2.5 py-1" style={{ ...mono, borderColor: ui.danger, color: ui.text }}>
            {t('themeStudio.preview.diagError')}
          </div>
          <div {...uses('ui:warning')} className="border-t border-l-[3px] px-2.5 py-1" style={{ ...mono, borderLeftColor: ui.warning, borderTopColor: ui.border, color: ui.text }}>
            {t('themeStudio.preview.diagWarning')}
            <span {...uses('ui:bgActive')} className="ml-2 rounded-[4px] px-1.5 py-px text-[10.5px]" style={{ background: ui.bgActive }}>{t('themeStudio.preview.quickFix')}</span>
          </div>
        </div>
      </Card>

      <Card theme={theme} title={t('themeStudio.preview.editorMarks')} className="[grid-column:span_2] max-[700px]:[grid-column:auto]">
        {codeBox(
          <>
            {/* Suchtreffer: aktueller Treffer mit Akzent, weitere mit Warnfarbe */}
            <div {...uses('ui:lineHighlight')} style={{ background: ui.lineHighlight }}>
              {tk('variable', 'theme', { background: withAlpha(ui.accent, 0.45), outline: `1px solid ${ui.warning}` }, ['ui:accent'])}
              {tk('punctuation', '.')}{tk('property', 'ui')}{tk('operator', ' = ')}
              {tk('variable', 'theme', { background: withAlpha(ui.warning, 0.3), outline: `1px solid ${ui.warning}` }, ['ui:warning'])}
              {tk('punctuation', '.')}{tk('function', 'clone')}{tk('punctuation', '()')}
              <span {...uses('ui:textSubtle')} className="ml-3 font-sans text-[10.5px]" style={{ color: ui.textSubtle }}>{t('themeStudio.preview.searchMatches')}</span>
            </div>
            {/* Klammerpaar */}
            <div>
              {tk('control', 'if ')}
              <span {...uses('ui:bgActive', 'ui:accent')} style={{ ...tokenCss(theme, 'punctuation'), background: ui.bgActive, outline: `1px solid ${ui.accent}`, borderRadius: 2 }}>(</span>
              {tk('variable', 'ready')}
              <span {...uses('ui:bgActive', 'ui:accent')} style={{ ...tokenCss(theme, 'punctuation'), background: ui.bgActive, outline: `1px solid ${ui.accent}`, borderRadius: 2 }}>)</span>
              {tk('punctuation', ' { ')}
              <span {...uses('ui:danger')} style={{ color: ui.danger }}>]</span>
              <span {...uses('ui:textSubtle')} className="ml-3 font-sans text-[10.5px]" style={{ color: ui.textSubtle }}>{t('themeStudio.preview.brackets')}</span>
            </div>
            {/* Auswahl und Mehrfachcursor */}
            <div>
              {tk('keyword', 'let ')}
              {tk('variable', 'count', { background: ui.selection }, ['ui:selection'])}
              <span {...uses('ui:cursor')} className="inline-block h-3.5 w-[2px] align-middle" style={{ background: ui.cursor }} />
              {tk('operator', ' = ')}{tk('number', '1')}{tk('punctuation', '; ')}
              {tk('variable', 'count')}
              <span {...uses('ui:cursor')} className="inline-block h-3.5 w-[2px] align-middle" style={{ background: ui.cursor }} />
              {tk('operator', ' += ')}{tk('number', '2')}
              <span {...uses('ui:textSubtle')} className="ml-3 font-sans text-[10.5px]" style={{ color: ui.textSubtle }}>{t('themeStudio.preview.multiCursor')}</span>
            </div>
            {/* Inlay-Hints */}
            <div>
              {tk('function', 'resize')}{tk('punctuation', '(')}
              <span {...uses('ui:bgActive', 'ui:textMuted')} className="mx-px rounded-[4px] px-1 text-[10px]" style={{ background: ui.bgActive, color: ui.textMuted, opacity: 0.85 }}>width:</span>
              {tk('number', '800')}{tk('punctuation', ', ')}
              <span {...uses('ui:bgActive', 'ui:textMuted')} className="mx-px rounded-[4px] px-1 text-[10px]" style={{ background: ui.bgActive, color: ui.textMuted, opacity: 0.85 }}>height:</span>
              {tk('number', '600')}{tk('punctuation', ')')}
              <span {...uses('ui:bgActive', 'ui:textMuted')} className="mx-px rounded-[4px] px-1 text-[10px] italic" style={{ background: ui.bgActive, color: ui.textMuted, opacity: 0.85 }}>: Size</span>
              <span {...uses('ui:textSubtle')} className="ml-3 font-sans text-[10.5px]" style={{ color: ui.textSubtle }}>{t('themeStudio.preview.inlayHints')}</span>
            </div>
          </>,
        )}
      </Card>

      <Card theme={theme} title={t('themeStudio.preview.badges')}>
        <div className="flex flex-wrap gap-1.5">
          {([['ui:accent', ui.accent], ['ui:success', ui.success], ['ui:warning', ui.warning], ['ui:danger', ui.danger]] as [ColorKey, string][]).map(([key, color]) => (
            <span key={key} {...uses(key)} className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: color, color: readableOn(color) }}>
              {key.slice(3)}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {([['ui:accent', ui.accent], ['ui:success', ui.success], ['ui:warning', ui.warning], ['ui:danger', ui.danger]] as [ColorKey, string][]).map(([key, color]) => (
            <span key={key} {...uses(key)} className="rounded-[4px] border px-1.5 py-0.5 text-[10.5px]" style={{ color, borderColor: withAlpha(color, 0.4), background: withAlpha(color, 0.1) }}>
              {key.slice(3)}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <FileCode2 size={12} {...uses('ui:textMuted')} style={{ color: ui.textMuted }} />
          <span {...uses('ui:border')} className="h-px flex-1" style={{ background: ui.border }} />
          <span {...uses('ui:borderStrong')} className="h-px flex-1" style={{ background: ui.borderStrong }} />
        </div>
      </Card>
    </div>
  )
}
