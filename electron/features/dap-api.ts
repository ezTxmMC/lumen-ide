/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The debugger's preload bridge (`window.lumen.dap`). */

import { invoke, subscribe } from './ipc';

export interface DapProgram {
  command: string;
  args?: string[];
  probe?: string[];
}

export interface DapStartOptions {
  transport: 'stdio' | 'tcp';
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  host?: string;
  port?: number;
  connectTimeout?: number;
}

export const dapApi = {
  /** The first call that works (PATH, paths with `~` and `*`, a trial run). */
  resolve: (programs: DapProgram[]): Promise<DapProgram | null> => invoke('dap:resolve', programs),
  /** Resolve a path with `*` in its segments — newest matches first. */
  glob: (pattern: string): Promise<string[]> => invoke('dap:glob', pattern),
  freePort: (): Promise<number> => invoke('dap:freePort'),
  start: (id: string, options: DapStartOptions): Promise<{ port?: number; }> => invoke('dap:start', id, options),
  send: (id: string, message: unknown): Promise<boolean> => invoke('dap:send', id, message),
  stop: (id: string): Promise<void> => invoke('dap:stop', id),
  onMessage: (cb: (p: { id: string; message: Record<string, unknown>; }) => void) => subscribe('dap:message', cb),
  onOutput: (cb: (p: { id: string; stream: 'stderr' | 'stdout'; text: string; }) => void) => subscribe('dap:output', cb),
  onClosed: (cb: (p: { id: string; reason: string; }) => void) => subscribe('dap:closed', cb),
};
