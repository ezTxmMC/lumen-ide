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
 * Popped-out windows as data: which views and editor groups sit in a window
 * of their own right now, where those windows were, and how a group comes home.
 *
 * Pure functions only — the store slice (`slices/popout.ts`) applies them,
 * `core/popout/windows.ts` owns the native windows, and
 * `scripts/check-layout.ts` tests this file.
 *
 * A popped-out view stays in the layout lists of its dock — that is what lets
 * it return to exactly where it was — so the dock only has to know that it is
 * away. A popped-out editor group is a group like any other, in `groups`; the
 * main window merely does not draw it.
 */

export type PopoutKind = 'view' | 'group';

export interface PopoutBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PopoutEntry {
  /** `view:<id>` or `group:<id>` — also names the native window. */
  key: string;
  kind: PopoutKind;
  /** The view id or the group id. */
  ref: string;
  /** For a group: the group its tabs came from, where they return to. */
  from?: string;
  /** Where the window was last (or opens); `null` lets the system choose. */
  bounds: PopoutBounds | null;
}

export const MIN_POPOUT = { width: 280, height: 160 };
const MAX_POPOUT = 10_000;

export const popoutKey = (kind: PopoutKind, ref: string) => `${kind}:${ref}`;

/** The name a native window is opened under — the same name reaches the same window again. */
export const popoutWindowName = (key: string) => `lumen-popout:${key}`;

export const isPopoutWindowName = (name: string) => name.startsWith('lumen-popout:');

export function addPopout(list: PopoutEntry[], entry: PopoutEntry): PopoutEntry[] {
  return [...list.filter((existing) => existing.key !== entry.key), entry];
}

export function removePopout(list: PopoutEntry[], key: string): PopoutEntry[] {
  if (!list.some((entry) => entry.key === key)) {
    return list;
  }
  return list.filter((entry) => entry.key !== key);
}

export function poppedViewIds(list: PopoutEntry[]): Set<string> {
  return new Set(list.filter((entry) => entry.kind === 'view').map((entry) => entry.ref));
}

export function poppedGroupIds(list: PopoutEntry[]): Set<string> {
  return new Set(list.filter((entry) => entry.kind === 'group').map((entry) => entry.ref));
}

export const isViewPopped = (list: PopoutEntry[], id: string) => list.some((entry) => entry.key === popoutKey('view', id));

/** The groups the main window draws: the popped-out ones are somewhere else. */
export function visibleGroups<G extends { id: string; }>(groups: G[], list: PopoutEntry[]): G[] {
  const popped = poppedGroupIds(list);
  return groups.filter((group) => !popped.has(group.id));
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Stored or reported bounds made safe: whole numbers, a usable size, or `null` for junk. */
export function normalizeBounds(raw: unknown): PopoutBounds | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const { x, y, width, height } = raw as Record<string, unknown>;
  if (!finite(x) || !finite(y) || !finite(width) || !finite(height)) {
    return null;
  }
  return {
    x: Math.round(clamp(x, -MAX_POPOUT, MAX_POPOUT)),
    y: Math.round(clamp(y, -MAX_POPOUT, MAX_POPOUT)),
    width: Math.round(clamp(width, MIN_POPOUT.width, MAX_POPOUT)),
    height: Math.round(clamp(height, MIN_POPOUT.height, MAX_POPOUT)),
  };
}

/** The remembered bounds per view or group kind, read from storage. */
export function normalizeBoundsMap(raw: unknown): Record<string, PopoutBounds> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const out: Record<string, PopoutBounds> = {};
  for (const [key, value] of Object.entries(raw)) {
    const bounds = normalizeBounds(value);
    if (bounds) {
      out[key] = bounds;
    }
  }
  return out;
}

/** Whether two bounds differ enough to be worth writing down (a drag reports every pixel). */
export const boundsChanged = (a: PopoutBounds | null, b: PopoutBounds | null) =>
  !a || !b || a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height;

/**
 * Where a window opens the first time: near the main window, shaped like what
 * it holds — a tall column for a side view, a wide strip for a bottom one.
 */
export function defaultBounds(kind: PopoutKind, shape: 'column' | 'strip' | 'editor', parent: PopoutBounds | null): PopoutBounds {
  const sizes = {
    column: { width: 420, height: 720 },
    strip: { width: 860, height: 380 },
    editor: { width: 900, height: 640 },
  };
  const size = kind === 'group' ? sizes.editor : sizes[shape];
  const origin = parent ?? { x: 80, y: 80, width: 1440, height: 900 };
  return normalizeBounds({
    x: origin.x + Math.max(0, Math.round((origin.width - size.width) / 2)) + 32,
    y: origin.y + Math.max(0, Math.round((origin.height - size.height) / 2)) + 32,
    ...size,
  }) as PopoutBounds;
}

interface GroupLike {
  id: string;
  tabIds: string[];
  activeTabId: string | null;
}

/**
 * The group a popped-out group's tabs go back to: the one they came from while
 * that is still around, else the last group the main window draws.
 */
export function dockBackTarget<G extends { id: string; }>(groups: G[], list: PopoutEntry[], from: string | undefined): G | null {
  const visible = visibleGroups(groups, list);
  return visible.find((group) => group.id === from) ?? visible[visible.length - 1] ?? null;
}

/**
 * Take a popped-out group back: its tabs join the target group and the group
 * itself is gone. `activeGroupId` follows the tabs when the popped group was
 * the active one.
 */
export function dockGroupBack<G extends GroupLike>(
  groups: G[],
  list: PopoutEntry[],
  groupId: string,
  from: string | undefined,
  activeGroupId: string,
): { groups: G[]; activeGroupId: string; } | null {
  const popped = groups.find((group) => group.id === groupId);
  const target = dockBackTarget(groups, list, from);
  if (!popped || !target) {
    return null;
  }
  const tabIds = [...target.tabIds, ...popped.tabIds.filter((id) => !target.tabIds.includes(id))];
  const activeTabId = popped.activeTabId ?? target.activeTabId;
  const next = groups
    .filter((group) => group.id !== groupId)
    .map((group) => (group.id === target.id ? { ...group, tabIds, activeTabId } : group));
  return { groups: next, activeGroupId: activeGroupId === groupId ? target.id : activeGroupId };
}

/**
 * Groups for `commitGroups`: empty ones fall away, but the main window always
 * keeps one group of its own, even if it holds nothing (its only tab just left
 * for a window of its own).
 */
export function settleGroups<G extends GroupLike>(groups: G[], list: PopoutEntry[], fallback: () => G): G[] {
  const popped = poppedGroupIds(list);
  const kept = groups.filter((group) => group.tabIds.length > 0);
  if (kept.some((group) => !popped.has(group.id))) {
    return kept;
  }
  const home = groups.find((group) => !popped.has(group.id)) ?? fallback();
  return [home, ...kept];
}
