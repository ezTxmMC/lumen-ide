import { contextBridge } from 'electron'
import { invoke, subscribe } from './features/ipc'
import { sdkApi } from './features/sdk-api'
import { lspPackagesApi } from './features/lsp-packages-api'
import { dapApi } from './features/dap-api'
import { userAddonsApi } from './features/user-addons-api'
import { updaterApi } from './features/updater-api'
import { agentApi } from './features/agent-api'
import { discordApi } from './features/discord-rpc-api'

export interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
}

export interface SearchHit {
  path: string
  line: number
  text: string
}

export interface FsChange {
  path: string
  /** 1 created · 2 changed · 3 deleted */
  type: 1 | 2 | 3
}

export interface FileStat {
  isDirectory: boolean
  size: number
  mtime: number
}

const api = {
  window: {
    minimize: () => invoke('window:minimize'),
    toggleMaximize: (): Promise<boolean> => invoke('window:toggleMaximize'),
    close: () => invoke('window:close'),
    forceClose: () => invoke('window:forceClose'),
    onCloseRequest: (cb: () => void) => subscribe('app:close-request', cb),
    isMaximized: (): Promise<boolean> => invoke('window:isMaximized'),
    onState: (cb: (s: { maximized?: boolean; fullscreen?: boolean }) => void) =>
      subscribe('window:state', cb),
  },

  app: {
    info: (): Promise<{
      platform: string; version: string; home: string; userData: string; tmp: string
      windowSystem: 'wayland' | 'x11' | 'other'; waylandSession: boolean; electron: string; chrome: string
    }> => invoke('app:info'),
    /** Start Lumen afresh (after a change of window system, say). */
    relaunch: (): Promise<void> => invoke('app:relaunch'),
    /** The projects opened most recently, for the jump list, the dock or the desktop entry. */
    setRecentProjects: (
      list: { path: string; name: string }[],
      labels: { category: string },
    ): Promise<void> => invoke('app:setRecentProjects', list, labels),
    /** The folder the command line named at start (once only). */
    startupFolder: (): Promise<string | null> => invoke('app:startupFolder'),
    /** An entry from the jump list, the dock or the desktop menu has been chosen. */
    onOpenFolder: (cb: (folder: string) => void) => subscribe('app:open-folder', cb),
  },

  deps: {
    /** Dependencies already present in ~/.m2 or the Gradle cache. */
    local: (): Promise<{ name: string; versions: string[] }[]> => invoke('deps:local'),
    /** Read afresh after an installation. */
    rescan: (): Promise<void> => invoke('deps:rescan'),
  },

  extensions: {
    /** The particulars of a server — which also checks whether one runs there. */
    info: <T = unknown>(server: string): Promise<T> => invoke('extensions:info', server),
    /** The catalogue of a server, searched where asked. */
    index: <T = unknown>(server: string, query?: string): Promise<T> => invoke('extensions:index', server, query),
    /** The details along with the manifest recommended. */
    detail: <T = unknown>(server: string, id: string): Promise<T> => invoke('extensions:detail', server, id),
    /** One particular manifest. */
    manifest: <T = unknown>(server: string, id: string, version: string): Promise<T> =>
      invoke('extensions:manifest', server, id, version),
    /** The manifests installed, from userData/extensions. */
    list: (): Promise<{ file: string; data: unknown; error?: string }[]> => invoke('extensions:list'),
    save: (id: string, content: string): Promise<void> => invoke('extensions:save', id, content),
    remove: (id: string): Promise<void> => invoke('extensions:remove', id),
    /** Saves approved program code and starts it; `hash` is the SHA-256 the user was shown. */
    installCode: (id: string, code: string, hash: string): Promise<void> => invoke('extensions:code:install', id, code, hash),
    removeCode: (id: string): Promise<void> => invoke('extensions:code:remove', id),
  },

  dialog: {
    openFolder: (): Promise<string | null> => invoke('dialog:openFolder'),
    /** Choose a folder without changing the working folder (write access is granted). */
    chooseFolder: (title?: string, defaultPath?: string): Promise<string | null> =>
      invoke('dialog:chooseFolder', title, defaultPath),
    openFile: (): Promise<{ path: string; content: string } | null> =>
      invoke('dialog:openFile'),
    saveFile: (suggested: string): Promise<string | null> =>
      invoke('dialog:saveFile', suggested),
  },

  fs: {
    readDir: (dir: string): Promise<DirEntry[]> => invoke('fs:readDir', dir),
    exists: (target: string): Promise<boolean> => invoke('fs:exists', target),
    stat: (target: string): Promise<FileStat | null> => invoke('fs:stat', target),
    list: (dir: string): Promise<{ name: string; isDirectory: boolean }[]> =>
      invoke('fs:list', dir),
    readFile: (file: string): Promise<string> => invoke('fs:readFile', file),
    writeFile: (file: string, content: string): Promise<boolean> =>
      invoke('fs:writeFile', file, content),
    create: (target: string, isDir: boolean): Promise<boolean> =>
      invoke('fs:create', target, isDir),
    rename: (from: string, to: string): Promise<boolean> =>
      invoke('fs:rename', from, to),
    remove: (target: string): Promise<boolean> => invoke('fs:delete', target),
    listFiles: (root: string, limit?: number): Promise<string[]> =>
      invoke('fs:listFiles', root, limit),
    search: (root: string, query: string, limit?: number): Promise<SearchHit[]> =>
      invoke('fs:search', root, query, limit),
    findRoot: (startDir: string, markers: string[]): Promise<string | null> =>
      invoke('fs:findRoot', startDir, markers),
    onChanged: (cb: (changes: FsChange[]) => void) => subscribe('fs:changed', cb),
  },

  workspace: {
    /** Set the working folder; `extras` are further folders of a workspace (watched, writable). */
    set: (root: string, extras?: string[]): Promise<string> => invoke('workspace:set', root, extras),
  },

  settings: {
    load: (): Promise<Record<string, unknown>> => invoke('settings:load'),
    save: (data: Record<string, unknown>): Promise<void> =>
      invoke('settings:save', data),
  },

  run: {
    start: (
      id: string, cmd: string, args: string[], cwd: string, env?: Record<string, string>,
    ): Promise<string> => invoke('run:start', id, cmd, args, cwd, env),
    kill: (id: string): Promise<void> => invoke('run:kill', id),
    onData: (cb: (p: { id: string; stream: 'stdout' | 'stderr'; data: string }) => void) =>
      subscribe('run:data', cb),
    onExit: (cb: (p: { id: string; code: number | null }) => void) =>
      subscribe('run:exit', cb),
  },

  lsp: {
    available: (command: string): Promise<boolean> =>
      invoke('lsp:available', command),
    /** The first candidate (a PATH name or a path) that is executable. */
    resolve: (candidates: string[]): Promise<string | null> =>
      invoke('lsp:resolve', candidates),
    start: (
      id: string, cmd: string, args: string[], cwd: string, env?: Record<string, string>,
    ): Promise<string> => invoke('lsp:start', id, cmd, args, cwd, env),
    send: (id: string, message: unknown): Promise<boolean> =>
      invoke('lsp:send', id, message),
    stop: (id: string): Promise<void> => invoke('lsp:stop', id),
    onMessage: (cb: (p: { id: string; message: Record<string, unknown> }) => void) =>
      subscribe('lsp:message', cb),
    onStderr: (cb: (p: { id: string; text: string }) => void) =>
      subscribe('lsp:stderr', cb),
    onClosed: (cb: (p: { id: string; reason: string }) => void) =>
      subscribe('lsp:closed', cb),
  },

  terminal: {
    shells: (): Promise<{ id: string; label: string; path: string; args: string[]; isDefault?: boolean }[]> =>
      invoke('terminal:shells'),
    externalTerminals: (): Promise<{ id: string; label: string; command: string }[]> =>
      invoke('terminal:external'),
    create: (
      id: string,
      options: { shell?: string; args?: string[]; cwd?: string; cols: number; rows: number; env?: Record<string, string> },
    ): Promise<{ pid: number; shell: string; cwd: string }> => invoke('terminal:create', id, options),
    write: (id: string, data: string): Promise<void> => invoke('terminal:write', id, data),
    resize: (id: string, cols: number, rows: number): Promise<void> => invoke('terminal:resize', id, cols, rows),
    kill: (id: string): Promise<void> => invoke('terminal:kill', id),
    openExternal: (cwd: string, terminalId?: string): Promise<string> =>
      invoke('terminal:openExternal', cwd, terminalId),
    onData: (cb: (p: { id: string; data: string }) => void) => subscribe('terminal:data', cb),
    onExit: (cb: (p: { id: string; code: number; signal: number | null }) => void) =>
      subscribe('terminal:exit', cb),
  },

  shell: {
    openExternal: (url: string) => invoke('shell:openExternal', url),
    showItemInFolder: (target: string) => invoke('shell:showItemInFolder', target),
  },

  net: {
    fetchText: (url: string): Promise<string> => invoke('net:fetchText', url),
    fetchJson: <T = unknown>(url: string): Promise<T> => invoke('net:fetchJson', url),
  },

  sdk: sdkApi,
  lspPackages: lspPackagesApi,
  dap: dapApi,
  userAddons: userAddonsApi,
  updater: updaterApi,
  agent: agentApi,
  discord: discordApi,
}

contextBridge.exposeInMainWorld('lumen', api)

export type LumenApi = typeof api
