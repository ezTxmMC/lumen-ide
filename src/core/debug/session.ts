/**
 * One debug session: the sequence `initialize` → `launch`/`attach` →
 * (`initialized`) breakpoints, exception filters, `configurationDone`, plus
 * threads, the call stack, variables (fetched lazily) and the stepping
 * commands.
 *
 * It knows neither the store nor the editor — everything else goes through
 * `SessionHooks`.
 */

import { getLanguage, t } from '@/i18n'
import { DapClient } from './client'
import type {
  Breakpoint, Capabilities, EvaluateResult, OutputEventBody, RunInTerminalArguments, Scope,
  SourceBreakpoint, StackFrame, StartDebuggingArguments, StoppedEventBody, Thread, Variable,
} from './protocol'

export type SessionState = 'initializing' | 'running' | 'stopped' | 'terminated'

export interface ThreadState extends Thread {
  stopped: boolean
  reason?: string
  description?: string
  frames: StackFrame[]
  totalFrames?: number
}

export interface FileBreakpoints {
  path: string
  /** Our own ids, in the same order as `breakpoints`. */
  ids: string[]
  breakpoints: SourceBreakpoint[]
}

export interface ProgressInfo {
  title: string
  message?: string
  percentage?: number
}

export interface SessionHooks {
  /** Every active breakpoint, by file. */
  sourceBreakpoints(session: DebugSession): FileBreakpoints[]
  /** Exception filters chosen for this session. */
  exceptionFilters(session: DebugSession): string[]
  breakpointsVerified(session: DebugSession, ids: string[], result: Breakpoint[]): void
  breakpointChanged(session: DebugSession, reason: string, breakpoint: Breakpoint): void
  stopped(session: DebugSession, threadId: number | undefined, body: StoppedEventBody): void
  continued(session: DebugSession): void
  output(session: DebugSession, body: OutputEventBody): void
  terminated(session: DebugSession, reason: string, restart: unknown): void
  runInTerminal(session: DebugSession, args: RunInTerminalArguments): Promise<{ processId?: number; shellProcessId?: number }>
  startDebugging(session: DebugSession, args: StartDebuggingArguments): Promise<void>
  changed(session: DebugSession): void
}

const FRAME_PAGE = 40

let sessionCounter = 0

export class DebugSession {
  readonly id = `dbg-${++sessionCounter}`
  capabilities: Capabilities = {}
  state: SessionState = 'initializing'
  threads = new Map<number, ThreadState>()
  progress = new Map<string, ProgressInfo>()
  children: DebugSession[] = []
  exitCode: number | null = null
  /** Why it ended last time — the adapter crashing, for instance. */
  endReason = ''

  private variableCache = new Map<number, Promise<Variable[]>>()
  private scopeCache = new Map<number, Promise<Scope[]>>()
  /** Adapter id → our own breakpoint id. */
  private breakpointIds = new Map<number, string>()
  private initializedResolve: (() => void) | null = null
  private threadTimer: ReturnType<typeof setTimeout> | null = null
  private terminating = false

  constructor(
    readonly client: DapClient,
    readonly name: string,
    readonly type: string,
    readonly request: 'launch' | 'attach',
    readonly args: Record<string, unknown>,
    private readonly hooks: SessionHooks,
    readonly parent: DebugSession | null = null,
  ) {
    client.onEvent = (event, body) => this.handleEvent(event, body)
    client.onRequest = (command, reqArgs) => this.handleReverseRequest(command, reqArgs)
    client.onClose = (reason) => this.handleClose(reason)
  }

  /* ---------------------------------------------------------------- *
   * Starting
   * ---------------------------------------------------------------- */

  async start(): Promise<void> {
    // Set up before `initialize`: GDB sends `initialized` right behind the answer.
    const initialized = new Promise<void>((resolve) => { this.initializedResolve = resolve })
    const caps = await this.client.request<Capabilities | undefined>('initialize', {
      clientID: 'lumen',
      clientName: 'Lumen',
      adapterID: this.type,
      locale: getLanguage(),
      linesStartAt1: true,
      columnsStartAt1: true,
      pathFormat: 'path',
      supportsVariableType: true,
      supportsVariablePaging: false,
      supportsRunInTerminalRequest: true,
      supportsMemoryReferences: false,
      supportsProgressReporting: true,
      supportsInvalidatedEvent: true,
      supportsStartDebuggingRequest: true,
      supportsArgsCanBeInterpretedByShell: true,
    })
    this.capabilities = caps ?? {}
    this.changed()

    const launch = this.client.request(this.request, this.args)
    let launchError: Error | null = null
    let launchDone = false
    const settled = launch.then(
      () => { launchDone = true },
      (err: Error) => { launchError = err },
    )

    await Promise.race([initialized, settled])
    if (launchError) throw launchError
    // Some adapters only send `initialized` after the launch response.
    if (launchDone) await Promise.race([initialized, delay(5000)])
    await this.configure()
    await launch
    if (this.state === 'initializing') this.state = 'running'
    this.changed()
  }

  private async configure() {
    for (const file of this.hooks.sourceBreakpoints(this)) {
      await this.setBreakpoints(file).catch(() => {})
    }
    if (this.capabilities.exceptionBreakpointFilters?.length) {
      await this.setExceptionFilters(this.hooks.exceptionFilters(this)).catch(() => {})
    }
    if (this.capabilities.supportsConfigurationDoneRequest) {
      await this.client.request('configurationDone').catch(() => {})
    }
  }

  /* ---------------------------------------------------------------- *
   * Breakpoints
   * ---------------------------------------------------------------- */

  async setBreakpoints(file: FileBreakpoints) {
    const caps = this.capabilities
    const breakpoints = file.breakpoints.map((bp) => ({
      line: bp.line,
      ...(bp.column ? { column: bp.column } : {}),
      ...(bp.condition && caps.supportsConditionalBreakpoints !== false ? { condition: bp.condition } : {}),
      ...(bp.hitCondition && caps.supportsHitConditionalBreakpoints !== false ? { hitCondition: bp.hitCondition } : {}),
      ...(bp.logMessage && caps.supportsLogPoints !== false ? { logMessage: bp.logMessage } : {}),
    }))
    const name = file.path.split(/[\\/]/).pop()
    const result = await this.client.request<{ breakpoints?: Breakpoint[] }>('setBreakpoints', {
      source: { name, path: file.path },
      breakpoints,
      lines: breakpoints.map((bp) => bp.line),
      sourceModified: false,
    })
    const list = result?.breakpoints ?? []
    list.forEach((bp, i) => {
      if (bp.id !== undefined && file.ids[i]) this.breakpointIds.set(bp.id, file.ids[i])
    })
    this.hooks.breakpointsVerified(this, file.ids, list)
  }

  async setExceptionFilters(filters: string[]) {
    await this.client.request('setExceptionBreakpoints', { filters })
  }

  breakpointIdFor(adapterId: number | undefined) {
    if (adapterId === undefined) return undefined
    return this.breakpointIds.get(adapterId)
  }

  /* ---------------------------------------------------------------- *
   * Events
   * ---------------------------------------------------------------- */

  private handleEvent(event: string, body: unknown) {
    const handler = this.eventHandlers[event]
    if (handler) handler(body)
  }

  private eventHandlers: Record<string, (body: unknown) => void> = {
    initialized: () => {
      this.initializedResolve?.()
      this.initializedResolve = null
    },
    stopped: (body) => void this.handleStopped(body as StoppedEventBody),
    continued: (body) => {
      const { threadId, allThreadsContinued } = (body ?? {}) as { threadId?: number; allThreadsContinued?: boolean }
      this.markRunning(allThreadsContinued === false ? threadId : undefined)
    },
    thread: () => this.scheduleThreadRefresh(),
    output: (body) => this.hooks.output(this, body as OutputEventBody),
    breakpoint: (body) => {
      const { reason, breakpoint } = body as { reason: string; breakpoint: Breakpoint }
      this.hooks.breakpointChanged(this, reason, breakpoint)
    },
    exited: (body) => {
      this.exitCode = (body as { exitCode?: number } | undefined)?.exitCode ?? null
      this.changed()
    },
    terminated: (body) => {
      const restart = (body as { restart?: unknown } | undefined)?.restart
      this.finish('', restart)
    },
    capabilities: (body) => {
      const caps = (body as { capabilities?: Capabilities } | undefined)?.capabilities
      if (caps) this.capabilities = { ...this.capabilities, ...caps }
      this.changed()
    },
    progressStart: (body) => {
      const b = body as { progressId: string; title: string; message?: string; percentage?: number }
      this.progress.set(b.progressId, { title: b.title, message: b.message, percentage: b.percentage })
      this.changed()
    },
    progressUpdate: (body) => {
      const b = body as { progressId: string; message?: string; percentage?: number }
      const entry = this.progress.get(b.progressId)
      if (!entry) return
      this.progress.set(b.progressId, { ...entry, message: b.message ?? entry.message, percentage: b.percentage ?? entry.percentage })
      this.changed()
    },
    progressEnd: (body) => {
      this.progress.delete((body as { progressId: string }).progressId)
      this.changed()
    },
    invalidated: () => {
      this.variableCache.clear()
      this.scopeCache.clear()
      this.changed()
    },
  }

  private async handleReverseRequest(command: string, args: unknown): Promise<unknown> {
    if (command === 'runInTerminal') return this.hooks.runInTerminal(this, args as RunInTerminalArguments)
    if (command === 'startDebugging') {
      await this.hooks.startDebugging(this, args as StartDebuggingArguments)
      return {}
    }
    throw new Error(t('debug.client.unsupported', { command }))
  }

  private handleClose(reason: string) {
    if (this.state === 'terminated') return
    this.finish(this.terminating ? '' : reason, undefined)
  }

  private finish(reason: string, restart: unknown) {
    if (this.state === 'terminated') return
    this.state = 'terminated'
    this.endReason = reason
    this.initializedResolve?.()
    this.threads.clear()
    this.progress.clear()
    if (this.threadTimer) clearTimeout(this.threadTimer)
    this.hooks.terminated(this, reason, restart)
    if (!this.terminating) void this.shutdown()
  }

  private async handleStopped(body: StoppedEventBody) {
    this.state = 'stopped'
    this.variableCache.clear()
    this.scopeCache.clear()
    await this.refreshThreads()
    if (body.threadId !== undefined && !this.threads.has(body.threadId)) {
      this.threads.set(body.threadId, { id: body.threadId, name: `Thread ${body.threadId}`, stopped: false, frames: [] })
    }
    const all = body.allThreadsStopped || body.threadId === undefined
    for (const thread of this.threads.values()) {
      if (!all && thread.id !== body.threadId) continue
      thread.stopped = true
      thread.reason = body.reason
      thread.description = body.description ?? body.text
      thread.frames = []
      thread.totalFrames = undefined
    }
    const threadId = body.threadId ?? this.threads.keys().next().value
    if (threadId !== undefined) await this.loadFrames(threadId).catch(() => {})
    this.hooks.stopped(this, threadId, body)
    this.changed()
  }

  private markRunning(threadId?: number) {
    for (const thread of this.threads.values()) {
      if (threadId !== undefined && thread.id !== threadId) continue
      thread.stopped = false
      thread.frames = []
      thread.reason = undefined
      thread.description = undefined
    }
    this.variableCache.clear()
    this.scopeCache.clear()
    if (![...this.threads.values()].some((t) => t.stopped) && this.state !== 'terminated') this.state = 'running'
    this.hooks.continued(this)
    this.changed()
  }

  private scheduleThreadRefresh() {
    if (this.threadTimer) clearTimeout(this.threadTimer)
    this.threadTimer = setTimeout(() => {
      this.threadTimer = null
      void this.refreshThreads().then(() => this.changed())
    }, 120)
  }

  async refreshThreads() {
    if (this.state === 'terminated') return
    const result = await this.client.request<{ threads?: Thread[] }>('threads').catch(() => null)
    if (!result) return
    const next = new Map<number, ThreadState>()
    for (const thread of result.threads ?? []) {
      const previous = this.threads.get(thread.id)
      next.set(thread.id, previous ? { ...previous, name: thread.name } : { ...thread, stopped: false, frames: [] })
    }
    this.threads = next
  }

  private changed() {
    this.hooks.changed(this)
  }

  /* ---------------------------------------------------------------- *
   * Queries
   * ---------------------------------------------------------------- */

  /** Loads the next frames of a stopped thread. */
  async loadFrames(threadId: number, more = false) {
    const thread = this.threads.get(threadId)
    if (!thread?.stopped) return
    const startFrame = more ? thread.frames.length : 0
    const result = await this.client.request<{ stackFrames?: StackFrame[]; totalFrames?: number }>('stackTrace', {
      threadId, startFrame, levels: FRAME_PAGE,
    })
    const frames = result?.stackFrames ?? []
    thread.frames = more ? [...thread.frames, ...frames] : frames
    thread.totalFrames = result?.totalFrames ?? (frames.length < FRAME_PAGE ? thread.frames.length : undefined)
    this.changed()
  }

  scopes(frameId: number): Promise<Scope[]> {
    let hit = this.scopeCache.get(frameId)
    if (hit) return hit
    hit = this.client.request<{ scopes?: Scope[] }>('scopes', { frameId }).then((r) => r?.scopes ?? [], () => [])
    this.scopeCache.set(frameId, hit)
    return hit
  }

  variables(variablesReference: number): Promise<Variable[]> {
    if (!variablesReference) return Promise.resolve([])
    let hit = this.variableCache.get(variablesReference)
    if (hit) return hit
    hit = this.client.request<{ variables?: Variable[] }>('variables', { variablesReference }).then(
      (r) => r?.variables ?? [],
      (err: Error) => {
        this.variableCache.delete(variablesReference)
        throw err
      },
    )
    this.variableCache.set(variablesReference, hit)
    return hit
  }

  evaluate(expression: string, frameId: number | undefined, context: 'repl' | 'watch' | 'hover' | 'clipboard'): Promise<EvaluateResult> {
    const effective = context === 'hover' && !this.capabilities.supportsEvaluateForHovers ? 'watch' : context
    return this.client.request<EvaluateResult>('evaluate', { expression, frameId, context: effective })
  }

  async setVariable(parentReference: number, variable: Variable, value: string, frameId?: number): Promise<string> {
    if (this.capabilities.supportsSetVariable) {
      const result = await this.client.request<{ value: string }>('setVariable', { variablesReference: parentReference, name: variable.name, value })
      this.variableCache.clear()
      return result?.value ?? value
    }
    if (this.capabilities.supportsSetExpression && variable.evaluateName) {
      const result = await this.client.request<{ value: string }>('setExpression', { expression: variable.evaluateName, value, frameId })
      this.variableCache.clear()
      return result?.value ?? value
    }
    throw new Error('setVariable')
  }

  get canSetVariables() {
    return Boolean(this.capabilities.supportsSetVariable || this.capabilities.supportsSetExpression)
  }

  /* ---------------------------------------------------------------- *
   * Control
   * ---------------------------------------------------------------- */

  async continue(threadId: number) {
    const result = await this.client.request<{ allThreadsContinued?: boolean }>('continue', { threadId })
    this.markRunning(result?.allThreadsContinued === false ? threadId : undefined)
  }

  async step(kind: 'next' | 'stepIn' | 'stepOut', threadId: number) {
    const granularity = this.capabilities.supportsSteppingGranularity ? { granularity: 'line' } : {}
    await this.client.request(kind, { threadId, ...granularity })
    this.markRunning(this.capabilities.supportsSingleThreadExecutionRequests ? threadId : undefined)
  }

  async pause(threadId: number) {
    await this.client.request('pause', { threadId })
  }

  async restart(): Promise<boolean> {
    if (!this.capabilities.supportsRestartRequest) return false
    await this.client.request('restart', { arguments: this.args })
    return true
  }

  /** Stopping: `terminate` politely first, then `disconnect`, and finally cut the connection. */
  async stop() {
    if (this.state === 'terminated') {
      await this.shutdown()
      return
    }
    this.terminating = true
    for (const child of [...this.children]) await child.stop()
    if (this.capabilities.supportsTerminateRequest && this.request === 'launch') {
      const ok = await this.client.request('terminate', { restart: false }).then(() => true, () => false)
      if (ok) await Promise.race([this.waitForEnd(), delay(2500)])
    }
    await this.shutdown()
    this.finish('', undefined)
  }

  private shutdownTask: Promise<void> | null = null

  /** Send `disconnect` and close the connection — also after the adapter reports `terminated`. */
  private shutdown(): Promise<void> {
    if (this.shutdownTask) return this.shutdownTask
    this.shutdownTask = (async () => {
      if (!this.client.closed) {
        await this.client.request('disconnect', { restart: false, terminateDebuggee: this.request === 'launch' }).catch(() => {})
      }
      this.client.dispose()
    })()
    return this.shutdownTask
  }

  private waitForEnd() {
    return new Promise<void>((resolve) => {
      const check = () => {
        if (this.state === 'terminated') {
          resolve()
          return
        }
        setTimeout(check, 50)
      }
      check()
    })
  }
}

export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
