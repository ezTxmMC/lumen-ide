/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { execFile } from 'node:child_process';
import path from 'node:path';
import { resolveFirst } from '../../../lsp/resolve';
import { withManagedPath } from './managed-path';
import { BIN } from '../places';

export interface ToolProbe {
  /** Where the command resolves to, or null. */
  path: string | null;
  /** The command is Lumen's own launcher (`~/.lumen/lsp/bin`), not something from the PATH. */
  managed: boolean;
  /** The check ran and exited with 0 (true without a check). */
  ok: boolean;
  /** First line of the check's output. */
  output: string;
}

type Runner = (file: string, args: string[]) => Promise<{ code: number; stdout: string; }>;

const run: Runner = (file, args) => new Promise((resolve) => {
  // A .cmd launcher needs the shell on Windows, which wants the path quoted.
  const program = process.platform === 'win32' ? `"${file}"` : file;
  execFile(program, args, { timeout: 8000, windowsHide: true, env: withManagedPath(process.env), shell: process.platform === 'win32' }, (err, stdout) => {
    const code = err ? Number((err as { code?: unknown; }).code ?? 1) || 1 : 0;
    resolve({ code, stdout: String(stdout ?? '') });
  });
});

/** Finds the command (managed folder, candidates, PATH) and, with `args`, runs it once to see that it starts. */
export async function probeTool(
  candidates: string[], args: string[] | undefined,
  resolver: (list: string[]) => Promise<string | null> = resolveFirst, runner: Runner = run,
): Promise<ToolProbe> {
  const found = await resolver(candidates);
  if (!found) {
    return { path: null, managed: false, ok: false, output: '' };
  }
  const managed = found.startsWith(BIN + path.sep);
  if (!args) {
    return { path: found, managed, ok: true, output: '' };
  }
  const result = await runner(found, args);
  return { path: found, managed, ok: result.code === 0, output: result.stdout.split(/\r?\n/)[0] ?? '' };
}
