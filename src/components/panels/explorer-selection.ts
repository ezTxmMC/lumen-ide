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
 * Selection in the file tree, as pure functions: what a click with or without
 * modifiers makes of the selection, and what a batch operation (delete, move,
 * copy) should really act on. The tree hands in the rows in their visible
 * order; nothing here touches the DOM or the disk.
 */

export interface TreeSelection {
  /** Selected paths, in the order they were added. */
  paths: string[];
  /** Where a Shift range starts: the row clicked last without Shift. */
  anchor: string | null;
}

export const EMPTY_SELECTION: TreeSelection = { paths: [], anchor: null };

export interface ClickModifiers {
  /** Ctrl, or Cmd on macOS: add or remove one row. */
  toggle: boolean;
  /** Shift: the rows from the anchor to this one. */
  range: boolean;
}

const SEPARATOR = /[\\/]/;

export const baseName = (path: string) => path.split(SEPARATOR).pop() ?? path;
export const parentDir = (path: string) => path.replace(/[\\/][^\\/]+$/, '');

/** Is `path` the folder `dir` or somewhere inside it? */
export function isWithin(dir: string, path: string) {
  if (path === dir) {
    return true;
  }
  return path.startsWith(`${dir}/`) || path.startsWith(`${dir}\\`);
}

/** Only the given row. */
export function single(path: string): TreeSelection {
  return { paths: [path], anchor: path };
}

function rangeBetween(visible: string[], from: string, to: string): string[] | null {
  const start = visible.indexOf(from);
  const end = visible.indexOf(to);
  if (start === -1 || end === -1) {
    return null;
  }
  const [low, high] = start <= end ? [start, end] : [end, start];
  return visible.slice(low, high + 1);
}

/** The selection after clicking `path`; `visible` is every row in its on-screen order. */
export function clickSelection(
  current: TreeSelection, path: string, visible: string[], modifiers: ClickModifiers,
): TreeSelection {
  if (modifiers.range) {
    const range = rangeBetween(visible, current.anchor ?? path, path);
    // The anchor scrolled out of view (its folder collapsed): start afresh here.
    if (!range) {
      return single(path);
    }
    if (!modifiers.toggle) {
      return { paths: range, anchor: current.anchor ?? path };
    }
    const merged = [...current.paths, ...range.filter((p) => !current.paths.includes(p))];
    return { paths: merged, anchor: current.anchor ?? path };
  }
  if (modifiers.toggle) {
    if (current.paths.includes(path)) {
      return { paths: current.paths.filter((p) => p !== path), anchor: path };
    }
    return { paths: [...current.paths, path], anchor: path };
  }
  return single(path);
}

/** Every visible row. */
export function selectAll(visible: string[]): TreeSelection {
  return { paths: [...visible], anchor: visible[0] ?? null };
}

/** Drop rows that no longer exist (deleted, renamed, folder collapsed away). */
export function keepVisible(current: TreeSelection, visible: string[]): TreeSelection {
  const present = new Set(visible);
  const paths = current.paths.filter((p) => present.has(p));
  if (paths.length === current.paths.length) {
    return current;
  }
  return { paths, anchor: current.anchor && present.has(current.anchor) ? current.anchor : paths[0] ?? null };
}

/** Paths sorted the way the tree shows them; unknown ones go last. */
export function inVisibleOrder(paths: string[], visible: string[]): string[] {
  const order = (p: string) => {
    const index = visible.indexOf(p);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return [...paths].sort((a, b) => order(a) - order(b));
}

/**
 * The paths a batch operation acts on: a folder takes its contents along, so
 * anything selected inside a selected folder is dropped. Visible order is kept
 * where known.
 */
export function topLevel(paths: string[], visible: string[] = []): string[] {
  const unique = [...new Set(paths)];
  return inVisibleOrder(unique.filter((p) => !unique.some((other) => other !== p && isWithin(other, p))), visible);
}

export interface PlannedMove {
  from: string;
  to: string;
}

export interface MovePlan {
  moves: PlannedMove[];
  /** Already in the target folder — nothing to do. */
  unchanged: string[];
  /** A folder dropped onto itself or into its own subfolder. */
  invalid: string[];
}

/** Moving the (top-level) `paths` into the folder `target`. */
export function planMove(paths: string[], target: string): MovePlan {
  const plan: MovePlan = { moves: [], unchanged: [], invalid: [] };
  for (const from of topLevel(paths)) {
    if (isWithin(from, target)) {
      plan.invalid.push(from);
      continue;
    }
    if (parentDir(from) === target) {
      plan.unchanged.push(from);
      continue;
    }
    plan.moves.push({ from, to: `${target}/${baseName(from)}` });
  }
  return plan;
}

/**
 * A free name for a copy: "name.ts" → "name copy.ts" → "name copy 2.ts".
 * `taken` says whether a name is in use in the target folder.
 */
export function copyName(name: string, taken: (candidate: string) => boolean): string {
  if (!taken(name)) {
    return name;
  }
  const dot = name.lastIndexOf('.');
  const hasExtension = dot > 0;
  const stem = hasExtension ? name.slice(0, dot) : name;
  const extension = hasExtension ? name.slice(dot) : '';
  const first = `${stem} copy${extension}`;
  if (!taken(first)) {
    return first;
  }
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${stem} copy ${n}${extension}`;
    if (!taken(candidate)) {
      return candidate;
    }
  }
  return `${stem} copy ${Date.now()}${extension}`;
}
