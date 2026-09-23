/**
 * JSON-RPC client for one language server.
 *
 * The process itself runs in the main process; what happens here is only the
 * protocol: the handshake, requests with a time limit, notifications,
 * server-side questions (configuration, progress, workspace changes) and the
 * bookkeeping of open documents.
 *
 * One client serves several languages — clangd C and C++, tsserver JavaScript
 * and TypeScript — so the `languageId` belongs to the document, not the client.
 */

import type { LspConfig } from '@/core/types'
import { locale, t } from '@/i18n'
import {
  pathToUri, toLocations,
  type CodeAction,
  type CompletionItem,
  type CompletionList,
  type Diagnostic,
  type DocumentHighlight,
  type DocumentSymbol,
  type Hover,
  type InlayHint,
  type JavaStatus,
  type Location,
  type LocationLink,
  type LspCommand,
  type MessageType,
  type Position,
  type PrepareRenameResult,
  type ProgressParams,
  type Range,
  type ShowMessageParams,
  type ShowMessageRequestParams,
  type SignatureHelp,
  type SymbolInformation,
  type TextEdit,
  type WorkspaceEdit,
  type WorkspaceSymbol,
} from './protocol'

export type ClientStatus =
  | 'idle'
  | 'checking'
  | 'unavailable'
  | 'starting'
  | 'ready'
  | 'failed'
  | 'stopped'

interface Pending {
  method: string
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface ProgressState {
  title: string
  message?: string
  percentage?: number
}

export interface LogLine {
  time: number
  /** `stderr`, `log` (window/logMessage) or `client` (our own notes). */
  kind: 'stderr' | 'log' | 'client'
  level: MessageType
  text: string
}

/** One change in LSP coordinates — for incremental synchronisation. */
export interface ContentChange {
  range: Range
  text: string
}

/** Requests to large servers (jdtls, tsserver on a cold cache) readily take longer. */
const REQUEST_TIMEOUT: Record<string, number> = {
  default: 15_000,
  initialize: 90_000,
  'workspace/symbol': 30_000,
  'textDocument/references': 30_000,
  'textDocument/rename': 30_000,
  'textDocument/codeAction': 20_000,
  'workspace/executeCommand': 60_000,
  'java/classFileContents': 30_000,
}

const MAX_LOG = 400

export class LspClient {
  readonly id: string
  readonly config: LspConfig
  /** The resolved program — a PATH hit or a candidate. */
  readonly command: string
  readonly root: string
  readonly startedAt = Date.now()

  status: ClientStatus = 'idle'
  detail = ''
  capabilities: Record<string, unknown> = {}
  serverInfo: { name?: string; version?: string } = {}
  progress = new Map<string | number, ProgressState>()
  log: LogLine[] = []
  /** Glob patterns the server wants file changes for. */
  watchedPatterns: string[] = []

  private nextId = 1
  private pending = new Map<number, Pending>()
  /** Open documents with the text the server has — changes are checked against it. */
  /** jdtls reported `ServiceReady`. */
  private javaReady = false
  private openDocs = new Map<string, { version: number; languageId: string; text: string }>()
  private disposers: (() => void)[] = []
  private languageIds = new Set<string>()

  onDiagnostics: (uri: string, diagnostics: Diagnostic[], version?: number) => void = () => {}
  onStatusChange: () => void = () => {}
  onLog: () => void = () => {}
  onMessage: (params: ShowMessageParams) => void = () => {}
  onApplyEdit: (label: string | undefined, edit: WorkspaceEdit) => Promise<boolean> = async () => false
  /** The server asks for a recomputation (inlay hints, semantic tokens …). */
  onRefresh: (what: string) => void = () => {}
  /**
   * jdtls: the build import finished or the classpath changed (`projects`),
   * the import had problems (`importProblem`), or Gradle cannot run with the
   * JDK it was given (`gradleJdk`).
   */
  onJavaEvent: (event: { kind: 'projects' | 'importProblem' | 'gradleJdk'; message?: string }) => void = () => {}

  constructor(config: LspConfig, command: string, root: string) {
    this.config = config
    this.command = command
    this.root = root
    this.id = `lsp:${config.command}:${root}`
  }

  /* ---------------------------------------------------------------- */

  private setStatus(status: ClientStatus, detail = '') {
    this.status = status
    this.detail = detail
    this.onStatusChange()
  }

  addLog(kind: LogLine['kind'], level: MessageType, text: string) {
    const trimmed = text.replace(/\s+$/, '')
    if (!trimmed) return
    this.log.push({ time: Date.now(), kind, level, text: trimmed })
    if (this.log.length > MAX_LOG) this.log.splice(0, this.log.length - MAX_LOG)
    this.onLog()
  }

  /** Languages this client currently serves, going by its documents. */
  get servedLanguages(): string[] {
    return [...this.languageIds]
  }

  get documentCount(): number {
    return this.openDocs.size
  }

  /** The first progress message in flight, such as “Indexing… 42 %”. */
  get busy(): string | null {
    const first = this.progress.values().next().value as ProgressState | undefined
    if (!first) return null
    const parts = [first.title, first.message].filter(Boolean)
    const pct = first.percentage !== undefined ? ` ${Math.round(first.percentage)} %` : ''
    return `${parts.join(' · ')}${pct}`
  }

  async start(env: Record<string, string> = {}): Promise<boolean> {
    this.setStatus('starting')
    this.disposers.push(
      window.lumen.lsp.onMessage(({ id, message }) => {
        if (id === this.id) this.receive(message)
      }),
      window.lumen.lsp.onStderr(({ id, text }) => {
        if (id === this.id) this.addLog('stderr', 4, text)
      }),
      window.lumen.lsp.onClosed(({ id, reason }) => {
        if (id !== this.id) return
        this.rejectAll(new Error(reason))
        this.openDocs.clear()
        this.progress.clear()
        if (this.status !== 'stopped') {
          this.addLog('client', 1, t('lsp.serverExited', { reason }))
          this.setStatus('failed', reason)
        }
      }),
    )

    await window.lumen.lsp.start(
      this.id,
      this.command,
      this.config.args ?? [],
      this.root,
      { ...(this.config.env ?? {}), ...env },
    )

    try {
      const result = (await this.request('initialize', {
        processId: null,
        clientInfo: { name: 'Lumen', version: '0.2.0' },
        locale: locale(),
        rootPath: this.root,
        rootUri: pathToUri(this.root),
        workspaceFolders: [{ uri: pathToUri(this.root), name: this.root.split(/[\\/]/).pop() }],
        initializationOptions: this.config.initializationOptions ?? undefined,
        capabilities: CLIENT_CAPABILITIES,
      })) as { capabilities?: Record<string, unknown>; serverInfo?: { name?: string; version?: string } }

      this.capabilities = result?.capabilities ?? {}
      this.serverInfo = result?.serverInfo ?? {}
      this.notify('initialized', {})
      if (this.config.settings !== undefined) {
        this.notify('workspace/didChangeConfiguration', { settings: this.config.settings })
      }
      this.setStatus('ready')
      this.addLog('client', 3, t('lsp.ready', { name: `${this.serverInfo.name ?? this.config.label}${this.serverInfo.version ? ` ${this.serverInfo.version}` : ''}` }))
      return true
    } catch (err) {
      this.setStatus('failed', (err as Error).message)
      return false
    }
  }

  async stop() {
    const wasReady = this.status === 'ready'
    this.setStatus('stopped')
    if (wasReady) {
      // Politely: shutdown, then exit; the main process kills harder if it must.
      await this.request('shutdown', null).catch(() => {})
      this.send({ jsonrpc: '2.0', method: 'exit' })
    }
    this.rejectAll(new Error(t('lsp.serverStopped')))
    for (const dispose of this.disposers) dispose()
    this.disposers = []
    this.openDocs.clear()
    this.progress.clear()
    await window.lumen.lsp.stop(this.id)
  }

  /* ---------------------------------------------------------------- */

  private rejectAll(error: Error) {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(error)
    }
    this.pending.clear()
  }

  private receive(message: Record<string, unknown>) {
    const id = message.id as number | string | undefined
    const method = message.method as string | undefined

    // An answer to one of our requests
    if (id !== undefined && !method) {
      const entry = this.pending.get(id as number)
      if (!entry) return
      clearTimeout(entry.timer)
      this.pending.delete(id as number)
      const error = message.error as { message?: string; code?: number } | undefined
      if (error) {
        entry.reject(new Error(error.message ?? t('lsp.error')))
        return
      }
      entry.resolve(message.result)
      return
    }
    if (!method) return

    const params = message.params as never

    // Server-side notifications
    if (id === undefined) {
      this.handleNotification(method, params)
      return
    }

    // Server-side requests
    void this.handleRequest(method, params).then(
      (result) => this.send({ jsonrpc: '2.0', id, result }),
      (err: Error) => this.send({
        jsonrpc: '2.0', id,
        error: { code: -32601, message: err.message },
      }),
    )
  }

  private handleNotification(method: string, params: never) {
    switch (method) {
      case 'textDocument/publishDiagnostics': {
        const p = params as { uri: string; diagnostics: Diagnostic[]; version?: number }
        this.onDiagnostics(p.uri, p.diagnostics ?? [], p.version)
        return
      }
      case 'window/showMessage': {
        const p = params as ShowMessageParams
        this.addLog('log', p.type, p.message)
        this.onMessage(p)
        return
      }
      case 'window/logMessage': {
        const p = params as ShowMessageParams
        this.addLog('log', p.type, p.message)
        return
      }
      case '$/progress': {
        const p = params as ProgressParams
        this.updateProgress(p)
        this.onStatusChange()
        return
      }
      case 'language/status': {
        // jdtls: Starting/Started/ServiceReady/Error
        const p = params as JavaStatus
        if (p.type === 'Error') this.addLog('log', 1, p.message)
        if (p.type !== 'Error' && p.type !== 'ProjectStatus') this.addLog('log', 3, `${p.type}: ${p.message}`)
        // jdtls keeps sending “Starting …” (with runaway percentages) after it is
        // ready — only the log gets those, not a spinner that never ends.
        if (p.type === 'Starting' && !this.javaReady) this.progress.set('java-status', { title: 'Java', message: p.message })
        if (p.type === 'ServiceReady') this.javaReady = true
        if (p.type === 'ServiceReady' || p.type === 'Started') this.progress.delete('java-status')
        if (p.type === 'ServiceReady') this.onJavaEvent({ kind: 'projects' })
        // `ProjectStatus: WARNING` — at least one project did not import cleanly.
        if (p.type === 'ProjectStatus' && p.message !== 'OK') this.onJavaEvent({ kind: 'importProblem', message: p.message })
        this.onStatusChange()
        return
      }
      case 'language/eventNotification': {
        // jdtls EventType: 100 ClasspathUpdated, 200 ProjectsImported, 300 IncompatibleGradleJDKIssue.
        const p = params as { eventType?: number; data?: unknown }
        if (p.eventType === 100 || p.eventType === 200) this.onJavaEvent({ kind: 'projects' })
        if (p.eventType === 300) this.onJavaEvent({ kind: 'gradleJdk', message: JSON.stringify(p.data ?? '') })
        return
      }
      case 'language/actionableNotification': {
        // Import failures and the like; `severity` follows MessageType (1 error … 4 log).
        const p = params as { severity?: MessageType; message?: string }
        if (!p.message) return
        const severity = p.severity ?? 3
        this.addLog('log', severity, p.message)
        this.onMessage({ type: severity, message: p.message })
        return
      }
      case 'language/progressReport': {
        const p = params as { id?: string; task?: string; subTask?: string; status?: string; complete?: boolean; workDone?: number; totalWork?: number }
        const token = `java:${p.id ?? 'report'}`
        if (p.complete) {
          this.progress.delete(token)
          this.onStatusChange()
          return
        }
        this.progress.set(token, {
          title: p.task ?? 'Java',
          message: p.subTask ?? p.status,
          percentage: p.totalWork ? ((p.workDone ?? 0) / p.totalWork) * 100 : undefined,
        })
        this.onStatusChange()
        return
      }
      case 'telemetry/event':
      case '$/logTrace':
        return
      default:
        return
    }
  }

  private updateProgress({ token, value }: ProgressParams) {
    if (value.kind === 'end') {
      this.progress.delete(token)
      return
    }
    if (value.kind === 'begin') {
      this.progress.set(token, { title: value.title ?? '', message: value.message, percentage: value.percentage })
      return
    }
    const current = this.progress.get(token) ?? { title: '' }
    this.progress.set(token, {
      title: current.title,
      message: value.message ?? current.message,
      percentage: value.percentage ?? current.percentage,
    })
  }

  private async handleRequest(method: string, params: never): Promise<unknown> {
    switch (method) {
      case 'workspace/configuration': {
        const p = params as { items: { section?: string; scopeUri?: string }[] }
        return p.items.map((item) => sectionOf(this.config.settings, item.section))
      }
      case 'client/registerCapability': {
        const p = params as { registrations: { id: string; method: string; registerOptions?: unknown }[] }
        for (const reg of p.registrations) {
          if (reg.method === 'workspace/didChangeWatchedFiles') {
            const options = reg.registerOptions as { watchers?: { globPattern: string | { pattern: string } }[] } | undefined
            for (const w of options?.watchers ?? []) {
              const pattern = typeof w.globPattern === 'string' ? w.globPattern : w.globPattern.pattern
              if (pattern) this.watchedPatterns.push(pattern)
            }
          }
        }
        return null
      }
      case 'client/unregisterCapability':
        return null
      case 'window/workDoneProgress/create':
        return null
      case 'window/showMessageRequest': {
        const p = params as ShowMessageRequestParams
        this.addLog('log', p.type, p.message)
        this.onMessage(p)
        // With jdtls the first action is “Yes/OK” — rather than picking it
        // blindly we answer null; choice dialogs make no sense here.
        return null
      }
      case 'window/showDocument': {
        const p = params as { uri: string; external?: boolean }
        if (p.external && /^https?:/.test(p.uri)) void window.lumen.shell.openExternal(p.uri)
        return { success: true }
      }
      case 'workspace/workspaceFolders':
        return [{ uri: pathToUri(this.root), name: this.root.split(/[\\/]/).pop() }]
      case 'workspace/applyEdit': {
        const p = params as { label?: string; edit: WorkspaceEdit }
        const applied = await this.onApplyEdit(p.label, p.edit)
        return { applied }
      }
      case 'workspace/inlayHint/refresh':
        this.onRefresh('inlayHint')
        return null
      case 'workspace/semanticTokens/refresh':
      case 'workspace/codeLens/refresh':
      case 'workspace/diagnostic/refresh':
        this.onRefresh(method.split('/')[1])
        return null
      case 'java/executeClientCommand':
        return null
      default:
        throw new Error(`Not supported: ${method}`)
    }
  }

  private send(message: unknown) {
    void window.lumen.lsp.send(this.id, message)
  }

  notify(method: string, params: unknown) {
    if (this.status !== 'ready' && method !== 'initialized') return
    this.send({ jsonrpc: '2.0', method, params })
  }

  /** `signal`: cancelling sends `$/cancelRequest` so the server stops working on a discarded answer. */
  request<T = unknown>(method: string, params: unknown, signal?: AbortSignal): Promise<T> {
    const id = this.nextId++
    const timeout = REQUEST_TIMEOUT[method] ?? REQUEST_TIMEOUT.default
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      const cancel = () => {
        if (!this.pending.has(id)) return
        clearTimeout(timer)
        this.pending.delete(id)
        this.send({ jsonrpc: '2.0', method: '$/cancelRequest', params: { id } })
        reject(new DOMException('Aborted', 'AbortError'))
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', cancel)
        this.pending.delete(id)
        this.send({ jsonrpc: '2.0', method: '$/cancelRequest', params: { id } })
        reject(new Error(t('lsp.timeout', { method })))
      }, timeout)
      signal?.addEventListener('abort', cancel, { once: true })
      const settle = <V>(fn: (value: V) => void) => (value: V) => {
        signal?.removeEventListener('abort', cancel)
        fn(value)
      }
      this.pending.set(id, {
        method,
        resolve: settle(resolve as (value: unknown) => void),
        reject: settle(reject),
        timer,
      })
      this.send({ jsonrpc: '2.0', id, method, params })
    })
  }

  /* ---------------------------------------------------------------- *
   * Documents
   * ---------------------------------------------------------------- */

  isOpen(filePath: string) {
    return this.openDocs.has(filePath)
  }

  /** Does the server support incremental changes? */
  get incrementalSync(): boolean {
    const sync = this.capabilities.textDocumentSync
    if (typeof sync === 'number') return sync === 2
    return (sync as { change?: number } | undefined)?.change === 2
  }

  /** The version the server was last told about for this file. */
  documentVersion(filePath: string): number | null {
    return this.openDocs.get(filePath)?.version ?? null
  }

  openDocument(filePath: string, text: string, languageId: string) {
    if (this.status !== 'ready' || this.openDocs.has(filePath)) return
    this.openDocs.set(filePath, { version: 1, languageId, text })
    this.languageIds.add(languageId)
    this.notify('textDocument/didOpen', {
      textDocument: { uri: pathToUri(filePath), languageId, version: 1, text },
    })
  }

  /**
   * Report a change. With `changes`, applicable in order, incrementally;
   * otherwise as full text — whichever the server can handle.
   */
  changeDocument(filePath: string, text: string, changes?: ContentChange[]) {
    const doc = this.openDocs.get(filePath)
    if (doc === undefined) return
    // The same change reported twice (a reload from disk reaches the server
    // both as full text and through the editor) — the server already has it.
    if (doc.text === text) return
    // Incremental changes only when they turn what the server has into `text`;
    // otherwise the full text, so the server's copy cannot drift away.
    const fits = Boolean(changes?.length) && applyContentChanges(doc.text, changes!) === text
    doc.text = text
    doc.version++
    const incremental = fits && this.incrementalSync
    this.notify('textDocument/didChange', {
      textDocument: { uri: pathToUri(filePath), version: doc.version },
      contentChanges: incremental
        ? changes!.map((c) => ({ range: c.range, text: c.text }))
        : [{ text }],
    })
  }

  saveDocument(filePath: string, text: string) {
    if (!this.openDocs.has(filePath)) return
    const sync = this.capabilities.textDocumentSync as { save?: boolean | { includeText?: boolean } } | undefined
    const includeText = typeof sync?.save === 'object' ? Boolean(sync.save.includeText) : false
    this.notify('textDocument/didSave', {
      textDocument: { uri: pathToUri(filePath) },
      ...(includeText ? { text } : {}),
    })
  }

  /**
   * Close and open a document again with its current text — the server
   * compiles it afresh in whatever project it belongs to now (after jdtls
   * finished importing the build, say).
   */
  reopenDocument(filePath: string, text: string) {
    const doc = this.openDocs.get(filePath)
    if (!doc) return
    this.closeDocument(filePath)
    this.openDocument(filePath, text, doc.languageId)
  }

  /** The documents open in this server. */
  openPaths(): string[] {
    return [...this.openDocs.keys()]
  }

  /** jdtls: import the given build files afresh, then rebuild the workspace. */
  async javaReimport(buildFiles: string[]) {
    for (const file of buildFiles) this.notify('java/projectConfigurationUpdate', { uri: pathToUri(file) })
    await this.request('java/buildWorkspace', true).catch(() => null)
  }

  closeDocument(filePath: string) {
    if (!this.openDocs.delete(filePath)) return
    this.notify('textDocument/didClose', {
      textDocument: { uri: pathToUri(filePath) },
    })
  }

  /** File changes in the workspace (created, changed, deleted). */
  didChangeWatchedFiles(changes: { uri: string; type: 1 | 2 | 3 }[]) {
    if (!changes.length || !this.watchedPatterns.length) return
    this.notify('workspace/didChangeWatchedFiles', { changes })
  }

  /* ---------------------------------------------------------------- *
   * Language features
   * ---------------------------------------------------------------- */

  supports(key: string): boolean {
    return Boolean(this.capabilities[key])
  }

  private doc(filePath: string) {
    return { textDocument: { uri: pathToUri(filePath) } }
  }

  async completion(filePath: string, position: Position, trigger?: string, signal?: AbortSignal): Promise<CompletionList> {
    if (!this.supports('completionProvider')) return { isIncomplete: false, items: [] }
    const result = await this.request<CompletionList | CompletionItem[] | null>(
      'textDocument/completion',
      {
        ...this.doc(filePath),
        position,
        context: trigger
          ? { triggerKind: 2, triggerCharacter: trigger }
          : { triggerKind: 1 },
      },
      signal,
    ).catch(() => null)
    if (!result) return { isIncomplete: false, items: [] }
    return Array.isArray(result) ? { isIncomplete: false, items: result } : result
  }

  async resolveCompletion(item: CompletionItem): Promise<CompletionItem> {
    const provider = this.capabilities.completionProvider as { resolveProvider?: boolean } | undefined
    if (!provider?.resolveProvider) return item
    const resolved = await this.request<CompletionItem | null>('completionItem/resolve', item).catch(() => null)
    return resolved ?? item
  }

  async hover(filePath: string, position: Position) {
    if (!this.supports('hoverProvider')) return null
    return this.request<Hover | null>('textDocument/hover', {
      ...this.doc(filePath), position,
    }).catch(() => null)
  }

  private async locations(method: string, filePath: string, position: Position, extra: object = {}): Promise<Location[]> {
    const result = await this.request<Location | Location[] | LocationLink[] | null>(method, {
      ...this.doc(filePath), position, ...extra,
    }).catch(() => null)
    return toLocations(result)
  }

  definition(filePath: string, position: Position) {
    if (!this.supports('definitionProvider')) return Promise.resolve([] as Location[])
    return this.locations('textDocument/definition', filePath, position)
  }

  declaration(filePath: string, position: Position) {
    if (!this.supports('declarationProvider')) return Promise.resolve([] as Location[])
    return this.locations('textDocument/declaration', filePath, position)
  }

  typeDefinition(filePath: string, position: Position) {
    if (!this.supports('typeDefinitionProvider')) return Promise.resolve([] as Location[])
    return this.locations('textDocument/typeDefinition', filePath, position)
  }

  implementation(filePath: string, position: Position) {
    if (!this.supports('implementationProvider')) return Promise.resolve([] as Location[])
    return this.locations('textDocument/implementation', filePath, position)
  }

  references(filePath: string, position: Position, includeDeclaration = true) {
    if (!this.supports('referencesProvider')) return Promise.resolve([] as Location[])
    return this.locations('textDocument/references', filePath, position, {
      context: { includeDeclaration },
    })
  }

  async documentHighlight(filePath: string, position: Position) {
    if (!this.supports('documentHighlightProvider')) return []
    const result = await this.request<DocumentHighlight[] | null>('textDocument/documentHighlight', {
      ...this.doc(filePath), position,
    }).catch(() => null)
    return result ?? []
  }

  async signatureHelp(filePath: string, position: Position, trigger?: string, isRetrigger = false) {
    if (!this.supports('signatureHelpProvider')) return null
    return this.request<SignatureHelp | null>('textDocument/signatureHelp', {
      ...this.doc(filePath),
      position,
      context: {
        triggerKind: trigger ? 2 : 1,
        triggerCharacter: trigger,
        isRetrigger,
      },
    }).catch(() => null)
  }

  get signatureTriggerCharacters(): string[] {
    const provider = this.capabilities.signatureHelpProvider as
      | { triggerCharacters?: string[]; retriggerCharacters?: string[] }
      | undefined
    return [...(provider?.triggerCharacters ?? []), ...(provider?.retriggerCharacters ?? [])]
  }

  async formatting(filePath: string, tabSize: number) {
    if (!this.supports('documentFormattingProvider')) return null
    return this.request<TextEdit[] | null>('textDocument/formatting', {
      ...this.doc(filePath),
      options: { tabSize, insertSpaces: true, trimTrailingWhitespace: true },
    }).catch(() => null)
  }

  async rangeFormatting(filePath: string, range: Range, tabSize: number) {
    if (!this.supports('documentRangeFormattingProvider')) return null
    return this.request<TextEdit[] | null>('textDocument/rangeFormatting', {
      ...this.doc(filePath),
      range,
      options: { tabSize, insertSpaces: true },
    }).catch(() => null)
  }

  async documentSymbols(filePath: string): Promise<(DocumentSymbol | SymbolInformation)[]> {
    if (!this.supports('documentSymbolProvider')) return []
    const result = await this.request<(DocumentSymbol | SymbolInformation)[] | null>(
      'textDocument/documentSymbol', this.doc(filePath),
    ).catch(() => null)
    return result ?? []
  }

  async workspaceSymbols(query: string): Promise<WorkspaceSymbol[]> {
    if (!this.supports('workspaceSymbolProvider')) return []
    const result = await this.request<WorkspaceSymbol[] | null>('workspace/symbol', { query })
      .catch(() => null)
    return result ?? []
  }

  async codeActions(filePath: string, range: Range, diagnostics: Diagnostic[], only?: string[]) {
    if (!this.supports('codeActionProvider')) return []
    const result = await this.request<(CodeAction | LspCommand)[] | null>('textDocument/codeAction', {
      ...this.doc(filePath),
      range,
      context: { diagnostics, only, triggerKind: 1 },
    }).catch(() => null)
    return result ?? []
  }

  async resolveCodeAction(action: CodeAction): Promise<CodeAction> {
    const provider = this.capabilities.codeActionProvider as { resolveProvider?: boolean } | undefined
    if (!provider?.resolveProvider || action.edit) return action
    const resolved = await this.request<CodeAction | null>('codeAction/resolve', action).catch(() => null)
    return resolved ?? action
  }

  async executeCommand(command: LspCommand): Promise<unknown> {
    if (!this.supports('executeCommandProvider')) return null
    return this.request('workspace/executeCommand', {
      command: command.command,
      arguments: command.arguments ?? [],
    })
  }

  async prepareRename(filePath: string, position: Position): Promise<PrepareRenameResult | null> {
    const provider = this.capabilities.renameProvider as { prepareProvider?: boolean } | boolean | undefined
    if (!provider) return null
    if (typeof provider === 'object' && provider.prepareProvider) {
      const result = await this.request<PrepareRenameResult | Range | { defaultBehavior: boolean } | null>(
        'textDocument/prepareRename', { ...this.doc(filePath), position },
      ).catch(() => null)
      if (!result) return null
      if ('range' in result) return result
      if ('start' in result) return { range: result }
      return { range: { start: position, end: position } }
    }
    return { range: { start: position, end: position } }
  }

  async rename(filePath: string, position: Position, newName: string): Promise<WorkspaceEdit | null> {
    if (!this.supports('renameProvider')) return null
    return this.request<WorkspaceEdit | null>('textDocument/rename', {
      ...this.doc(filePath), position, newName,
    }).catch((err: Error) => { throw err })
  }

  async inlayHints(filePath: string, range: Range): Promise<InlayHint[]> {
    if (!this.supports('inlayHintProvider')) return []
    const result = await this.request<InlayHint[] | null>('textDocument/inlayHint', {
      ...this.doc(filePath), range,
    }).catch(() => null)
    return result ?? []
  }

  /** jdtls: the source of a class from the JDK or a jar (a `jdt://` URI). */
  async classFileContents(uri: string): Promise<string | null> {
    return this.request<string | null>('java/classFileContents', { uri }).catch(() => null)
  }

  /** Characters after which the server wants to complete unprompted. */
  get triggerCharacters(): string[] {
    const provider = this.capabilities.completionProvider as
      | { triggerCharacters?: string[] }
      | undefined
    return provider?.triggerCharacters ?? []
  }
}

/** `settings` → the subtree for `section` ("java.format" → settings.java.format). */
function sectionOf(settings: unknown, section: string | undefined): unknown {
  if (!section) return settings ?? {}
  let node: unknown = settings
  for (const key of section.split('.')) {
    if (!node || typeof node !== 'object') return null
    node = (node as Record<string, unknown>)[key]
  }
  return node ?? null
}

const CLIENT_CAPABILITIES = {
  textDocument: {
    synchronization: { dynamicRegistration: false, didSave: true, willSave: false },
    publishDiagnostics: {
      relatedInformation: true,
      versionSupport: true,
      tagSupport: { valueSet: [1, 2] },
      codeDescriptionSupport: true,
      dataSupport: true,
    },
    completion: {
      dynamicRegistration: false,
      contextSupport: true,
      completionItem: {
        snippetSupport: true,
        commitCharactersSupport: false,
        documentationFormat: ['markdown', 'plaintext'],
        insertReplaceSupport: true,
        deprecatedSupport: true,
        preselectSupport: true,
        labelDetailsSupport: true,
        tagSupport: { valueSet: [1] },
        resolveSupport: { properties: ['documentation', 'detail', 'additionalTextEdits'] },
      },
      completionItemKind: { valueSet: Array.from({ length: 25 }, (_, i) => i + 1) },
    },
    hover: { dynamicRegistration: false, contentFormat: ['markdown', 'plaintext'] },
    signatureHelp: {
      dynamicRegistration: false,
      contextSupport: true,
      signatureInformation: {
        documentationFormat: ['markdown', 'plaintext'],
        parameterInformation: { labelOffsetSupport: true },
        activeParameterSupport: true,
      },
    },
    definition: { dynamicRegistration: false, linkSupport: true },
    declaration: { dynamicRegistration: false, linkSupport: true },
    typeDefinition: { dynamicRegistration: false, linkSupport: true },
    implementation: { dynamicRegistration: false, linkSupport: true },
    references: { dynamicRegistration: false },
    documentHighlight: { dynamicRegistration: false },
    documentSymbol: {
      dynamicRegistration: false,
      hierarchicalDocumentSymbolSupport: true,
      symbolKind: { valueSet: Array.from({ length: 26 }, (_, i) => i + 1) },
      tagSupport: { valueSet: [1] },
    },
    codeAction: {
      dynamicRegistration: false,
      isPreferredSupport: true,
      disabledSupport: true,
      dataSupport: true,
      resolveSupport: { properties: ['edit'] },
      codeActionLiteralSupport: {
        codeActionKind: {
          valueSet: [
            '', 'quickfix', 'refactor', 'refactor.extract', 'refactor.inline',
            'refactor.rewrite', 'source', 'source.organizeImports', 'source.fixAll',
          ],
        },
      },
    },
    formatting: { dynamicRegistration: false },
    rangeFormatting: { dynamicRegistration: false },
    rename: { dynamicRegistration: false, prepareSupport: true, honorsChangeAnnotations: false },
    inlayHint: { dynamicRegistration: false, resolveSupport: { properties: ['tooltip', 'label.tooltip'] } },
  },
  workspace: {
    applyEdit: true,
    workspaceEdit: {
      documentChanges: true,
      resourceOperations: ['create', 'rename', 'delete'],
      failureHandling: 'abort',
    },
    workspaceFolders: true,
    configuration: true,
    symbol: {
      dynamicRegistration: false,
      symbolKind: { valueSet: Array.from({ length: 26 }, (_, i) => i + 1) },
    },
    didChangeConfiguration: { dynamicRegistration: false },
    didChangeWatchedFiles: { dynamicRegistration: true, relativePatternSupport: false },
    executeCommand: { dynamicRegistration: false },
    inlayHint: { refreshSupport: true },
    semanticTokens: { refreshSupport: false },
  },
  window: {
    workDoneProgress: true,
    showMessage: { messageActionItem: { additionalPropertiesSupport: false } },
    showDocument: { support: true },
  },
  general: {
    positionEncodings: ['utf-16'],
    markdown: { parser: 'lumen', version: '1.0' },
  },
  // jdtls-specific extensions (opening Java classes out of jars).
  experimental: {},
}

/** Offset of an LSP position (UTF-16, as CodeMirror and JavaScript count) in a text. */
function offsetOf(text: string, position: Position): number {
  let offset = 0
  for (let line = 0; line < position.line; line++) {
    const next = text.indexOf('\n', offset)
    if (next === -1) return text.length
    offset = next + 1
  }
  return Math.min(text.length, offset + position.character)
}

/** Apply content changes in order, each in the coordinates of the text before it. */
export function applyContentChanges(text: string, changes: ContentChange[]): string {
  let out = text
  for (const change of changes) {
    const start = offsetOf(out, change.range.start)
    const end = offsetOf(out, change.range.end)
    out = out.slice(0, start) + change.text + out.slice(end)
  }
  return out
}
