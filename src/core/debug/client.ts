/**
 * The DAP connection: requests with a time limit, events and reverse requests
 * (`runInTerminal`, `startDebugging`). Independent of the transport — over IPC
 * in the renderer, over child_process in the check script.
 */

import { t } from '@/i18n'
import type { DapEvent, DapMessage, DapRequest, DapResponse } from './protocol'

export interface DapTransport {
  send(message: DapMessage): void
  onMessage(cb: (message: DapMessage) => void): () => void
  onClose(cb: (reason: string) => void): () => void
  close(): void
}

interface Pending {
  command: string
  resolve(body: unknown): void
  reject(err: Error): void
  timer: ReturnType<typeof setTimeout> | null
}

/** Deadlines per command in ms; 0 means none, since launch waits for the program. */
const TIMEOUTS: Record<string, number> = {
  initialize: 20_000,
  launch: 0,
  attach: 0,
  evaluate: 15_000,
  variables: 15_000,
  stackTrace: 15_000,
  disconnect: 4_000,
  terminate: 4_000,
  restart: 30_000,
}
const DEFAULT_TIMEOUT = 30_000

export class DapError extends Error {
  constructor(message: string, readonly command: string, readonly body?: unknown) {
    super(message)
  }
}

export class DapClient {
  private seq = 1
  private pending = new Map<number, Pending>()
  private disposers: (() => void)[] = []
  closed = false
  closeReason = ''

  onEvent: (event: string, body: unknown) => void = () => {}
  onClose: (reason: string) => void = () => {}
  /** A reverse request; the return value is sent as `body`, an error as `success: false`. */
  onRequest: (command: string, args: unknown) => Promise<unknown> = async (command) => {
    throw new Error(t('debug.client.unsupported', { command }))
  }

  constructor(private readonly transport: DapTransport) {
    this.disposers.push(
      transport.onMessage((message) => this.receive(message)),
      transport.onClose((reason) => this.handleClose(reason)),
    )
  }

  request<T = unknown>(command: string, args?: unknown, timeout = TIMEOUTS[command] ?? DEFAULT_TIMEOUT): Promise<T> {
    if (this.closed) return Promise.reject(new DapError(t('debug.client.closed', { reason: this.closeReason }), command))
    const seq = this.seq++
    return new Promise<T>((resolve, reject) => {
      const timer = timeout > 0
        ? setTimeout(() => {
          this.pending.delete(seq)
          reject(new DapError(t('debug.client.timeout', { command }), command))
        }, timeout)
        : null
      this.pending.set(seq, { command, resolve: resolve as (body: unknown) => void, reject, timer })
      const message: DapRequest = { seq, type: 'request', command, arguments: args }
      try {
        this.transport.send(message)
      } catch (err) {
        this.pending.delete(seq)
        if (timer) clearTimeout(timer)
        reject(err as Error)
      }
    })
  }

  private receive(message: DapMessage) {
    if (message.type === 'response') {
      this.handleResponse(message)
      return
    }
    if (message.type === 'event') {
      this.handleEvent(message)
      return
    }
    if (message.type === 'request') void this.handleRequest(message)
  }

  private handleResponse(message: DapResponse) {
    const entry = this.pending.get(message.request_seq)
    if (!entry) return
    this.pending.delete(message.request_seq)
    if (entry.timer) clearTimeout(entry.timer)
    if (message.success) {
      entry.resolve(message.body)
      return
    }
    const detail = (message.body as { error?: { format?: string } } | undefined)?.error?.format
    entry.reject(new DapError(message.message || detail || t('debug.client.failed', { command: entry.command }), entry.command, message.body))
  }

  private handleEvent(message: DapEvent) {
    try {
      this.onEvent(message.event, message.body)
    } catch (err) {
      console.error('[lumen] DAP-Ereignis fehlgeschlagen:', message.event, err)
    }
  }

  private async handleRequest(message: DapRequest) {
    const respond = (success: boolean, body?: unknown, error?: string) => {
      if (this.closed) return
      const response: DapResponse = {
        seq: this.seq++,
        type: 'response',
        request_seq: message.seq,
        command: message.command,
        success,
        ...(error ? { message: error } : {}),
        ...(body !== undefined ? { body } : {}),
      }
      this.transport.send(response)
    }
    try {
      respond(true, (await this.onRequest(message.command, message.arguments)) ?? {})
    } catch (err) {
      respond(false, undefined, (err as Error).message)
    }
  }

  private handleClose(reason: string) {
    if (this.closed) return
    this.closed = true
    this.closeReason = reason
    for (const entry of this.pending.values()) {
      if (entry.timer) clearTimeout(entry.timer)
      entry.reject(new DapError(t('debug.client.closed', { reason }), entry.command))
    }
    this.pending.clear()
    this.onClose(reason)
  }

  /** Close the connection, which stops the adapter. */
  dispose(reason = '') {
    this.transport.close()
    this.handleClose(reason)
    for (const dispose of this.disposers) dispose()
    this.disposers = []
  }
}
