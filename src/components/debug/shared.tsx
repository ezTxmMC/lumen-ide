import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { debug } from '@/core/debug/manager'
import { breakpoints } from '@/core/debug/breakpoints'

/** Re-renders when the debugger or the breakpoints change. */
export function useDebugVersion() {
  const version = useSyncExternalStore(debug.subscribe, debug.getVersion)
  const bpVersion = useSyncExternalStore(breakpoints.subscribe, breakpoints.getVersion)
  return `${version}:${bpVersion}`
}

const openSections = new Map<string, boolean>()

/** A collapsible section of the sidebar; its state survives switching views. */
export function DebugSection({
  id, title, count, actions, children, defaultOpen = true, grow = false,
}: {
  id: string
  title: string
  count?: number
  actions?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  grow?: boolean
}) {
  const [open, setOpen] = useState(openSections.get(id) ?? defaultOpen)
  const toggle = () => {
    openSections.set(id, !open)
    setOpen(!open)
  }
  return (
    <section className={`flex min-h-0 flex-col border-t border-edge ${open && grow ? 'flex-1' : ''}`}>
      <div className="group flex h-7 shrink-0 cursor-pointer select-none items-center gap-1 px-1.5" onClick={toggle}>
        <ChevronRight size={12} className="lm-transition shrink-0 text-subtle" style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
        <h3 className="min-w-0 flex-1 truncate text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">
          {title}
          {count !== undefined && count > 0 && <span className="ml-1.5 font-normal normal-case tracking-normal text-subtle">{count}</span>}
        </h3>
        {actions && (
          <div className="flex items-center gap-0.5 opacity-0 lm-transition group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
      {open && <div className="lm-anim-fade min-h-0 overflow-y-auto pb-1.5">{children}</div>}
    </section>
  )
}

export function IconButton({ title, onClick, children, disabled, tone = 'hover:text-fg' }: {
  title: string
  onClick: () => void
  children: ReactNode
  disabled?: boolean
  tone?: string
}) {
  return (
    <button
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`lm-transition flex size-5 items-center justify-center rounded-lumen-sm text-subtle hover:bg-hover disabled:pointer-events-none disabled:opacity-40 ${tone}`}
    >
      {children}
    </button>
  )
}

/** A value's colour, roughly by kind. */
export function valueTone(value: string, type?: string) {
  if (/^["'`]/.test(value) || /string|str\b|char/i.test(type ?? '')) return 'text-ok'
  if (/^-?\d/.test(value)) return 'text-warn'
  if (/^(true|false|null|nil|None|undefined|True|False)$/.test(value)) return 'text-accent'
  return 'text-fg'
}
