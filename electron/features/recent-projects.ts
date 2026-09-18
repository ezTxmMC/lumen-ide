/**
 * The projects opened most recently, on the icon in the taskbar or the dock.
 *
 * Every desktop has its own way of doing this, and none of them is portable:
 *   • Windows — the jump list (`app.setJumpList`). The entries start the
 *     program afresh; the single-instance lock passes the folder on to the
 *     window already running.
 *   • macOS — the dock menu (`app.dock.setMenu`). Clicks land straight in the
 *     running program, with no restart.
 *   • Linux — “actions” in the desktop entry. GNOME, KDE and Xfce show them in
 *     the context menu of the icon. An entry is never created here, only one
 *     already present is extended: a new `.desktop` file would turn up as a
 *     second program entry in the system's menu.
 *
 * The list comes from the renderer, labels and all — the i18n system runs
 * there, not in the main process.
 */

import { BrowserWindow, Menu, app, ipcMain } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface RecentProject {
  path: string
  name: string
}

export interface RecentProjectsLabels {
  /** The heading of the jump list under Windows. */
  category: string
}

/** The switch with which an entry opens a folder. */
const OPEN_FLAG = '--open-folder='

/** At most this many entries — none of the desktops shows more. */
const MAX_ENTRIES = 10

/* ------------------------------------------------------------------ *
 * The folder from the command line
 * ------------------------------------------------------------------ */

/** The folder from `--open-folder=…`, where the command line names one. */
export function folderFromArgv(argv: readonly string[]): string | null {
  for (const arg of argv) {
    if (!arg.startsWith(OPEN_FLAG)) continue
    const value = arg.slice(OPEN_FLAG.length).replace(/^"|"$/g, '')
    if (value) return value
  }
  return null
}

/* ------------------------------------------------------------------ *
 * The desktop entry (Linux)
 * ------------------------------------------------------------------ */

/** The command that starts this program — for an AppImage, its own path. */
function launcher(): string {
  return process.env.APPIMAGE ?? process.execPath
}

/** Does the desktop entry belong to this program? */
function belongsToApp(content: string): boolean {
  const exec = /^Exec=(.*)$/m.exec(content)?.[1] ?? ''
  if (exec.includes(launcher())) return true
  return /^Name=Lumen\s*$/m.test(content)
}

function applicationsDir(): string {
  const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
  return path.join(dataHome, 'applications')
}

/**
 * Point every desktop entry that starts `from` at `to` instead — after the
 * updater moved the AppImage, so menu entries and pins keep working.
 */
export function repointDesktopEntries(from: string, to: string) {
  const dir = applicationsDir()
  let names: string[] = []
  try {
    names = fs.readdirSync(dir)
  } catch {
    return
  }
  for (const name of names) {
    if (!name.endsWith('.desktop')) continue
    const file = path.join(dir, name)
    try {
      const content = fs.readFileSync(file, 'utf8')
      if (!content.includes(from)) continue
      fs.writeFileSync(file, content.split(from).join(to), 'utf8')
    } catch {
      // Read-only entries stay as they are.
    }
  }
}

/** The user's desktop entries that belong to this program. */
function desktopEntries(): string[] {
  const dir = applicationsDir()
  let names: string[] = []
  try {
    names = fs.readdirSync(dir)
  } catch {
    return []
  }
  const out: string[] = []
  for (const name of names) {
    if (!name.endsWith('.desktop')) continue
    const file = path.join(dir, name)
    try {
      if (belongsToApp(fs.readFileSync(file, 'utf8'))) out.push(file)
    } catch {
      // Pass over entries that cannot be read.
    }
  }
  return out
}

/** Escape lines: in desktop entries `%` and line breaks are special. */
function desktopValue(text: string): string {
  return text.replace(/%/g, '%%').replace(/[\r\n]+/g, ' ').trim()
}

/** Remove the actions so far along with their sections. */
function withoutActions(content: string): string {
  const head = content.split(/^\[Desktop Action /m)[0]
  return head.replace(/^Actions=.*$\n?/m, '').replace(/\s+$/, '')
}

function desktopFileFor(content: string, projects: readonly RecentProject[]): string {
  const base = withoutActions(content)
  if (!projects.length) return `${base}\n`

  const ids = projects.map((_, index) => `lumen-recent-${index}`)
  const sections = projects.map((project, index) => [
    `[Desktop Action ${ids[index]}]`,
    `Name=${desktopValue(project.name)}`,
    `Exec=${desktopValue(launcher())} ${OPEN_FLAG}${desktopValue(project.path)}`,
  ].join('\n'))
  return `${base}\nActions=${ids.join(';')};\n\n${sections.join('\n\n')}\n`
}

function applyLinux(projects: readonly RecentProject[]) {
  for (const file of desktopEntries()) {
    try {
      const content = fs.readFileSync(file, 'utf8')
      const next = desktopFileFor(content, projects)
      if (next === content) continue
      fs.writeFileSync(file, next, 'utf8')
    } catch {
      // Read-only or system-wide entries stay as they are.
    }
  }
}

/* ------------------------------------------------------------------ *
 * The jump list and the dock
 * ------------------------------------------------------------------ */

function applyWindows(projects: readonly RecentProject[], labels: RecentProjectsLabels) {
  if (!projects.length) {
    app.setJumpList(null)
    return
  }
  app.setJumpList([{
    type: 'custom',
    name: labels.category,
    items: projects.map((project) => ({
      type: 'task' as const,
      title: project.name,
      description: project.path,
      program: process.execPath,
      args: `${OPEN_FLAG}"${project.path}"`,
      iconPath: process.execPath,
      iconIndex: 0,
    })),
  }])
}

function applyMac(projects: readonly RecentProject[], open: (folder: string) => void) {
  if (!app.dock) return
  if (!projects.length) {
    app.dock.setMenu(Menu.buildFromTemplate([]))
    return
  }
  app.dock.setMenu(Menu.buildFromTemplate(
    projects.map((project) => ({
      label: project.name,
      toolTip: project.path,
      click: () => open(project.path),
    })),
  ))
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

export function registerRecentProjectsIpc(getWindow: () => BrowserWindow | null) {
  const open = (folder: string) => {
    const win = getWindow()
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.focus()
    win.webContents.send('app:open-folder', folder)
  }

  ipcMain.handle('app:setRecentProjects', (_event, list: RecentProject[], labels: RecentProjectsLabels) => {
    const projects = (Array.isArray(list) ? list : [])
      .filter((entry) => entry && typeof entry.path === 'string' && typeof entry.name === 'string')
      .slice(0, MAX_ENTRIES)
    if (process.platform === 'win32') {
      applyWindows(projects, labels)
      return
    }
    if (process.platform === 'darwin') {
      applyMac(projects, open)
      return
    }
    applyLinux(projects)
  })

  return { open }
}
