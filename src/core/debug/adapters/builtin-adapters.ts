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
 * The debug adapters that ship with Lumen, each under a name.
 *
 * An adapter describes not only its command and arguments but also what a
 * launch request looks like (`launch`) — and that is a function. There is no
 * way to express it declaratively without inventing half a language for it.
 *
 * Hence the detour through names: an extension writes `"debug": ["delve"]` and
 * gets the adapter Lumen already ships. That covers the case that actually
 * comes up — a language wanting the familiar debugger of its toolchain —
 * without allowing foreign extensions to supply code.
 */

import type { DebugAdapterConfig } from '@/core/types';
import {
  codelldb, debugpy, delve, gdbDap, javaDebug, jsDebugNode, jsDebugTypeScript,
  kotlinDebug, lldbDap, netcoredbg, phpDebug,
} from './adapters';

/** Name → adapter. The names are part of the extension format and stay stable. */
export const BUILTIN_DEBUG_ADAPTERS: Record<string, DebugAdapterConfig> = {
  codelldb,
  debugpy,
  delve,
  'gdb-dap': gdbDap,
  'java-debug': javaDebug,
  'js-debug': jsDebugNode,
  'js-debug-typescript': jsDebugTypeScript,
  'kotlin-debug': kotlinDebug,
  'lldb-dap': lldbDap,
  netcoredbg,
  'php-debug': phpDebug,
};

export const BUILTIN_DEBUG_ADAPTER_NAMES = Object.keys(BUILTIN_DEBUG_ADAPTERS).sort();

/** Resolve names to adapters; unknown ones fall away. */
export function resolveDebugAdapters(names: readonly string[] | undefined): DebugAdapterConfig[] {
  if (!names?.length) {
    return [];
  }
  return names
    .map((name) => BUILTIN_DEBUG_ADAPTERS[name])
    .filter((adapter): adapter is DebugAdapterConfig => Boolean(adapter));
}
