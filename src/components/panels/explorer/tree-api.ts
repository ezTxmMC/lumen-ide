/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import {
  clickSelection, EMPTY_SELECTION, inVisibleOrder, pathsOrFocused, single, topLevel, type TreeSelection,
} from './explorer-selection';
import { pasteInto, trashPaths } from './explorer-actions';
import {
  createEntry, DRAG_MIME, dragOverTree, dropOnTree, renameEntry, toggledPath, withPath, type Creating, type DragExpand, type TreeOps,
} from './explorer-tree-ops';
import { uriListOf } from '@/lib/files/os-drop';
import type { DirEntry } from '../../../../electron/preload';
import type { MenuState, TreeApi } from './tree-types';

export interface ApiContext {
  root: string;
  expanded: Set<string>;
  selected: DirEntry | null;
  selection: TreeSelection;
  selectionSet: Set<string>;
  cutSet: Set<string>;
  dropTarget: string | null;
  renaming: string | null;
  creating: Creating | null;
  refreshToken: number;
  isMac: boolean;
  ops: TreeOps;
  visiblePaths(): string[];
  isDirectoryRow(path: string): boolean;
  focusOnly(entry: DirEntry | null): void;
  endDrag(): void;
  showArrived(paths: string[], dir: string): void;
  refresh(): void;
  setExpanded: Dispatch<SetStateAction<Set<string>>>;
  setSelected(entry: DirEntry | null): void;
  setSelection: Dispatch<SetStateAction<TreeSelection>>;
  setRenaming(path: string | null): void;
  setCreating(job: Creating | null): void;
  setMenu(menu: MenuState | null): void;
  /** Opens every folder (and the workspace folder) above `dir`, so a row created in it is on screen. */
  revealDir(dir: string): void;
}

/** The tree's actions, bound to the state the explorer owns. */
export function buildTreeApi(c: ApiContext): TreeApi {
  const {
    root, selected, selection, selectionSet, isMac, ops, visiblePaths, focusOnly, refresh, showArrived,
    setExpanded, setSelected, setSelection, setRenaming, setCreating, setMenu, revealDir,
  } = c;
  return {
    root: c.root,
    expanded: c.expanded,
    selected,
    selection: selectionSet,
    cut: c.cutSet,
    dropTarget: c.dropTarget,
    renaming: c.renaming,
    creating: c.creating,
    refreshToken: c.refreshToken,
    toggle(path) {
      setExpanded((prev) => toggledPath(prev, path));
    },
    expand(path) {
      setExpanded((prev) => withPath(prev, path));
    },
    select: focusOnly,
    click(event, entry) {
      const modifiers = { toggle: isMac ? event.metaKey : event.ctrlKey, range: event.shiftKey };
      setSelected(entry);
      setSelection((prev) => clickSelection(prev, entry.path, visiblePaths(), modifiers));
      return !modifiers.toggle && !modifiers.range;
    },
    dragStart(event, entry) {
      const dragged = selectionSet.has(entry.path) ? topLevel(selection.paths, visiblePaths()) : [entry.path];
      if (!selectionSet.has(entry.path)) {
        focusOnly(entry);
      }
      event.dataTransfer.setData(DRAG_MIME, JSON.stringify(dragged));
      event.dataTransfer.setData('text/plain', dragged.join('\n'));
      // Also as files, for a drop into the OS file manager.
      event.dataTransfer.setData('text/uri-list', uriListOf(dragged));
      event.dataTransfer.effectAllowed = 'copyMove';
    },
    dragOver: (event, dir, folder) => dragOverTree(event, dir, folder, ops),
    drop: (event, dir) => dropOnTree(event, dir, ops),
    dragEnd: c.endDrag,
    async removeSelection() {
      const paths = pathsOrFocused(selection.paths, selected);
      const removed = await trashPaths(paths, c.isDirectoryRow);
      if (!removed.length) {
        return;
      }
      focusOnly(null);
      refresh();
    },
    async paste(dir) {
      showArrived(await pasteInto(dir), dir);
    },
    selectedPaths: () => inVisibleOrder(selection.paths, visiblePaths()),
    startRename(path) {
      setCreating(null);
      setRenaming(path);
    },
    startCreate(isDir, dir) {
      setRenaming(null);
      const target = dir ?? root;
      // Expanding only the target is not enough: with a collapsed parent (or workspace folder) the
      // input row is never drawn, `creating` stays set, and the tree swallows every key.
      revealDir(target);
      setCreating({ dir: target, isDir });
    },
    cancelCreate() {
      setCreating(null);
    },
    async commitCreate(name) {
      const job = c.creating;
      setCreating(null);
      if (!job) {
        return;
      }
      await createEntry(job, name, ops);
    },
    async commitRename(entry, name) {
      setRenaming(null);
      await renameEntry(entry, name, ops);
    },
    async remove(entry) {
      const removed = await trashPaths([entry.path], () => entry.isDirectory);
      if (!removed.length) {
        return;
      }
      if (selected?.path === entry.path) {
        setSelected(null);
      }
      setSelection((prev) => ({ ...prev, paths: prev.paths.filter((p) => p !== entry.path) }));
      refresh();
    },
    openMenu(event, entry) {
      event.preventDefault();
      event.stopPropagation();
      // A right-click inside the selection keeps it; elsewhere it selects just that row.
      if (entry && selectionSet.has(entry.path)) {
        setSelected(entry);
      }
      if (entry && !selectionSet.has(entry.path)) {
        focusOnly(entry);
      }
      setMenu({ x: event.clientX, y: event.clientY, entry });
    },
  };
}

interface TreeCallbackDeps {
  container: React.RefObject<HTMLDivElement | null>;
  dragExpand: React.MutableRefObject<DragExpand | null>;
  workspace: string | null;
  refresh(): void;
  setExpanded: Dispatch<SetStateAction<Set<string>>>;
  setSelected(entry: DirEntry | null): void;
  setSelection: Dispatch<SetStateAction<TreeSelection>>;
  setDropTarget(dir: string | null): void;
}

/** The stable helpers the tree's actions share: reading the DOM order, focusing, dragging, showing arrivals. */
export function useTreeCallbacks(d: TreeCallbackDeps) {
  const { container, dragExpand, workspace, refresh, setExpanded, setSelected, setSelection, setDropTarget } = d;
  /** The rows as the tree shows them right now — the order Shift ranges and Ctrl+A follow. */
  const visiblePaths = useCallback(() => {
    const rows = container.current?.querySelectorAll<HTMLElement>('[role="treeitem"][data-path]') ?? [];
    return [...rows].map((row) => row.dataset.path ?? '').filter(Boolean);
  }, [container]);
  const isDirectoryRow = useCallback(
    (path: string) => Boolean(container.current?.querySelector(`[data-path="${CSS.escape(path)}"]`)?.hasAttribute('data-dir')),
    [container],
  );
  /** Focus and select exactly this row (or nothing). */
  const focusOnly = useCallback((entry: DirEntry | null) => {
    setSelected(entry);
    setSelection(entry ? single(entry.path) : EMPTY_SELECTION);
  }, [setSelected, setSelection]);
  const endDrag = useCallback(() => {
    setDropTarget(null);
    if (dragExpand.current) {
      clearTimeout(dragExpand.current.timer);
    }
    dragExpand.current = null;
  }, [setDropTarget, dragExpand]);
  /** After moving, copying or pasting: show and select what arrived. */
  const showArrived = useCallback((paths: string[], dir: string) => {
    if (!paths.length) {
      return;
    }
    if (dir !== workspace) {
      setExpanded((prev) => withPath(prev, dir));
    }
    setSelected(null);
    setSelection({ paths, anchor: paths[0] });
    refresh();
  }, [workspace, refresh, setExpanded, setSelected, setSelection]);
  return { visiblePaths, isDirectoryRow, focusOnly, endDrag, showArrived };
}
