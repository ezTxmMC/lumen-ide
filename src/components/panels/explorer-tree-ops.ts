/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { t } from '@/i18n';
import { copyPathsInto, copyPaths, cutPaths, movePaths } from './explorer-actions';
import { EMPTY_SELECTION, selectAll, type TreeSelection } from './explorer-selection';
import { onFsChanged } from '@/lib/fs-events';
import type { DirEntry } from '../../../electron/preload';

/*
 * The mutations behind the explorer tree, kept apart from the components so
 * Explorer only wires state to them.
 */

export interface Creating {
  /** The folder the new entry is created in. */
  dir: string;
  isDir: boolean;
}

/** Paths dragged within the tree — other drops (files from the desktop) are not ours. */
export const DRAG_MIME = 'application/x-lumen-paths';
/** Hovering a closed folder while dragging opens it after this long. */
const DRAG_EXPAND_MS = 650;

export const parentOf = (path: string) => path.replace(/[\\/][^\\/]+$/, '');

type ExpandedSetter = Dispatch<SetStateAction<Set<string>>>;

export interface DragExpand {
  path: string;
  timer: ReturnType<typeof setTimeout>;
}

/** What the tree operations need from the component that owns the state. */
export interface TreeOps {
  isMac: boolean;
  notify(message: string, kind?: 'warning' | 'error'): void;
  openFile(path: string, preview?: boolean): Promise<unknown>;
  pathRenamed(from: string, to: string): void;
  refresh(): void;
  focusOnly(entry: DirEntry | null): void;
  setExpanded: ExpandedSetter;
  setDropTarget(dir: string | null): void;
  dragExpand: MutableRefObject<DragExpand | null>;
  endDrag(): void;
  showArrived(paths: string[], dir: string): void;
}

/* ------------------------------------------------------------------ *
 * Expanded-set helpers
 * ------------------------------------------------------------------ */

export function withPath(prev: Set<string>, path: string): Set<string> {
  return new Set(prev).add(path);
}

export function toggledPath(prev: Set<string>, path: string): Set<string> {
  const next = new Set(prev);
  if (next.has(path)) {
    next.delete(path);
    return next;
  }
  next.add(path);
  return next;
}

/** Adds every folder along `parts` below `dir`. */
function withChain(prev: Set<string>, dir: string, parts: string[]): Set<string> {
  const next = new Set(prev);
  let current = dir;
  for (const part of parts) {
    current = `${current}/${part}`;
    next.add(current);
  }
  return next;
}

/** Expanded folders below a renamed path follow it to the new name. */
function remapExpanded(prev: Set<string>, from: string, to: string): Set<string> {
  if (!prev.has(from)) {
    return prev;
  }
  const next = new Set<string>();
  for (const p of prev) {
    next.add(p === from || p.startsWith(`${from}/`) ? `${to}${p.slice(from.length)}` : p);
  }
  return next;
}

/* ------------------------------------------------------------------ *
 * Drag and drop
 * ------------------------------------------------------------------ */

export function dragOverTree(event: React.DragEvent, dir: string, folder: string | undefined, ops: TreeOps) {
  if (!event.dataTransfer.types.includes(DRAG_MIME)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = (ops.isMac ? event.altKey : event.ctrlKey) ? 'copy' : 'move';
  ops.setDropTarget(dir);
  const pending = ops.dragExpand.current;
  if (pending?.path === folder) {
    return;
  }
  if (pending) {
    clearTimeout(pending.timer);
  }
  ops.dragExpand.current = null;
  if (!folder) {
    return;
  }
  const timer = setTimeout(() => {
    ops.dragExpand.current = null;
    ops.setExpanded((prev) => withPath(prev, folder));
  }, DRAG_EXPAND_MS);
  ops.dragExpand.current = { path: folder, timer };
}

export function dropOnTree(event: React.DragEvent, dir: string, ops: TreeOps) {
  if (!event.dataTransfer.types.includes(DRAG_MIME)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  ops.endDrag();
  let dragged: unknown;
  try {
    dragged = JSON.parse(event.dataTransfer.getData(DRAG_MIME));
  } catch {
    return;
  }
  if (!Array.isArray(dragged)) {
    return;
  }
  const paths = dragged.filter((p): p is string => typeof p === 'string');
  // Ctrl (Option on macOS) held while dropping copies instead of moving.
  const copy = ops.isMac ? event.altKey : event.ctrlKey;
  void (copy ? copyPathsInto(paths, dir) : movePaths(paths, dir)).then((arrived) => ops.showArrived(arrived, dir));
}

/* ------------------------------------------------------------------ *
 * Create and rename
 * ------------------------------------------------------------------ */

// eslint-disable-next-line no-control-regex
const NAME_FORBIDDEN = /[<>"|?*\u0000-\u001f]/;

function validateName(name: string): string | null {
  if (!name) {
    return t('explorer.nameMissing');
  }
  if (NAME_FORBIDDEN.test(name)) {
    return t('explorer.nameInvalidChars');
  }
  if (name.split(/[\\/]/).some((part) => part === '..')) {
    return t('explorer.nameDotDot');
  }
  if (/^[\\/]/.test(name)) {
    return t('explorer.nameLeadingSlash');
  }
  return null;
}

export async function createEntry(job: Creating, name: string, ops: TreeOps) {
  const problem = validateName(name);
  if (problem) {
    ops.notify(problem, 'warning');
    return;
  }
  const clean = name.replace(/[\\/]+$/, '');
  const target = `${job.dir}/${clean}`;
  // “folder/file.ts” creates the intermediate folders; a trailing “/” makes a folder.
  const isDir = job.isDir || /[\\/]$/.test(name);
  try {
    await window.lumen.fs.create(target, isDir);
  } catch (err) {
    ops.notify((err as Error).message.replace(/^Error: /, ''), 'error');
    return;
  }
  // Expand the intermediate folders and the target.
  const parts = clean.split(/[\\/]/);
  ops.setExpanded((prev) => withChain(withPath(prev, job.dir), job.dir, isDir ? parts : parts.slice(0, -1)));
  ops.focusOnly({ name: parts[parts.length - 1] ?? clean, path: target, isDirectory: isDir });
  ops.refresh();
  if (isDir) {
    return;
  }
  await ops.openFile(target).catch(() => {});
}

export async function renameEntry(entry: DirEntry, name: string, ops: TreeOps) {
  if (name === entry.name) {
    return;
  }
  const problem = validateName(name);
  if (problem) {
    ops.notify(problem, 'warning');
    return;
  }
  const target = `${parentOf(entry.path)}/${name}`;
  try {
    await window.lumen.fs.rename(entry.path, target);
  } catch (err) {
    ops.notify((err as Error).message.replace(/^Error: /, ''), 'error');
    return;
  }
  ops.pathRenamed(entry.path, target);
  ops.setExpanded((prev) => remapExpanded(prev, entry.path, target));
  ops.focusOnly({ ...entry, name, path: target });
  ops.refresh();
}

/* ------------------------------------------------------------------ *
 * Keyboard
 * ------------------------------------------------------------------ */

export interface KeyContext {
  isMac: boolean;
  selection: TreeSelection;
  selected: DirEntry | null;
  visiblePaths(): string[];
  selectedPaths(): string[];
  selectedDir(): string;
  setSelection: Dispatch<SetStateAction<TreeSelection>>;
  paste(dir: string): Promise<void>;
  removeSelection(): Promise<void>;
  startRename(path: string): void;
  toggle(path: string): void;
  openFile(path: string): Promise<unknown>;
}

export function handleTreeKey(event: React.KeyboardEvent, ctx: KeyContext) {
  const { isMac, selection, selected } = ctx;
  const mod = isMac ? event.metaKey : event.ctrlKey;
  const key = event.key.toLowerCase();
  if (mod && key === 'a') {
    event.preventDefault();
    ctx.setSelection(selectAll(ctx.visiblePaths()));
    return;
  }
  if (event.key === 'Escape') {
    if (!selection.paths.length) {
      return;
    }
    event.preventDefault();
    ctx.setSelection(EMPTY_SELECTION);
    return;
  }
  if (mod && key === 'v') {
    event.preventDefault();
    void ctx.paste(ctx.selectedDir());
    return;
  }
  const paths = selection.paths.length ? ctx.selectedPaths() : selected ? [selected.path] : [];
  if (mod && (key === 'c' || key === 'x') && paths.length) {
    event.preventDefault();
    if (key === 'c') {
      copyPaths(paths);
    }
    if (key === 'x') {
      cutPaths(paths);
    }
    return;
  }
  if ((event.key === 'Delete' || (isMac && event.metaKey && event.key === 'Backspace')) && paths.length) {
    event.preventDefault();
    void ctx.removeSelection();
    return;
  }
  if (!selected) {
    return;
  }
  if (event.key === 'F2') {
    event.preventDefault();
    ctx.startRename(selected.path);
    return;
  }
  if (event.key !== 'Enter') {
    return;
  }
  event.preventDefault();
  if (selected.isDirectory) {
    ctx.toggle(selected.path);
    return;
  }
  void ctx.openFile(selected.path);
}

/* ------------------------------------------------------------------ *
 * Effects
 * ------------------------------------------------------------------ */

/** Refreshing itself: file system events and window focus. */
export function useRefreshTriggers(refresh: () => void) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    // At most one pending refresh — restarting the wait on every batch would
    // hold the tree back for as long as something keeps writing.
    const schedule = () => {
      if (timer) {
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        refresh();
      }, 120);
    };
    const offFs = onFsChanged(schedule);
    window.addEventListener('focus', schedule);
    return () => {
      offFs();
      window.removeEventListener('focus', schedule);
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [refresh]);
}

/** Reveal the active file in the tree, inside whichever workspace folder holds it. */
export function useRevealActive(
  workspace: string | null, extraFolders: string[], activePath: string | null, setExpanded: ExpandedSetter,
) {
  useEffect(() => {
    const owner = [workspace, ...extraFolders].find((dir): dir is string => Boolean(dir && activePath?.startsWith(`${dir}/`)));
    if (!activePath || !owner) {
      return;
    }
    const parts = activePath.slice(owner.length + 1).split('/').slice(0, -1);
    if (!parts.length) {
      return;
    }
    setExpanded((prev) => withChain(prev, owner, parts));
  }, [activePath, workspace, extraFolders, setExpanded]);
}
