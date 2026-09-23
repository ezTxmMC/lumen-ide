/**
 * The Debug Adapter Protocol — adapter processes in the main process.
 *
 * Adapters run either over stdio (framed as in the LSP:
 * `Content-Length: <n>\r\n\r\n<JSON>`) or over TCP: Lumen starts the adapter
 * with a free port and connects with retries — or only connects (a port from
 * the language server, java-debug for instance).
 *
 * The channels to the renderer: `dap:message`, `dap:output` (the adapter's
 * stderr and stdout), `dap:closed`.
 */

import { ipcMain, type WebContents } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import net from 'node:net'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export interface DapProgram {
  command: string
  args?: string[]
  probe?: string[]
}

export interface DapStartOptions {
  transport: 'stdio' | 'tcp'
  /** Absent when only connecting (TCP). */
  command?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  host?: string
  /** A fixed port; otherwise one chosen freely (only with `command`). */
  port?: number
  /** The overall deadline for establishing the connection (TCP). 15 s by default. */
  connectTimeout?: number
}

export interface DapEvents {
  message(id: string, message: unknown): void
  output(id: string, stream: 'stderr' | 'stdout', text: string): void
  closed(id: string, reason: string): void
}

interface AdapterHandle {
  child: ChildProcess | null
  socket: net.Socket | null
  buffer: Buffer
  closed: boolean
}

const adapters = new Map<string, AdapterHandle>()

/* ------------------------------------------------------------------ *
 * Framing
 * ------------------------------------------------------------------ */

/** Splits the buffer into messages and returns what is left. */
export function drainFrames(buffer: Buffer, emit: (message: unknown) => void): Buffer {
  let rest = buffer
  for (;;) {
    const headerEnd = rest.indexOf('\r\n\r\n')
    if (headerEnd === -1) return rest
    const header = rest.subarray(0, headerEnd).toString('ascii')
    const match = /content-length:\s*(\d+)/i.exec(header)
    if (!match) {
      rest = rest.subarray(headerEnd + 4)
      continue
    }
    const length = Number(match[1])
    const start = headerEnd + 4
    if (rest.length < start + length) return rest
    const body = rest.subarray(start, start + length).toString('utf8')
    rest = rest.subarray(start + length)
    try {
      emit(JSON.parse(body))
    } catch {
      // Skip broken JSON.
    }
  }
}

export function frame(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), 'utf8')
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'), body])
}

/* ------------------------------------------------------------------ *
 * Resolving programs
 * ------------------------------------------------------------------ */

const expandHome = (value: string) => value.replace(/^~(?=[\\/]|$)/, os.homedir())

const isPathLike = (value: string) => path.isAbsolute(value) || value.includes('/') || value.includes('\\')

/** Resolve segments with `*`, the newest version (lexically the greatest) first. */
export async function globPaths(pattern: string): Promise<string[]> {
  const expanded = expandHome(pattern).replace(/\\/g, '/')
  if (!expanded.includes('*')) {
    return fs.access(expanded).then(() => [expanded], () => [])
  }
  const parts = expanded.split('/')
  let bases = [parts[0] === '' ? '/' : parts[0]]
  for (const part of parts.slice(1)) {
    if (!part) continue
    const next: string[] = []
    for (const base of bases) {
      if (!part.includes('*')) {
        next.push(path.posix.join(base, part))
        continue
      }
      const regex = new RegExp(`^${part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`)
      const entries = await fs.readdir(base).catch(() => [] as string[])
      const hits = entries.filter((name) => regex.test(name))
      hits.sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))
      for (const name of hits) next.push(path.posix.join(base, name))
    }
    bases = next
    if (!bases.length) return []
  }
  const existing: string[] = []
  for (const candidate of bases) {
    if (await fs.access(candidate).then(() => true, () => false)) existing.push(candidate)
  }
  return existing
}

function which(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = spawn(process.platform === 'win32' ? 'where' : 'which', [command], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    })
    probe.on('error', () => resolve(false))
    probe.on('close', (code) => resolve(code === 0))
  })
}

function probeRuns(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore', shell: process.platform === 'win32' })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve(false)
    }, 8000)
    child.on('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve(code === 0)
    })
  })
}

/** The runtime for script files. */
const RUNTIMES: Record<string, (file: string) => DapProgram> = {
  '.js': (file) => ({ command: 'node', args: [file] }),
  '.mjs': (file) => ({ command: 'node', args: [file] }),
  '.cjs': (file) => ({ command: 'node', args: [file] }),
  '.py': (file) => ({ command: process.platform === 'win32' ? 'python' : 'python3', args: [file] }),
  '.jar': (file) => ({ command: 'java', args: ['-jar', file] }),
}

async function resolveOne(program: DapProgram): Promise<DapProgram | null> {
  const args = program.args ?? []
  const command = expandHome(program.command)
  if (isPathLike(command)) {
    const [hit] = await globPaths(command)
    if (!hit) return null
    const runtime = RUNTIMES[path.extname(hit).toLowerCase()]
    const stat = await fs.stat(hit).catch(() => null)
    // Start a folder with a __main__.py (debugpy/adapter, say) through Python.
    if (stat?.isDirectory() && fsSync.existsSync(path.join(hit, '__main__.py'))) {
      const python = process.platform === 'win32' ? 'python' : 'python3'
      if (!(await which(python))) return null
      return { command: python, args: [hit, ...args] }
    }
    if (!stat || stat.isDirectory()) return null
    if (runtime) {
      const base = runtime(hit)
      if (!(await which(base.command))) return null
      return { command: base.command, args: [...(base.args ?? []), ...args] }
    }
    const executable = process.platform === 'win32'
      || await fs.access(hit, fsSync.constants.X_OK).then(() => true, () => false)
    if (!executable) return null
    if (program.probe && !(await probeRuns(hit, program.probe))) return null
    return { command: hit, args }
  }
  if (!(await which(command))) return null
  if (program.probe && !(await probeRuns(command, program.probe))) return null
  return { command, args }
}

/** The first call that works. */
export async function resolveProgram(programs: DapProgram[]): Promise<DapProgram | null> {
  for (const program of programs) {
    const hit = await resolveOne(program).catch(() => null)
    if (hit) return hit
  }
  return null
}

/* ------------------------------------------------------------------ *
 * Ports and connections
 * ------------------------------------------------------------------ */

export function freePort(host = '127.0.0.1'): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, host, () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

function connectOnce(host: string, port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port })
    const fail = (err: Error) => {
      socket.destroy()
      reject(err)
    }
    socket.once('error', fail)
    socket.once('connect', () => {
      socket.off('error', fail)
      resolve(socket)
    })
  })
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function connectWithRetry(
  host: string, port: number, timeout: number, gaveUp: () => string | null,
): Promise<net.Socket> {
  const deadline = Date.now() + timeout
  let lastError: Error | null = null
  while (Date.now() < deadline) {
    const reason = gaveUp()
    if (reason) throw new Error(reason)
    try {
      return await connectOnce(host, port)
    } catch (err) {
      lastError = err as Error
      await wait(150)
    }
  }
  throw new Error(`No connection to ${host}:${port} (${lastError?.message ?? 'timed out'})`)
}

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

function spawnAdapter(command: string, args: string[], cwd: string | undefined, env: Record<string, string>) {
  const workdir = cwd && fsSync.existsSync(cwd) ? cwd : os.homedir()
  return spawn(command, args, {
    cwd: workdir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
    shell: process.platform === 'win32',
    windowsHide: true,
  })
}

/** Starts or connects an adapter. Returns the port used (TCP). */
export async function startAdapter(id: string, options: DapStartOptions, events: DapEvents): Promise<{ port?: number }> {
  stopAdapter(id)
  const handle: AdapterHandle = { child: null, socket: null, buffer: Buffer.alloc(0), closed: false }
  adapters.set(id, handle)

  const close = (reason: string) => {
    if (handle.closed) return
    handle.closed = true
    if (adapters.get(id) === handle) adapters.delete(id)
    handle.socket?.destroy()
    if (handle.child && handle.child.exitCode === null) killChild(handle.child)
    events.closed(id, reason)
  }

  const onData = (chunk: Buffer) => {
    handle.buffer = drainFrames(Buffer.concat([handle.buffer, chunk]), (message) => events.message(id, message))
  }

  const host = options.host ?? '127.0.0.1'
  const port = options.transport === 'tcp' ? (options.port ?? (options.command ? await freePort(host) : 0)) : undefined
  const substitute = (value: string) => value.replace(/\$\{port\}/g, String(port ?? '')).replace(/\$\{host\}/g, host)

  let exitReason: string | null = null
  if (options.command) {
    const child = spawnAdapter(options.command, (options.args ?? []).map(substitute), options.cwd, options.env ?? {})
    handle.child = child
    child.stderr?.on('data', (chunk: Buffer) => events.output(id, 'stderr', chunk.toString()))
    child.on('error', (err) => {
      exitReason = err.message
      close(err.message)
    })
    child.on('close', (code, signal) => {
      // A clean end with no reason — the renderer then reports no crash.
      exitReason = code === 0 ? '' : `beendet (Code ${code ?? signal})`
      close(exitReason)
    })
    if (options.transport === 'stdio') {
      child.stdout?.on('data', onData)
      return {}
    }
    // TCP adapters write nothing but log lines to stdout.
    child.stdout?.on('data', (chunk: Buffer) => events.output(id, 'stdout', chunk.toString()))
  }

  if (!port) {
    close('No port given')
    throw new Error('No port given')
  }

  try {
    const socket = await connectWithRetry(host, port, options.connectTimeout ?? 15_000, () => {
      if (handle.closed) return exitReason || 'Adapter beendet'
      return null
    })
    if (handle.closed) {
      socket.destroy()
      throw new Error(exitReason || 'Adapter beendet')
    }
    handle.socket = socket
    socket.on('data', onData)
    socket.on('error', (err) => close(err.message))
    socket.on('close', (hadError) => close(hadError ? 'Verbindung getrennt' : ''))
    return { port }
  } catch (err) {
    close((err as Error).message)
    throw err
  }
}

export function sendAdapter(id: string, message: unknown): boolean {
  const handle = adapters.get(id)
  if (!handle || handle.closed) return false
  const data = frame(message)
  if (handle.socket) {
    handle.socket.write(data)
    return true
  }
  if (!handle.child?.stdin?.writable) return false
  handle.child.stdin.write(data)
  return true
}

function killChild(child: ChildProcess) {
  child.stdin?.end()
  child.kill('SIGTERM')
  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }, 2000)
  timer.unref()
}

export function stopAdapter(id: string) {
  const handle = adapters.get(id)
  if (!handle) return
  adapters.delete(id)
  handle.closed = true
  handle.socket?.end()
  handle.socket?.destroy()
  if (handle.child && handle.child.exitCode === null) killChild(handle.child)
}

/* ------------------------------------------------------------------ *
 * IPC
 * ------------------------------------------------------------------ */

/** The window each adapter was started from — its events go there and only there. */
const owners = new Map<string, number>()

export function registerDapIpc() {
  const eventsFor = (contents: WebContents): DapEvents => {
    const send = (channel: string, payload: unknown) => {
      if (contents.isDestroyed()) return
      contents.send(channel, payload)
    }
    return {
      message: (id, message) => send('dap:message', { id, message }),
      output: (id, stream, text) => send('dap:output', { id, stream, text }),
      closed: (id, reason) => {
        owners.delete(id)
        send('dap:closed', { id, reason })
      },
    }
  }

  ipcMain.handle('dap:resolve', (_e, programs: DapProgram[]) => resolveProgram(Array.isArray(programs) ? programs : []))
  ipcMain.handle('dap:glob', (_e, pattern: string) => globPaths(String(pattern)))
  ipcMain.handle('dap:freePort', () => freePort())
  ipcMain.handle('dap:start', (e, id: string, options: DapStartOptions) => {
    owners.set(id, e.sender.id)
    return startAdapter(id, options, eventsFor(e.sender))
  })
  ipcMain.handle('dap:send', (_e, id: string, message: unknown) => sendAdapter(id, message))
  ipcMain.handle('dap:stop', (_e, id: string) => stopAdapter(id))
}

/** A window closed: end the adapters it started. */
export function stopDebugAdaptersOf(contentsId: number) {
  for (const [id, owner] of [...owners]) {
    if (owner !== contentsId) continue
    owners.delete(id)
    stopAdapter(id)
  }
}

export function stopAllDebugAdapters() {
  for (const id of [...adapters.keys()]) stopAdapter(id)
}
