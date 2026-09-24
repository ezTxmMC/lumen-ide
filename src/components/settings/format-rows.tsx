import type { ReactNode } from 'react'
import {
  formatFor, supportsBracketSpacing, supportsQuotes, supportsSemicolons, supportsTrailingComma,
  type FormatSettings, type LanguageFormat,
} from '@/core/format-settings'
import { Button, Select, Slider, Toggle } from '../ui'

interface FormatRowsArgs {
  t: (key: string, params?: Record<string, string | number>) => string
  languages: { id: string; name: string; indentUnit?: number }[]
  languageId: string
  onLanguage: (id: string) => void
  settings: FormatSettings
  onChange: (patch: Partial<LanguageFormat>) => void
  onReset: () => void
}

interface FormatRow {
  section: 'formatting'
  text: string
  node: ReactNode
}

/** The rows of the “Formatting” page: one language at a time, only the settings that make sense for it. */
export function formatRows({ t, languages, languageId, onLanguage, settings, onChange, onReset }: FormatRowsArgs): FormatRow[] {
  const language = languages.find((l) => l.id === languageId)
  const format = formatFor(settings, languageId, language?.indentUnit)
  const label = (key: string) => t(`settings.formatting.${key}`)

  const toggle = (key: 'useTabs' | 'singleQuote' | 'semicolons' | 'bracketSpacing' | 'trimTrailingWhitespace' | 'insertFinalNewline', hint = false): FormatRow => ({
    section: 'formatting',
    text: `${label(key)} ${hint ? label(`${key}Hint`) : ''}`,
    node: <Toggle label={label(key)} hint={hint ? label(`${key}Hint`) : undefined} checked={format[key]} onChange={(v) => onChange({ [key]: v })} />,
  })

  const rows: FormatRow[] = [
    {
      section: 'formatting',
      text: `${label('language')} ${label('languageHint')}`,
      node: (
        <div className="py-2">
          <Select label={label('language')} value={languageId} options={languages.map((l) => ({ value: l.id, label: l.name }))} onChange={onLanguage} />
          <p className="text-[11.5px] leading-snug text-subtle">{label('languageHint')}</p>
        </div>
      ),
    },
    {
      section: 'formatting',
      text: label('tabWidth'),
      node: <Slider label={label('tabWidth')} min={1} max={8} value={format.tabWidth} format={(v) => String(v)} onChange={(v) => onChange({ tabWidth: v })} />,
    },
    toggle('useTabs'),
    {
      section: 'formatting',
      text: `${label('printWidth')} ${label('printWidthHint')}`,
      node: (
        <div>
          <Slider label={label('printWidth')} min={40} max={200} step={4} value={format.printWidth} format={(v) => String(v)} onChange={(v) => onChange({ printWidth: v })} />
          <p className="text-[11.5px] leading-snug text-subtle">{label('printWidthHint')}</p>
        </div>
      ),
    },
  ]

  if (supportsQuotes(languageId)) rows.push(toggle('singleQuote'))
  if (supportsSemicolons(languageId)) rows.push(toggle('semicolons'))
  if (supportsTrailingComma(languageId)) {
    rows.push({
      section: 'formatting',
      text: label('trailingComma'),
      node: (
        <Select
          label={label('trailingComma')}
          value={format.trailingComma}
          options={[
            { value: 'none', label: label('trailingCommaNone') },
            { value: 'es5', label: label('trailingCommaEs5') },
            { value: 'all', label: label('trailingCommaAll') },
          ]}
          onChange={(v) => onChange({ trailingComma: v })}
        />
      ),
    })
  }
  if (supportsBracketSpacing(languageId)) rows.push(toggle('bracketSpacing'))

  rows.push(
    {
      section: 'formatting',
      text: label('endOfLine'),
      node: (
        <Select
          label={label('endOfLine')}
          value={format.endOfLine}
          options={[
            { value: 'keep', label: label('endOfLineKeep') },
            { value: 'lf', label: 'LF' },
            { value: 'crlf', label: 'CRLF' },
          ]}
          onChange={(v) => onChange({ endOfLine: v })}
        />
      ),
    },
    toggle('trimTrailingWhitespace'),
    toggle('insertFinalNewline'),
    {
      section: 'formatting',
      text: `${label('reset')} ${label('serverHint')}`,
      node: (
        <div className="flex items-center justify-between gap-3 py-2">
          <p className="text-[11.5px] leading-snug text-subtle">{label('serverHint')}</p>
          <Button size="sm" variant="outline" onClick={onReset}>{label('reset')}</Button>
        </div>
      ),
    },
  )
  return rows
}
