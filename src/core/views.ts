/**
 * Views: everything that can sit in a dock of the window.
 *
 * The explorer, the terminal, the problems list, an extension's page and an
 * agent's chat are all the same kind of thing — a view with a title, an icon
 * and a body. Where a view lives is not part of it: the window has three docks
 * (left, right, bottom), each view names the dock it prefers, and the layout
 * (`state/slices/layout.ts`) remembers where the user dragged it since.
 *
 * Views register at runtime — the built-in ones at startup, an extension's as
 * it is installed — so a dock never has to know what it will show. The
 * registry holds no React state; `subscribe`/`getVersion` feed
 * `useSyncExternalStore`.
 */

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export type Dock = 'left' | 'right' | 'bottom'

export const DOCKS: readonly Dock[] = ['left', 'right', 'bottom']

/** A small counter or dot on a view's icon or tab. */
export interface ViewBadge {
  text: string
  /** A Tailwind text colour class (`text-bad`, `text-ok` …). */
  tone?: string
}

export interface ViewDef {
  /** Unique: `explorer`, `terminal`, `ext:<extension>:<page>`, `agent:<key>`, `view:<extension>/<view>`. */
  id: string
  /** Shown in tooltips, tab bars and dock headers — already translated. */
  title: () => string
  /** An icon component (lucide, or one of the icon-pack shapes). */
  icon: LucideIcon
  /** Where the view goes as long as the user has not moved it. */
  defaultDock: Dock
  /** Order within the default dock; lower comes first. */
  order: number
  /** The body. Rendered only while the view is visible. */
  render: () => ReactNode
  /** Buttons in the dock header while the view is active. */
  toolbar?: () => ReactNode
  /** Recomputed on every render of the dock. */
  badge?: () => ViewBadge | null
  /** The command that opens the view — its shortcut appears in the tooltip. */
  command?: string
  /** Where the view comes from, when that is not Lumen itself (an extension's name). */
  source?: () => string | undefined
}

const views = new Map<string, ViewDef>()
const listeners = new Set<() => void>()
let version = 0

function emit() {
  version++
  for (const fn of listeners) fn()
}

export const viewRegistry = {
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  },
  getVersion: () => version,

  get: (id: string | null | undefined) => (id ? views.get(id) : undefined),
  has: (id: string) => views.has(id),
  list: (): ViewDef[] => [...views.values()].sort((a, b) => a.order - b.order),

  /** Register or replace a view; returns a function that removes it again. */
  register(def: ViewDef): () => void {
    views.set(def.id, def)
    emit()
    return () => {
      if (views.get(def.id) !== def) return
      views.delete(def.id)
      emit()
    }
  },

  /**
   * Replace every view whose id starts with `prefix` by `defs` — for sources
   * that know their whole list at once (an extension's pages, the agents).
   */
  sync(prefix: string, defs: ViewDef[]) {
    const wanted = new Set(defs.map((def) => def.id))
    let changed = false
    for (const id of [...views.keys()]) {
      if (!id.startsWith(prefix) || wanted.has(id)) continue
      views.delete(id)
      changed = true
    }
    for (const def of defs) {
      if (views.get(def.id) === def) continue
      views.set(def.id, def)
      changed = true
    }
    if (changed) emit()
  },
}
