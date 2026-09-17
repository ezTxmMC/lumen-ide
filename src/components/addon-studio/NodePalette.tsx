import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useT } from '@/i18n'
import {
  NODE_CATEGORIES, canConnect, categoryColor, categoryLabel, nodeDefs, nodeTitle,
  type NodeDef,
} from '@/core/user-addons/catalog'
import type { PinType } from '@/core/user-addons/schema'

export interface PendingPin {
  node: string
  pin: string
  type: PinType
  side: 'in' | 'out'
}

/** The first pin of a node that fits the pin being dragged. */
export function matchingPin(def: NodeDef, from: PendingPin | null | undefined) {
  if (!from) return null
  if (from.side === 'out') return def.inputs.find((p) => canConnect(from.type, p.type)) ?? null
  return def.outputs.find((p) => canConnect(p.type, from.type)) ?? null
}

/** The node palette with a search — filtered by allowed nodes and the dragged pin. */
export function NodePalette({
  x, y, from, allow, onPick, onClose,
}: {
  /** Position inside the container, in px. */
  x: number
  y: number
  from?: PendingPin | null
  allow?: (def: NodeDef) => boolean
  onPick: (def: NodeDef) => void
  onClose: () => void
}) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const entries = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const defs = nodeDefs()
      .filter((def) => !allow || allow(def))
      .filter((def) => !from || matchingPin(def, from))
      .filter((def) => {
        if (!needle) return true
        const haystack = `${nodeTitle(def.type)} ${categoryLabel(def.category)} ${def.type}`.toLowerCase()
        return needle.split(/\s+/).every((part) => haystack.includes(part))
      })
    const order = NODE_CATEGORIES.map((c) => c.id)
    return defs.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category))
  }, [query, from, allow])

  useEffect(() => setIndex(0), [query])

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const onKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIndex((i) => Math.min(entries.length - 1, i + 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setIndex((i) => Math.max(0, i - 1))
      return
    }
    if (event.key === 'Enter' && entries[index]) {
      event.preventDefault()
      onPick(entries[index])
    }
  }

  let lastCategory = ''
  return (
    <div
      className="lm-glass lm-shadow lm-anim-pop absolute z-20 flex max-h-[360px] w-[260px] flex-col overflow-hidden rounded-lumen border border-edge"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
    >
      <label className="flex items-center gap-2 border-b border-edge px-2.5 py-2">
        <Search size={12} className="shrink-0 text-subtle" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={(e) => {
            if (!e.currentTarget.closest('.lm-glass')?.contains(e.relatedTarget as Node | null)) onClose()
          }}
          placeholder={t('addonStudio.graph.searchNodes')}
          className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-subtle"
        />
      </label>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1">
        {entries.length === 0 && (
          <div className="px-2 py-4 text-center text-[12px] text-subtle">{t('common.nothingFound')}</div>
        )}
        {entries.map((def, i) => {
          const header = def.category !== lastCategory
          lastCategory = def.category
          return (
            <div key={def.type}>
              {header && (
                <div className="px-2 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-subtle">
                  {categoryLabel(def.category)}
                </div>
              )}
              <button
                data-index={i}
                tabIndex={-1}
                onMouseEnter={() => setIndex(i)}
                onClick={() => onPick(def)}
                className={[
                  'lm-transition flex w-full items-center gap-2 rounded-lumen-sm px-2 py-1 text-left text-[12.5px]',
                  i === index ? 'bg-active text-fg' : 'text-muted',
                ].join(' ')}
              >
                <span className="size-2 shrink-0 rounded-full" style={{ background: categoryColor(def.category) }} />
                <span className="min-w-0 flex-1 truncate">{nodeTitle(def.type)}</span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
