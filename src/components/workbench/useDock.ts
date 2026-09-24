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
 * What a dock shows right now: its views in order, the active one, whether it
 * is open, and its size — recomputed when views come and go or the layout
 * changes.
 */

import { useMemo, useSyncExternalStore } from 'react';
import { useStore } from '@/state/store';
import { activeView, resolveDock } from '@/state/layout';
import { viewRegistry, type Dock, type ViewDef } from '@/core/views';
import { terminals } from '@/lib/terminals';

const terminalsSubscribe = (fn: () => void) => terminals.subscribe(fn);

export interface DockView {
  views: ViewDef[];
  active: ViewDef | null;
  open: boolean;
  size: number;
}

export function useViewRegistry(): number {
  return useSyncExternalStore(viewRegistry.subscribe, viewRegistry.getVersion);
}

export function useDock(dock: Dock): DockView {
  const version = useViewRegistry();
  const layout = useStore((s) => s.layout);
  return useMemo(() => {
    const known = viewRegistry.list();
    const ids = resolveDock(layout, dock, known);
    const views = ids.map((id) => viewRegistry.get(id)).filter((view): view is ViewDef => Boolean(view));
    const activeId = activeView(layout, dock, known);
    return {
      views,
      active: views.find((view) => view.id === activeId) ?? null,
      open: layout[dock].open,
      size: layout[dock].size,
    };
    // `version` stands for the registry's contents.
  }, [layout, dock, version]);
}

/**
 * Badges read from all over the store (diagnostics, a running task, the
 * debugger, references). Subscribing to those values re-renders the docks
 * whenever a badge may have changed.
 */
export function useBadgeTick(): void {
  useSyncExternalStore(terminalsSubscribe, terminals.getVersion);
  useStore((s) => s.lspVersion);
  useStore((s) => s.runningId);
  useStore((s) => s.debugActive);
  useStore((s) => s.references?.hits.length ?? -1);
  useStore((s) => Boolean(s.project?.primary));
}
