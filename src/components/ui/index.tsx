import { useId, type ReactNode } from 'react'

/* ------------------------------------------------------------------ *
 * Kleine, wiederverwendbare Bausteine im flachen Lumen-Stil.
 * ------------------------------------------------------------------ */

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <label htmlFor={id} className="min-w-0 flex-1 select-none">
        <div className="text-[13px] text-fg">{label}</div>
        {hint && <div className="mt-0.5 text-[11.5px] leading-snug text-subtle">{hint}</div>}
      </label>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          'lm-transition relative mt-0.5 h-[20px] w-[34px] shrink-0 rounded-full',
          'disabled:opacity-40',
          checked ? 'bg-accent' : 'bg-active',
        ].join(' ')}
      >
        <span
          className="lm-transition absolute top-[3px] size-[14px] rounded-full bg-white shadow"
          style={{ left: checked ? 17 : 3 }}
        />
      </button>
    </div>
  )
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  format,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  label: string
  format?: (value: number) => string
}) {
  const id = useId()
  return (
    <div className="py-2">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] text-fg">{label}</label>
        <span className="font-mono text-[11.5px] tabular-nums text-muted">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="lm-range w-full"
      />
    </div>
  )
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  label: string
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <label htmlFor={id} className="text-[13px] text-fg">{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="lm-transition rounded-lumen-sm border border-edge bg-input px-2 py-1 text-[12.5px] hover:border-edge-strong"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

export function Button({
  children,
  onClick,
  variant = 'ghost',
  size = 'md',
  title,
  disabled,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'ghost' | 'solid' | 'outline' | 'danger'
  size?: 'sm' | 'md'
  title?: string
  disabled?: boolean
  className?: string
}) {
  const variants = {
    ghost: 'text-muted hover:bg-hover hover:text-fg',
    solid: 'bg-accent text-accent-fg hover:opacity-90',
    outline: 'border border-edge text-fg hover:border-edge-strong hover:bg-hover',
    danger: 'text-bad hover:bg-bad/12',
  }
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={[
        'lm-transition inline-flex items-center justify-center gap-1.5 rounded-lumen-sm font-medium',
        size === 'sm' ? 'h-6 px-2 text-[11.5px]' : 'h-7 px-2.5 text-[12.5px]',
        variants[variant],
        disabled ? 'pointer-events-none opacity-40' : '',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function Section({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="border-b border-edge px-3 py-3 last:border-b-0">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Empty(
  { icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode },
) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-subtle opacity-60">{icon}</div>}
      <div className="text-[12.5px] text-muted">{title}</div>
      {hint && <div className="text-[11.5px] leading-relaxed text-subtle">{hint}</div>}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-edge bg-input px-1.5 py-px font-mono text-[10.5px] text-muted">
      {children}
    </kbd>
  )
}
