import { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  createTerminal, detectExternalTerminals, detectShells, killAllTerminals, killTerminal,
  openExternalTerminal, resizeTerminal, writeTerminal, type TerminalOptions,
} from './terminal'
import { registerSdkIpc } from './features/sdk'
import { registerDapIpc, stopAllDebugAdapters } from './features/dap'
import { registerUserAddonIpc } from './features/user-addons'
import { registerNetIpc } from './features/net'
import { registerUpdaterIpc } from './features/updater'
import { registerExtensionHostIpc } from './features/extension-host'
import { registerDiscordIpc, stopDiscordRpc } from './features/discord-rpc'
import { applyWindowSystem, currentWindowSystem, isWaylandSession, relaunchApp } from './features/window-system'
import { folderFromArgv, registerRecentProjectsIpc } from './features/recent-projects'
import { registerLocalRepoIpc } from './features/local-repos'
import { registerExtensionIpc } from './features/extensions'
import { managedCommand, registerLspPackageIpc } from './features/lsp-packages'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

let win: BrowserWindow | null = null
let forceClose = false

/* ------------------------------------------------------------------ *
 * The window
 * ------------------------------------------------------------------ */

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 820,
    minHeight: 520,
    show: false,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#0b0d10',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  })

  // Under Wayland `ready-to-show` does not always arrive for hidden windows —
  // show it anyway once loading is through, or after a short wait.
  const reveal = () => { if (win && !win.isDestroyed() && !win.isVisible()) win.show() }
  win.once('ready-to-show', reveal)
  win.webContents.once('did-finish-load', () => setTimeout(reveal, 400))
  setTimeout(reveal, 4000)
  // Reloading the renderer (hot reload) orphans the shells running — end them then.
  win.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) killAllTerminals()
  })
  win.on('closed', () => { win = null })

  // Close only after asking in the renderer (unsaved changes).
  win.on('close', (event) => {
    if (forceClose) return
    event.preventDefault()
    win?.webContents.send('app:close-request')
  })

  const emit = (channel: string, payload?: unknown) =>
    win?.webContents.send(channel, payload)

  win.on('maximize', () => emit('window:state', { maximized: true }))
  win.on('unmaximize', () => emit('window:state', { maximized: false }))
  win.on('enter-full-screen', () => emit('window:state', { fullscreen: true }))
  win.on('leave-full-screen', () => emit('window:state', { fullscreen: false }))

  // Never open external links in the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    return
  }
  win.loadFile(path.join(RENDERER_DIST, 'index.html'))
}

const relaunching = applyWindowSystem()

/**
 * One instance is enough.
 *
 * The entries of the jump list under Windows and the actions of the desktop
 * entry under Linux start the program afresh, only with `--open-folder=…`.
 * Without the lock a second window would then stand beside the first; with it
 * the second instance passes the folder through to the running window and
 * quits.
 */
const singleInstance = relaunching || app.requestSingleInstanceLock()
if (!singleInstance) app.quit()

/** The folder the command line names at start — the renderer collects it. */
let pendingFolder = folderFromArgv(process.argv)

app.on('second-instance', (_event, argv) => {
  const folder = folderFromArgv(argv)
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.focus()
  if (!folder) return
  win.webContents.send('app:open-folder', folder)
})

app.whenReady().then(() => {
  if (relaunching || !singleInstance) return
  nativeTheme.themeSource = 'dark'
  registerIpc()
  registerNetIpc()
  registerSdkIpc(() => win)
  registerLspPackageIpc(() => win)
  registerDapIpc(() => win)
  registerUserAddonIpc(() => win)
  registerUpdaterIpc(() => win, () => { forceClose = true })
  registerDiscordIpc(() => win)
  registerRecentProjectsIpc(() => win)
  registerLocalRepoIpc()
  registerExtensionHostIpc(() => win)
  registerExtensionIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/* ------------------------------------------------------------------ *
 * Filesystem helpers
 * ------------------------------------------------------------------ */

const IGNORED = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out',
  '.next', '.nuxt', '.cache', '__pycache__', '.venv', 'venv',
  'target', 'vendor', '.idea', '.gradle', 'bin', 'obj',
])

const MAX_FILE_BYTES = 8 * 1024 * 1024

/** Entries the file tree never shows — dotfiles such as .gitignore stay visible. */
const HIDDEN_ENTRIES = new Set(['.git', '.svn', '.hg', '.DS_Store', 'Thumbs.db', '.idea', '.cache'])

export interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
}

async function readDirectory(dir: string): Promise<DirEntry[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const result: DirEntry[] = []
  for (const e of entries) {
    if (HIDDEN_ENTRIES.has(e.name)) continue
    if (IGNORED.has(e.name)) continue
    result.push({
      name: e.name,
      path: path.join(dir, e.name),
      isDirectory: e.isDirectory(),
    })
  }
  result.sort((a, b) =>
    a.isDirectory === b.isDirectory
      ? a.name.localeCompare(b.name, 'de', { numeric: true })
      : a.isDirectory ? -1 : 1,
  )
  return result
}

/**
 * Keeps IPC calls from the renderer from writing to arbitrary paths. Allowed
 * are the folder opened and paths the user picked in a file dialog
 * themselves.
 */
const grantedPaths = new Set<string>()

function isInside(parent: string, target: string) {
  const rel = path.relative(parent, target)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function assertWritable(target: string) {
  if (grantedPaths.has(target)) return
  if (workspaceRoot && isInside(workspaceRoot, target)) return
  for (const extra of extraRoots) if (isInside(extra, target)) return
  for (const granted of grantedPaths) if (isInside(granted, target)) return
  throw new Error('Path lies outside the workspace folder')
}

let workspaceRoot: string | null = null
/** Further folders of a workspace (multi-root). */
let extraRoots: string[] = []
interface FsChange {
  path: string
  /** 1 created · 2 changed · 3 deleted */
  type: 1 | 2 | 3
}

/** Dot folders watched all the same (the project configuration). */
const WATCHED_DOT_DIRS = new Set(['.lumen', '.vscode', '.github'])
const MAX_WATCHED_DIRS = 12_000

function ignoredSegment(segment: string) {
  if (IGNORED.has(segment)) return true
  return segment.startsWith('.') && segment.length > 1 && !WATCHED_DOT_DIRS.has(segment) && segment !== '.env'
}

/**
 * Watches the working folder and reports changes to the renderer in batches.
 *
 * macOS and Windows can watch recursively. Under Linux that would be expensive
 * over node_modules and its like through inotify, and soon runs into limits —
 * there every folder that matters gets a watcher of its own, and new folders
 * are taken on as they appear.
 */
class WorkspaceWatcher {
  private watchers = new Map<string, fsSync.FSWatcher>()
  private pending = new Map<string, 'rename' | 'change'>()
  private timer: NodeJS.Timeout | null = null
  private closed = false

  constructor(private readonly root: string) {
    if (process.platform === 'linux') {
      void this.watchTree(root)
      return
    }
    this.watchRecursive()
  }

  private watchRecursive() {
    try {
      const watcher = fsSync.watch(this.root, { recursive: true }, (event, filename) => {
        const name = filename?.toString() ?? ''
        if (!name) return
        if (name.split(/[\\/]/).some(ignoredSegment)) return
        this.record(path.join(this.root, name), event)
      })
      watcher.on('error', () => this.close())
      this.watchers.set(this.root, watcher)
    } catch {
      // Without a watcher, refreshing waits for window focus.
    }
  }

  private async watchTree(dir: string) {
    if (this.closed || this.watchers.has(dir) || this.watchers.size >= MAX_WATCHED_DIRS) return
    try {
      const watcher = fsSync.watch(dir, (event, filename) => {
        const name = filename?.toString() ?? ''
        if (!name || ignoredSegment(name)) return
        this.record(path.join(dir, name), event)
      })
      watcher.on('error', () => this.unwatch(dir))
      this.watchers.set(dir, watcher)
    } catch {
      return
    }
    let entries: fsSync.Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || ignoredSegment(entry.name)) continue
      await this.watchTree(path.join(dir, entry.name))
    }
  }

  private unwatch(dir: string) {
    for (const [watched, watcher] of this.watchers) {
      if (watched !== dir && !watched.startsWith(`${dir}${path.sep}`)) continue
      watcher.close()
      this.watchers.delete(watched)
    }
  }

  private record(file: string, event: string) {
    const previous = this.pending.get(file)
    this.pending.set(file, event === 'rename' || previous === 'rename' ? 'rename' : 'change')
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.flush(), 150)
  }

  private async flush() {
    const batch = [...this.pending]
    this.pending.clear()
    const changes: FsChange[] = []
    for (const [file, kind] of batch) {
      const stat = await fs.stat(file).catch(() => null)
      if (!stat) {
        this.unwatch(file)
        changes.push({ path: file, type: 3 })
        continue
      }
      if (stat.isDirectory() && process.platform === 'linux') await this.watchTree(file)
      changes.push({ path: file, type: kind === 'rename' ? 1 : 2 })
    }
    if (this.closed || !changes.length) return
    win?.webContents.send('fs:changed', changes)
  }

  close() {
    this.closed = true
    if (this.timer) clearTimeout(this.timer)
    for (const watcher of this.watchers.values()) watcher.close()
    this.watchers.clear()
  }
}

let watchers: WorkspaceWatcher[] = []

function watchWorkspace(root: string, extras: string[] = []) {
  for (const existing of watchers) existing.close()
  watchers = [root, ...extras.filter((extra) => extra !== root)].map((dir) => new WorkspaceWatcher(dir))
}

/* ------------------------------------------------------------------ *
 * Settings (userData/settings.json)
 * ------------------------------------------------------------------ */

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json')

async function loadSettings(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(settingsFile(), 'utf8'))
  } catch {
    return {}
  }
}

async function saveSettings(data: Record<string, unknown>) {
  await fs.mkdir(path.dirname(settingsFile()), { recursive: true })
  await fs.writeFile(settingsFile(), JSON.stringify(data, null, 2), 'utf8')
}

/* ------------------------------------------------------------------ *
 * The process runner
 * ------------------------------------------------------------------ */

const running = new Map<string, ChildProcess>()

/** Replace `${env:NAME}` with the environment variable. */
function expandEnv(value: string, env: Record<string, string | undefined>) {
  return value.replace(/\$\{env:(\w+)\}/g, (_m, name: string) => env[name] ?? '')
}

function runCommand(
  id: string, command: string, rawArgs: string[], cwd: string,
  env: Record<string, string> = {},
) {
  killCommand(id)
  const merged = { ...process.env, ...env }
  const args = rawArgs.map((a) => expandEnv(a, merged))
  const child = spawn(expandEnv(command, merged), args, {
    cwd,
    env: { ...process.env, FORCE_COLOR: '0', ...env },
    shell: process.platform === 'win32',
  })
  running.set(id, child)

  const send = (stream: 'stdout' | 'stderr', data: Buffer) =>
    win?.webContents.send('run:data', { id, stream, data: data.toString() })

  child.stdout?.on('data', (d: Buffer) => send('stdout', d))
  child.stderr?.on('data', (d: Buffer) => send('stderr', d))
  child.on('error', (err) => {
    win?.webContents.send('run:data', {
      id, stream: 'stderr', data: `${err.message}\n`,
    })
    running.delete(id)
    win?.webContents.send('run:exit', { id, code: -1 })
  })
  child.on('close', (code) => {
    running.delete(id)
    win?.webContents.send('run:exit', { id, code })
  })
}

function killCommand(id: string) {
  const child = running.get(id)
  if (!child) return
  child.kill('SIGTERM')
  running.delete(id)
}

app.on('before-quit', () => {
  for (const id of [...running.keys()]) killCommand(id)
  for (const id of [...servers.keys()]) stopLsp(id)
  killAllTerminals()
  stopAllDebugAdapters()
  stopDiscordRpc()
  for (const existing of watchers) existing.close()
})

/* ------------------------------------------------------------------ *
 * Language servers (JSON-RPC over stdio)
 * ------------------------------------------------------------------ */

interface LspProcess {
  child: ChildProcess
  /** A buffer for messages not yet complete. */
  buffer: Buffer
}

const servers = new Map<string, LspProcess>()

/** Checks whether a program lies in the PATH. */
function commandExists(command: string): Promise<boolean> {
  return resolveCommand(command).then((hit) => hit !== null)
}

/**
 * Resolves a program: absolute paths (with `~` as well) through the file
 * permissions, bare names through `which`/`where`. Returns the path to use.
 */
function resolveCommand(command: string): Promise<string | null> {
  const expanded = command.replace(/^~(?=\/|$)/, os.homedir())
  return new Promise((resolve) => {
    if (path.isAbsolute(expanded) || expanded.includes('/') || expanded.includes('\\')) {
      fs.access(expanded, fsSync.constants.X_OK).then(
        () => resolve(expanded),
        () => resolve(null),
      )
      return
    }
    const probe = spawn(process.platform === 'win32' ? 'where' : 'which', [expanded], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    })
    probe.on('error', () => resolve(null))
    probe.on('close', (code) => resolve(code === 0 ? expanded : null))
  })
}

/**
 * The first candidate that exists. A server Lumen installed itself
 * (`~/.lumen/lsp/bin`) comes before anything on the PATH.
 */
async function resolveFirst(candidates: string[]): Promise<string | null> {
  const managed = candidates[0] ? await managedCommand(candidates[0]) : null
  if (managed) return managed
  for (const candidate of candidates) {
    const hit = await resolveCommand(candidate)
    if (hit) return hit
  }
  return null
}

/**
 * Splits the stdout stream into LSP messages.
 * The frame: `Content-Length: <n>\r\n\r\n<n bytes of JSON>`
 */
function drainLsp(id: string, server: LspProcess) {
  for (;;) {
    const headerEnd = server.buffer.indexOf('\r\n\r\n')
    if (headerEnd === -1) return

    const header = server.buffer.subarray(0, headerEnd).toString('ascii')
    const match = /content-length:\s*(\d+)/i.exec(header)
    if (!match) {
      // An unusable frame — discard up to the end of the header.
      server.buffer = server.buffer.subarray(headerEnd + 4)
      continue
    }

    const length = Number(match[1])
    const start = headerEnd + 4
    if (server.buffer.length < start + length) return

    const body = server.buffer.subarray(start, start + length).toString('utf8')
    server.buffer = server.buffer.subarray(start + length)

    try {
      win?.webContents.send('lsp:message', { id, message: JSON.parse(body) })
    } catch {
      // Skip broken JSON rather than lose the stream.
    }
  }
}

function startLsp(
  id: string, command: string, args: string[], cwd: string,
  env: Record<string, string> = {},
) {
  stopLsp(id)
  // Create the data folder (jdtls -data, say) where the arguments name one.
  for (const arg of args) {
    if (arg.startsWith(app.getPath('userData'))) {
      try { fsSync.mkdirSync(arg, { recursive: true }) } catch { /* egal */ }
    }
  }
  // Through the Windows shell a path with spaces (C:\Users\Jane Doe\…) has to be quoted.
  const quoted = process.platform === 'win32' && command.includes(' ') && !command.startsWith('"')
  const child = spawn(quoted ? `"${command}"` : command, args, {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
    shell: process.platform === 'win32',
  })
  const server: LspProcess = { child, buffer: Buffer.alloc(0) }
  servers.set(id, server)

  child.stdout?.on('data', (chunk: Buffer) => {
    server.buffer = Buffer.concat([server.buffer, chunk])
    drainLsp(id, server)
  })
  // The servers' stderr is often chatty — pass it on for debugging only.
  child.stderr?.on('data', (chunk: Buffer) => {
    win?.webContents.send('lsp:stderr', { id, text: chunk.toString() })
  })
  // A restart uses the same id. The late end of the old process must neither
  // delete the entry of the new one nor report its client as having crashed.
  child.on('error', (err) => {
    if (servers.get(id) !== server) return
    servers.delete(id)
    win?.webContents.send('lsp:closed', { id, reason: err.message })
  })
  child.on('close', (code) => {
    if (servers.get(id) !== server) return
    servers.delete(id)
    win?.webContents.send('lsp:closed', { id, reason: `beendet (Code ${code})` })
  })
}

function sendLsp(id: string, message: unknown) {
  const server = servers.get(id)
  if (!server?.child.stdin?.writable) return false
  const body = Buffer.from(JSON.stringify(message), 'utf8')
  server.child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`)
  server.child.stdin.write(body)
  return true
}

function stopLsp(id: string) {
  const server = servers.get(id)
  if (!server) return
  servers.delete(id)
  server.child.stdin?.end()
  server.child.kill('SIGTERM')
  // Kill hanging servers outright after a short wait.
  // `killed` becomes true as soon as SIGTERM is sent — what counts is whether it has ended.
  setTimeout(() => {
    if (server.child.exitCode === null && server.child.signalCode === null) server.child.kill('SIGKILL')
  }, 2000)
}

/* ------------------------------------------------------------------ *
 * IPC
 * ------------------------------------------------------------------ */

function registerIpc() {
  ipcMain.handle('window:minimize', () => win?.minimize())
  ipcMain.handle('window:toggleMaximize', () => {
    if (!win) return false
    win.isMaximized() ? win.unmaximize() : win.maximize()
    return win.isMaximized()
  })
  ipcMain.handle('window:close', () => win?.webContents.send('app:close-request'))
  ipcMain.handle('window:forceClose', () => {
    forceClose = true
    if (win && !win.isDestroyed()) win.close()
  })
  ipcMain.handle('window:isMaximized', () => win?.isMaximized() ?? false)

  // Once only: the renderer collects the start folder, after which it is spent.
  ipcMain.handle('app:startupFolder', () => {
    const folder = pendingFolder
    pendingFolder = null
    return folder
  })

  ipcMain.handle('app:info', () => ({
    platform: process.platform,
    version: app.getVersion(),
    home: os.homedir(),
    userData: app.getPath('userData'),
    tmp: app.getPath('temp'),
    windowSystem: currentWindowSystem(),
    waylandSession: isWaylandSession(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  }))
  ipcMain.handle('app:relaunch', () => {
    forceClose = true
    relaunchApp()
  })

  ipcMain.handle('dialog:openFolder', async () => {
    const res = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })
    if (res.canceled || !res.filePaths[0]) return null
    workspaceRoot = res.filePaths[0]
    extraRoots = []
    watchWorkspace(workspaceRoot)
    return workspaceRoot
  })

  ipcMain.handle('dialog:chooseFolder', async (_e, title?: string, defaultPath?: string) => {
    const res = await dialog.showOpenDialog(win!, {
      title: title ?? 'Ordner wählen',
      defaultPath,
      properties: ['openDirectory', 'createDirectory'],
    })
    if (res.canceled || !res.filePaths[0]) return null
    grantedPaths.add(res.filePaths[0])
    return res.filePaths[0]
  })

  ipcMain.handle('dialog:openFile', async () => {
    const res = await dialog.showOpenDialog(win!, { properties: ['openFile'] })
    if (res.canceled || !res.filePaths[0]) return null
    const file = res.filePaths[0]
    grantedPaths.add(file)
    return { path: file, content: await fs.readFile(file, 'utf8') }
  })

  ipcMain.handle('dialog:saveFile', async (_e, suggested: string) => {
    const res = await dialog.showSaveDialog(win!, { defaultPath: suggested })
    if (res.canceled || !res.filePath) return null
    grantedPaths.add(res.filePath)
    return res.filePath
  })

  ipcMain.handle('fs:readDir', (_e, dir: string) => readDirectory(dir))

  ipcMain.handle('fs:exists', (_e, target: string) =>
    fs.access(target).then(() => true, () => false))

  ipcMain.handle('fs:stat', async (_e, target: string) => {
    try {
      const st = await fs.stat(target)
      return { isDirectory: st.isDirectory(), size: st.size, mtime: st.mtimeMs }
    } catch {
      return null
    }
  })

  /** The contents of a folder including dot entries — for project detection. */
  ipcMain.handle('fs:list', async (_e, dir: string) => {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }))
    } catch {
      return []
    }
  })

  ipcMain.handle('fs:readFile', async (_e, file: string) => {
    const stat = await fs.stat(file)
    if (stat.size > MAX_FILE_BYTES) {
      throw new Error(`File is too large (${(stat.size / 1048576).toFixed(1)} MB)`)
    }
    const buf = await fs.readFile(file)
    // A rough check for binary content: a NUL byte in the head of the file.
    if (buf.subarray(0, 4096).includes(0)) throw new Error('Binary file')
    return buf.toString('utf8')
  })

  ipcMain.handle('fs:writeFile', async (_e, file: string, content: string) => {
    assertWritable(file)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, content, 'utf8')
    return true
  })

  ipcMain.handle('fs:create', async (_e, target: string, isDir: boolean) => {
    assertWritable(target)
    const existing = await fs.stat(target).catch(() => null)
    if (existing && !isDir) throw new Error(`“${path.basename(target)}” already exists`)
    if (existing && isDir && !existing.isDirectory()) throw new Error(`“${path.basename(target)}” is already a file`)
    if (isDir) {
      await fs.mkdir(target, { recursive: true })
      return true
    }
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, '', { flag: 'wx' })
    return true
  })

  ipcMain.handle('fs:rename', async (_e, from: string, to: string) => {
    assertWritable(from)
    assertWritable(to)
    if (from !== to && await fs.access(to).then(() => true, () => false)) {
      throw new Error(`“${path.basename(to)}” already exists`)
    }
    await fs.mkdir(path.dirname(to), { recursive: true })
    await fs.rename(from, to)
    return true
  })

  ipcMain.handle('fs:delete', async (_e, target: string) => {
    assertWritable(target)
    await shell.trashItem(target)
    return true
  })

  ipcMain.handle('fs:listFiles', async (_e, root: string, limit = 5000) => {
    const files: string[] = []
    async function walk(dir: string) {
      if (files.length >= limit) return
      let entries: DirEntry[]
      try { entries = await readDirectory(dir) } catch { return }
      for (const e of entries) {
        if (files.length >= limit) return
        if (!e.isDirectory) {
          files.push(e.path)
          continue
        }
        await walk(e.path)
      }
    }
    await walk(root)
    return files
  })

  ipcMain.handle('fs:search', async (_e, root: string, query: string, limit = 200) => {
    const needle = query.toLowerCase()
    const hits: { path: string; line: number; text: string }[] = []

    async function walk(dir: string) {
      if (hits.length >= limit) return
      let entries: DirEntry[]
      try { entries = await readDirectory(dir) } catch { return }
      for (const e of entries) {
        if (hits.length >= limit) return
        if (e.isDirectory) { await walk(e.path); continue }
        try {
          const stat = await fs.stat(e.path)
          if (stat.size > 1024 * 512) continue
          const buf = await fs.readFile(e.path)
          if (buf.subarray(0, 2048).includes(0)) continue
          const lines = buf.toString('utf8').split('\n')
          for (let i = 0; i < lines.length && hits.length < limit; i++) {
            if (lines[i].toLowerCase().includes(needle)) {
              hits.push({ path: e.path, line: i + 1, text: lines[i].trim().slice(0, 200) })
            }
          }
        } catch { /* nicht lesbar — überspringen */ }
      }
    }

    if (needle) await walk(root)
    return hits
  })

  ipcMain.handle('workspace:set', (_e, root: string, extras?: string[]) => {
    workspaceRoot = root
    extraRoots = Array.isArray(extras) ? extras.filter((dir) => typeof dir === 'string' && path.isAbsolute(dir)) : []
    watchWorkspace(root, extraRoots)
    return root
  })

  ipcMain.handle('settings:load', () => loadSettings())
  ipcMain.handle('settings:save', (_e, data: Record<string, unknown>) => saveSettings(data))

  ipcMain.handle('run:start', (
    _e, id: string, cmd: string, args: string[], cwd: string, env?: Record<string, string>,
  ) => {
    runCommand(id, cmd, args, cwd, env ?? {})
    return id
  })
  ipcMain.handle('run:kill', (_e, id: string) => killCommand(id))

  /** Searches from `startDir` upwards (as far as the working folder) for project markers. */
  ipcMain.handle('fs:findRoot', async (_e, startDir: string, markers: string[]) => {
    const containing = [workspaceRoot, ...extraRoots].find((dir): dir is string => Boolean(dir && isInside(dir, startDir)))
    const limit = containing ?? path.parse(startDir).root
    let dir = startDir
    for (;;) {
      for (const marker of markers) {
        try {
          await fs.access(path.join(dir, marker))
          return dir
        } catch { /* weiter */ }
      }
      if (dir === limit) break
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    return null
  })

  ipcMain.handle('lsp:available', (_e, command: string) => commandExists(command))
  ipcMain.handle('lsp:resolve', (_e, candidates: string[]) => resolveFirst(candidates))
  ipcMain.handle('lsp:start', (
    _e, id: string, cmd: string, args: string[], cwd: string, env?: Record<string, string>,
  ) => {
    startLsp(id, cmd, args, cwd, env ?? {})
    return id
  })
  ipcMain.handle('lsp:send', (_e, id: string, message: unknown) => sendLsp(id, message))
  ipcMain.handle('lsp:stop', (_e, id: string) => stopLsp(id))

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) return shell.openExternal(url)
  })
  ipcMain.handle('terminal:shells', () => detectShells())
  ipcMain.handle('terminal:external', () => detectExternalTerminals())
  ipcMain.handle('terminal:create', (e, id: string, options: TerminalOptions) =>
    createTerminal(id, options, e.sender))
  ipcMain.handle('terminal:write', (_e, id: string, data: string) => writeTerminal(id, data))
  ipcMain.handle('terminal:resize', (_e, id: string, cols: number, rows: number) => resizeTerminal(id, cols, rows))
  ipcMain.handle('terminal:kill', (_e, id: string) => killTerminal(id))
  ipcMain.handle('terminal:openExternal', (_e, cwd: string, terminalId?: string) => {
    const target = cwd && fsSync.existsSync(cwd) ? cwd : (workspaceRoot ?? os.homedir())
    return openExternalTerminal(target, terminalId)
  })

  ipcMain.handle('shell:showItemInFolder', (_e, target: string) => shell.showItemInFolder(target))
}
