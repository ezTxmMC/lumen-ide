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
 * The managed folder (`~/.lumen/lsp/bin`) on the PATH.
 *
 * Whatever Lumen installs — language servers and the tools an add-on declares
 * (`novusc`) — gets a launcher there. Putting the folder on the PATH of the
 * main process makes every child inherit it (terminals, run tasks, debug
 * adapters, extension-host commands, language servers); the same function is
 * applied to the environments those spawns build themselves, so a project
 * variable `PATH` cannot hide it.
 *
 * Precedence on the PATH of everything Lumen starts:
 *   1. the folders of the chosen SDKs (project JDK, default Novus, Node …) —
 *      the renderer puts them first and lists them in `LUMEN_SDK_PATH`;
 *   2. this managed folder;
 *   3. whatever else the PATH had.
 * So a Novus picked in the SDK dialog beats the `novusc` the add-on installer
 * put here, and without a choice the add-on's copy is the one that runs.
 */

import path from 'node:path';
import { BIN } from '../places';

type Env = Record<string, string | undefined>;

/** The folders of the chosen SDKs, as the renderer sets them (`sdkEnvironment()` in `core/sdk/env.ts` — keep the names equal). */
export const SDK_PATH_VARIABLE = 'LUMEN_SDK_PATH';

/** `existing` with `dir` in front — once, wherever it was before — but behind the `ahead` folders that are already first. */
export function composePath(dir: string, existing: string | undefined, delimiter = path.delimiter, ahead: string[] = []): string {
  const entries = (existing ?? '').split(delimiter).filter((entry) => entry && entry !== dir);
  const first = entries.filter((entry) => ahead.includes(entry));
  const rest = entries.filter((entry) => !ahead.includes(entry));
  return [...first, dir, ...rest].join(delimiter);
}

/** The name PATH has in this environment — `Path` on Windows. */
function pathKey(env: Env, platform: string): string {
  if (platform !== 'win32') {
    return 'PATH';
  }
  return Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'Path';
}

/** A copy of `env` with the managed folder first on the PATH. */
export function withManagedPath<T extends Env>(env: T, dir = BIN, platform: string = process.platform): T {
  const key = pathKey(env, platform);
  const delimiter = platform === 'win32' ? ';' : ':';
  const ahead = (env[SDK_PATH_VARIABLE] ?? '').split(delimiter).filter(Boolean);
  return { ...env, [key]: composePath(dir, env[key], delimiter, ahead) };
}

/** Called once at start — every process Lumen spawns afterwards inherits it. */
export function applyManagedPath() {
  const key = pathKey(process.env, process.platform);
  process.env[key] = composePath(BIN, process.env[key]);
}
