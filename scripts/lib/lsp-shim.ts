/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/**
 * `window.lumen` rebuilt with child_process, for tests that drive the real
 * LspManager / LspClient against a real language server. Same framing as
 * electron/main.ts (Content-Length over stdio).
 *
 * `installLumenShim({ commands })` maps a command name to an executable path;
 * only those names resolve. Nothing here touches the project folders except
 * what the renderer itself asks for through `fs`.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

type Listener<T> = (p: T) => void;
type Server = { child: ChildProcess; buffer: Buffer; };

export interface LumenShim {
  servers: Map<string, Server>;
  /** SIGKILL every server that is still around (also the whole process group). */
  killAll: () => void;
  /** Raw stderr lines per server id, for diagnostics. */
  stderr: string[];
}

const exists = (p: string) => fs.access(p).then(() => true, () => false);

interface ShimState {
  msgListeners: Set<Listener<{ id: string; message: Record<string, unknown>; }>>;
  errListeners: Set<Listener<{ id: string; text: string; }>>;
  closeListeners: Set<Listener<{ id: string; reason: string; }>>;
  servers: Map<string, Server>;
  stderr: string[];
}

/** Cuts complete Content-Length frames off the server's stdout and hands them to the listeners. */
function drain(state: ShimState, id: string, s: Server) {
  for (;;) {
    const headerEnd = s.buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      return;
    }
    const header = s.buffer.subarray(0, headerEnd).toString('ascii');
    const m = /content-length:\s*(\d+)/i.exec(header);
    if (!m) { s.buffer = s.buffer.subarray(headerEnd + 4); continue; }
    const len = Number(m[1]);
    const start = headerEnd + 4;
    if (s.buffer.length < start + len) {
      return;
    }
    const body = s.buffer.subarray(start, start + len).toString('utf8');
    s.buffer = s.buffer.subarray(start + len);
    const message = JSON.parse(body);
    for (const l of state.msgListeners) {
      l({ id, message });
    }
  }
}

function killAllServers(servers: Map<string, Server>) {
  for (const s of servers.values()) {
    const pid = s.child.pid;
    if (pid) {
      try { process.kill(-pid, 'SIGKILL'); } catch { /* already gone */ }
    }
    try { s.child.kill('SIGKILL'); } catch { /* already gone */ }
  }
  servers.clear();
}

/** `nearest` (default) stops at the first hit going up, `outermost` keeps going and returns the last. */
async function findRoot(start: string, markers: string[], mode?: string): Promise<string | null> {
  let dir = start;
  let found: string | null = null;
  for (;;) {
    let hit = false;
    for (const m of markers) {
      if (await exists(path.join(dir, m))) { hit = true; break; }
    }
    if (hit) {
      found = dir;
      if (mode !== 'outermost') {
        return found;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return found;
    }
    dir = parent;
  }
}

function fsShim() {
  return {
    readFile: (p: string) => fs.readFile(p, 'utf8'),
    writeFile: async (p: string, c: string) => { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, c); return true; },
    create: async (p: string, dir: boolean) => {
      if (dir) { await fs.mkdir(p, { recursive: true }); return true; }
      await fs.writeFile(p, '');
      return true;
    },
    exists,
    list: async (p: string) => (await fs.readdir(p, { withFileTypes: true })).map((e) => ({ name: e.name, isDirectory: e.isDirectory() })),
    findRoot,
  };
}

/** Starts a server in its own process group and wires its output into the listeners. */
function startServer(state: ShimState, id: string, cmd: string, args: string[], cwd: string, env: Record<string, string>) {
  // own process group, so a launcher script's JVM dies with it
  const child = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env }, detached: true });
  const s: Server = { child, buffer: Buffer.alloc(0) };
  state.servers.set(id, s);
  child.stdout!.on('data', (chunk: Buffer) => { s.buffer = Buffer.concat([s.buffer, chunk]); drain(state, id, s); });
  child.stderr!.on('data', (chunk: Buffer) => {
    state.stderr.push(chunk.toString());
    if (state.stderr.length > 400) {
      state.stderr.splice(0, 200);
    }
    for (const l of state.errListeners) {
      l({ id, text: chunk.toString() });
    }
  });
  child.on('close', (code) => {
    if (state.servers.get(id) !== s) {
      return;
    }
    state.servers.delete(id);
    for (const l of state.closeListeners) {
      l({ id, reason: `beendet (Code ${code})` });
    }
  });
  return id;
}

function lspShim(options: { commands: Record<string, string>; }, state: ShimState) {
  const { servers, msgListeners, errListeners, closeListeners } = state;
  return {
    available: async (c: string) => c in options.commands,
    resolve: async (cands: string[]) => {
      for (const c of cands) {
        if (c in options.commands) {
          return options.commands[c];
        }
        if (path.isAbsolute(c) && await exists(c)) {
          return c;
        }
      }
      return null;
    },
    start: async (id: string, cmd: string, args: string[], cwd: string, env: Record<string, string>) =>
      startServer(state, id, cmd, args, cwd, env),
    send: async (id: string, message: unknown) => {
      const s = servers.get(id);
      if (!s?.child.stdin?.writable) {
        return false;
      }
      const body = Buffer.from(JSON.stringify(message), 'utf8');
      s.child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
      s.child.stdin.write(body);
      return true;
    },
    stop: async (id: string) => {
      const s = servers.get(id);
      if (!s) {
        return;
      }
      servers.delete(id);
      s.child.stdin?.end();
      const pid = s.child.pid;
      if (pid) {
        try { process.kill(-pid, 'SIGTERM'); } catch { /* already gone */ }
      }
    },
    onMessage: (cb: Listener<{ id: string; message: Record<string, unknown>; }>) => { msgListeners.add(cb); return () => msgListeners.delete(cb); },
    onStderr: (cb: Listener<{ id: string; text: string; }>) => { errListeners.add(cb); return () => errListeners.delete(cb); },
    onClosed: (cb: Listener<{ id: string; reason: string; }>) => { closeListeners.add(cb); return () => closeListeners.delete(cb); },
    // main-process helpers of the jdtls support: the harness does not want the
    // real metadata cleaner (it would hide a jdtls that writes into the project)
    clearData: async () => {},
    javaImportState: async () => 'current' as const,
    javaImportDone: async () => {},
    javaCleanMetadata: async () => ({ removed: [] as string[], kept: [] as string[] }),
  };
}

export function installLumenShim(options: { commands: Record<string, string>; }): LumenShim {
  const state: ShimState = {
    msgListeners: new Set(),
    errListeners: new Set(),
    closeListeners: new Set(),
    servers: new Map(),
    stderr: [],
  };
  const lumen = {
    fs: fsShim(),
    lsp: lspShim(options, state),
    shell: { openExternal: async () => {} },
  };
  (globalThis as unknown as { window: unknown; }).window = { lumen };
  return { servers: state.servers, killAll: () => killAllServers(state.servers), stderr: state.stderr };
}
