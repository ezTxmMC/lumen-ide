/**
 * `window.lumen` rebuilt with child_process, for tests that drive the real
 * LspManager / LspClient against a real language server. Same framing as
 * electron/main.ts (Content-Length over stdio).
 *
 * `installLumenShim({ commands })` maps a command name to an executable path;
 * only those names resolve. Nothing here touches the project folders except
 * what the renderer itself asks for through `fs`.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

type Listener<T> = (p: T) => void
type Server = { child: ChildProcess; buffer: Buffer }

export interface LumenShim {
  servers: Map<string, Server>
  /** SIGKILL every server that is still around (also the whole process group). */
  killAll: () => void
  /** Raw stderr lines per server id, for diagnostics. */
  stderr: string[]
}

const exists = (p: string) => fs.access(p).then(() => true, () => false)

export function installLumenShim(options: { commands: Record<string, string> }): LumenShim {
  const msgListeners = new Set<Listener<{ id: string; message: Record<string, unknown> }>>()
  const errListeners = new Set<Listener<{ id: string; text: string }>>()
  const closeListeners = new Set<Listener<{ id: string; reason: string }>>()
  const servers = new Map<string, Server>()
  const stderr: string[] = []

  function drain(id: string, s: Server) {
    for (;;) {
      const headerEnd = s.buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return
      const header = s.buffer.subarray(0, headerEnd).toString('ascii')
      const m = /content-length:\s*(\d+)/i.exec(header)
      if (!m) { s.buffer = s.buffer.subarray(headerEnd + 4); continue }
      const len = Number(m[1])
      const start = headerEnd + 4
      if (s.buffer.length < start + len) return
      const body = s.buffer.subarray(start, start + len).toString('utf8')
      s.buffer = s.buffer.subarray(start + len)
      const message = JSON.parse(body)
      for (const l of msgListeners) l({ id, message })
    }
  }

  const killAll = () => {
    for (const s of servers.values()) {
      const pid = s.child.pid
      if (pid) {
        try { process.kill(-pid, 'SIGKILL') } catch { /* already gone */ }
      }
      try { s.child.kill('SIGKILL') } catch { /* already gone */ }
    }
    servers.clear()
  }

  const lumen = {
    fs: {
      readFile: (p: string) => fs.readFile(p, 'utf8'),
      writeFile: async (p: string, c: string) => { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, c); return true },
      create: async (p: string, dir: boolean) => {
        if (dir) { await fs.mkdir(p, { recursive: true }); return true }
        await fs.writeFile(p, '')
        return true
      },
      exists,
      list: async (p: string) => (await fs.readdir(p, { withFileTypes: true })).map((e) => ({ name: e.name, isDirectory: e.isDirectory() })),
      /** `nearest` (default) stops at the first hit going up, `outermost` keeps going and returns the last. */
      findRoot: async (start: string, markers: string[], mode?: string) => {
        let dir = start
        let found: string | null = null
        for (;;) {
          let hit = false
          for (const m of markers) if (await exists(path.join(dir, m))) { hit = true; break }
          if (hit) {
            found = dir
            if (mode !== 'outermost') return found
          }
          const parent = path.dirname(dir)
          if (parent === dir) return found
          dir = parent
        }
      },
    },
    lsp: {
      available: async (c: string) => c in options.commands,
      resolve: async (cands: string[]) => {
        for (const c of cands) {
          if (c in options.commands) return options.commands[c]
          if (path.isAbsolute(c) && await exists(c)) return c
        }
        return null
      },
      start: async (id: string, cmd: string, args: string[], cwd: string, env: Record<string, string>) => {
        // own process group, so a launcher script's JVM dies with it
        const child = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env }, detached: true })
        const s: Server = { child, buffer: Buffer.alloc(0) }
        servers.set(id, s)
        child.stdout!.on('data', (chunk: Buffer) => { s.buffer = Buffer.concat([s.buffer, chunk]); drain(id, s) })
        child.stderr!.on('data', (chunk: Buffer) => {
          stderr.push(chunk.toString())
          if (stderr.length > 400) stderr.splice(0, 200)
          for (const l of errListeners) l({ id, text: chunk.toString() })
        })
        child.on('close', (code) => {
          if (servers.get(id) !== s) return
          servers.delete(id)
          for (const l of closeListeners) l({ id, reason: `beendet (Code ${code})` })
        })
        return id
      },
      send: async (id: string, message: unknown) => {
        const s = servers.get(id)
        if (!s?.child.stdin?.writable) return false
        const body = Buffer.from(JSON.stringify(message), 'utf8')
        s.child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`)
        s.child.stdin.write(body)
        return true
      },
      stop: async (id: string) => {
        const s = servers.get(id)
        if (!s) return
        servers.delete(id)
        s.child.stdin?.end()
        const pid = s.child.pid
        if (pid) {
          try { process.kill(-pid, 'SIGTERM') } catch { /* already gone */ }
        }
      },
      onMessage: (cb: Listener<{ id: string; message: Record<string, unknown> }>) => { msgListeners.add(cb); return () => msgListeners.delete(cb) },
      onStderr: (cb: Listener<{ id: string; text: string }>) => { errListeners.add(cb); return () => errListeners.delete(cb) },
      onClosed: (cb: Listener<{ id: string; reason: string }>) => { closeListeners.add(cb); return () => closeListeners.delete(cb) },
      // main-process helpers of the jdtls support: the harness does not want the
      // real metadata cleaner (it would hide a jdtls that writes into the project)
      clearData: async () => {},
      javaImportState: async () => 'current' as const,
      javaImportDone: async () => {},
      javaCleanMetadata: async () => ({ removed: [] as string[], kept: [] as string[] }),
    },
    shell: { openExternal: async () => {} },
  }
  ;(globalThis as unknown as { window: unknown }).window = { lumen }
  return { servers, killAll, stderr }
}
