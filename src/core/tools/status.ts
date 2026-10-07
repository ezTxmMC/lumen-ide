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
 * Tools a language declares (`ToolSpec`): are they there, and are they the
 * version the add-on pins? Pure — the manager feeds in what the main process
 * found, `npm run check:lsp` tests it with fakes.
 */

import type { LanguageSpec, LspConfig, ToolSpec } from '@/core/types';
import type { InstalledPackage } from '../../../electron/features/lsp-packages/types';

/** What the main process says about one tool (`lspPackages.probe`). */
export interface ToolProbe {
  path: string | null;
  managed: boolean;
  ok: boolean;
  output: string;
}

export type ToolState = 'ok' | 'missing' | 'outdated' | 'broken';

export interface ToolStatus {
  tool: ToolSpec;
  state: ToolState;
  path: string | null;
  /** Recorded by the installer; only for what Lumen installed. */
  installedVersion?: string;
  /** What the add-on pins. */
  pinnedVersion?: string;
}

/** The tool as a server configuration — the install dialog and the install plans take that. */
export function toolConfig(tool: ToolSpec): LspConfig {
  return {
    label: tool.label,
    command: tool.command,
    candidates: tool.candidates,
    package: tool.package,
    systemPackages: tool.systemPackages,
    docs: tool.docs,
    install: tool.install,
  };
}

/** The version a package pins; only GitHub releases carry one. */
export function pinnedVersion(tool: ToolSpec): string | undefined {
  return tool.package?.type === 'github' ? tool.package.version : undefined;
}

/** The record of the package that installed this command. */
export function recordFor(tool: ToolSpec, installed: InstalledPackage[]): InstalledPackage | undefined {
  return installed.find((entry) => entry.bins.includes(tool.command));
}

export function toolStatus(tool: ToolSpec, probe: ToolProbe | null, installed: InstalledPackage[]): ToolStatus {
  const pinned = pinnedVersion(tool);
  if (!probe?.path) {
    return { tool, state: 'missing', path: null, pinnedVersion: pinned };
  }
  const record = recordFor(tool, installed);
  const base = { tool, path: probe.path, installedVersion: record?.version, pinnedVersion: pinned };
  if (!probe.ok) {
    return { ...base, state: 'broken' };
  }
  // Only Lumen's own copy is Lumen's to update — a program from the PATH is the user's.
  const stale = probe.managed && Boolean(pinned) && Boolean(record) && record?.version !== pinned;
  return { ...base, state: stale ? 'outdated' : 'ok' };
}

/** Every tool the languages declare, once per id. */
export function toolsOf(languages: LanguageSpec[]): ToolSpec[] {
  const seen = new Map<string, ToolSpec>();
  for (const language of languages) {
    for (const tool of language.tools ?? []) {
      if (!seen.has(tool.id)) {
        seen.set(tool.id, tool);
      }
    }
  }
  return [...seen.values()];
}

/** Missing, broken or out of date — worth putting in front of the user. */
export const needsAttention = (status: ToolStatus) => status.state !== 'ok';
