/**
 * Per-project debug state in `.lumen/breakpoints.json`: breakpoints (relative
 * to the workspace folder), watch expressions, exception filters and remembered
 * input such as a program path. Launch configurations live separately in
 * `.lumen/debug.json`.
 */

import { joinPath } from './paths'

export interface StoredBreakpoint {
  path: string
  /** 1-based, as editors usually count. */
  line: number
  enabled?: boolean
  condition?: string
  hitCondition?: string
  logMessage?: string
}

export interface DebugState {
  breakpoints: StoredBreakpoint[]
  watches: string[]
  /** Adapter type → the filters chosen. */
  exceptionFilters: Record<string, string[]>
  /** Adapter type → filters we know of, so they show without a running session. */
  knownFilters: Record<string, { filter: string; label: string; default?: boolean }[]>
  memory: Record<string, string>
}

export const EMPTY_DEBUG_STATE: DebugState = {
  breakpoints: [],
  watches: [],
  exceptionFilters: {},
  knownFilters: {},
  memory: {},
}

export const statePath = (root: string) => joinPath(root, '.lumen/breakpoints.json')
export const launchConfigPath = (root: string) => joinPath(root, '.lumen/debug.json')

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

function cleanBreakpoint(value: unknown): StoredBreakpoint | null {
  if (!isRecord(value)) return null
  if (typeof value.path !== 'string' || typeof value.line !== 'number') return null
  const optional = (key: string) => (typeof value[key] === 'string' && value[key] ? { [key]: value[key] as string } : {})
  return {
    path: value.path,
    line: Math.max(1, Math.floor(value.line)),
    ...(value.enabled === false ? { enabled: false } : {}),
    ...optional('condition'),
    ...optional('hitCondition'),
    ...optional('logMessage'),
  }
}

export async function loadDebugState(root: string): Promise<DebugState> {
  const raw = await window.lumen.fs.readFile(statePath(root)).catch(() => null)
  if (!raw) return structuredClone(EMPTY_DEBUG_STATE)
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const breakpoints = Array.isArray(parsed.breakpoints) ? parsed.breakpoints.map(cleanBreakpoint).filter((b): b is StoredBreakpoint => b !== null) : []
    const watches = Array.isArray(parsed.watches) ? parsed.watches.filter((w): w is string => typeof w === 'string') : []
    return {
      breakpoints,
      watches,
      exceptionFilters: isRecord(parsed.exceptionFilters) ? parsed.exceptionFilters as DebugState['exceptionFilters'] : {},
      knownFilters: isRecord(parsed.knownFilters) ? parsed.knownFilters as DebugState['knownFilters'] : {},
      memory: isRecord(parsed.memory) ? parsed.memory as DebugState['memory'] : {},
    }
  } catch {
    return structuredClone(EMPTY_DEBUG_STATE)
  }
}

export async function saveDebugState(root: string, state: DebugState) {
  await window.lumen.fs.writeFile(statePath(root), `${JSON.stringify(state, null, 2)}\n`)
}

/** With nothing stored, there is no need for a file. */
export function isEmptyState(state: DebugState) {
  return !state.breakpoints.length && !state.watches.length
    && !Object.keys(state.exceptionFilters).length && !Object.keys(state.memory).length
}
