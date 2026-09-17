/** The small form building blocks of the Add-on Studio. */

import { useId, useState, type ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import { useT } from '@/i18n'

export const inputClass =
  'lm-transition w-full rounded-lumen-sm border bg-input px-2 py-1 text-[12.5px] outline-none focus:border-accent'

export function Field({
  label, hint, error, children, className = '',
}: {
  label: string
  hint?: string
  error?: string | null
  children: (id: string) => ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className="mb-1 block text-[11.5px] text-muted">{label}</label>
      {children(id)}
      {error && <span className="mt-1 block text-[11px] text-bad">{error}</span>}
      {!error && hint && <span className="mt-1 block text-[11px] leading-snug text-subtle">{hint}</span>}
    </div>
  )
}

export function TextField({
  label, value, onChange, hint, error, placeholder, mono, className,
}: {
  label: string
  value: string | undefined
  onChange: (value: string) => void
  hint?: string
  error?: string | null
  placeholder?: string
  mono?: boolean
  className?: string
}) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id) => (
        <input
          id={id}
          value={value ?? ''}
          spellCheck={false}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} ${error ? 'border-bad' : 'border-edge'} ${mono ? 'font-mono text-[12px]' : ''}`}
        />
      )}
    </Field>
  )
}

export function NumberField({
  label, value, onChange, hint, min, max, className,
}: {
  label: string
  value: number | undefined
  onChange: (value: number | undefined) => void
  hint?: string
  min?: number
  max?: number
  className?: string
}) {
  return (
    <Field label={label} hint={hint} className={className}>
      {(id) => (
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          className={`${inputClass} border-edge font-mono text-[12px]`}
        />
      )}
    </Field>
  )
}

export function AreaField({
  label, value, onChange, hint, rows = 6, placeholder, className,
}: {
  label: string
  value: string | undefined
  onChange: (value: string) => void
  hint?: string
  rows?: number
  placeholder?: string
  className?: string
}) {
  return (
    <Field label={label} hint={hint} className={className}>
      {(id) => (
        <textarea
          id={id}
          rows={rows}
          value={value ?? ''}
          spellCheck={false}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Tab') return
            e.preventDefault()
            const el = e.currentTarget
            const start = el.selectionStart
            const next = `${el.value.slice(0, start)}  ${el.value.slice(el.selectionEnd)}`
            onChange(next)
            requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2))
          }}
          className={`${inputClass} border-edge resize-y font-mono text-[12px] leading-relaxed`}
        />
      )}
    </Field>
  )
}

export function CheckField({
  label, checked, onChange, hint,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
  hint?: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 py-1 text-[12.5px] text-muted">
      <input
        type="checkbox"
        className="mt-0.5 accent-[var(--c-accent)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        {hint && <span className="block text-[11px] text-subtle">{hint}</span>}
      </span>
    </label>
  )
}

export function ColorField({
  label, value, onChange, className,
}: {
  label: string
  value: string | undefined
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <Field label={label} className={className}>
      {(id) => (
        <div className="flex items-center gap-1.5">
          <label className="relative size-7 shrink-0 cursor-pointer overflow-hidden rounded-lumen-sm border border-edge">
            <span className="absolute inset-0" style={{ background: value || 'transparent' }} />
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(value ?? '') ? value : '#7c8cff'}
              onChange={(e) => onChange(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          <input
            id={id}
            value={value ?? ''}
            spellCheck={false}
            placeholder="#7c8cff"
            onChange={(e) => onChange(e.target.value)}
            className={`${inputClass} border-edge font-mono text-[12px]`}
          />
        </div>
      )}
    </Field>
  )
}

/** A word list as chips: Enter, comma or space adds, pasting splits. */
export function ChipInput({
  label, values, onChange, hint, placeholder, allowSpaces = false, className,
}: {
  label: string
  values: string[] | undefined
  onChange: (values: string[]) => void
  hint?: string
  placeholder?: string
  /** Spaces belong to the value — file names, for instance. */
  allowSpaces?: boolean
  className?: string
}) {
  const t = useT()
  const [draft, setDraft] = useState('')
  const list = values ?? []
  const separator = allowSpaces ? /[,\n]+/ : /[\s,]+/

  const add = (raw: string) => {
    const parts = raw.split(separator).map((p) => p.trim()).filter(Boolean)
    if (!parts.length) return
    onChange([...new Set([...list, ...parts])])
    setDraft('')
  }

  return (
    <Field label={`${label} (${list.length})`} hint={hint} className={className}>
      {(id) => (
        <div className="lm-transition flex max-h-[148px] flex-wrap items-center gap-1 overflow-y-auto rounded-lumen-sm border border-edge bg-input p-1 focus-within:border-accent">
          {list.map((value) => (
            <span key={value} className="flex items-center gap-0.5 rounded-[4px] bg-active py-px pr-0.5 pl-1.5 font-mono text-[11px] text-fg">
              {value}
              <button
                title={t('common.remove')}
                aria-label={`${t('common.remove')}: ${value}`}
                onClick={() => onChange(list.filter((v) => v !== value))}
                className="rounded-sm p-px text-subtle hover:bg-hover hover:text-fg"
              >
                <X size={10} />
              </button>
            </span>
          ))}
          <input
            id={id}
            value={draft}
            spellCheck={false}
            placeholder={list.length ? undefined : placeholder}
            onChange={(e) => {
              const value = e.target.value
              if (separator.test(value.slice(-1))) {
                add(value)
                return
              }
              setDraft(value)
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text')
              if (!separator.test(text)) return
              e.preventDefault()
              add(`${draft}${text}`)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add(draft)
                return
              }
              if (e.key === 'Backspace' && !draft && list.length) onChange(list.slice(0, -1))
            }}
            onBlur={() => add(draft)}
            className="min-w-[80px] flex-1 bg-transparent px-1 py-0.5 font-mono text-[11.5px] outline-none placeholder:text-subtle"
          />
        </div>
      )}
    </Field>
  )
}

/** The heading of a section in the Studio. */
export function Heading({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="mt-5 mb-2 flex items-end gap-2 first:mt-0">
      <div className="min-w-0 flex-1">
        <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">{title}</h4>
        {hint && <p className="mt-0.5 text-[11.5px] leading-snug text-subtle">{hint}</p>}
      </div>
      {action}
    </div>
  )
}

export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="lm-transition flex h-6 items-center gap-1 rounded-lumen-sm px-2 text-[11.5px] text-accent hover:bg-hover"
    >
      <Plus size={12} /> {label}
    </button>
  )
}

/** The list on the left of the Studio (languages, commands …). */
export function ItemList<T>({
  items, selected, onSelect, render, onAdd, addLabel, errorIndexes,
}: {
  items: T[]
  selected: number
  onSelect: (index: number) => void
  render: (item: T) => { title: string; subtitle?: string; color?: string }
  onAdd: () => void
  addLabel: string
  errorIndexes?: Set<number>
}) {
  return (
    <div className="flex h-full w-[210px] shrink-0 flex-col border-r border-edge">
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {items.map((item, index) => {
          const info = render(item)
          const active = index === selected
          return (
            <button
              key={index}
              onClick={() => onSelect(index)}
              className={[
                'lm-transition mb-0.5 flex w-full items-center gap-2 rounded-lumen-sm px-2 py-1.5 text-left',
                active ? 'bg-active text-fg' : 'text-muted hover:bg-hover hover:text-fg',
              ].join(' ')}
            >
              <span className="size-2 shrink-0 rounded-full" style={{ background: info.color ?? 'var(--c-border-strong)' }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px]">{info.title}</span>
                {info.subtitle && <span className="block truncate font-mono text-[10.5px] text-subtle">{info.subtitle}</span>}
              </span>
              {errorIndexes?.has(index) && <span className="size-1.5 shrink-0 rounded-full bg-bad" />}
            </button>
          )
        })}
      </div>
      <div className="border-t border-edge p-1.5">
        <AddButton label={addLabel} onClick={onAdd} />
      </div>
    </div>
  )
}
