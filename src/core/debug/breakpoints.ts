/**
 * Breakpoints across every file. Lines are 0-based, as in the editor and in
 * LSP; only the session converts them to the 1-based lines DAP wants.
 */

import { normalizePath, samePath } from './paths'

export interface BreakpointEntry {
  id: string
  /** Absolute path. */
  path: string
  line: number
  enabled: boolean
  condition?: string
  hitCondition?: string
  logMessage?: string
}

export interface BreakpointStatus {
  verified: boolean
  message?: string
}

export type BreakpointPatch = Partial<Pick<BreakpointEntry, 'enabled' | 'condition' | 'hitCondition' | 'logMessage' | 'line'>>

let counter = 0
const nextId = () => `bp-${++counter}`

type ChangeListener = (paths: Set<string>, persist: boolean) => void

class BreakpointStore {
  private list: BreakpointEntry[] = []
  private status = new Map<string, BreakpointStatus>()
  private listeners = new Set<() => void>()
  private changeListeners = new Set<ChangeListener>()
  private version = 0

  /* ---------------------------------------------------------------- */

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  getVersion = () => this.version

  /** Files that changed — for the adapter and for saving. */
  onChange(fn: ChangeListener) {
    this.changeListeners.add(fn)
    return () => { this.changeListeners.delete(fn) }
  }

  private emit(paths: string[], persist = true) {
    this.version++
    for (const fn of this.listeners) fn()
    const set = new Set(paths.map(normalizePath))
    for (const fn of this.changeListeners) fn(set, persist)
  }

  /* ---------------------------------------------------------------- */

  all(): BreakpointEntry[] {
    return this.list
  }

  forPath(path: string | null): BreakpointEntry[] {
    if (!path) return []
    const normalized = normalizePath(path)
    return this.list.filter((bp) => normalizePath(bp.path) === normalized)
  }

  at(path: string, line: number): BreakpointEntry | undefined {
    return this.list.find((bp) => bp.line === line && samePath(bp.path, path))
  }

  byId(id: string): BreakpointEntry | undefined {
    return this.list.find((bp) => bp.id === id)
  }

  statusOf(id: string): BreakpointStatus | undefined {
    return this.status.get(id)
  }

  /* ---------------------------------------------------------------- */

  /** Replace without saving, as when a project loads. */
  replace(entries: Omit<BreakpointEntry, 'id'>[]) {
    const previous = this.list.map((bp) => bp.path)
    this.list = entries.map((entry) => ({ ...entry, id: nextId() }))
    this.status.clear()
    this.emit([...previous, ...this.list.map((bp) => bp.path)], false)
  }

  toggle(path: string, line: number): BreakpointEntry | null {
    const existing = this.at(path, line)
    if (existing) {
      this.remove(existing.id)
      return null
    }
    return this.add(path, line)
  }

  add(path: string, line: number, patch: BreakpointPatch = {}): BreakpointEntry {
    const existing = this.at(path, line)
    if (existing) {
      this.update(existing.id, patch)
      return existing
    }
    const entry: BreakpointEntry = { id: nextId(), path, line, enabled: true, ...clean(patch) }
    this.list = [...this.list, entry]
    this.emit([path])
    return entry
  }

  update(id: string, patch: BreakpointPatch) {
    const entry = this.byId(id)
    if (!entry) return
    const next: BreakpointEntry = { ...entry, ...patch }
    for (const key of ['condition', 'hitCondition', 'logMessage'] as const) {
      if (!next[key]) delete next[key]
    }
    this.list = this.list.map((bp) => (bp.id === id ? next : bp))
    this.emit([entry.path])
  }

  remove(id: string) {
    const entry = this.byId(id)
    if (!entry) return
    this.list = this.list.filter((bp) => bp.id !== id)
    this.status.delete(id)
    this.emit([entry.path])
  }

  removeAll() {
    const paths = this.list.map((bp) => bp.path)
    this.list = []
    this.status.clear()
    this.emit(paths)
  }

  setAllEnabled(enabled: boolean) {
    const paths = this.list.map((bp) => bp.path)
    this.list = this.list.map((bp) => ({ ...bp, enabled }))
    this.emit(paths)
  }

  /**
   * Lines after a text change, mapped by the editor. Where two breakpoints
   * land on the same line, the first one stays.
   */
  moveLines(path: string, lines: Map<string, number>) {
    let changed = false
    const seen = new Set<number>()
    const next: BreakpointEntry[] = []
    for (const bp of this.list) {
      if (!samePath(bp.path, path)) {
        next.push(bp)
        continue
      }
      const line = lines.get(bp.id) ?? bp.line
      if (seen.has(line)) {
        changed = true
        continue
      }
      seen.add(line)
      if (line !== bp.line) changed = true
      next.push(line === bp.line ? bp : { ...bp, line })
    }
    if (!changed) return
    this.list = next
    this.emit([path])
  }

  setStatus(id: string, status: BreakpointStatus) {
    const previous = this.status.get(id)
    if (previous && previous.verified === status.verified && previous.message === status.message) return
    this.status.set(id, status)
    this.version++
    for (const fn of this.listeners) fn()
  }

  clearStatus() {
    if (!this.status.size) return
    this.status.clear()
    this.version++
    for (const fn of this.listeners) fn()
  }
}

function clean(patch: BreakpointPatch): BreakpointPatch {
  const out: BreakpointPatch = { ...patch }
  for (const key of ['condition', 'hitCondition', 'logMessage'] as const) {
    if (!out[key]) delete out[key]
  }
  return out
}

export const breakpoints = new BreakpointStore()
