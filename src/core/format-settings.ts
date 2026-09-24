/**
 * Formatting settings per language: tab width, tabs or spaces, print width,
 * quotes, semicolons … They drive the editor's indentation, the options sent
 * with LSP formatting requests, what happens on save, and the settings that
 * language servers with a formatter receive at start.
 */

import { EditorState, Prec, type Extension } from '@codemirror/state'
import { indentUnit } from '@codemirror/language'
import type { LspConfig } from './types'

export interface LanguageFormat {
  tabWidth: number
  useTabs: boolean
  printWidth: number
  singleQuote: boolean
  semicolons: boolean
  trailingComma: 'none' | 'es5' | 'all'
  bracketSpacing: boolean
  endOfLine: 'keep' | 'lf' | 'crlf'
  trimTrailingWhitespace: boolean
  insertFinalNewline: boolean
}

export type FormatSettings = Record<string, Partial<LanguageFormat>>

export const DEFAULT_FORMAT: LanguageFormat = {
  tabWidth: 2,
  useTabs: false,
  printWidth: 100,
  singleQuote: false,
  semicolons: true,
  trailingComma: 'es5',
  bracketSpacing: true,
  endOfLine: 'keep',
  trimTrailingWhitespace: false,
  insertFinalNewline: false,
}

/** Languages whose defaults differ from `DEFAULT_FORMAT` (their own conventions). */
const LANGUAGE_DEFAULTS: Record<string, Partial<LanguageFormat>> = {
  javascript: { singleQuote: true, semicolons: false },
  typescript: { singleQuote: true, semicolons: false },
  java: { tabWidth: 4, printWidth: 120 },
  kotlin: { tabWidth: 4, printWidth: 120 },
  python: { tabWidth: 4, printWidth: 88 },
  rust: { tabWidth: 4 },
  csharp: { tabWidth: 4, printWidth: 120 },
  c: { tabWidth: 4 },
  cpp: { tabWidth: 4 },
  php: { tabWidth: 4, printWidth: 120 },
  dart: { tabWidth: 2, printWidth: 80, trailingComma: 'all' },
  go: { tabWidth: 4, useTabs: true },
  makefile: { tabWidth: 4, useTabs: true },
  groovy: { tabWidth: 4 },
  html: { printWidth: 120 },
}

/** Which settings are meaningful for which language — the rest is hidden in the settings page. */
const QUOTE_LANGUAGES = new Set(['javascript', 'typescript', 'css', 'scss', 'less', 'json', 'html', 'vue', 'astro', 'mdx', 'python', 'php', 'dart'])
const SEMICOLON_LANGUAGES = new Set(['javascript', 'typescript', 'vue', 'astro', 'mdx'])
const TRAILING_COMMA_LANGUAGES = new Set(['javascript', 'typescript', 'vue', 'astro', 'mdx', 'json', 'dart', 'rust', 'python', 'php', 'kotlin', 'java'])
const BRACKET_SPACING_LANGUAGES = new Set(['javascript', 'typescript', 'vue', 'astro', 'mdx', 'json', 'rust', 'dart'])

export const supportsQuotes = (languageId: string) => QUOTE_LANGUAGES.has(languageId)
export const supportsSemicolons = (languageId: string) => SEMICOLON_LANGUAGES.has(languageId)
export const supportsTrailingComma = (languageId: string) => TRAILING_COMMA_LANGUAGES.has(languageId)
export const supportsBracketSpacing = (languageId: string) => BRACKET_SPACING_LANGUAGES.has(languageId)

/** The effective settings of a language: stored values over the language's defaults over the global ones. */
export function formatFor(settings: FormatSettings, languageId: string | undefined, indentUnitHint?: number): LanguageFormat {
  const id = languageId ?? ''
  const base: LanguageFormat = { ...DEFAULT_FORMAT, ...(indentUnitHint ? { tabWidth: indentUnitHint } : {}), ...LANGUAGE_DEFAULTS[id] }
  return { ...base, ...(settings[id] ?? {}) }
}

/** Indentation for the editor: overrides the language's own `indentUnit`. */
export function formatExtension(format: LanguageFormat): Extension {
  return Prec.high([
    EditorState.tabSize.of(format.tabWidth),
    indentUnit.of(format.useTabs ? '\t' : ' '.repeat(format.tabWidth)),
  ])
}

/** Options of `textDocument/formatting`. */
export function lspFormattingOptions(format: LanguageFormat) {
  return {
    tabSize: format.tabWidth,
    insertSpaces: !format.useTabs,
    trimTrailingWhitespace: format.trimTrailingWhitespace,
    insertFinalNewline: format.insertFinalNewline,
    trimFinalNewlines: format.insertFinalNewline,
  }
}

/** What saving does to the text: trailing whitespace, the final newline. Line endings are handled by the caller. */
export function applySaveRules(text: string, format: LanguageFormat): string {
  let out = text
  if (format.trimTrailingWhitespace) out = out.replace(/[ \t]+$/gm, '')
  if (format.insertFinalNewline && out.length > 0) out = out.replace(/\n*$/, '\n')
  return out
}

/** Keys of `settings` for servers that carry their own formatter, by language id. */
function serverSettings(languageId: string, format: LanguageFormat): Record<string, unknown> | null {
  const semicolons = format.semicolons ? 'insert' : 'remove'
  if (languageId === 'typescript' || languageId === 'javascript') {
    const options = {
      format: {
        tabSize: format.tabWidth,
        indentSize: format.tabWidth,
        convertTabsToSpaces: !format.useTabs,
        semicolons,
        insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: format.bracketSpacing,
      },
      preferences: { quoteStyle: format.singleQuote ? 'single' : 'double' },
    }
    return { typescript: options, javascript: options }
  }
  if (languageId === 'html') {
    return {
      html: { format: { wrapLineLength: format.printWidth, indentInnerHtml: true } },
      editor: { tabSize: format.tabWidth, insertSpaces: !format.useTabs },
    }
  }
  if (languageId === 'css' || languageId === 'scss' || languageId === 'less') {
    return { editor: { tabSize: format.tabWidth, insertSpaces: !format.useTabs } }
  }
  return null
}

/** Merge (deeply, objects only) `extra` into `base`; `base` wins where both set a value. */
function mergeDeep(base: unknown, extra: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(base && typeof base === 'object' ? base as Record<string, unknown> : {}) }
  for (const [key, value] of Object.entries(extra)) {
    const current = out[key]
    const bothObjects = value && typeof value === 'object' && current && typeof current === 'object'
    out[key] = bothObjects ? mergeDeep(current, value as Record<string, unknown>) : (current ?? value)
  }
  return out
}

/** A decorator for `lsp.addConfigDecorator`: gives language servers the language's formatting settings at start. */
export function createFormatDecorator(read: () => FormatSettings) {
  return (config: LspConfig, languageId: string): LspConfig => {
    const extra = serverSettings(languageId, formatFor(read(), languageId))
    if (!extra) return config
    // What the server config sets itself wins — the user's choice fills the gaps.
    return { ...config, settings: mergeDeep(config.settings, extra) }
  }
}
