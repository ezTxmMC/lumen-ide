/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { FormValues, FormField } from './forms';

/* ------------------------------------------------------------------ *
 * Debugger (Debug Adapter Protocol)
 * ------------------------------------------------------------------ */

/** One way of launching a debug adapter. */
export interface DebugAdapterProgram {
  /**
   * Program or path (`~` and `*` are allowed in path segments). When the path
   * ends in `.js`, `.py` or `.jar`, Lumen starts it with node, python3 or java.
   */
  command: string;
  args?: string[];
  /** A trial run with these arguments must exit 0, e.g. `['-c', 'import debugpy']`. */
  probe?: string[];
}

/** Surroundings when a debug session starts — for adapter configurations. */
export interface DebugContext {
  /** The active file, when there is one. */
  file: string | null;
  fileDir: string;
  fileName: string;
  fileStem: string;
  workspace: string;
  projectRoot: string;
  projectName: string;
  /** Recognised project kinds (`cargo`, `cmake`, `maven` …). */
  projectKinds: string[];
  languageId: string | null;
  platform: string;
  home: string;
  /** Replaces `${file}`, `${fileDir}`, `${fileStem}`, `${workspace}`, `${projectRoot}` … */
  substitute(value: string): string;
  exists(path: string): Promise<boolean>;
  /** Resolve paths containing `*` in their segments. */
  glob(pattern: string): Promise<string[]>;
  /** `workspace/executeCommand` on the language's server. */
  lspCommand(command: string, args?: unknown[]): Promise<unknown>;
  /** A choice; `null` when cancelled. */
  pick(title: string, choices: { value: string; label: string; detail?: string; }[]): Promise<string | null>;
  /** A form; `null` when cancelled. */
  ask(title: string, fields: FormField[], initial?: FormValues): Promise<FormValues | null>;
  /** Values Lumen remembers per project — the last chosen program, say. */
  memory: { get(key: string): string | undefined; set(key: string, value: string): void; };
}

export type DebugLaunchArguments = Record<string, unknown>;

/**
 * A debug adapter for this language. As with language servers, Lumen installs
 * nothing itself — when the adapter is missing, the debug panel shows
 * `install`.
 */
export interface DebugAdapterConfig {
  /** Display name, such as “lldb-dap”. */
  label: string;
  /** DAP type of the configuration, such as `lldb`, `debugpy`, `pwa-node`. */
  type: string;
  /** Defaults to `stdio`. With `tcp`, Lumen replaces `${port}` in the arguments. */
  transport?: 'stdio' | 'tcp';
  command?: string;
  args?: string[];
  /** Trial run for `command` (see `DebugAdapterProgram.probe`). */
  probe?: string[];
  /** Further places the adapter may live; the first one found wins. */
  candidates?: (string | DebugAdapterProgram)[];
  env?: Record<string, string>;
  /** A fixed TCP port; otherwise Lumen looks for a free one. */
  port?: number;
  host?: string;
  /** TCP without a process of our own: the port comes from elsewhere, as with Java's language server. */
  connect?(ctx: DebugContext): Promise<{ port: number; host?: string; }>;
  /** Defaults to `launch`. */
  request?: 'launch' | 'attach';
  /**
   * Arguments for `launch`/`attach`. As an object, placeholders are replaced
   * in every string; as a function it may ask questions — `null` cancels.
   */
  launch?: DebugLaunchArguments | ((ctx: DebugContext) => DebugLaunchArguments | null | Promise<DebugLaunchArguments | null>);
  /** Plugins the language's server has to load (java-debug for jdtls, say). */
  lspBundles?: string[];
  /** Project kinds this adapter is preferred for. */
  kinds?: string[];
  /** How to install the adapter, in prose. */
  install?: string;
  installCommands?: Partial<Record<'linux' | 'darwin' | 'win32', string>>;
  docs?: string;
}

