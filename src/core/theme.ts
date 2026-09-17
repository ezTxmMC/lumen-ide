/** Theme and effect system: CSS variables and a CodeMirror theme out of one `Theme`. */

import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { tokenTags } from './tokenizer'
import { TOKEN_KINDS, UI_COLOR_KEYS, type SyntaxStyle, type Theme, type TokenKind } from './types'
import { contrastRatio } from './theme-colors'

/* ------------------------------------------------------------------ *
 * Effects
 * ------------------------------------------------------------------ */

export interface Effects {
  /** Transitions and fades, globally on or off. */
  animations: boolean
  /** 0.4 = quick, 2 = sluggish. */
  animationSpeed: number
  /** `reduced`: fades only · `normal` · `rich`: staggered lists, hover lift, springs on top. */
  animationLevel: 'reduced' | 'normal' | 'rich'
  /** Frosted-glass blur behind panels and overlays. */
  glass: boolean
  /** A soft accent glow on active elements. */
  glow: boolean
  shadows: boolean
  /** Corner radius in px. */
  radius: number
  /** Compact or airy spacing. */
  density: 'compact' | 'comfortable'
  /** Background transparency of the panels (0 = opaque). */
  transparency: number

  fontFamily: string
  fontSize: number
  lineHeight: number
  ligatures: boolean
  smoothCaret: boolean
  cursorBlink: boolean
  /** Text cursor: a line between characters, a block over the character, or an underline. */
  cursorStyle: 'line' | 'block' | 'underline'
  /** Thickness of the line in px (1–4). */
  cursorWidth: number
  /** Language servers, globally on or off. */
  lsp: boolean
  /** Inlay hints (parameter names, types) from the language server. */
  inlayHints: boolean
  /** Signature help while typing `(` and `,`. */
  signatureHelp: boolean
  /** Highlight occurrences of the symbol under the cursor. */
  documentHighlight: boolean
  /** Format through the language server on save. */
  formatOnSave: boolean
  /** Organise imports on save (source.organizeImports). */
  organizeImportsOnSave: boolean
  /** Remember open files per project and restore them. */
  restoreOpenFiles: boolean
  /** Shell for new terminals (a path, or an id such as `fish`); empty = the default shell. */
  terminalShell: string
  terminalFontSize: number
  terminalCursor: 'block' | 'bar' | 'underline'
  /** Copy a terminal selection to the clipboard straight away. */
  terminalCopyOnSelect: boolean
  /** Preferred external terminal program (its id); empty = the first one found. */
  externalTerminal: string
  showLineNumbers: boolean
  showIndentGuides: boolean
  highlightActiveLine: boolean
  wordWrap: boolean
  /** Minimap along the right edge of the editor. */
  minimap: boolean
  /** Minimap: characters as blocks rather than as type. */
  minimapRenderCharacters: boolean
  /** Minimap: width in px. */
  minimapWidth: number
  /** Show fold markers only while hovering the gutter. */
  foldingOnHover: boolean
  /** Collapse packages in the explorer into one row (`com.example.project`). */
  compactPackages: boolean
  /** Window system on Linux: `auto` uses Wayland where available. Takes effect after a restart. */
  windowSystem: 'auto' | 'wayland' | 'x11'
  /** Look for updates in the background, download them and apply them on exit. */
  autoUpdate: boolean

  /** Custom CSS, inserted last, overriding everything. */
  customCss: string
}

export const DEFAULT_EFFECTS: Effects = {
  animations: true,
  animationSpeed: 1,
  animationLevel: 'normal',
  glass: true,
  glow: true,
  shadows: true,
  radius: 10,
  density: 'comfortable',
  transparency: 0,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace",
  fontSize: 13,
  lineHeight: 1.6,
  ligatures: true,
  smoothCaret: true,
  cursorBlink: true,
  cursorStyle: 'line',
  cursorWidth: 2,
  lsp: true,
  inlayHints: true,
  signatureHelp: true,
  documentHighlight: true,
  formatOnSave: false,
  organizeImportsOnSave: false,
  restoreOpenFiles: true,
  terminalShell: '',
  terminalFontSize: 13,
  terminalCursor: 'bar',
  terminalCopyOnSelect: false,
  externalTerminal: '',
  showLineNumbers: true,
  showIndentGuides: true,
  highlightActiveLine: true,
  wordWrap: false,
  minimap: true,
  minimapRenderCharacters: false,
  minimapWidth: 96,
  foldingOnHover: false,
  compactPackages: true,
  windowSystem: 'auto',
  autoUpdate: true,
  customCss: '',
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

/**
 * `#a1b2c3` → `161 178 195`, for `rgb(var(--x) / 40%)`. Spaces, not commas:
 * `rgb(161, 178, 195 / 40%)` is invalid and browsers drop it silently. An
 * alpha part (`#rrggbbaa`) is ignored.
 */
export function hexToRgbChannels(hex: string): string {
  const clean = splitAlpha(hex).base.replace('#', '')
  if (clean.length !== 6) return '127 127 127'
  const n = Number.parseInt(clean, 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

/** Splits `#rrggbbaa` into the base colour and the alpha suffix. */
export function splitAlpha(color: string): { base: string; alpha: string } {
  const match = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})$/.exec(color.trim())
  if (match) return { base: `#${match[1]}`, alpha: match[2] }
  const short = /^#([0-9a-fA-F]{3})$/.exec(color.trim())
  if (short) {
    const [r, g, b] = short[1]
    return { base: `#${r}${r}${g}${g}${b}${b}`, alpha: '' }
  }
  return { base: /^#[0-9a-fA-F]{6}$/.test(color.trim()) ? color.trim() : '#000000', alpha: '' }
}

/**
 * Selection colours from `ui.selection`, always clearly visible. When the
 * theme's colour is too weak against the background — contrast below 1.4 —
 * its opacity rises; if that is not enough it is mixed towards the accent.
 * Unfocused, roughly half the opacity applies, and further occurrences take
 * the accent colour.
 */
export function selectionColors(ui: Pick<Theme['ui'], 'selection' | 'accent' | 'bg'>) {
  const accent = rgbOf(ui.accent)
  const { alpha } = splitAlpha(ui.selection)
  let color = rgbOf(ui.selection)
  let opacity = alpha ? Number.parseInt(alpha, 16) / 255 : 1

  for (let step = 0; step < 16 && contrastRatio(withAlpha(color, opacity), ui.bg) < SELECTION_MIN_CONTRAST; step++) {
    if (opacity < 0.85) {
      opacity = Math.min(0.85, opacity + 0.1)
      continue
    }
    color = mix(color, accent, 0.25)
  }

  const channels = color.map(Math.round).join(' ')
  const accentChannels = accent.join(' ')
  return {
    focused: `rgb(${channels} / ${Math.round(opacity * 100)}%)`,
    inactive: `rgb(${channels} / ${Math.round(opacity * 60)}%)`,
    match: `rgb(${accentChannels} / 12%)`,
    matchBorder: `rgb(${accentChannels} / 45%)`,
  }
}

const SELECTION_MIN_CONTRAST = 1.4

type Rgb = [number, number, number]

function rgbOf(color: string): Rgb {
  const n = Number.parseInt(splitAlpha(color).base.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function withAlpha(color: Rgb, opacity: number): string {
  const hex = (value: number) => Math.round(value).toString(16).padStart(2, '0')
  return `#${color.map(hex).join('')}${hex(opacity * 255)}`
}

function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  return [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * amount) as Rgb
}

/**
 * The text cursor. CodeMirror sets position and line height inline; one
 * character is `1ch` of the editor font. Block and underline cover exactly the
 * character at the cursor — the block semi-transparent so that character
 * stays readable.
 */
function cursorStyles(effects: Effects, color: string): Record<string, Record<string, string>> {
  const smooth = effects.smoothCaret ? 'left var(--duration-fast) var(--ease-out), top var(--duration-fast) var(--ease-out)' : 'none'
  const width = `${Math.min(4, Math.max(1, Math.round(effects.cursorWidth || 2)))}px`
  const drop = { '.cm-dropCursor': { borderLeftColor: color, borderLeftWidth: width } }
  if (effects.cursorStyle === 'block') {
    return {
      ...drop,
      '.cm-cursor': {
        borderLeft: 'none',
        width: '1ch',
        marginLeft: '0',
        backgroundColor: `rgb(${hexToRgbChannels(color)} / 55%)`,
        borderRadius: '1px',
        transition: smooth,
      },
    }
  }
  if (effects.cursorStyle === 'underline') {
    return {
      ...drop,
      '.cm-cursor': {
        borderLeft: 'none',
        width: '1ch',
        marginLeft: '0',
        boxSizing: 'border-box',
        borderBottom: `${width} solid ${color}`,
        transition: smooth,
      },
    }
  }
  return {
    ...drop,
    '.cm-cursor': { borderLeftColor: color, borderLeftWidth: width, transition: smooth },
  }
}

/** Completion symbol kind → syntax colour; without one, dimmed type. */
const COMPLETION_KIND_COLORS: [string, TokenKind][] = [
  ['function', 'function'], ['method', 'function'],
  ['class', 'type'], ['interface', 'type'], ['enum', 'type'], ['type', 'type'],
  ['variable', 'variable'], ['constant', 'constant'], ['property', 'property'],
  ['keyword', 'keyword'], ['namespace', 'meta'], ['snippet', 'string'], ['operator', 'operator'],
]

/**
 * The suggestion list: tall enough for many entries, the symbol kind as a
 * coloured chip, typed characters in the accent colour, details right-aligned
 * and dimmed, and the selection as a tinted row with an accent bar — text and
 * details stay readable.
 *
 * Selectors start with `&.cm-editor .cm-tooltip` because CodeMirror's base
 * theme otherwise wins with more specific rules: a blue selection, 10em tall.
 */
function completionPopupStyles(theme: Theme, effects: Effects): Record<string, Record<string, string | number | Record<string, string>>> {
  const ui = theme.ui
  const accent = hexToRgbChannels(ui.accent)
  const popup = '&.cm-editor .cm-tooltip.cm-tooltip-autocomplete'
  const size = effects.fontSize
  const styles: Record<string, Record<string, string | number | Record<string, string>>> = {
    [popup]: { padding: '4px', backgroundColor: ui.bgOverlay },
    [`${popup} > ul`]: {
      fontFamily: effects.fontFamily,
      fontSize: `${size}px`,
      maxHeight: `min(${Math.round(size * 1.75 * 14)}px, 46vh)`,
      minWidth: '340px',
      maxWidth: 'min(760px, 92vw)',
      scrollbarWidth: 'thin',
    },
    [`${popup} > ul > li`]: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '2px 8px 2px 6px',
      lineHeight: '1.6',
      borderRadius: 'var(--radius-sm)',
      color: ui.text,
    },
    [`${popup} > ul > li:hover`]: { backgroundColor: ui.bgHover },
    [`${popup} > ul > li[aria-selected]`]: {
      backgroundColor: `rgb(${accent} / 20%)`,
      color: ui.text,
      boxShadow: `inset 2px 0 0 ${ui.accent}`,
    },
    [`${popup}.cm-tooltip-autocomplete-disabled > ul > li[aria-selected]`]: {
      backgroundColor: ui.bgActive,
      boxShadow: 'none',
    },
    [`${popup} > ul > completion-section`]: {
      padding: '6px 8px 2px',
      borderBottom: `1px solid ${ui.border}`,
      color: ui.textSubtle,
      fontSize: '0.8em',
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
    },
    '.cm-completionLabel': { flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' },
    '.cm-completionMatchedText': { textDecoration: 'none', color: ui.accent, fontWeight: 600 },
    '.cm-completionDetail': {
      marginLeft: 'auto',
      paddingLeft: '16px',
      maxWidth: '48%',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      fontStyle: 'normal',
      fontSize: '0.88em',
      color: ui.textMuted,
    },
    '.cm-completionDetail + .cm-lumen-completionOrigin': { marginLeft: 0 },
    '.cm-lumen-completionOrigin': { marginLeft: 'auto', opacity: 0.75, color: ui.textSubtle },
    [`${popup} .cm-completionIcon`]: {
      flex: 'none',
      width: '1.45em',
      height: '1.45em',
      lineHeight: '1.45em',
      padding: 0,
      borderRadius: '4px',
      fontSize: '0.8em',
      textAlign: 'center',
      opacity: 1,
      color: ui.textMuted,
      backgroundColor: ui.bgActive,
    },
    '.cm-completionIcon-snippet': { '&:after': { content: "'{}'" } },
    '.cm-completionIcon-operator': { '&:after': { content: "'±'" } },
    '&.cm-editor .cm-tooltip.cm-completionInfo': {
      padding: '8px 10px',
      maxWidth: '440px',
      backgroundColor: ui.bgOverlay,
      color: ui.text,
    },
    '.cm-completionInfo .lm-lsp-doc': { borderTop: 'none', padding: 0, maxWidth: 'none' },
  }
  for (const [kind, token] of COMPLETION_KIND_COLORS) {
    const raw = theme.syntax[token]
    if (!raw) continue
    const color = normalizeSyntax(raw).color
    styles[`${popup} .cm-completionIcon-${kind}`] = {
      color,
      backgroundColor: `rgb(${hexToRgbChannels(color)} / 16%)`,
    }
  }
  return styles
}

/** Picks black or white as readable type on the given surface. */
export function readableOn(color: string): string {
  const { base } = splitAlpha(color)
  const n = Number.parseInt(base.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.36 ? '#000000' : '#ffffff'
}

function normalizeSyntax(value: string | SyntaxStyle): SyntaxStyle {
  return typeof value === 'string' ? { color: value } : value
}

/* ------------------------------------------------------------------ *
 * Applying it to the document
 * ------------------------------------------------------------------ */

const CUSTOM_CSS_ID = 'lumen-custom-css'

export function applyTheme(theme: Theme, effects: Effects) {
  const root = document.documentElement
  const style = root.style

  for (const key of UI_COLOR_KEYS) {
    const value = theme.ui[key]
    style.setProperty(`--c-${kebab(key)}`, value)
    if (value.startsWith('#')) {
      style.setProperty(`--c-${kebab(key)}-rgb`, hexToRgbChannels(value))
    }
  }

  for (const kind of TOKEN_KINDS) {
    const raw = theme.syntax[kind]
    if (raw) style.setProperty(`--s-${kind}`, normalizeSyntax(raw).color)
  }

  root.dataset.themeType = theme.type
  root.dataset.themeId = theme.id
  applyEffects(effects)
}

/** `normal` follows the system's “reduce motion”; `rich` and `reduced` are a deliberate choice. */
function motionLevel(effects: Effects): string {
  if (!effects.animations) return 'none'
  if (effects.animationLevel !== 'normal') return effects.animationLevel
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 'reduced'
  return 'normal'
}

/** Base durations in seconds, scaled by `animationSpeed`; the easing curves live in index.css. */
const MOTION_DURATIONS: [string, number][] = [
  ['--duration-fast', 0.09],
  ['--duration', 0.16],
  ['--duration-slow', 0.28],
  ['--duration-exit', 0.13],
]

export function applyEffects(effects: Effects) {
  const root = document.documentElement
  const style = root.style

  style.setProperty('--radius', `${effects.radius}px`)
  style.setProperty('--radius-sm', `${Math.max(2, effects.radius - 4)}px`)
  style.setProperty('--radius-lg', `${effects.radius + 4}px`)
  for (const [name, seconds] of MOTION_DURATIONS) {
    style.setProperty(name, effects.animations ? `${(seconds * effects.animationSpeed).toFixed(3)}s` : '0s')
  }
  style.setProperty('--blur', effects.glass ? '14px' : '0px')
  style.setProperty('--panel-alpha', String(1 - effects.transparency))
  style.setProperty('--font-mono', effects.fontFamily)
  style.setProperty('--font-size', `${effects.fontSize}px`)
  style.setProperty('--line-height', String(effects.lineHeight))
  style.setProperty('--ligatures', effects.ligatures ? 'normal' : 'none')
  style.setProperty('--row-height', effects.density === 'compact' ? '22px' : '26px')
  style.setProperty('--pad', effects.density === 'compact' ? '4px' : '8px')

  root.dataset.animations = String(effects.animations)
  root.dataset.motion = motionLevel(effects)
  root.dataset.glass = String(effects.glass)
  root.dataset.glow = String(effects.glow)
  root.dataset.shadows = String(effects.shadows)
  root.dataset.indentGuides = String(effects.showIndentGuides)

  let tag = document.getElementById(CUSTOM_CSS_ID) as HTMLStyleElement | null
  if (!tag) {
    tag = document.createElement('style')
    tag.id = CUSTOM_CSS_ID
    document.head.append(tag)
  }
  tag.textContent = effects.customCss
}

/* ------------------------------------------------------------------ *
 * CodeMirror theme
 * ------------------------------------------------------------------ */

export function editorTheme(theme: Theme, effects: Effects): Extension {
  const ui = theme.ui
  const dark = theme.type === 'dark'

  const highlight = HighlightStyle.define(
    TOKEN_KINDS.flatMap((kind) => {
      const raw = theme.syntax[kind]
      if (!raw) return []
      const s = normalizeSyntax(raw)
      return [{
        tag: tokenTags[kind],
        color: s.color,
        fontStyle: s.italic ? 'italic' : undefined,
        fontWeight: s.bold ? '600' : undefined,
        textDecoration: s.underline ? 'underline' : undefined,
      }]
    }),
  )

  const selection = selectionColors(ui)
  const view = EditorView.theme(
    {
      '&': {
        color: ui.text,
        backgroundColor: 'transparent',
        fontSize: `${effects.fontSize}px`,
        height: '100%',
      },
      '.cm-content': {
        fontFamily: effects.fontFamily,
        fontVariantLigatures: effects.ligatures ? 'normal' : 'none',
        lineHeight: String(effects.lineHeight),
        padding: '10px 0 40vh 0',
        caretColor: ui.cursor,
      },
      '.cm-scroller': {
        fontFamily: effects.fontFamily,
        lineHeight: String(effects.lineHeight),
        overflow: 'auto',
      },
      // Opaque: the gutters stick to the left edge while scrolling sideways —
      // without a background of their own the code would run visibly behind them.
      '.cm-gutters': {
        backgroundColor: ui.bg,
        color: ui.gutter,
        border: 'none',
        paddingRight: '6px',
      },
      '.cm-lineNumbers .cm-gutterElement': { minWidth: '38px', padding: '0 4px 0 12px' },
      '.cm-activeLineGutter': { backgroundColor: 'transparent', color: ui.text },
      '.cm-activeLine': { backgroundColor: ui.lineHighlight },
      ...cursorStyles(effects, ui.cursor),
      '&.cm-focused .cm-cursor': { animationDuration: effects.cursorBlink ? '1.2s' : '0s' },
      // Selection: CodeMirror's base theme sets its own colours with more specific
      // selectors (#233 and #d7d4f0) — without this weighting the theme colour never showed.
      '&.cm-editor > .cm-scroller > .cm-selectionLayer .cm-selectionBackground.cm-selectionBackground': {
        background: selection.inactive,
      },
      '&.cm-editor.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground.cm-selectionBackground': {
        background: selection.focused,
      },
      '.cm-panels ::selection, .cm-tooltip ::selection': { backgroundColor: selection.focused },
      // Further occurrences of the selected text: outlined discreetly rather than filled,
      // so they read differently from the selection itself.
      '.cm-selectionMatch': {
        backgroundColor: selection.match,
        boxShadow: `inset 0 0 0 1px ${selection.matchBorder}`,
        borderRadius: '2px',
      },
      '.cm-selectionMatch-main': { backgroundColor: 'transparent', boxShadow: 'none' },
      '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
        backgroundColor: ui.bgActive,
        outline: `1px solid ${ui.accent}`,
        borderRadius: '2px',
      },
      '.cm-nonmatchingBracket': { color: ui.danger },
      '.cm-searchMatch': {
        backgroundColor: `rgb(${hexToRgbChannels(ui.warning)} / 30%)`,
        outline: `1px solid ${ui.warning}`,
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: `rgb(${hexToRgbChannels(ui.accent)} / 45%)`,
      },
      '.cm-panels': {
        backgroundColor: ui.bgElevated,
        color: ui.text,
        borderColor: ui.border,
      },
      // Find and replace floats at the top right over the text instead of
      // pushing the editor down as a bar would (as in VS Code). The strip
      // itself lets clicks through — only the box inside catches them.
      '.cm-panels.cm-panels-top': {
        position: 'absolute',
        top: '0',
        left: 'auto',
        right: '0',
        width: 'auto',
        maxWidth: 'calc(100% - 16px)',
        zIndex: '6',
        border: 'none',
        backgroundColor: 'transparent',
        pointerEvents: 'none',
      },
      '.cm-panels.cm-panels-top > *': { pointerEvents: 'auto' },
      '&.lm-has-minimap .cm-panels.cm-panels-top': { right: 'var(--minimap-width, 0px)' },
      '.cm-panel.cm-search': {
        position: 'relative',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '4px',
        margin: '6px',
        padding: '6px 26px 6px 8px',
        backgroundColor: ui.bgOverlay,
        border: `1px solid ${ui.border}`,
        borderRadius: 'var(--radius)',
        boxShadow: '0 12px 32px rgb(0 0 0 / 35%)',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
      },
      // The `<br>` between the search and replace rows is a flex child of its
      // own — given full width it becomes the line break.
      '.cm-panel.cm-search br': { flexBasis: '100%', width: '100%', height: '0' },
      '.cm-panel.cm-search input.cm-textfield': {
        flex: '1 1 190px',
        minWidth: '150px',
        fontFamily: effects.fontFamily,
      },
      '.cm-panel.cm-search label': {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        whiteSpace: 'nowrap',
        color: ui.textMuted,
      },
      '.cm-panel.cm-search button[name="close"]': {
        position: 'absolute',
        top: '4px',
        right: '4px',
        padding: '0 4px',
        border: 'none',
        backgroundColor: 'transparent',
        color: ui.textMuted,
        fontSize: '15px',
        lineHeight: '1.1',
      },
      '.cm-panel.cm-search button[name="close"]:hover': { color: ui.text, backgroundColor: ui.bgHover },
      '.cm-panel input, .cm-panel button': {
        backgroundColor: ui.bgInput,
        color: ui.text,
        border: `1px solid ${ui.border}`,
        borderRadius: 'var(--radius-sm)',
        padding: '2px 6px',
      },
      '.cm-panel button:hover': { backgroundColor: ui.bgHover },
      '.cm-panel input:focus-visible, .cm-panel button:focus-visible': {
        outline: `1px solid ${ui.accent}`,
        outlineOffset: '0',
      },
      '.cm-panel input[type="checkbox"]': { padding: '0', accentColor: ui.accent },
      '.cm-tooltip': {
        backgroundColor: ui.bgOverlay,
        border: `1px solid ${ui.border}`,
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        boxShadow: '0 12px 32px rgb(0 0 0 / 35%)',
      },
      ...completionPopupStyles(theme, effects),
      '.cm-lintRange-error': {
        backgroundImage: 'none',
        textDecoration: `underline wavy ${ui.danger}`,
        textDecorationSkipInk: 'none',
        textUnderlineOffset: '2px',
      },
      '.cm-lintRange-warning': {
        backgroundImage: 'none',
        textDecoration: `underline wavy ${ui.warning}`,
        textDecorationSkipInk: 'none',
        textUnderlineOffset: '2px',
      },
      '.cm-lintRange-info, .cm-lintRange-hint': {
        backgroundImage: 'none',
        textDecoration: `underline dotted ${ui.textMuted}`,
        textDecorationSkipInk: 'none',
        textUnderlineOffset: '2px',
      },
      '.cm-diagnostic': {
        padding: '4px 10px',
        borderLeft: '3px solid transparent',
        fontFamily: effects.fontFamily,
        fontSize: `${Math.max(11, effects.fontSize - 1)}px`,
        whiteSpace: 'pre-wrap',
      },
      '.cm-diagnostic-error': { borderLeftColor: ui.danger },
      '.cm-diagnostic-warning': { borderLeftColor: ui.warning },
      '.cm-diagnostic-info': { borderLeftColor: ui.accent },
      '.cm-diagnostic-hint': { borderLeftColor: ui.textMuted },
      '.cm-lint-marker': { width: '11px', height: '11px' },
      '.cm-panel.cm-panel-lint ul': { maxHeight: '160px' },
      '.lm-lsp-hover': {
        padding: '8px 11px',
        maxWidth: '620px',
        maxHeight: '360px',
        overflow: 'auto',
        fontFamily: 'system-ui, sans-serif',
        fontSize: `${Math.max(11, effects.fontSize - 1)}px`,
        lineHeight: '1.5',
        color: ui.text,
      },
      '.lm-lsp-doc': {
        padding: '6px 9px',
        maxWidth: '460px',
        maxHeight: '260px',
        overflow: 'auto',
        borderTop: `1px solid ${ui.border}`,
        color: ui.textMuted,
        fontFamily: 'system-ui, sans-serif',
        fontSize: `${Math.max(10, effects.fontSize - 2)}px`,
      },
      '.lm-md p, .lm-md ul, .lm-md ol, .lm-md blockquote': { margin: '0 0 6px 0' },
      '.lm-md > :last-child': { marginBottom: 0 },
      '.lm-md pre': {
        margin: '0 0 6px 0',
        padding: '6px 8px',
        borderRadius: 'var(--radius-sm)',
        backgroundColor: ui.bgInput,
        overflow: 'auto',
        fontFamily: effects.fontFamily,
        fontSize: `${Math.max(10, effects.fontSize - 1)}px`,
        whiteSpace: 'pre',
      },
      '.lm-md code': {
        fontFamily: effects.fontFamily,
        fontSize: '0.95em',
        padding: '0 3px',
        borderRadius: '3px',
        backgroundColor: ui.bgInput,
      },
      '.lm-md pre code': { padding: 0, backgroundColor: 'transparent' },
      '.lm-md h3, .lm-md h4, .lm-md h5, .lm-md h6': { margin: '4px 0', fontSize: '1em', fontWeight: '600' },
      '.lm-md ul, .lm-md ol': { paddingLeft: '18px' },
      '.lm-md hr': { border: 'none', borderTop: `1px solid ${ui.border}`, margin: '6px 0' },
      '.lm-md a': { color: ui.accent, textDecoration: 'none' },
      '.lm-md blockquote': { borderLeft: `2px solid ${ui.border}`, paddingLeft: '8px', color: ui.textMuted },
      '.lm-signature': {
        padding: '7px 10px',
        maxWidth: '620px',
        fontFamily: effects.fontFamily,
        fontSize: `${Math.max(11, effects.fontSize - 1)}px`,
        color: ui.text,
      },
      '.lm-signature-label': { whiteSpace: 'pre-wrap' },
      '.lm-signature-active': {
        fontWeight: '700',
        color: ui.accent,
        textDecoration: 'underline',
        textDecorationColor: ui.accent,
        textUnderlineOffset: '2px',
      },
      '.lm-signature-doc': {
        marginTop: '5px',
        paddingTop: '5px',
        borderTop: `1px solid ${ui.border}`,
        color: ui.textMuted,
        fontFamily: 'system-ui, sans-serif',
        fontSize: `${Math.max(10, effects.fontSize - 2)}px`,
      },
      '.lm-signature-count': { float: 'right', marginLeft: '10px', color: ui.textSubtle, fontSize: '0.85em' },
      '.lm-inlay': {
        display: 'inline-block',
        padding: '0 4px',
        margin: '0 1px',
        borderRadius: '4px',
        fontSize: '0.82em',
        lineHeight: '1.3',
        verticalAlign: 'baseline',
        color: ui.textMuted,
        backgroundColor: ui.bgActive,
        opacity: 0.85,
        pointerEvents: 'none',
        fontFamily: effects.fontFamily,
      },
      '.lm-inlay-type': { fontStyle: 'italic' },
      '.lm-highlight-read': { backgroundColor: `rgb(${hexToRgbChannels(ui.accent)} / 16%)`, borderRadius: '2px' },
      '.lm-highlight-write': { backgroundColor: `rgb(${hexToRgbChannels(ui.warning)} / 22%)`, borderRadius: '2px' },
      '.lm-highlight-text': { backgroundColor: ui.bgActive, borderRadius: '2px' },
      '.lm-menu': { minWidth: '260px', maxWidth: '520px', maxHeight: '300px', overflow: 'auto', padding: '4px' },
      '.lm-menu-title': {
        padding: '4px 8px 6px',
        fontSize: '10.5px',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: ui.textSubtle,
      },
      '.lm-menu-item': {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '5px 8px',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        fontSize: `${Math.max(11, effects.fontSize - 1)}px`,
        color: ui.text,
        fontFamily: 'system-ui, sans-serif',
      },
      '.lm-menu-item[aria-selected="true"], .lm-menu-item:hover': {
        backgroundColor: ui.accent,
        color: ui.accentText,
      },
      '.lm-menu-item[aria-disabled="true"]': { opacity: 0.45, cursor: 'default' },
      '.lm-menu-kind': { fontSize: '0.8em', opacity: 0.7, marginLeft: 'auto', whiteSpace: 'nowrap' },
      '.lm-menu-empty': { padding: '8px', color: ui.textMuted, fontSize: '12px' },
      '.lm-rename': { display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px' },
      '.lm-rename input': {
        minWidth: '180px',
        padding: '3px 6px',
        border: `1px solid ${ui.accent}`,
        borderRadius: 'var(--radius-sm)',
        backgroundColor: ui.bgInput,
        color: ui.text,
        fontFamily: effects.fontFamily,
        fontSize: `${effects.fontSize}px`,
        outline: 'none',
      },
      '.lm-rename-hint': { fontSize: '10.5px', color: ui.textSubtle, whiteSpace: 'nowrap' },
      '.cm-lintRange-deprecated': { textDecoration: 'line-through', textDecorationColor: ui.textMuted },
      '.cm-lintRange-unnecessary': { opacity: 0.6 },
      '.cm-diagnosticAction': {
        backgroundColor: ui.bgActive,
        color: ui.text,
        borderRadius: 'var(--radius-sm)',
        padding: '1px 6px',
        marginLeft: '6px',
        fontSize: '11px',
      },
      '.cm-foldPlaceholder': {
        backgroundColor: ui.bgActive,
        border: 'none',
        color: ui.textMuted,
        borderRadius: '4px',
        padding: '0 6px',
      },
    },
    { dark },
  )

  return [view, syntaxHighlighting(highlight)]
}
