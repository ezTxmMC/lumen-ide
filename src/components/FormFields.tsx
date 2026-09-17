import { useId } from 'react'
import type { FormField, FormValues } from '@/core/types'
import { visibleFields } from '@/core/project/scaffold'
import { tr, useT } from '@/i18n'

const inputClass =
  'w-full rounded-lumen-sm border bg-input px-2.5 py-1.5 text-[13px] outline-none focus:border-accent'

/** Renders form fields grouped by `section`. */
export function FormFields({
  fields, values, errors, onChange, autoFocus, onSubmit,
}: {
  fields: FormField[]
  values: FormValues
  errors: Record<string, string>
  onChange: (id: string, value: string) => void
  autoFocus?: string
  onSubmit?: () => void
}) {
  useT()
  const shown = visibleFields(fields, values)
  const sections = [...new Set(shown.map((f) => f.section ?? ''))]

  return (
    <>
      {sections.map((section) => {
        const inSection = shown.filter((f) => (f.section ?? '') === section)
        const toggles = inSection.filter((f) => f.type === 'toggle')
        const others = inSection.filter((f) => f.type !== 'toggle')
        return (
          <fieldset key={section || '_'} className="mb-3">
            {section && (
              <legend className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">
                {tr(section)}
              </legend>
            )}
            {others.length > 0 && (
              <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
                {others.map((field) => (
                  <Field
                    key={field.id}
                    field={field}
                    values={values}
                    value={values[field.id] ?? ''}
                    error={errors[field.id]}
                    onChange={(v) => onChange(field.id, v)}
                    autoFocus={autoFocus === field.id}
                    onSubmit={onSubmit}
                  />
                ))}
              </div>
            )}
            {toggles.length > 0 && (
              <div className="mt-2 flex flex-col gap-1.5">
                {toggles.map((field) => (
                  <label key={field.id} className="flex cursor-pointer items-start gap-2 text-[12.5px] text-muted">
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-[var(--c-accent)]"
                      checked={values[field.id] === 'true'}
                      onChange={(e) => onChange(field.id, String(e.target.checked))}
                    />
                    <span>
                      {tr(field.label)}
                      {field.hint && <span className="block text-[11px] text-subtle">{tr(field.hint)}</span>}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        )
      })}
    </>
  )
}

/** A field's suggestions, resolved against the current values. */
function suggestionsOf(field: FormField, values: FormValues): string[] {
  const source = field.suggestions
  if (!source) return []
  if (typeof source === 'function') return source(values)
  return source
}

function Field({
  field, values, value, error, onChange, autoFocus, onSubmit,
}: {
  field: FormField
  values: FormValues
  value: string
  error?: string
  onChange: (value: string) => void
  autoFocus?: boolean
  onSubmit?: () => void
}) {
  const id = useId()
  const t = useT()
  const border = error ? 'border-bad' : 'border-edge'
  const mono = field.mono ? 'font-mono text-[12px]' : ''
  const suggestions = suggestionsOf(field, values)

  return (
    <div className={field.type === 'select' ? '' : 'min-w-0'}>
      <label htmlFor={id} className="mb-1 block text-[11.5px] text-muted">
        {tr(field.label)}
        {field.required === false && field.type !== 'select' && <span className="ml-1 text-subtle">{t('forms.optional')}</span>}
      </label>
      {field.type === 'select' ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} ${border}`}
        >
          {field.choices?.map((c) => <option key={c.value} value={c.value}>{tr(c.label)}</option>)}
        </select>
      ) : (
        <>
          <input
            id={id}
            autoFocus={autoFocus}
            value={value}
            placeholder={tr(field.placeholder)}
            spellCheck={false}
            list={suggestions.length ? `${id}-suggestions` : undefined}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              onSubmit?.()
            }}
            className={`${inputClass} ${border} ${mono}`}
          />
          {/* Vorschlagsliste: tippt man weiter, filtert der Browser selbst. */}
          {suggestions.length > 0 && (
            <datalist id={`${id}-suggestions`}>
              {suggestions.map((entry) => <option key={entry} value={entry} />)}
            </datalist>
          )}
        </>
      )}
      {error && <span className="mt-1 block text-[11px] text-bad">{error}</span>}
      {!error && field.hint && <span className="mt-1 block text-[11px] leading-snug text-subtle">{tr(field.hint)}</span>}
      {!error && field.type === 'select' && field.choices?.find((c) => c.value === value)?.hint && (
        <span className="mt-1 block text-[11px] text-subtle">{tr(field.choices.find((c) => c.value === value)!.hint)}</span>
      )}
    </div>
  )
}
