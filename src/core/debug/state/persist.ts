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
 * Per-project debug state in `breakpoints.json`: breakpoints (relative to the
 * workspace folder), watch expressions, exception filters and remembered input
 * such as a program path. Launch configurations live separately in
 * `debug.json`. Both sit in Lumen's data folder for the project
 * (`~/.lumen/projects/…`), not in the project itself.
 */

import { projectDataFile } from '@/core/project/data';

export interface StoredBreakpoint {
  path: string;
  /** 1-based, as editors usually count. */
  line: number;
  enabled?: boolean;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
}

export interface DebugState {
  breakpoints: StoredBreakpoint[];
  watches: string[];
  /** Adapter type → the filters chosen. */
  exceptionFilters: Record<string, string[]>;
  /** Adapter type → filters we know of, so they show without a running session. */
  knownFilters: Record<string, { filter: string; label: string; default?: boolean; }[]>;
  memory: Record<string, string>;
}

export const EMPTY_DEBUG_STATE: DebugState = {
  breakpoints: [],
  watches: [],
  exceptionFilters: {},
  knownFilters: {},
  memory: {},
};

export const statePath = (root: string) => projectDataFile(root, 'breakpoints.json');
export const launchConfigPath = (root: string) => projectDataFile(root, 'debug.json');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function cleanBreakpoint(value: unknown): StoredBreakpoint | null {
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.path !== 'string' || typeof value.line !== 'number') {
    return null;
  }
  const optional = (key: string) => (typeof value[key] === 'string' && value[key] ? { [key]: value[key] as string } : {});
  return {
    path: value.path,
    line: Math.max(1, Math.floor(value.line)),
    ...(value.enabled === false ? { enabled: false } : {}),
    ...optional('condition'),
    ...optional('hitCondition'),
    ...optional('logMessage'),
  };
}

export async function loadDebugState(root: string): Promise<DebugState> {
  const raw = await window.lumen.fs.readFileIfExists(await statePath(root)).catch(() => null);
  if (!raw) {
    return structuredClone(EMPTY_DEBUG_STATE);
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const breakpoints = Array.isArray(parsed.breakpoints) ? parsed.breakpoints.map(cleanBreakpoint).filter((b): b is StoredBreakpoint => b !== null) : [];
    const watches = Array.isArray(parsed.watches) ? parsed.watches.filter((w): w is string => typeof w === 'string') : [];
    return {
      breakpoints,
      watches,
      exceptionFilters: isRecord(parsed.exceptionFilters) ? parsed.exceptionFilters as DebugState['exceptionFilters'] : {},
      knownFilters: isRecord(parsed.knownFilters) ? parsed.knownFilters as DebugState['knownFilters'] : {},
      memory: isRecord(parsed.memory) ? parsed.memory as DebugState['memory'] : {},
    };
  } catch {
    return structuredClone(EMPTY_DEBUG_STATE);
  }
}

export async function saveDebugState(root: string, state: DebugState) {
  await window.lumen.fs.writeFile(await statePath(root), `${JSON.stringify(state, null, 2)}\n`);
}

/** With nothing stored, there is no need for a file. */
export function isEmptyState(state: DebugState) {
  return !state.breakpoints.length && !state.watches.length
    && !Object.keys(state.exceptionFilters).length && !Object.keys(state.memory).length;
}
