/**
 * Watches the files open in editor tabs that the workspace watcher does not
 * see: files in folders it skips on purpose (build/, .claude/, a dot folder)
 * and files from outside the workspace. An agent or a tool editing one of
 * those would otherwise leave the tab showing stale text.
 *
 * One non-recursive watcher per parent folder, filtered down to the open
 * files' names — a handful of watchers, never a tree.
 */

import { ipcMain, type WebContents } from 'electron'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

interface FsChange {
  path: string
  type: 1 | 2 | 3
}

interface FolderWatch {
  watcher: fs.FSWatcher
  names: Set<string>
}

const QUIET_MS = 150
const MAX_OPEN_FILES = 500

/** The watches of one window: its open files, reported back to it alone. */
class OpenFileWatch {
  private folders = new Map<string, FolderWatch>()
  private pending = new Set<string>()
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly owner: WebContents,
    private readonly covered: (owner: WebContents, file: string) => boolean,
  ) {}

  update(files: string[]) {
    const wanted = new Map<string, Set<string>>()
    for (const file of files.slice(0, MAX_OPEN_FILES)) {
      const dir = path.dirname(file)
      const names = wanted.get(dir) ?? new Set<string>()
      names.add(path.basename(file))
      wanted.set(dir, names)
    }
    for (const [dir, watch] of this.folders) {
      if (wanted.has(dir)) continue
      watch.watcher.close()
      this.folders.delete(dir)
    }
    for (const [dir, names] of wanted) {
      const existing = this.folders.get(dir)
      if (!existing) {
        this.watchFolder(dir, names)
        continue
      }
      existing.names.clear()
      for (const name of names) existing.names.add(name)
    }
  }

  close() {
    if (this.timer) clearTimeout(this.timer)
    for (const watch of this.folders.values()) watch.watcher.close()
    this.folders.clear()
  }

  private watchFolder(dir: string, names: Set<string>) {
    try {
      const watcher = fs.watch(dir, (_event, filename) => {
        const name = filename?.toString() ?? ''
        if (!names.has(name)) return
        this.record(path.join(dir, name))
      })
      // A folder that went away: dropped; the next tab update adds it back.
      watcher.on('error', () => {
        watcher.close()
        this.folders.delete(dir)
      })
      this.folders.set(dir, { watcher, names })
    } catch {
      // A folder that does not exist (yet): nothing to watch.
    }
  }

  private record(file: string) {
    this.pending.add(file)
    if (this.timer) return
    this.timer = setTimeout(() => void this.flush(), QUIET_MS)
  }

  private async flush() {
    this.timer = null
    const files = [...this.pending]
    this.pending.clear()
    const changes: FsChange[] = []
    for (const file of files) {
      // Asked at report time: the workspace watcher may have taken the folder on since.
      if (this.covered(this.owner, file)) continue
      const stat = await fsp.stat(file).catch(() => null)
      if (stat?.isDirectory()) continue
      changes.push({ path: file, type: stat ? 2 : 3 })
    }
    if (!changes.length || this.owner.isDestroyed()) return
    this.owner.send('fs:changed', changes)
  }
}

export function registerOpenFileWatchIpc(
  /** Is the file already reported to this window by its workspace watcher? */
  covered: (owner: WebContents, file: string) => boolean,
) {
  const watches = new Map<number, OpenFileWatch>()

  ipcMain.handle('fs:watchOpenFiles', (event, files: unknown) => {
    const owner = event.sender
    const list = Array.isArray(files) ? files.filter((f): f is string => typeof f === 'string' && path.isAbsolute(f)) : []
    let watch = watches.get(owner.id)
    if (!watch) {
      const id = owner.id
      watch = new OpenFileWatch(owner, covered)
      watches.set(id, watch)
      owner.once('destroyed', () => {
        watches.get(id)?.close()
        watches.delete(id)
      })
    }
    watch.update(list)
    return true
  })
}
