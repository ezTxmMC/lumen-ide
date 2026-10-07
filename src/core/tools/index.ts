/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { ToolSpec } from '@/core/types';
import { lsp } from '../lsp/manager';
import { toolConfig, toolStatus, type ToolStatus } from './status';
export { needsAttention, pinnedVersion, recordFor, toolConfig, toolStatus, toolsOf } from './status';
export type { ToolProbe, ToolState, ToolStatus } from './status';

/**
 * Finds the tools languages declare and keeps the answers until something
 * changes (an install, a rescan) — a probe starts a process, so it is not
 * repeated for every keystroke of the UI.
 */
class ToolManager {
  private known = new Map<string, Promise<ToolStatus>>();
  private latest = new Map<string, ToolStatus>();
  private listeners = new Set<() => void>();
  private version = 0;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  getVersion = () => this.version;

  private emit() {
    this.version++;
    for (const fn of this.listeners) {
      fn();
    }
  }

  /** The last answer for a tool, if one arrived. */
  status(id: string): ToolStatus | undefined {
    return this.latest.get(id);
  }

  private preferred = new Set<(tool: ToolSpec) => string[]>();

  /** Programs that count before the tool's own command — the Novus chosen in the SDK dialog satisfies `novusc`. */
  addCandidateProvider(fn: (tool: ToolSpec) => string[]) {
    this.preferred.add(fn);
    return () => { this.preferred.delete(fn); };
  }

  private probe(tool: ToolSpec): Promise<ToolStatus> {
    const config = toolConfig(tool);
    const candidates = (tool.candidates ?? []).map((candidate) => lsp.substitute(candidate, config, ''));
    const first = [...this.preferred].flatMap((provide) => provide(tool));
    return Promise.all([
      window.lumen.lspPackages.probe([...first, tool.command, ...candidates], tool.check).catch(() => null),
      window.lumen.lspPackages.list().catch(() => []),
    ]).then(([probe, installed]) => {
      const status = toolStatus(tool, probe, installed);
      this.latest.set(tool.id, status);
      this.emit();
      return status;
    });
  }

  /** Looks the tools up (cached) and returns their status in the same order. */
  check(tools: ToolSpec[]): Promise<ToolStatus[]> {
    return Promise.all(tools.map((tool) => {
      let hit = this.known.get(tool.id);
      if (!hit) {
        hit = this.probe(tool);
        this.known.set(tool.id, hit);
      }
      return hit;
    }));
  }

  /** Forget the answers — after an install. */
  rescan() {
    this.known.clear();
    this.latest.clear();
    this.emit();
  }
}

export const tools = new ToolManager();
