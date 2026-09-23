/**
 * What the explorer does to several entries at once: trash, move, cut/copy
 * and paste, copy paths. Open tabs follow along (renamed, closed), errors go
 * to a toast. Which entries to act on is decided in `explorer-selection.ts`.
 */

import { useSyncExternalStore } from 'react'
import { useStore, relativeToWorkspace } from '@/state/store'
import { t } from '@/i18n'
import { baseName, copyName, isWithin, planMove, topLevel } from './explorer-selection'

const errorText = (err: unknown) => (err as Error).message.replace(/^Error: /, '')

/* ------------------------------------------------------------------ *
 * The explorer's own clipboard (paths, not text)
 * ------------------------------------------------------------------ */

export interface FileClipboard {
  mode: 'copy' | 'cut'
  paths: string[]
}

let clipboard: FileClipboard | null = null
const listeners = new Set<() => void>()

function setClipboard(next: FileClipboard | null) {
  clipboard = next
  for (const fn of listeners) fn()
}

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** The explorer clipboard — module state, so it survives the panel closing. */
export function useFileClipboard() {
  return useSyncExternalStore(subscribe, () => clipboard)
}

export function cutPaths(paths: string[]) {
  if (paths.length) setClipboard({ mode: 'cut', paths: topLevel(paths) })
}

export function copyPaths(paths: string[]) {
  if (paths.length) setClipboard({ mode: 'copy', paths: topLevel(paths) })
}

/* ------------------------------------------------------------------ *
 * Operations
 * ------------------------------------------------------------------ */

/** Trash the entries after one question for all; returns what is gone. */
export async function trashPaths(paths: string[], isDirectory: (path: string) => boolean): Promise<string[]> {
  const targets = topLevel(paths)
  if (!targets.length) return []
  const question = targets.length === 1
    ? t(isDirectory(targets[0]) ? 'explorer.confirmTrashFolder' : 'explorer.confirmTrashFile', { name: baseName(targets[0]) })
    : t('explorer.confirmTrashMany', { count: targets.length })
  if (!confirm(question)) return []
  const state = useStore.getState()
  const removed: string[] = []
  for (const path of targets) {
    try {
      await window.lumen.fs.remove(path)
    } catch (err) {
      state.notify(`${baseName(path)}: ${errorText(err)}`, 'error')
      continue
    }
    state.pathDeleted(path)
    removed.push(path)
  }
  return removed
}

/** Move the entries into the folder `target`; returns the new paths. */
export async function movePaths(paths: string[], target: string): Promise<string[]> {
  const state = useStore.getState()
  const plan = planMove(paths, target)
  for (const path of plan.invalid) state.notify(t('explorer.moveIntoItself', { name: baseName(path) }), 'warning')
  // Nothing is overwritten: a name already in the target is reported and left alone.
  const taken = new Set((await window.lumen.fs.list(target).catch(() => [])).map((entry) => entry.name))
  const moved: string[] = []
  for (const { from, to } of plan.moves) {
    if (taken.has(baseName(to))) {
      state.notify(t('explorer.alreadyExists', { name: baseName(to) }), 'warning')
      continue
    }
    try {
      await window.lumen.fs.rename(from, to)
    } catch (err) {
      state.notify(`${baseName(from)}: ${errorText(err)}`, 'error')
      continue
    }
    state.pathRenamed(from, to)
    moved.push(to)
  }
  return moved
}

/** Copy the entries into `target`, under a free name where theirs is taken; returns the new paths. */
export async function copyPathsInto(paths: string[], target: string): Promise<string[]> {
  const state = useStore.getState()
  const taken = new Set((await window.lumen.fs.list(target).catch(() => [])).map((entry) => entry.name))
  const copied: string[] = []
  for (const from of topLevel(paths)) {
    if (isWithin(from, target)) {
      state.notify(t('explorer.moveIntoItself', { name: baseName(from) }), 'warning')
      continue
    }
    const name = copyName(baseName(from), (candidate) => taken.has(candidate))
    const to = `${target}/${name}`
    try {
      await window.lumen.fs.copy(from, to)
    } catch (err) {
      state.notify(`${baseName(from)}: ${errorText(err)}`, 'error')
      continue
    }
    taken.add(name)
    copied.push(to)
  }
  return copied
}

/** Paste the explorer clipboard into `target`; a cut is used up by it. */
export async function pasteInto(target: string): Promise<string[]> {
  const job = clipboard
  if (!job) return []
  if (job.mode === 'copy') return copyPathsInto(job.paths, target)
  const moved = await movePaths(job.paths, target)
  setClipboard(null)
  return moved
}

/** Several paths as text, one per line. */
export async function copyPathText(paths: string[], relative: boolean) {
  const state = useStore.getState()
  const lines = paths.map((path) => (relative ? relativeToWorkspace(path, state.workspace) : path))
  try {
    await navigator.clipboard.writeText(lines.join('\n'))
    state.notify(t('explorer.copied'), 'info')
  } catch {
    state.notify(t('explorer.clipboardUnavailable'), 'warning')
  }
}
