/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */


import { type ChildProcess } from 'node:child_process';
import net from 'node:net';

export interface DapProgram {
  command: string;
  args?: string[];
  probe?: string[];
}

export interface DapStartOptions {
  transport: 'stdio' | 'tcp';
  /** Absent when only connecting (TCP). */
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  host?: string;
  /** A fixed port; otherwise one chosen freely (only with `command`). */
  port?: number;
  /** The overall deadline for establishing the connection (TCP). 15 s by default. */
  connectTimeout?: number;
}

export interface DapEvents {
  message(id: string, message: unknown): void;
  output(id: string, stream: 'stderr' | 'stdout', text: string): void;
  closed(id: string, reason: string): void;
}

export interface AdapterHandle {
  child: ChildProcess | null;
  socket: net.Socket | null;
  buffer: Buffer;
  closed: boolean;
}
