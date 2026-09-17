/** Colour keys, groups and small helpers of the Theme Studio. */

import { syntaxColor, withSyntaxColor } from '@/core/theme-colors'
import { TOKEN_KINDS, type SyntaxStyle, type Theme, type TokenKind, type UIColorKey } from '@/core/types'

/** `ui:bg` or `syntax:keyword` — how colours are named in preview attributes and tools. */
export type ColorKey = `ui:${UIColorKey}` | `syntax:${TokenKind}`

export interface UiGroup {
  id: 'surfaces' | 'lines' | 'text' | 'signals' | 'editor'
  keys: UIColorKey[]
}

export const UI_GROUPS: UiGroup[] = [
  { id: 'surfaces', keys: ['bg', 'bgElevated', 'bgOverlay', 'bgInput', 'bgHover', 'bgActive'] },
  { id: 'lines', keys: ['border', 'borderStrong'] },
  { id: 'text', keys: ['text', 'textMuted', 'textSubtle'] },
  { id: 'signals', keys: ['accent', 'accentText', 'success', 'warning', 'danger'] },
  { id: 'editor', keys: ['selection', 'lineHighlight', 'cursor', 'gutter', 'scrollbar'] },
]

/** Syntax groups, so “reset per group” works here too. */
export const SYNTAX_GROUPS: { id: 'code' | 'values' | 'names' | 'markup'; kinds: TokenKind[] }[] = [
  { id: 'code', kinds: ['keyword', 'control', 'operator', 'punctuation', 'comment', 'meta'] },
  { id: 'values', kinds: ['string', 'escape', 'number', 'constant', 'regexp', 'invalid'] },
  { id: 'names', kinds: ['type', 'builtin', 'function', 'variable', 'property'] },
  { id: 'markup', kinds: ['tag', 'attribute'] },
]

export const TOKEN_SAMPLE: Record<TokenKind, string> = {
  keyword: 'const', control: 'return', type: 'string', builtin: 'console',
  constant: 'true', string: '"Text"', escape: '\\n', number: '42',
  comment: '// …', function: 'load()', variable: 'value', property: '.size',
  operator: '=>', punctuation: '{ }', tag: '<div>', attribute: 'class',
  meta: '@Route', regexp: '/\\d+/', invalid: '???',
}

/** The background a colour's contrast is checked against; null means no display. */
export const CONTRAST_AGAINST: Partial<Record<UIColorKey, UIColorKey>> = {
  text: 'bg', textMuted: 'bg', textSubtle: 'bg', gutter: 'bg', accent: 'bg',
  accentText: 'accent', success: 'bg', warning: 'bg', danger: 'bg', cursor: 'bg',
}

export function colorOf(theme: Theme, key: ColorKey): string {
  const [scope, name] = splitKey(key)
  if (scope === 'ui') return theme.ui[name as UIColorKey]
  return syntaxColor(theme, name as TokenKind)
}

export function splitKey(key: ColorKey): ['ui' | 'syntax', string] {
  const index = key.indexOf(':')
  return [key.slice(0, index) as 'ui' | 'syntax', key.slice(index + 1)]
}

export function withColor(theme: Theme, key: ColorKey, color: string): Theme {
  const [scope, name] = splitKey(key)
  if (scope === 'ui') return { ...theme, ui: { ...theme.ui, [name]: color } }
  const kind = name as TokenKind
  return { ...theme, syntax: { ...theme.syntax, [kind]: withSyntaxColor(theme.syntax[kind], color) } }
}

export function syntaxStyle(theme: Theme, kind: TokenKind): SyntaxStyle {
  const raw = theme.syntax[kind]
  if (!raw) return { color: theme.ui.text }
  if (typeof raw === 'string') return { color: raw }
  return raw
}

/** CSS for a syntax entry (colour, italic, bold, underline). */
export function tokenCss(theme: Theme, kind: TokenKind): React.CSSProperties {
  const s = syntaxStyle(theme, kind)
  return {
    color: s.color,
    fontStyle: s.italic ? 'italic' : undefined,
    fontWeight: s.bold ? 600 : undefined,
    textDecoration: s.underline ? 'underline' : undefined,
  }
}

/** Applies `patch`, storing an object only when styles are actually set. */
export function withSyntaxStyle(theme: Theme, kind: TokenKind, patch: Partial<SyntaxStyle>): Theme {
  const merged = { ...syntaxStyle(theme, kind), ...patch }
  const value: string | SyntaxStyle = merged.italic || merged.bold || merged.underline ? merged : merged.color
  return { ...theme, syntax: { ...theme.syntax, [kind]: value } }
}

export const ALL_COLOR_KEYS: ColorKey[] = [
  ...UI_GROUPS.flatMap((g) => g.keys.map((k) => `ui:${k}` as ColorKey)),
  ...TOKEN_KINDS.map((k) => `syntax:${k}` as ColorKey),
]

/** Attribute for preview elements: which colours this element uses. */
export const uses = (...keys: ColorKey[]) => ({ 'data-c': keys.join(' ') })

/* ------------------------------------------------------------------ *
 * Local storage
 * ------------------------------------------------------------------ */

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable — then without remembering.
  }
}

export const STORAGE = {
  invertOnSwitch: 'lumen.themeStudio.invertOnSwitch',
  recent: 'lumen.themeStudio.recentColors',
  preview: 'lumen.themeStudio.preview',
} as const
