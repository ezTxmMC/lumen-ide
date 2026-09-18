/**
 * Manages the language servers: one process per program and project root —
 * clangd serves C and C++ together, tsserver JavaScript and TypeScript —
 * started when the first matching file is opened.
 */

import type { LanguageSpec, LspConfig, LspPackage } from '@/core/types'
import { t } from '@/i18n'
import { LspClient, type ClientStatus, type ContentChange, type LogLine } from './client'
import {
  pathToUri, uriToPath,
  type Diagnostic, type ShowMessageParams, type WorkspaceEdit, type WorkspaceSymbol,
} from './protocol'

export interface LspStatus {
  status: ClientStatus | 'none'
  label: string
  detail: string
  /** How to install the server, shown when it is missing. */
  install?: string
  /** A progress message in flight (indexing …). */
  busy?: string | null
}

export interface ServerEntry {
  id: string
  label: string
  command: string
  languages: string[]
  status: ClientStatus
  detail: string
  root: string
  documents: number
  busy: string | null
  startedAt: number
  version?: string
  config: LspConfig
}

export interface FsChange {
  path: string
  /** 1 created · 2 changed · 3 deleted */
  type: 1 | 2 | 3
}

export interface Paths {
  home: string
  userData: string
  platform: string
  /** `linux-x64`, `darwin-arm64` … — which `github` downloads fit. */
  platformKey?: string
}

class LspManager {
  private clients = new Map<string, LspClient>()
  /** file → client key */
  private owners = new Map<string, string>()
  private diagnosticsByPath = new Map<string, Diagnostic[]>()
  /** Document version the diagnostics refer to; `null` when unknown. */
  private diagnosticsVersions = new Map<string, number | null>()
  private listeners = new Set<() => void>()
  private starting = new Map<string, Promise<LspClient | null>>()
  /** The `initialize` handshake in flight, per client. */
  private startups = new Map<LspClient, Promise<boolean>>()
  /** Resolution results per program — otherwise every file open would probe again. */
  private resolved = new Map<string, Promise<string | null>>()
  /** Languages no server was found for. */
  private missing = new Map<string, LspConfig>()
  private version = 0
  private logVersion = 0

  /** Switchable off globally by the user. */
  enabled = true
  private workspace: string | null = null
  private paths: Paths = { home: '', userData: '', platform: 'linux' }
  /** Preferred server per language (by label), from the project configuration. */
  private preferred: Record<string, string> = {}
  /** Extend the configuration before starting — JAVA_HOME and runtimes for jdtls, say. */
  private decorators = new Set<(config: LspConfig, languageId: string, root: string) => LspConfig>()

  /** Adjust a server's configuration before it starts; returns a function to undo it. */
  addConfigDecorator(fn: (config: LspConfig, languageId: string, root: string) => LspConfig) {
    this.decorators.add(fn)
    return () => { this.decorators.delete(fn) }
  }

  /** Set by the store: apply a WorkspaceEdit across open tabs and files. */
  applyEdit: (edit: WorkspaceEdit, label?: string) => Promise<boolean> = async () => false
  /** Set by the store: show a server message. */
  showMessage: (server: string, params: ShowMessageParams) => void = () => {}
  /** Set by the editor: fetch inlay hints and the like again. */
  onRefresh: (what: string) => void = () => {}
  /** Set by the store: language and current contents of an open file — for a restart. */
  documentFor: (filePath: string) => { spec: LanguageSpec | null; text: string } | null = () => null

  /* ---------------------------------------------------------------- */

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getVersion = () => this.version
  getLogVersion = () => this.logVersion

  private emit() {
    this.version++
    for (const fn of this.listeners) fn()
  }

  private emitLog() {
    this.logVersion++
    for (const fn of this.listeners) fn()
  }

  setPaths(paths: Paths) {
    this.paths = paths
  }

  get platform() {
    return this.paths.platform
  }

  setWorkspace(root: string | null) {
    if (root === this.workspace) return
    this.workspace = root
    this.preferred = {}
    void this.shutdownAll()
  }

  setPreferred(preferred: Record<string, string>) {
    this.preferred = preferred
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    this.emit()
    if (!enabled) {
      void this.shutdownAll()
      return
    }
    this.rescan()
  }

  /* ---------------------------------------------------------------- *
   * Resolution
   * ---------------------------------------------------------------- */

  /** Replaces `~`, `${home}`, `${root}`, `${dataDir}`. */
  substitute(value: string, config: LspConfig, root: string): string {
    const dataDir = `${this.paths.userData}/lsp/${config.command.replace(/[^\w.-]/g, '_')}/${hashOf(root)}`
    return value
      .replace(/^~(?=\/|$)/, this.paths.home)
      .replace(/\$\{home\}/g, this.paths.home)
      .replace(/\$\{root\}/g, root)
      .replace(/\$\{workspace\}/g, this.workspace ?? root)
      .replace(/\$\{dataDir\}/g, dataDir)
  }

  /** The program on the PATH or among the candidates — `null` when nothing is there. */
  private resolveCommand(config: LspConfig, root: string): Promise<string | null> {
    const candidates = (config.candidates ?? []).map((c) => this.substitute(c, config, root))
    const key = `${config.command} ${candidates.join(' ')}`
    let probe = this.resolved.get(key)
    if (!probe) {
      probe = window.lumen.lsp.resolve([config.command, ...candidates]).catch(() => null)
      this.resolved.set(key, probe)
    }
    return probe
  }

  /** Order: the project configuration's preferred server first. */
  private orderedConfigs(spec: LanguageSpec): LspConfig[] {
    const list = [...(spec.lsp ?? [])]
    const wanted = this.preferred[spec.id]
    if (!wanted) return list
    list.sort((a, b) => Number(b.label === wanted) - Number(a.label === wanted))
    return list
  }

  private async resolveConfig(
    spec: LanguageSpec, root: string,
  ): Promise<{ config: LspConfig; command: string } | null> {
    for (const config of this.orderedConfigs(spec)) {
      const command = await this.resolveCommand(config, root)
      if (command) {
        this.missing.delete(spec.id)
        return { config, command }
      }
    }
    if (spec.lsp?.length) this.missing.set(spec.id, this.orderedConfigs(spec)[0])
    return null
  }

  /** Forgets the resolution results — useful after an install. */
  rescan() {
    this.resolved.clear()
    this.missing.clear()
    this.emit()
  }

  private async resolveRoot(config: LspConfig, filePath: string): Promise<string> {
    const fallback = this.workspace ?? filePath.replace(/[^/\\]+$/, '').replace(/[/\\]$/, '')
    if (!config.rootMarkers?.length) return fallback
    const dir = filePath.replace(/[^/\\]+$/, '').replace(/[/\\]$/, '')
    const found = await window.lumen.fs.findRoot(dir, config.rootMarkers).catch(() => null)
    return found ?? fallback
  }

  private clientKey(spec: LanguageSpec, config: LspConfig, root: string) {
    return config.shared === false
      ? `${spec.id}:${config.command}:${root}`
      : `${config.command}:${root}`
  }

  /** Starts the server for this language if needed and returns it. */
  private async ensure(spec: LanguageSpec, filePath: string): Promise<LspClient | null> {
    if (!this.enabled || !spec.lsp?.length) return null

    const pendingKey = `${spec.id}:${filePath}`
    const pending = this.starting.get(pendingKey)
    if (pending) return pending

    const task = (async () => {
      // Work out the root first (for `${root}` in candidates), then resolve.
      const first = this.orderedConfigs(spec)[0]
      const root = await this.resolveRoot(first, filePath)
      const hit = await this.resolveConfig(spec, root)
      if (!hit) {
        this.emit()
        return null
      }
      const { config, command } = hit
      const actualRoot = config === first ? root : await this.resolveRoot(config, filePath)
      const key = this.clientKey(spec, config, actualRoot)
      const existing = this.clients.get(key)
      if (existing) {
        if (existing.status === 'ready') return existing
        // Still starting — a second file, or a restart with several tabs: wait,
        // because a client that is not ready drops didOpen silently.
        const startup = this.startups.get(existing)
        if (existing.status === 'starting' && startup) return (await startup) ? existing : null
        // Do not restart failed clients endlessly — the user can choose
        // “restart”.
        return null
      }

      const substituted: LspConfig = {
        ...config,
        args: (config.args ?? []).map((a) => this.substitute(a, config, actualRoot)),
        env: Object.fromEntries(
          Object.entries(config.env ?? {}).map(([k, v]) => [k, this.substitute(v, config, actualRoot)]),
        ),
      }
      let decorated = substituted
      for (const decorate of this.decorators) decorated = decorate(decorated, spec.id, actualRoot)
      const client = new LspClient(decorated, command, actualRoot)
      this.wire(client)
      this.clients.set(key, client)
      this.emit()

      const startup = client.start()
      this.startups.set(client, startup)
      const ok = await startup
      this.startups.delete(client)
      this.emit()
      return ok ? client : null
    })()

    this.starting.set(pendingKey, task)
    try {
      return await task
    } finally {
      this.starting.delete(pendingKey)
    }
  }

  private wire(client: LspClient) {
    client.onStatusChange = () => this.emit()
    client.onLog = () => this.emitLog()
    client.onDiagnostics = (uri, diagnostics, version) => {
      const path = uriToPath(uri)
      this.diagnosticsByPath.set(path, diagnostics)
      this.diagnosticsVersions.set(path, version ?? null)
      this.emit()
    }
    client.onMessage = (params) => this.showMessage(client.config.label, params)
    client.onApplyEdit = (label, edit) => this.applyEdit(edit, label)
    client.onRefresh = (what) => this.onRefresh(what)
  }

  /* ---------------------------------------------------------------- *
   * Documents
   * ---------------------------------------------------------------- */

  async openDocument(spec: LanguageSpec | null, filePath: string | null, text: string) {
    if (!spec || !filePath) return
    const client = await this.ensure(spec, filePath)
    if (!client) return
    const own = (spec.lsp ?? []).find((c) => c.command === client.config.command)
    const languageId = own?.languageId ?? spec.id
    client.openDocument(filePath, text, languageId)
    this.owners.set(filePath, client.id)
  }

  changeDocument(filePath: string | null, text: string, changes?: ContentChange[]) {
    if (!filePath) return
    this.clientForPath(filePath)?.changeDocument(filePath, text, changes)
  }

  saveDocument(filePath: string | null, text: string) {
    if (!filePath) return
    this.clientForPath(filePath)?.saveDocument(filePath, text)
  }

  closeDocument(filePath: string | null) {
    if (!filePath) return
    this.clientForPath(filePath)?.closeDocument(filePath)
    this.owners.delete(filePath)
    this.emit()
  }

  clientForPath(filePath: string | null): LspClient | null {
    if (!filePath) return null
    const id = this.owners.get(filePath)
    if (!id) return null
    for (const client of this.clients.values()) if (client.id === id) return client
    return null
  }

  /** Any ready client serving the language — for jumps into foreign files. */
  clientForLanguage(languageId: string): LspClient | null {
    for (const client of this.clients.values()) {
      if (client.status === 'ready' && client.servedLanguages.includes(languageId)) return client
    }
    return null
  }

  readyClients(): LspClient[] {
    return [...this.clients.values()].filter((c) => c.status === 'ready')
  }

  clientById(id: string): LspClient | null {
    for (const client of this.clients.values()) if (client.id === id) return client
    return null
  }

  /** Report file changes to every server that cares. */
  notifyFsChanges(changes: FsChange[]) {
    if (!changes.length) return
    for (const client of this.clients.values()) {
      if (client.status !== 'ready' || !client.watchedPatterns.length) continue
      const matchers = client.watchedPatterns.map(globToRegExp)
      const relevant = changes
        .filter((c) => matchers.some((re) => re.test(c.path)))
        .map((c) => ({ uri: pathToUri(c.path), type: c.type }))
      client.didChangeWatchedFiles(relevant)
    }
  }

  /* ---------------------------------------------------------------- *
   * Diagnostics
   * ---------------------------------------------------------------- */

  diagnostics(filePath: string | null): Diagnostic[] {
    return (filePath && this.diagnosticsByPath.get(filePath)) || []
  }

  /**
   * Are the diagnostics still current? The server works on a snapshot; while
   * typing, its positions would otherwise land on text that has since moved.
   */
  diagnosticsAreCurrent(filePath: string | null): boolean {
    if (!filePath) return false
    const version = this.diagnosticsVersions.get(filePath)
    if (version === undefined || version === null) return true
    const current = this.clientForPath(filePath)?.documentVersion(filePath)
    return current === null || current === undefined || version >= current
  }

  /** Every diagnostic in the workspace — for the problems panel. */
  allDiagnostics(): { path: string; diagnostics: Diagnostic[] }[] {
    const out: { path: string; diagnostics: Diagnostic[] }[] = []
    for (const [path, diagnostics] of this.diagnosticsByPath) {
      if (diagnostics.length) out.push({ path, diagnostics })
    }
    return out.sort((a, b) => a.path.localeCompare(b.path))
  }

  diagnosticCounts(): { errors: number; warnings: number; infos: number } {
    let errors = 0, warnings = 0, infos = 0
    for (const list of this.diagnosticsByPath.values()) {
      for (const d of list) {
        const severity = d.severity ?? 1
        if (severity === 1) {
          errors++
          continue
        }
        if (severity === 2) {
          warnings++
          continue
        }
        infos++
      }
    }
    return { errors, warnings, infos }
  }

  /* ---------------------------------------------------------------- *
   * Workspace-wide requests
   * ---------------------------------------------------------------- */

  async workspaceSymbols(query: string): Promise<(WorkspaceSymbol & { server: string })[]> {
    const results = await Promise.all(
      this.readyClients().map(async (client) => {
        const list = await client.workspaceSymbols(query)
        return list.map((s) => ({ ...s, server: client.config.label }))
      }),
    )
    return results.flat().slice(0, 500)
  }

  /* ---------------------------------------------------------------- *
   * Status
   * ---------------------------------------------------------------- */

  status(spec: LanguageSpec | null): LspStatus {
    if (!spec?.lsp?.length) return { status: 'none', label: '', detail: '' }
    if (!this.enabled) return { status: 'stopped', label: t('lsp.off'), detail: '' }

    for (const client of this.clients.values()) {
      if (spec.lsp.some((c) => c.command === client.config.command)) {
        return {
          status: client.status,
          label: client.config.label,
          detail: client.detail,
          install: client.config.install,
          busy: client.busy,
        }
      }
    }
    const missing = this.missing.get(spec.id)
    if (missing) {
      return {
        status: 'unavailable',
        label: missing.label,
        detail: t('lsp.notFound'),
        install: missing.install,
      }
    }
    const first = this.orderedConfigs(spec)[0]
    return { status: 'idle', label: first.label, detail: '', install: first.install }
  }

  /** The first progress message from any server. */
  anyBusy(): string | null {
    for (const client of this.clients.values()) {
      const busy = client.busy
      if (busy) return `${client.config.label.split(/[\s-]/)[0]}: ${busy}`
    }
    return null
  }

  /** Every known server and its state — for the status display. */
  list(): ServerEntry[] {
    return [...this.clients.values()].map((client) => ({
      id: client.id,
      label: client.config.label,
      command: client.command,
      languages: client.servedLanguages,
      status: client.status,
      detail: client.detail,
      root: client.root,
      documents: client.documentCount,
      busy: client.busy,
      startedAt: client.startedAt,
      version: client.serverInfo.version,
      config: client.config,
    }))
  }

  /** Transcript of every server, newest last. */
  logs(serverId?: string): (LogLine & { server: string })[] {
    const out: (LogLine & { server: string })[] = []
    for (const client of this.clients.values()) {
      if (serverId && client.id !== serverId) continue
      for (const line of client.log) out.push({ ...line, server: client.config.label })
    }
    return out.sort((a, b) => a.time - b.time)
  }

  clearLogs() {
    for (const client of this.clients.values()) client.log = []
    this.emitLog()
  }

  /** Missing servers (language → configuration) for install hints. */
  missingServers(): { languageId: string; config: LspConfig }[] {
    return [...this.missing.entries()].map(([languageId, config]) => ({ languageId, config }))
  }

  /** Whether the server's program can be found — on the PATH or among its candidates. */
  async isInstalled(config: LspConfig): Promise<boolean> {
    const root = this.workspace ?? this.paths.home
    return Boolean(await this.resolveCommand(config, root))
  }

  /**
   * How Lumen installs the server into its own environment: the `package`,
   * or one read from a plain install command (`npm i -g …`, `pipx install …`)
   * — so older manifests never run a global install that needs root.
   */
  packageFor(config: LspConfig): LspPackage | null {
    if (config.package) return config.package
    return packageFromCommand(this.installCommand(config) ?? config.install ?? '')
  }

  /** Lumen can install the server into its own environment on this platform. */
  hasPackage(config: LspConfig): boolean {
    const spec = this.packageFor(config)
    if (!spec) return false
    if (spec.type === 'github') return Boolean(spec.assets[this.paths.platformKey ?? ''])
    if (spec.type === 'archive' && typeof spec.url !== 'string') return Boolean(spec.url[this.paths.platformKey ?? ''])
    return true
  }

  /** What an install would do, in one line — for tooltips and prompts. */
  installHint(config: LspConfig): string | null {
    const spec = this.packageFor(config)
    if (spec && this.hasPackage(config)) return `~/.lumen/lsp ← ${packageSource(spec)}`
    return this.installCommand(config)
  }

  /** Something — a package or a command — can install the server here. */
  canInstall(config: LspConfig): boolean {
    return this.hasPackage(config) || Boolean(this.installCommand(config))
  }

  /** The install command for this platform, where one is on record. */
  installCommand(config: LspConfig): string | null {
    const key = this.paths.platform as 'linux' | 'darwin' | 'win32'
    return config.installCommands?.[key] ?? null
  }

  /* ---------------------------------------------------------------- *
   * Lifecycle
   * ---------------------------------------------------------------- */

  /** Restart the file's server — including a failed one the file was never assigned to. */
  async restart(spec: LanguageSpec | null, filePath: string | null) {
    if (!spec || !filePath) return
    const client = this.clientForPath(filePath) ?? this.deadClientFor(spec)
    if (client) await this.restartClient(client.id)
    if (!client) this.rescan()
    const doc = this.documentFor(filePath)
    if (doc) await this.openDocument(spec, filePath, doc.text)
  }

  /** A failed or exited client that would serve this language. */
  private deadClientFor(spec: LanguageSpec): LspClient | null {
    const commands = new Set((spec.lsp ?? []).map((c) => c.command))
    for (const client of this.clients.values()) {
      if (client.status === 'ready' || client.status === 'starting') continue
      if (commands.has(client.config.command)) return client
    }
    return null
  }

  /** Stops a server and its diagnostics; open documents are re-announced on the next open. */
  async stopClient(id: string) {
    const client = this.clientById(id)
    if (!client) return
    for (const [key, value] of this.clients) if (value === client) this.clients.delete(key)
    for (const [path, owner] of this.owners) {
      if (owner !== id) continue
      this.owners.delete(path)
      this.diagnosticsByPath.delete(path)
      this.diagnosticsVersions.delete(path)
    }
    this.emit()
    await client.stop().catch(() => {})
    this.emit()
  }

  /** Restarts one specific server and re-announces the files that were open. Returns their paths. */
  async restartClient(id: string): Promise<string[]> {
    const affected = [...this.owners.entries()].filter(([, owner]) => owner === id).map(([p]) => p)
    await this.stopClient(id)
    this.resolved.clear()
    await Promise.all(affected.map((path) => {
      const doc = this.documentFor(path)
      if (!doc) return undefined
      return this.openDocument(doc.spec, path, doc.text)
    }))
    return affected
  }

  async shutdownAll() {
    const clients = [...this.clients.values()]
    this.clients.clear()
    this.owners.clear()
    this.diagnosticsByPath.clear()
    this.diagnosticsVersions.clear()
    this.emit()
    await Promise.all(clients.map((client) => client.stop().catch(() => {})))
  }
}

/** A short, stable hash for the data folder of each project root. */
function hashOf(text: string): string {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

/** A very small glob translation: `**`, `*`, `?`, `{a,b}`. */
export function globToRegExp(glob: string): RegExp {
  const simple: Record<string, string> = { '?': '[^/]', '{': '(', '}': ')', ',': '|' }
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*'
      i++
      if (glob[i + 1] === '/') i++
      continue
    }
    if (c === '*') {
      re += '[^/]*'
      continue
    }
    if (c in simple) {
      re += simple[c]
      continue
    }
    re += '.+^$()|[]\\'.includes(c) ? `\\${c}` : c
  }
  return new RegExp(`(^|/)${re}$`)
}

/** TypeScript 7 is the native compiler without tsserver.js — the servers need the JavaScript one. */
function npmPackage(name: string): string {
  return name === 'typescript' ? 'typescript@6' : name
}

/** Servers built on the TypeScript API; npm would otherwise fill their peer dependency with TypeScript 7. */
const NEEDS_TYPESCRIPT = /^(@vue\/language-server|@astrojs\/language-server|@angular\/language-server|typescript-language-server|@mdx-js\/language-server)$/

function npmPackages(names: string[]): string[] {
  const packages = names.filter((name) => !name.startsWith('-')).map(npmPackage)
  if (!packages.some((name) => NEEDS_TYPESCRIPT.test(name))) return packages
  if (packages.some((name) => name.startsWith('typescript@'))) return packages
  return [...packages, 'typescript@6']
}

/**
 * A package from a plain, global install command — the kinds Lumen can run in
 * its own environment instead. Anything else (a pipe, several commands,
 * `sudo`) gives `null` and stays a shell command.
 */
export function packageFromCommand(command: string): LspPackage | null {
  const text = command.trim()
  if (!text || /[|&;<>`$]/.test(text)) return null
  const npm = /^npm (?:i|install|add) (?:-g|--global) ([^-].*)$/.exec(text)
  if (npm) return { type: 'npm', packages: npmPackages(npm[1].split(/\s+/)) }
  const python = /^(?:pipx install|pip3? install(?: --user)?|uv tool install) ([A-Za-z0-9][\w.[\],-]*)$/.exec(text)
  if (python) return { type: 'pypi', package: python[1] }
  const go = /^go install (\S+@\S+)$/.exec(text)
  if (go) return { type: 'go', module: go[1] }
  const dotnet = /^dotnet tool install (?:-g|--global) ([\w.-]+)$/.exec(text)
  if (dotnet) return { type: 'dotnet', package: dotnet[1] }
  return null
}

/** Where a package comes from: `npm typescript-language-server`, `GitHub clangd/clangd` … */
export function packageSource(spec: LspPackage): string {
  if (spec.type === 'npm') return `npm ${spec.packages.join(' ')}`
  if (spec.type === 'pypi') return `PyPI ${spec.package}${spec.python ? ` (Python ${spec.python})` : ''}`
  if (spec.type === 'go') return `go ${spec.module}`
  if (spec.type === 'dotnet') return `dotnet ${spec.package}`
  if (spec.type === 'github') return `GitHub ${spec.repo}`
  return typeof spec.url === 'string' ? spec.url : 'download'
}

export const lsp = new LspManager()
