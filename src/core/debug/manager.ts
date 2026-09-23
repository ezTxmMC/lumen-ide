/**
 * The debugger: sessions — child sessions through `startDebugging` included —
 * focus on a thread and a frame, the debug console, watch expressions, inline
 * values, exception filters, and keeping breakpoints in step with every
 * adapter.
 *
 * The interface and the editor read through `subscribe`/`getVersion`.
 */

import { useStore } from '@/state/store'
import { registry } from '@/core/registry'
import { lsp } from '@/core/lsp/manager'
import { matchLanguage } from '@/core/language'
import { t } from '@/i18n'
import type { DebugAdapterConfig, DebugContext } from '@/core/types'
import { DapClient } from './client'
import { DebugSession, type FileBreakpoints, type SessionHooks, type ThreadState } from './session'
import type { EvaluateResult, OutputEventBody, RunInTerminalArguments, StackFrame, Variable } from './protocol'
import { breakpoints } from './breakpoints'
import {
  createContext, debugChoices, injectLspBundles, launchArguments, pickOne, type DebugChoice, type Vars,
} from './config'
import {
  EMPTY_DEBUG_STATE, isEmptyState, loadDebugState, saveDebugState, statePath, type DebugState,
} from './persist'
import { normalizePath, samePath, toAbsolute, toRelative } from './paths'
import { createIpcTransport } from './transport'

export type ConsoleKind = 'stdout' | 'stderr' | 'console' | 'important' | 'input' | 'result' | 'error' | 'adapter' | 'system'

export interface ConsoleEntry {
  id: number
  kind: ConsoleKind
  text: string
  sessionId?: string
  variablesReference?: number
}

export interface MissingAdapter {
  label: string
  language: string
  install?: string
  installCommand?: string
  docs?: string
}

export interface WatchResult {
  value: string
  type?: string
  variablesReference: number
  error?: boolean
}

export interface Focus {
  sessionId: string
  threadId: number | null
  frameId: number | null
}

export interface ExecLocation {
  path: string
  /** 0-based. */
  line: number
  /** The topmost frame, unless a deeper one was chosen. */
  top: boolean
}

export interface InlineValues {
  path: string
  line: number
  values: Map<string, string>
}

interface Endpoint {
  transport: 'stdio' | 'tcp'
  command?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  host?: string
  port?: number
}

interface SessionMeta {
  choice: DebugChoice
  /** For child sessions: TCP adapters reconnect, stdio adapters start again. */
  childEndpoint: Endpoint
  revealed: boolean
}

const MAX_CONSOLE = 4000
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g
const INLINE_KEY = 'lumen.debug.inlineValues'

const KIND_BY_CATEGORY: Record<string, ConsoleKind> = {
  stdout: 'stdout',
  stderr: 'stderr',
  console: 'console',
  important: 'important',
}

function readInlinePreference() {
  try {
    return localStorage.getItem(INLINE_KEY) !== 'false'
  } catch {
    return true
  }
}

/** Put environment variables in front of the command (PowerShell, or `env`). */
function envPrefix(env: [string, string][], platform: string) {
  if (!env.length) return ''
  if (platform === 'win32') return env.map(([key, value]) => `$env:${key}=${quoteArg(value, platform)}; `).join('')
  return `env ${env.map(([key, value]) => `${key}=${quoteArg(value, platform)}`).join(' ')} `
}

function quoteArg(arg: string, platform: string) {
  if (/^[\w@%+=:,./-]+$/.test(arg)) return arg
  if (platform === 'win32') return `"${arg.replace(/"/g, '\\"')}"`
  return `'${arg.replace(/'/g, `'\\''`)}'`
}

class Debugger {
  sessions: DebugSession[] = []
  focus: Focus | null = null
  console: ConsoleEntry[] = []
  watchResults = new Map<string, WatchResult>()
  inline: InlineValues | null = null
  showInline = readInlinePreference()
  missing: MissingAdapter[] = []
  starting = false
  exec: ExecLocation | null = null
  /** Rises whenever variables have to be reloaded — a stop, a frame change, a new value. */
  generation = 0

  private state: DebugState = structuredClone(EMPTY_DEBUG_STATE)
  private workspace: string | null = null
  private stateFileExists = false
  private meta = new Map<string, SessionMeta>()
  private tempBreakpoint: { path: string; line: number } | null = null
  private lastLaunch: { choice: DebugChoice; file: string | null } | null = null
  private home = ''
  private consoleCounter = 0
  private version = 0
  private listeners = new Set<() => void>()
  private emitQueued = false
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private resendTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private resolved = new Map<string, Promise<{ command: string; args?: string[] } | null>>()
  private started = false

  /* ---------------------------------------------------------------- *
   * Observers
   * ---------------------------------------------------------------- */

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  getVersion = () => this.version

  private emit() {
    if (this.emitQueued) return
    this.emitQueued = true
    queueMicrotask(() => {
      this.emitQueued = false
      this.version++
      for (const fn of this.listeners) fn()
    })
  }

  /* ---------------------------------------------------------------- *
   * Starting and project state
   * ---------------------------------------------------------------- */

  init() {
    if (this.started) return
    this.started = true
    void window.lumen.app.info().then((info) => { this.home = info.home }).catch(() => {})
    void injectLspBundles().catch((err) => console.error('[lumen] Debug-Plugins:', err))

    breakpoints.onChange((paths, persist) => {
      if (persist) this.schedulePersist()
      for (const path of paths) this.scheduleResend(path)
    })

    void this.loadWorkspace(useStore.getState().workspace)
    useStore.subscribe((state, previous) => {
      if (state.workspace === previous.workspace) return
      void this.loadWorkspace(state.workspace)
    })
  }

  private async loadWorkspace(root: string | null) {
    if (this.sessions.length) await this.stopAll()
    this.flushPersist()
    this.workspace = root
    this.state = structuredClone(EMPTY_DEBUG_STATE)
    this.stateFileExists = false
    if (root) {
      this.stateFileExists = await window.lumen.fs.exists(await statePath(root)).catch(() => false)
      this.state = await loadDebugState(root)
    }
    if (this.workspace !== root) return
    breakpoints.replace(this.state.breakpoints.map((bp) => ({
      path: toAbsolute(root ?? '', bp.path),
      line: bp.line - 1,
      enabled: bp.enabled !== false,
      condition: bp.condition,
      hitCondition: bp.hitCondition,
      logMessage: bp.logMessage,
    })))
    this.watchResults.clear()
    this.emit()
  }

  private schedulePersist() {
    if (!this.workspace) return
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => this.flushPersist(), 400)
  }

  private flushPersist() {
    if (!this.persistTimer) return
    clearTimeout(this.persistTimer)
    this.persistTimer = null
    const root = this.workspace
    if (!root) return
    this.state.breakpoints = breakpoints.all().map((bp) => ({
      path: toRelative(root, bp.path),
      line: bp.line + 1,
      ...(bp.enabled ? {} : { enabled: false }),
      ...(bp.condition ? { condition: bp.condition } : {}),
      ...(bp.hitCondition ? { hitCondition: bp.hitCondition } : {}),
      ...(bp.logMessage ? { logMessage: bp.logMessage } : {}),
    }))
    if (!this.stateFileExists && isEmptyState(this.state)) return
    this.stateFileExists = true
    void saveDebugState(root, this.state).catch((err: Error) => {
      useStore.getState().notify(t('debug.error.saveState', { message: err.message }), 'warning')
    })
  }

  private readonly memory: DebugContext['memory'] = {
    get: (key) => this.state.memory[key],
    set: (key, value) => {
      if (this.state.memory[key] === value) return
      this.state.memory[key] = value
      this.schedulePersist()
    },
  }

  /* ---------------------------------------------------------------- *
   * Breakpoints to the adapters
   * ---------------------------------------------------------------- */

  private fileBreakpoints(path: string): FileBreakpoints {
    const entries = breakpoints.forPath(path).filter((bp) => bp.enabled)
    const out: FileBreakpoints = {
      path: entries[0]?.path ?? path,
      ids: entries.map((bp) => bp.id),
      breakpoints: entries.map((bp) => ({
        line: bp.line + 1,
        condition: bp.condition,
        hitCondition: bp.hitCondition,
        logMessage: bp.logMessage,
      })),
    }
    const temp = this.tempBreakpoint
    if (temp && samePath(temp.path, path) && !entries.some((bp) => bp.line === temp.line)) {
      out.ids.push('temp')
      out.breakpoints.push({ line: temp.line + 1 })
    }
    return out
  }

  private allFileBreakpoints(): FileBreakpoints[] {
    const paths = new Map<string, string>()
    for (const bp of breakpoints.all()) paths.set(normalizePath(bp.path), bp.path)
    if (this.tempBreakpoint) paths.set(normalizePath(this.tempBreakpoint.path), this.tempBreakpoint.path)
    return [...paths.values()].map((path) => this.fileBreakpoints(path)).filter((file) => file.breakpoints.length)
  }

  private scheduleResend(path: string) {
    if (!this.sessions.length) return
    const key = normalizePath(path)
    const pending = this.resendTimers.get(key)
    if (pending) clearTimeout(pending)
    this.resendTimers.set(key, setTimeout(() => {
      this.resendTimers.delete(key)
      const file = this.fileBreakpoints(path)
      for (const session of this.sessions) {
        if (session.state === 'initializing' || session.state === 'terminated') continue
        void session.setBreakpoints(file).catch((err: Error) => this.append('error', err.message, session.id))
      }
    }, 150))
  }

  /* ---------------------------------------------------------------- *
   * Session hooks
   * ---------------------------------------------------------------- */

  private readonly hooks: SessionHooks = {
    sourceBreakpoints: () => this.allFileBreakpoints(),
    exceptionFilters: (session) => {
      const filters = session.capabilities.exceptionBreakpointFilters ?? []
      const known = filters.map((f) => ({ filter: f.filter, label: f.label, ...(f.default ? { default: true } : {}) }))
      if (JSON.stringify(this.state.knownFilters[session.type]) !== JSON.stringify(known)) {
        this.state.knownFilters[session.type] = known
        this.schedulePersist()
      }
      return this.selectedFilters(session.type)
    },
    breakpointsVerified: (_session, ids, result) => {
      ids.forEach((id, i) => {
        if (id === 'temp') return
        const bp = result[i]
        breakpoints.setStatus(id, { verified: bp?.verified ?? false, message: bp?.message })
      })
    },
    breakpointChanged: (session, reason, bp) => {
      const id = session.breakpointIdFor(bp.id)
      if (!id || reason === 'removed') return
      breakpoints.setStatus(id, { verified: bp.verified, message: bp.message })
    },
    stopped: (session, threadId, body) => void this.handleStopped(session, threadId, body.preserveFocusHint, body.reason, body.text ?? body.description),
    continued: (session) => {
      if (this.focus?.sessionId !== session.id) return
      const thread = this.focus.threadId === null ? undefined : session.threads.get(this.focus.threadId)
      if (thread?.stopped) return
      this.setExec(null)
      this.inline = null
      this.watchResults.clear()
      this.generation++
      this.emit()
    },
    output: (session, body) => this.handleOutput(session, body),
    terminated: (session, reason) => this.handleTerminated(session, reason),
    runInTerminal: (_session, args) => this.runInTerminal(args),
    startDebugging: async (session, args) => {
      const root = this.rootOf(session)
      const meta = this.meta.get(root.id)
      if (!meta) throw new Error('startDebugging')
      const name = typeof args.configuration.name === 'string' ? args.configuration.name : session.name
      void this.startSession(meta.choice, meta.childEndpoint, args.request, name, args.configuration, session)
    },
    changed: () => this.emit(),
  }

  private rootOf(session: DebugSession): DebugSession {
    let current = session
    while (current.parent) current = current.parent
    return current
  }

  private handleOutput(session: DebugSession, body: OutputEventBody) {
    if (body.category === 'telemetry') return
    const kind = KIND_BY_CATEGORY[body.category ?? 'console'] ?? 'console'
    this.append(kind, body.output, session.id, body.variablesReference)
  }

  private async handleStopped(session: DebugSession, threadId: number | undefined, preserveFocus: boolean | undefined, reason: string, text?: string) {
    if (this.tempBreakpoint) {
      const temp = this.tempBreakpoint
      this.tempBreakpoint = null
      this.scheduleResend(temp.path)
    }
    if (reason === 'exception') {
      this.append('error', t('debug.console.exception', { text: text ?? '' }), session.id)
    }
    const focusedElsewhere = this.focus && this.focus.sessionId !== session.id && this.focusedThread()?.stopped
    if (preserveFocus && focusedElsewhere) {
      this.emit()
      return
    }
    const thread = threadId === undefined ? undefined : session.threads.get(threadId)
    const frame = thread ? this.firstUsefulFrame(thread) : undefined
    this.focus = { sessionId: session.id, threadId: threadId ?? null, frameId: frame?.id ?? null }
    this.generation++
    const meta = this.meta.get(this.rootOf(session).id)
    if (meta && !meta.revealed) {
      meta.revealed = true
      useStore.getState().showSidebar('debug')
    }
    if (frame) await this.revealFrame(session, frame, frame === thread?.frames[0])
    await Promise.all([this.refreshWatches(), this.computeInline()])
    this.emit()
  }

  private firstUsefulFrame(thread: ThreadState): StackFrame | undefined {
    return thread.frames.find((f) => (f.source?.path || f.source?.sourceReference) && f.presentationHint !== 'subtle')
      ?? thread.frames[0]
  }

  private handleTerminated(session: DebugSession, reason: string) {
    this.sessions = this.sessions.filter((s) => s !== session)
    if (session.parent) session.parent.children = session.parent.children.filter((c) => c !== session)
    this.meta.delete(session.id)
    if (reason) {
      useStore.getState().notify(t('debug.error.crashed', { name: session.name, reason }), 'error')
      this.append('error', t('debug.error.crashed', { name: session.name, reason }), session.id)
    }
    if (session.exitCode !== null) this.append('system', t('debug.console.exited', { name: session.name, code: session.exitCode }), session.id)
    if (this.focus?.sessionId === session.id) {
      this.focus = null
      this.setExec(null)
      this.inline = null
      this.watchResults.clear()
      const next = this.sessions.find((s) => [...s.threads.values()].some((th) => th.stopped))
      if (next) void this.handleStopped(next, [...next.threads.values()].find((th) => th.stopped)?.id, false, 'focus')
    }
    if (!this.sessions.length) this.allEnded()
    this.syncActive()
    this.emit()
  }

  private allEnded() {
    this.tempBreakpoint = null
    breakpoints.clearStatus()
    this.focus = null
    this.setExec(null)
    this.inline = null
    this.watchResults.clear()
    this.append('system', t('debug.console.ended'))
  }

  private syncActive() {
    const active = this.sessions.length > 0
    if (useStore.getState().debugActive !== active) useStore.setState({ debugActive: active })
  }

  private async runInTerminal(args: RunInTerminalArguments) {
    const state = useStore.getState()
    const platform = state.platform
    const command = args.argsCanBeInterpretedByShell
      ? args.args.join(' ')
      : args.args.map((arg) => quoteArg(arg, platform)).join(' ')
    const env = Object.entries(args.env ?? {}).filter(([, value]) => value !== null) as [string, string][]
    const prefix = envPrefix(env, platform)
    await state.openTerminal({ command: `${prefix}${command}`, cwd: args.cwd || undefined, title: args.title ?? t('debug.terminalTitle') })
    return {}
  }

  /* ---------------------------------------------------------------- *
   * Console
   * ---------------------------------------------------------------- */

  append(kind: ConsoleKind, raw: string, sessionId?: string, variablesReference?: number) {
    const text = raw.replace(ANSI, '')
    const last = this.console[this.console.length - 1]
    const mergeable = last && !variablesReference && !last.variablesReference && last.kind === kind
      && last.sessionId === sessionId && !last.text.endsWith('\n') && (kind === 'stdout' || kind === 'stderr' || kind === 'console' || kind === 'adapter')
    if (mergeable) {
      this.console = [...this.console.slice(0, -1), { ...last, text: last.text + text }]
      this.emit()
      return
    }
    const entry: ConsoleEntry = { id: ++this.consoleCounter, kind, text, sessionId, variablesReference }
    this.console = [...this.console, entry].slice(-MAX_CONSOLE)
    this.emit()
  }

  clearConsole() {
    this.console = []
    this.emit()
  }

  /* ---------------------------------------------------------------- *
   * Launching
   * ---------------------------------------------------------------- */

  private resolveProgram(adapter: DebugAdapterConfig, vars: Vars) {
    const sub = (value: string) => value.replace(/\$\{home\}/g, vars.home).replace(/\$\{projectRoot\}/g, vars.projectRoot).replace(/\$\{workspace\}/g, vars.workspace)
    const programs = [
      ...(adapter.command ? [{ command: adapter.command, args: adapter.args, probe: adapter.probe }] : []),
      ...(adapter.candidates ?? []).map((candidate) => (typeof candidate === 'string'
        ? { command: candidate, args: adapter.args }
        : { command: candidate.command, args: candidate.args ?? adapter.args, probe: candidate.probe })),
    ].map((program) => ({ ...program, command: sub(program.command) }))
    const key = JSON.stringify(programs)
    let hit = this.resolved.get(key)
    if (!hit) {
      hit = window.lumen.dap.resolve(programs).catch(() => null)
      this.resolved.set(key, hit)
      // Do not remember failures for good — the user may be installing right now.
      void hit.then((result) => { if (!result) this.resolved.delete(key) })
    }
    return hit
  }

  private async isAvailable(choice: DebugChoice, vars: Vars) {
    if (choice.adapter.connect) return true
    return Boolean(await this.resolveProgram(choice.adapter, vars))
  }

  private missingEntry(choice: DebugChoice): MissingAdapter {
    const platform = useStore.getState().platform as 'linux' | 'darwin' | 'win32'
    const language = registry.languages().find((l) => l.id === choice.languageId)
    return {
      label: choice.adapter.label,
      language: language?.name ?? choice.languageId ?? '',
      install: choice.adapter.install,
      installCommand: choice.adapter.installCommands?.[platform],
      docs: choice.adapter.docs,
    }
  }

  /** Starts a session for the active file, or for the project. */
  async start(options: { pick?: boolean; choiceId?: string } = {}) {
    if (this.starting) return
    const state = useStore.getState()
    const tab = state.activeTab()
    const file = tab?.path && !tab.virtual ? tab.path : null
    const language = state.languageFor(tab)
    this.starting = true
    this.emit()
    try {
      const choices = await debugChoices(language?.id ?? null)
      if (!choices.length) {
        state.notify(t('debug.error.noAdapter', { language: language?.name ?? t('debug.thisProject') }), 'warning')
        return
      }
      const { vars } = createContext(file, language?.id ?? null, this.memory, this.home)
      const available: DebugChoice[] = []
      for (const choice of choices) {
        if (choice.config || await this.isAvailable(choice, vars)) available.push(choice)
      }
      if (!available.length) {
        this.missing = choices.filter((c) => !c.config).map((c) => this.missingEntry(c))
        state.notify(t('debug.error.adapterMissing', { names: this.missing.map((m) => m.label).join(', ') }), 'warning')
        state.showPanel('debug')
        return
      }
      this.missing = []
      const lastKey = `last:${language?.id ?? 'project'}`
      const chosen = await this.chooseConfig(available, options, lastKey)
      if (!chosen) return
      this.memory.set(lastKey, chosen.id)
      await this.launch(chosen, file)
    } catch (err) {
      this.reportStartError(err as Error)
    } finally {
      this.starting = false
      this.emit()
    }
  }

  private async chooseConfig(available: DebugChoice[], options: { pick?: boolean; choiceId?: string }, lastKey: string) {
    const byId = options.choiceId ? available.find((c) => c.id === options.choiceId) : undefined
    if (byId) return byId
    if (available.length === 1) return available[0]
    const remembered = available.find((c) => c.id === this.state.memory[lastKey])
    if (remembered && !options.pick) return remembered
    const id = await pickOne(
      t('debug.pickConfig'),
      available.map((c) => ({ value: c.id, label: c.label, detail: c.detail })),
      this.state.memory[lastKey],
    )
    return available.find((c) => c.id === id) ?? null
  }

  private reportStartError(err: Error) {
    const message = t('debug.error.startFailed', { message: err.message })
    useStore.getState().notify(message, 'error')
    this.append('error', message)
  }

  private async launch(choice: DebugChoice, file: string | null) {
    const { ctx, vars } = createContext(file, choice.languageId, this.memory, this.home)
    const args = await launchArguments(choice, ctx, vars)
    if (!args) return
    const endpoint = await this.openEndpoint(choice, ctx, vars)
    if (!endpoint) return
    const request = choice.config?.request ?? choice.adapter.request ?? 'launch'
    this.lastLaunch = { choice, file }
    this.append('system', t('debug.console.starting', { name: choice.label }))
    useStore.getState().showPanel('debug')
    await this.startSession(choice, endpoint, request, choice.label, { type: choice.adapter.type, request, name: choice.label, ...args }, null)
  }

  private async openEndpoint(choice: DebugChoice, ctx: DebugContext, vars: Vars): Promise<Endpoint | null> {
    const adapter = choice.adapter
    if (adapter.connect) {
      try {
        const { port, host } = await adapter.connect(ctx)
        return { transport: 'tcp', port, host }
      } catch (err) {
        this.missing = [this.missingEntry(choice)]
        throw err
      }
    }
    const program = await this.resolveProgram(adapter, vars)
    if (!program) {
      this.missing = [this.missingEntry(choice)]
      useStore.getState().notify(t('debug.error.adapterMissing', { names: adapter.label }), 'warning')
      useStore.getState().showPanel('debug')
      return null
    }
    const env = Object.fromEntries(Object.entries(adapter.env ?? {}).map(([key, value]) => [key, ctx.substitute(value)]))
    return {
      transport: adapter.transport ?? 'stdio',
      command: program.command,
      args: (program.args ?? []).map((arg) => ctx.substitute(arg)),
      cwd: ctx.projectRoot,
      env: { ...useStore.getState().projectConfig.env, ...env },
      host: adapter.host,
      port: adapter.port,
    }
  }

  private async startSession(
    choice: DebugChoice, endpoint: Endpoint, request: 'launch' | 'attach', name: string,
    args: Record<string, unknown>, parent: DebugSession | null,
  ) {
    const transport = createIpcTransport()
    transport.onOutput((_stream, text) => this.append('adapter', text))
    let port: number | undefined
    try {
      port = (await window.lumen.dap.start(transport.id, endpoint)).port
    } catch (err) {
      transport.close()
      throw err
    }
    const client = new DapClient(transport)
    const session = new DebugSession(client, name, choice.adapter.type, request, args, this.hooks, parent)
    const childEndpoint: Endpoint = endpoint.transport === 'tcp'
      ? { transport: 'tcp', host: endpoint.host, port: port ?? endpoint.port }
      : endpoint
    this.sessions = [...this.sessions, session]
    if (parent) parent.children = [...parent.children, session]
    this.meta.set(session.id, { choice, childEndpoint, revealed: false })
    this.syncActive()
    this.emit()
    try {
      await session.start()
    } catch (err) {
      const message = t('debug.error.startFailed', { message: (err as Error).message })
      useStore.getState().notify(message, 'error')
      this.append('error', message, session.id)
      await session.stop().catch(() => {})
    }
  }

  /* ---------------------------------------------------------------- *
   * Control
   * ---------------------------------------------------------------- */

  focusedSession(): DebugSession | null {
    const id = this.focus?.sessionId
    return this.sessions.find((s) => s.id === id) ?? null
  }

  focusedThread(): ThreadState | null {
    const session = this.focusedSession()
    if (!session || this.focus?.threadId === null || this.focus?.threadId === undefined) return null
    return session.threads.get(this.focus.threadId) ?? null
  }

  focusedFrame(): StackFrame | null {
    const thread = this.focusedThread()
    if (!thread) return null
    return thread.frames.find((f) => f.id === this.focus?.frameId) ?? null
  }

  get isStopped() {
    return Boolean(this.focusedThread()?.stopped)
  }

  get hasSessions() {
    return this.sessions.length > 0
  }

  /** Session and thread for control commands: the focused one, else the first stopped. */
  private target(): { session: DebugSession; threadId: number } | null {
    const session = this.focusedSession()
    const threadId = this.focus?.threadId
    if (session && threadId !== null && threadId !== undefined) return { session, threadId }
    for (const candidate of this.sessions) {
      const thread = [...candidate.threads.values()].find((th) => th.stopped) ?? candidate.threads.values().next().value
      if (thread) return { session: candidate, threadId: thread.id }
    }
    return null
  }

  private async control(fn: (session: DebugSession, threadId: number) => Promise<unknown>) {
    const target = this.target()
    if (!target) return
    try {
      await fn(target.session, target.threadId)
    } catch (err) {
      this.append('error', (err as Error).message, target.session.id)
    }
  }

  continue() {
    return this.control((session, threadId) => session.continue(threadId))
  }

  pause() {
    return this.control((session, threadId) => session.pause(threadId))
  }

  step(kind: 'next' | 'stepIn' | 'stepOut') {
    if (!this.isStopped) return Promise.resolve()
    return this.control((session, threadId) => session.step(kind, threadId))
  }

  async stopAll() {
    const roots = this.sessions.filter((s) => !s.parent)
    await Promise.all(roots.map((s) => s.stop().catch(() => {})))
  }

  async stopSession(sessionId: string) {
    const session = this.sessions.find((s) => s.id === sessionId)
    if (session) await session.stop().catch(() => {})
  }

  async restart() {
    const roots = this.sessions.filter((s) => !s.parent)
    if (!roots.length) {
      if (this.lastLaunch) await this.relaunch()
      return
    }
    let restarted = true
    for (const session of roots) {
      const ok = await session.restart().catch(() => false)
      if (!ok) restarted = false
    }
    if (restarted) return
    await this.stopAll()
    await this.relaunch()
  }

  private async relaunch() {
    const last = this.lastLaunch
    if (!last) return
    this.starting = true
    this.emit()
    try {
      await this.launch(last.choice, last.file)
    } catch (err) {
      this.reportStartError(err as Error)
    } finally {
      this.starting = false
      this.emit()
    }
  }

  /** Run to a line: a temporary breakpoint, then continue or start. */
  async runToCursor(path: string, line: number) {
    this.tempBreakpoint = { path, line }
    if (!this.sessions.length) {
      await this.start()
      return
    }
    this.scheduleResend(path)
    await new Promise((resolve) => setTimeout(resolve, 200))
    if (this.isStopped) await this.continue()
  }

  /** Set a breakpoint and start a session (“debug from here”). */
  async debugFrom(path: string, line: number) {
    if (!breakpoints.at(path, line)) breakpoints.add(path, line)
    if (this.sessions.length) return
    await this.start()
  }

  /* ---------------------------------------------------------------- *
   * Focus, execution line, values
   * ---------------------------------------------------------------- */

  async selectThread(sessionId: string, threadId: number) {
    const session = this.sessions.find((s) => s.id === sessionId)
    const thread = session?.threads.get(threadId)
    if (!session || !thread) return
    if (thread.stopped && !thread.frames.length) await session.loadFrames(threadId).catch(() => {})
    const frame = this.firstUsefulFrame(thread)
    this.focus = { sessionId, threadId, frameId: frame?.id ?? null }
    this.generation++
    if (frame) await this.revealFrame(session, frame, frame === thread.frames[0])
    if (!frame) this.setExec(null)
    await Promise.all([this.refreshWatches(), this.computeInline()])
    this.emit()
  }

  async selectFrame(sessionId: string, threadId: number, frameId: number) {
    const session = this.sessions.find((s) => s.id === sessionId)
    const thread = session?.threads.get(threadId)
    const frame = thread?.frames.find((f) => f.id === frameId)
    if (!session || !thread || !frame) return
    this.focus = { sessionId, threadId, frameId }
    this.generation++
    await this.revealFrame(session, frame, frame === thread.frames[0])
    await Promise.all([this.refreshWatches(), this.computeInline()])
    this.emit()
  }

  async loadMoreFrames(sessionId: string, threadId: number) {
    const session = this.sessions.find((s) => s.id === sessionId)
    await session?.loadFrames(threadId, true).catch(() => {})
  }

  private setExec(location: ExecLocation | null) {
    this.exec = location
    this.emit()
  }

  private async revealFrame(session: DebugSession, frame: StackFrame, top: boolean) {
    const source = frame.source
    const line = Math.max(0, frame.line - 1)
    const character = Math.max(0, (frame.column || 1) - 1)
    const state = useStore.getState()
    if (source?.path) {
      this.setExec({ path: source.path, line, top })
      await state.openAt(source.path, line, character)
      return
    }
    if (!source?.sourceReference) {
      this.setExec(null)
      return
    }
    const uri = `dap-source://${session.id}/${source.sourceReference}/${source.name ?? 'source'}`
    const existing = state.tabs.find((tab) => tab.path === uri)
    if (!existing) {
      const result = await session.client.request<{ content: string }>('source', { source, sourceReference: source.sourceReference }).catch(() => null)
      if (!result) return
      const language = source.name ? matchLanguage(source.name, registry.languages()) : null
      state.openVirtual(uri, source.name ?? 'source', result.content, language?.id ?? null)
    }
    this.setExec({ path: uri, line, top })
    await state.openAt(uri, line, character)
  }

  private async computeInline() {
    this.inline = null
    const session = this.focusedSession()
    const frame = this.focusedFrame()
    if (!session || !frame || !this.exec || !this.showInline) return
    const scopes = await session.scopes(frame.id)
    const cheap = scopes.filter((scope) => !scope.expensive && !/regist|global/i.test(scope.name)).slice(0, 2)
    const values = new Map<string, string>()
    for (const scope of cheap) {
      const variables = await session.variables(scope.variablesReference).catch(() => [])
      for (const variable of variables.slice(0, 200)) {
        if (!/^[A-Za-z_$][\w$]*$/.test(variable.name) || values.has(variable.name)) continue
        values.set(variable.name, variable.value)
      }
    }
    if (this.focus?.frameId !== frame.id) return
    this.inline = { path: this.exec.path, line: this.exec.line, values }
  }

  setShowInline(show: boolean) {
    this.showInline = show
    try {
      localStorage.setItem(INLINE_KEY, String(show))
    } catch {
      // Without storage the setting only lasts until a restart.
    }
    if (!show) this.inline = null
    if (show) void this.computeInline().then(() => this.emit())
    this.emit()
  }

  /* ---------------------------------------------------------------- *
   * Evaluating
   * ---------------------------------------------------------------- */

  async evaluateRepl(expression: string) {
    const trimmed = expression.trim()
    if (!trimmed) return
    this.append('input', trimmed)
    const session = this.focusedSession() ?? this.sessions[0]
    if (!session) {
      this.append('error', t('debug.console.noSession'))
      return
    }
    try {
      const result = await session.evaluate(trimmed, this.focus?.frameId ?? undefined, 'repl')
      this.append('result', result.result, session.id, result.variablesReference || undefined)
      this.generation++
      // Side effects are possible — reload the values.
      await Promise.all([this.refreshWatches(), this.computeInline()])
      this.emit()
    } catch (err) {
      this.append('error', (err as Error).message, session.id)
    }
  }

  async evaluateHover(expression: string): Promise<(EvaluateResult & { sessionId: string }) | null> {
    const session = this.focusedSession()
    if (!session || !this.isStopped) return null
    const result = await session.evaluate(expression, this.focus?.frameId ?? undefined, 'hover').catch(() => null)
    if (!result) return null
    return { ...result, sessionId: session.id }
  }

  /** Change a variable's value (setVariable, or setExpression). */
  async setVariable(sessionId: string, parentReference: number, variable: Variable, value: string) {
    const session = this.sessionById(sessionId)
    if (!session) return
    try {
      await session.setVariable(parentReference, variable, value, this.focus?.frameId ?? undefined)
    } catch (err) {
      const message = (err as Error).message === 'setVariable' ? t('debug.error.cannotSet') : (err as Error).message
      useStore.getState().notify(message, 'warning')
      return
    }
    this.generation++
    await Promise.all([this.refreshWatches(), this.computeInline()])
    this.emit()
  }

  sessionById(id: string | undefined) {
    return this.sessions.find((s) => s.id === id) ?? null
  }

  /* ---------------------------------------------------------------- *
   * Watches
   * ---------------------------------------------------------------- */

  get watches(): string[] {
    return this.state.watches
  }

  addWatch(expression: string) {
    const trimmed = expression.trim()
    if (!trimmed) return
    this.state.watches = [...this.state.watches, trimmed]
    this.schedulePersist()
    void this.refreshWatches().then(() => this.emit())
    this.emit()
  }

  editWatch(index: number, expression: string) {
    const trimmed = expression.trim()
    if (!trimmed) {
      this.removeWatch(index)
      return
    }
    this.state.watches = this.state.watches.map((w, i) => (i === index ? trimmed : w))
    this.schedulePersist()
    void this.refreshWatches().then(() => this.emit())
  }

  removeWatch(index: number) {
    this.state.watches = this.state.watches.filter((_, i) => i !== index)
    this.schedulePersist()
    this.emit()
  }

  clearWatches() {
    this.state.watches = []
    this.watchResults.clear()
    this.schedulePersist()
    this.emit()
  }

  private async refreshWatches() {
    const session = this.focusedSession()
    const frameId = this.focus?.frameId ?? undefined
    if (!session || !this.isStopped) {
      this.watchResults.clear()
      return
    }
    const next = new Map<string, WatchResult>()
    for (const expression of this.state.watches) {
      const result = await session.evaluate(expression, frameId, 'watch').then(
        (r) => ({ value: r.result, type: r.type, variablesReference: r.variablesReference }),
        (err: Error) => ({ value: err.message, variablesReference: 0, error: true }),
      )
      next.set(expression, result)
    }
    this.watchResults = next
  }

  /* ---------------------------------------------------------------- *
   * Exception filters
   * ---------------------------------------------------------------- */

  private selectedFilters(type: string): string[] {
    const chosen = this.state.exceptionFilters[type]
    if (chosen) return chosen
    return (this.state.knownFilters[type] ?? []).filter((f) => f.default).map((f) => f.filter)
  }

  /** Filters for display: known filters of the adapter types of running or recent sessions. */
  exceptionFilterGroups(): { type: string; filters: { filter: string; label: string; enabled: boolean }[] }[] {
    const types = new Set<string>([...this.sessions.map((s) => s.type), ...Object.keys(this.state.knownFilters)])
    return [...types].map((type) => {
      const selected = new Set(this.selectedFilters(type))
      const fromSession = this.sessions.find((s) => s.type === type)?.capabilities.exceptionBreakpointFilters
      const filters = (fromSession ?? this.state.knownFilters[type] ?? []).map((f) => ({ filter: f.filter, label: f.label, enabled: selected.has(f.filter) }))
      return { type, filters }
    }).filter((group) => group.filters.length)
  }

  toggleExceptionFilter(type: string, filter: string) {
    const selected = new Set(this.selectedFilters(type))
    const wasSelected = selected.delete(filter)
    if (!wasSelected) selected.add(filter)
    this.state.exceptionFilters[type] = [...selected]
    this.schedulePersist()
    for (const session of this.sessions) {
      if (session.type !== type || session.state === 'terminated') continue
      void session.setExceptionFilters([...selected]).catch((err: Error) => this.append('error', err.message, session.id))
    }
    this.emit()
  }

  /* ---------------------------------------------------------------- *
   * Odds and ends
   * ---------------------------------------------------------------- */

  /** Re-check the language server for this language, after a plugin was installed. */
  async refreshAdapters() {
    this.resolved.clear()
    this.missing = []
    await injectLspBundles().catch(() => {})
    lsp.rescan()
    this.emit()
  }
}

export const debug = new Debugger()
