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
 * The window layout as data: which view sits in which dock, which one is
 * active, and how large each dock is.
 *
 * Pure functions only — the store slice (`slices/layout.ts`) applies them and
 * `scripts/check-layout.ts` tests them.
 *
 * A dock lists the views the user placed there explicitly. Views nobody has
 * placed yet (a freshly installed extension's, say) go to their default dock,
 * after the placed ones, in their registry order. Ids of views that are not
 * registered right now stay in the list, invisible — so an extension that is
 * switched off and on again returns to where it was.
 */

import { DOCKS, type Dock, type ViewDef } from '@/core/views';

export type NavSide = 'left' | 'right';

export interface DockState {
  /** Placed views in order; may name views that are not registered right now. */
  views: string[];
  /** The view shown; falls back to the first one when it is gone. */
  active: string | null;
  open: boolean;
  /** Width of a side dock, height of the bottom one, in pixels. */
  size: number;
}

export interface LayoutState {
  left: DockState;
  right: DockState;
  bottom: DockState;
  /** The side of the window the panel navigation (and its global buttons) sits on. */
  navSide: NavSide;
}

export const SIZE_LIMITS: Record<Dock, { min: number; max: number; }> = {
  left: { min: 180, max: 640 },
  right: { min: 200, max: 720 },
  bottom: { min: 100, max: 800 },
};

export const DEFAULT_LAYOUT: LayoutState = {
  left: { views: [], active: 'explorer', open: true, size: 260 },
  right: { views: [], active: null, open: false, size: 340 },
  bottom: { views: [], active: 'output', open: false, size: 220 },
  navSide: 'left',
};

export const clampSize = (dock: Dock, px: number) =>
  Math.round(Math.min(SIZE_LIMITS[dock].max, Math.max(SIZE_LIMITS[dock].min, px)));

const MIRRORED: Record<Dock, Dock> = { left: 'right', right: 'left', bottom: 'bottom' };

/**
 * The dock an unplaced view goes to. `left` in a view's definition means “the
 * side of the navigation”: with the navigation on the right, it lands right.
 */
function defaultDockOf(layout: LayoutState, view: ViewDef): Dock {
  if (layout.navSide === 'left') {
    return view.defaultDock;
  }
  return MIRRORED[view.defaultDock];
}

/** Every id placed in any dock. */
function placedIds(layout: LayoutState): Set<string> {
  return new Set(DOCKS.flatMap((dock) => layout[dock].views));
}

/** The visible views of a dock, in order. */
export function resolveDock(layout: LayoutState, dock: Dock, known: ViewDef[]): string[] {
  const registered = new Set(known.map((view) => view.id));
  const placed = placedIds(layout);
  const explicit = layout[dock].views.filter((id) => registered.has(id));
  const implicit = known
    .filter((view) => defaultDockOf(layout, view) === dock && !placed.has(view.id))
    .map((view) => view.id);
  return [...explicit, ...implicit];
}

/** The dock a view lives in — placed, or its default. */
export function dockOf(layout: LayoutState, id: string, known: ViewDef[]): Dock | null {
  const placed = DOCKS.find((dock) => layout[dock].views.includes(id));
  if (placed) {
    return placed;
  }
  const view = known.find((entry) => entry.id === id);
  if (!view) {
    return null;
  }
  return defaultDockOf(layout, view);
}

/** The view a dock shows: its active one while that is still there, else the first. */
export function activeView(layout: LayoutState, dock: Dock, known: ViewDef[]): string | null {
  const list = resolveDock(layout, dock, known);
  const active = layout[dock].active;
  if (active && list.includes(active)) {
    return active;
  }
  return list[0] ?? null;
}

/** Write a dock's current order out explicitly, keeping unregistered ids at the end. */
function materialize(layout: LayoutState, dock: Dock, known: ViewDef[]): string[] {
  const registered = new Set(known.map((view) => view.id));
  const hidden = layout[dock].views.filter((id) => !registered.has(id));
  return [...resolveDock(layout, dock, known), ...hidden];
}

/**
 * Move a view into a dock at a position (the end without one) and make it the
 * dock's active view. Moving within the same dock reorders.
 */
export function moveView(layout: LayoutState, id: string, target: Dock, known: ViewDef[], index?: number): LayoutState {
  const source = dockOf(layout, id, known);
  if (!source) {
    return layout;
  }
  const lists = Object.fromEntries(DOCKS.map((dock) => [dock, materialize(layout, dock, known)])) as Record<Dock, string[]>;
  const without = lists[target].filter((entry) => entry !== id);
  const at = Math.max(0, Math.min(index ?? without.length, without.length));
  without.splice(at, 0, id);
  lists[target] = without;
  if (source !== target) {
    lists[source] = lists[source].filter((entry) => entry !== id);
  }

  const next: LayoutState = { ...layout };
  for (const dock of DOCKS) {
    next[dock] = { ...layout[dock], views: lists[dock] };
  }
  next[target] = { ...next[target], active: id, open: true };
  if (source !== target && layout[source].active === id) {
    const remaining = resolveDock(next, source, known);
    next[source] = { ...next[source], active: remaining[0] ?? null, open: remaining.length > 0 && next[source].open };
  }
  return next;
}

/** Open the dock holding the view and make the view active there. */
export function showView(layout: LayoutState, id: string, known: ViewDef[]): LayoutState {
  const dock = dockOf(layout, id, known);
  if (!dock) {
    return layout;
  }
  return { ...layout, [dock]: { ...layout[dock], active: id, open: true } };
}

/** Show the view — or, when it already is the visible one, close its dock. */
export function toggleView(layout: LayoutState, id: string, known: ViewDef[]): LayoutState {
  const dock = dockOf(layout, id, known);
  if (!dock) {
    return layout;
  }
  const visible = layout[dock].open && activeView(layout, dock, known) === id;
  if (visible) {
    return { ...layout, [dock]: { ...layout[dock], open: false } };
  }
  return showView(layout, id, known);
}

/** Put the navigation on the other side — the side docks trade places with it. */
export function setNavSide(layout: LayoutState, side: NavSide): LayoutState {
  if (layout.navSide === side) {
    return layout;
  }
  return { ...layout, navSide: side, left: layout.right, right: layout.left };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function normalizeDock(raw: unknown, dock: Dock): DockState {
  const fallback = DEFAULT_LAYOUT[dock];
  if (!isRecord(raw)) {
    return { ...fallback, views: [] };
  }
  const views = Array.isArray(raw.views) ? raw.views.filter((id): id is string => typeof id === 'string') : [];
  return {
    views: [...new Set(views)],
    active: typeof raw.active === 'string' ? raw.active : fallback.active,
    open: typeof raw.open === 'boolean' ? raw.open : fallback.open,
    size: typeof raw.size === 'number' ? clampSize(dock, raw.size) : fallback.size,
  };
}

/**
 * Read a stored layout. Settings from before docks existed only knew the
 * sidebar width and the panel height — those carry over.
 */
export function normalizeLayout(raw: unknown, legacy: { sidebarWidth?: number; panelHeight?: number; } = {}): LayoutState {
  const stored = isRecord(raw) ? raw : {};
  const layout: LayoutState = {
    left: normalizeDock(stored.left, 'left'),
    right: normalizeDock(stored.right, 'right'),
    bottom: normalizeDock(stored.bottom, 'bottom'),
    navSide: stored.navSide === 'right' ? 'right' : 'left',
  };
  if (!isRecord(raw) && legacy.sidebarWidth) {
    layout.left.size = clampSize('left', legacy.sidebarWidth);
  }
  if (!isRecord(raw) && legacy.panelHeight) {
    layout.bottom.size = clampSize('bottom', legacy.panelHeight);
  }
  // A view placed in two docks (a hand-edited file) stays in the first.
  const seen = new Set<string>();
  for (const dock of DOCKS) {
    layout[dock].views = layout[dock].views.filter((id) => {
      if (seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });
  }
  return layout;
}

/**
 * The views dragged between docks carry this type on the drag — nothing else
 * (a file from the explorer, a tab) can be dropped on a dock.
 */
export const VIEW_DRAG_TYPE = 'application/x-lumen-view';
