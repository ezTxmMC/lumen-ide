/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */



export type IPty = {
  pid: number;
  onData(cb: (data: string) => void): { dispose(): void; };
  onExit(cb: (e: { exitCode: number; signal?: number; }) => void): { dispose(): void; };
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
};

export type PtyModule = {
  spawn(file: string, args: string[], options: {
    name: string; cols: number; rows: number; cwd: string; env: Record<string, string>;
  }): IPty;
};

export interface ShellProfile {
  id: string;
  label: string;
  path: string;
  args: string[];
  /** The user's default shell ($SHELL, or PowerShell under Windows). */
  isDefault?: boolean;
}

export interface ExternalTerminal {
  id: string;
  label: string;
  command: string;
}

export interface TerminalOptions {
  shell?: string;
  args?: string[];
  cwd?: string;
  cols: number;
  rows: number;
  env?: Record<string, string>;
}
