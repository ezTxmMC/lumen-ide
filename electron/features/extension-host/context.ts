/**
 * `ctx` — everything an extension's `activate(ctx)` gets to work with.
 *
 *   ctx.agents.register(id, provider)          a chat agent (see contract.ts)
 *   ctx.views.register(id, provider)           content for a view declared in the manifest
 *   ctx.views.refresh(id, instance?)           the content changed
 *   ctx.views.open(id, instance, title)        a tab of an editor view (`location: "editor"`)
 *   ctx.commands.register(id, handler)         a command declared in the manifest
 *   ctx.statusBar.set(id, item | null)         an entry in the status bar
 *   ctx.workspace.root() / folders()           the open folders, and a change event
 *   ctx.events.on(kind, fn) / last(kind)       file saved, active file, project, window focus/blur, view shown
 *   ctx.ui.notify / openFile / openDocument / showView / runInTerminal / refreshProject
 *   ctx.locale()                               the interface language (`de`, `en` …)
 *   ctx.appVersion                             Lumen's version
 *   ctx.ui.confirm / input / pick              questions, answered in Lumen's dialogs
 *   ctx.exec(command, args, options)           run a program, collect its output
 *   ctx.settings.get / all / onDidChange       the extension's settings
 *   ctx.secrets.get / set / delete             encrypted with the system's key store
 *   ctx.storage.get / set                      a small JSON document that survives restarts
 *   ctx.storage.dir()                          a folder of the extension's own (downloads, caches)
 *   ctx.openExternal(url)                      a link in the browser
 *
 * Every registration is undone when the extension stops, whatever it forgot
 * to clean up itself.
 */

import { app, shell } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { agents } from './agents'
import { contributions } from './contributions'
import { services } from './services'
import { onWorkspaceRoots, workspaceFolders, workspaceRoot } from '../workspace-roots'
import type {
  AgentProvider, HostEvent, InputField, StatusItem, UiMessage, ViewProvider,
} from './contract'

const MAX_OUTPUT = 16 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 120_000

export interface ExecOptions {
  cwd?: string
  env?: Record<string, string>
  /** Milliseconds; defaults to two minutes. */
  timeoutMs?: number
  /** Written to the program's standard input. */
  input?: string
}

export interface ExecResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

type Dispose = () => void

/** Run a program without a shell and collect what it prints. */
export function exec(command: string, args: string[] = [], options: ExecOptions = {}): Promise<ExecResult> {
  if (typeof command !== 'string' || !command) return Promise.reject(new Error('No command given'))
  const cwd = options.cwd ?? workspaceRoot() ?? process.cwd()
  if (!path.isAbsolute(cwd)) return Promise.reject(new Error('cwd must be an absolute path'))
  return new Promise((resolve, reject) => {
    const child = spawn(command, args.map(String), {
      cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      shell: process.platform === 'win32',
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    child.stdout?.on('data', (chunk: Buffer) => { if (stdout.length < MAX_OUTPUT) stdout += chunk.toString() })
    child.stderr?.on('data', (chunk: Buffer) => { if (stderr.length < MAX_OUTPUT) stderr += chunk.toString() })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut })
    })
    if (options.input !== undefined) child.stdin?.end(options.input)
    if (options.input === undefined) child.stdin?.end()
  })
}

export function createContext(extensionId: string, onDispose: (fn: Dispose) => void) {
  /** Register a listener and make sure it goes when the extension stops. */
  const track = (dispose: Dispose): Dispose => {
    onDispose(dispose)
    return dispose
  }
  const message = (body: UiMessage) => services.message(extensionId, body)

  return {
    id: extensionId,
    platform: process.platform,
    /** Lumen's own version (`0.6.0`). */
    appVersion: app.getVersion(),
    locale: () => services.locale(),
    log: (...args: unknown[]) => console.log(`[${extensionId}]`, ...args),

    agents: {
      register(agentId: string, provider: AgentProvider) {
        agents.register(extensionId, agentId, provider)
      },
    },

    views: {
      register(viewId: string, provider: ViewProvider) {
        contributions.registerView(extensionId, viewId, provider)
      },
      refresh(viewId: string, instance?: string) {
        contributions.refreshView(extensionId, viewId, instance)
      },
      /** Open (or focus) the tab `instance` of an editor view. */
      open(viewId: string, instance: string, title?: string) {
        message({ kind: 'showView', viewId, instance: String(instance), ...(title ? { title: String(title) } : {}) })
      },
    },

    commands: {
      register(commandId: string, handler: (args?: unknown) => unknown) {
        contributions.registerCommand(extensionId, commandId, handler)
      },
    },

    statusBar: {
      set(itemId: string, item: StatusItem | null) {
        contributions.setStatus(extensionId, itemId, item)
      },
    },

    workspace: {
      root: workspaceRoot,
      folders: workspaceFolders,
      onDidChange: (fn: (root: string | null, folders: string[]) => void) =>
        track(onWorkspaceRoots((root, extras) => fn(root, root ? [root, ...extras] : []))),
    },

    events: {
      on<K extends HostEvent['kind']>(kind: K, fn: (event: Extract<HostEvent, { kind: K }>) => void) {
        return track(services.onEvent(extensionId, (event) => {
          if (event.kind !== kind) return
          fn(event as Extract<HostEvent, { kind: K }>)
        }))
      },
      /** The latest event of a kind, if one came yet (`activeFile`, `project`, `windowBlur` …). */
      last: <K extends HostEvent['kind']>(kind: K) => services.last(kind),
    },

    ui: {
      notify: (text: string, tone: 'info' | 'success' | 'warning' | 'error' = 'info') =>
        message({ kind: 'notify', message: String(text), tone }),
      openFile: (file: string, line?: number, column?: number) => message({ kind: 'openFile', path: file, line, column }),
      showView: (viewId: string, options: { instance?: string; title?: string } = {}) => message({ kind: 'showView', viewId, ...options }),
      runInTerminal: (command: string, options: { cwd?: string; title?: string } = {}) =>
        message({ kind: 'runInTerminal', command, ...options }),
      refreshProject: () => message({ kind: 'refreshProject' }),
      openDocument: (name: string, content: string, languageId?: string) =>
        message({ kind: 'openDocument', name, content, languageId }),
      confirm: async (title: string, text: string, options: { confirmLabel?: string; danger?: boolean } = {}) =>
        (await services.request<boolean>(extensionId, { kind: 'confirm', title, message: text, ...options })) === true,
      input: (title: string, fields: InputField[], options: { description?: string; submitLabel?: string } = {}) =>
        services.request<Record<string, string>>(extensionId, { kind: 'input', title, fields, ...options }),
      pick: (title: string, items: { value: string; label: string; detail?: string }[], options: { placeholder?: string } = {}) =>
        services.request<string>(extensionId, { kind: 'pick', title, items, ...options }),
    },

    exec,

    settings: {
      get: (key: string): string | undefined => services.settingsOf(extensionId)[key],
      all: () => ({ ...services.settingsOf(extensionId) }),
      onDidChange: (fn: (values: Record<string, string>) => void) => track(services.onSettings(extensionId, fn)),
    },

    secrets: {
      get: (key: string) => services.getSecret(extensionId, key),
      set: (key: string, value: string) => services.setSecret(extensionId, key, value),
      delete: (key: string) => services.setSecret(extensionId, key, ''),
    },

    storage: {
      get<T>(key: string, fallback: T): T {
        const value = services.stateOf(extensionId)[key]
        return value === undefined ? fallback : value as T
      },
      set: (key: string, value: unknown) => services.saveState(extensionId, key, value),
      /** Created on first use; removed with the extension. */
      async dir(): Promise<string> {
        const dir = services.storageDir(extensionId)
        await fs.mkdir(dir, { recursive: true })
        return dir
      },
    },

    openExternal(url: string) {
      if (!/^https?:\/\//.test(url)) throw new Error('Only http(s) links can be opened')
      return shell.openExternal(url)
    },
  }
}

export type ExtensionContext = ReturnType<typeof createContext>
