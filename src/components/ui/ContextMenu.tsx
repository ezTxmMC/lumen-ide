import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'

export type MenuItem =
  | { label: string; icon?: LucideIcon; run: () => void; danger?: boolean; hint?: string; disabled?: boolean }
  | 'sep'

/** The gap the menu keeps from the window edge. */
const EDGE_MARGIN = 6

interface Placement {
  left: number
  top: number
  maxHeight: number
}

/**
 * Places the menu with its top-left corner at the pointer.
 *
 * Where it no longer fits, it flips to the other side of the pointer — as in
 * VS Code — rather than merely being pushed against the edge. Measuring goes
 * through `offsetWidth`/`offsetHeight`: `getBoundingClientRect()` would count
 * the running fade-in (`scale(0.975)`) and come out too small.
 */
function place(element: HTMLElement, x: number, y: number): Placement {
  const width = element.offsetWidth
  const height = element.offsetHeight
  const viewWidth = window.innerWidth
  const viewHeight = window.innerHeight
  const maxHeight = viewHeight - 2 * EDGE_MARGIN

  const fitsRight = x + width <= viewWidth - EDGE_MARGIN
  const left = fitsRight ? x : Math.max(EDGE_MARGIN, Math.min(x - width, viewWidth - width - EDGE_MARGIN))

  const visible = Math.min(height, maxHeight)
  const fitsBelow = y + visible <= viewHeight - EDGE_MARGIN
  if (fitsBelow) return { left, top: y, maxHeight }

  const above = y - visible
  if (above >= EDGE_MARGIN) return { left, top: above, maxHeight }
  return { left, top: Math.max(EDGE_MARGIN, viewHeight - visible - EDGE_MARGIN), maxHeight }
}

/** A floating context menu at a pointer position; closes on a click beside it, Esc, or losing the window. */
export function ContextMenu({ x, y, items, onClose }: {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState<Placement | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    setPlacement(place(element, x, y))
  }, [x, y, items.length])

  useEffect(() => {
    const close = () => onClose()
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', key, true)
    }
  }, [onClose])

  return (
    <>
      <div className="fixed inset-0 z-[9999]" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div
        ref={ref}
        role="menu"
        className="lm-glass lm-shadow lm-anim-pop fixed z-[61] min-w-[210px] overflow-y-auto rounded-lumen border border-edge p-1"
        style={{
          left: placement?.left ?? x,
          top: placement?.top ?? y,
          maxHeight: placement?.maxHeight,
          // Invisible until measured: otherwise the menu flashes briefly at the
          // unchecked raw position when it does not fit there.
          visibility: placement ? undefined : 'hidden',
        }}
      >
        {items.map((item, i) => {
          if (item === 'sep') return <div key={`sep-${i}`} className="my-1 h-px bg-edge" />
          const Icon = item.icon
          return (
            <button
              key={`${item.label}-${i}`}
              role="menuitem"
              disabled={item.disabled}
              onClick={() => { onClose(); item.run() }}
              className={[
                'lm-transition flex w-full items-center gap-2 rounded-lumen-sm px-2 py-1 text-left text-[12.5px] disabled:pointer-events-none disabled:opacity-40',
                item.danger ? 'text-bad hover:bg-bad/12' : 'text-muted hover:bg-hover hover:text-fg',
              ].join(' ')}
            >
              {Icon ? <Icon size={12} className="shrink-0 opacity-80" /> : <span className="w-3" />}
              <span className="flex-1">{item.label}</span>
              {item.hint && <span className="text-[10.5px] text-subtle">{item.hint}</span>}
            </button>
          )
        })}
      </div>
    </>
  )
}
