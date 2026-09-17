/**
 * Suggestions accepted recently, per language — how often and when, capped
 * and kept in localStorage.
 */

import { recencyBonus } from './ranking'

const STORAGE_PREFIX = 'lumen.completion.recent.'
const LIMIT = 300

/** label → [count, timestamp] */
type Table = Map<string, [number, number]>

const tables = new Map<string, Table>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function load(language: string): Table {
  const hit = tables.get(language)
  if (hit) return hit
  const table: Table = new Map()
  tables.set(language, table)
  try {
    const raw = storage()?.getItem(STORAGE_PREFIX + language)
    if (!raw) return table
    const parsed = JSON.parse(raw) as Record<string, [number, number]>
    for (const [label, entry] of Object.entries(parsed)) {
      if (Array.isArray(entry) && entry.length === 2) table.set(label, entry)
    }
  } catch {
    // A broken entry — start over.
  }
  return table
}

function persist(language: string) {
  const pending = timers.get(language)
  if (pending) clearTimeout(pending)
  timers.set(language, setTimeout(() => {
    timers.delete(language)
    const table = load(language)
    try {
      storage()?.setItem(STORAGE_PREFIX + language, JSON.stringify(Object.fromEntries(table)))
    } catch {
      // Storage full or locked — recency is only a convenience.
    }
  }, 500))
}

export function recordAccepted(language: string, label: string, now = Date.now()) {
  if (!label) return
  const table = load(language)
  const entry = table.get(label)
  table.delete(label)
  table.set(label, [(entry?.[0] ?? 0) + 1, now])
  // Discard the oldest entries first, in insertion order.
  while (table.size > LIMIT) {
    const oldest = table.keys().next().value
    if (oldest === undefined) break
    table.delete(oldest)
  }
  persist(language)
}

/** The bonus function for `rank`, bound to a language and a point in time. */
export function recencySignal(language: string, now = Date.now()): (label: string) => number {
  const table = load(language)
  if (!table.size) return () => 0
  return (label) => {
    const entry = table.get(label)
    if (!entry) return 0
    return recencyBonus(entry[0], now - entry[1])
  }
}
