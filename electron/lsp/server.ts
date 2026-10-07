/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { app, type WebContents } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import fsSync from 'node:fs';
import { withManagedPath } from '../features/lsp-packages/tools/managed-path';
import { scopedId } from '../window/ids';

interface LspProcess {
  child: ChildProcess;
  /** A buffer for messages not yet complete. */
  buffer: Buffer;
  /** The renderer's id for the server — `servers` keys it per window. */
  id: string;
  owner: WebContents;
}

/** Keyed by `scopedId`. */
export const servers = new Map<string, LspProcess>();

function postLsp(server: LspProcess, channel: string, payload: unknown) {
  if (server.owner.isDestroyed()) {
    return;
  }
  server.owner.send(channel, payload);
}

/**
 * Splits the stdout stream into LSP messages.
 * The frame: `Content-Length: <n>\r\n\r\n<n bytes of JSON>`
 */
function drainLsp(server: LspProcess) {
  for (;;) {
    const headerEnd = server.buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      return;
    }

    const header = server.buffer.subarray(0, headerEnd).toString('ascii');
    const match = /content-length:\s*(\d+)/i.exec(header);
    if (!match) {
      // An unusable frame — discard up to the end of the header.
      server.buffer = server.buffer.subarray(headerEnd + 4);
      continue;
    }

    const length = Number(match[1]);
    const start = headerEnd + 4;
    if (server.buffer.length < start + length) {
      return;
    }

    const body = server.buffer.subarray(start, start + length).toString('utf8');
    server.buffer = server.buffer.subarray(start + length);

    try {
      postLsp(server, 'lsp:message', { id: server.id, message: JSON.parse(body) });
    } catch {
      // Skip broken JSON rather than lose the stream.
    }
  }
}

/**
 * The environment of a language server. Variables of a VS Code session that
 * started Lumen stay out: ModDevGradle, run inside jdtls' Gradle import,
 * takes `VSCODE_PID` as “running in VS Code” and writes `.vscode/launch.json`
 * into the project.
 */
function serverEnvironment(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = withManagedPath({ ...process.env, ...extra });
  for (const key of Object.keys(env)) {
    if (key.startsWith('VSCODE_')) {
      delete env[key];
    }
  }
  return env;
}

export function startLsp(
  owner: WebContents, id: string, command: string, args: string[], cwd: string,
  env: Record<string, string> = {},
) {
  const key = scopedId(owner, id);
  stopLsp(key);
  // Create the data folder (jdtls -data, say) where the arguments name one.
  for (const arg of args) {
    if (arg.startsWith(app.getPath('userData'))) {
      try { fsSync.mkdirSync(arg, { recursive: true }); } catch { /* egal */ }
    }
  }
  // Through the Windows shell a path with spaces (C:\Users\Jane Doe\…) has to be quoted.
  const quoted = process.platform === 'win32' && command.includes(' ') && !command.startsWith('"');
  const child = spawn(quoted ? `"${command}"` : command, args, {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: serverEnvironment(env),
    shell: process.platform === 'win32',
  });
  const server: LspProcess = { child, buffer: Buffer.alloc(0), id, owner };
  servers.set(key, server);

  child.stdout?.on('data', (chunk: Buffer) => {
    server.buffer = Buffer.concat([server.buffer, chunk]);
    drainLsp(server);
  });
  // The servers' stderr is often chatty — pass it on for debugging only.
  child.stderr?.on('data', (chunk: Buffer) => {
    postLsp(server, 'lsp:stderr', { id, text: chunk.toString() });
  });
  // A restart uses the same id. The late end of the old process must neither
  // delete the entry of the new one nor report its client as having crashed.
  child.on('error', (err) => {
    if (servers.get(key) !== server) {
      return;
    }
    servers.delete(key);
    postLsp(server, 'lsp:closed', { id, reason: err.message });
  });
  child.on('close', (code) => {
    if (servers.get(key) !== server) {
      return;
    }
    servers.delete(key);
    postLsp(server, 'lsp:closed', { id, reason: `beendet (Code ${code})` });
  });
}

/** `LUMEN_TRACE_LSP=1` prints the document sync sent to servers — for debugging drift between editor and server. */
const TRACE_LSP = process.env.LUMEN_TRACE_LSP === '1';

function traceLsp(id: string, message: unknown) {
  const { method, params } = message as { method?: string; params?: { textDocument?: { uri?: string; version?: number; }; contentChanges?: unknown[]; }; };
  if (!method?.startsWith('textDocument/did') && method !== 'workspace/didChangeWatchedFiles') {
    return;
  }
  console.log(`[lsp ${id}] ${method} ${params?.textDocument?.uri ?? ''} v${params?.textDocument?.version ?? ''} ${JSON.stringify(params?.contentChanges ?? (params as Record<string, unknown>)?.changes ?? '').slice(0, 400)}`);
}

export function sendLsp(key: string, message: unknown) {
  if (TRACE_LSP) {
    traceLsp(key, message);
  }
  const server = servers.get(key);
  if (!server?.child.stdin?.writable) {
    return false;
  }
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  server.child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  server.child.stdin.write(body);
  return true;
}

export function stopLsp(key: string) {
  const server = servers.get(key);
  if (!server) {
    return;
  }
  servers.delete(key);
  server.child.stdin?.end();
  server.child.kill('SIGTERM');
  // Kill hanging servers outright after a short wait.
  // `killed` becomes true as soon as SIGTERM is sent — what counts is whether it has ended.
  setTimeout(() => {
    if (server.child.exitCode === null && server.child.signalCode === null) {
      server.child.kill('SIGKILL');
    }
  }, 2000);
}
