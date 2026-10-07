/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/state/store';
import { NewJvmDialog } from '../../dialogs/runtime/NewJvmDialog';
import { keepVisible, EMPTY_SELECTION, type TreeSelection } from './explorer-selection';
import { useFileClipboard } from './explorer-actions';
import {
  handleTreeKey, parentOf, toggledPath, useRefreshTriggers, useRevealActive, withChain, type Creating, type DragExpand, type TreeOps,
} from './explorer-tree-ops';
import type { DirEntry } from '../../../../electron/preload';
import { buildTreeApi, useTreeCallbacks } from './tree-api';
import { ContextMenu } from './ExplorerContextMenu';
import { ExplorerHeader, NoWorkspaceView, TreeBody } from './ExplorerChrome';
import { useChildren } from './TreeNodes';
import type { MenuState, TreeApi } from './tree-types';

export function Explorer() {
  const workspace = useStore((s) => s.workspace);
  const extraFolders = useStore((s) => s.extraFolders);
  const notify = useStore((s) => s.notify);
  const openFile = useStore((s) => s.openFile);
  const pathRenamed = useStore((s) => s.pathRenamed);
  const activePath = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.path ?? null);
  const isMac = useStore((s) => s.platform === 'darwin');

  const [refreshToken, setRefreshToken] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<DirEntry | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [creating, setCreating] = useState<Creating | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [selection, setSelection] = useState<TreeSelection>(EMPTY_SELECTION);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragExpand = useRef<DragExpand | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const clipboard = useFileClipboard();
  const selectionSet = useMemo(() => new Set(selection.paths), [selection]);
  const cutSet = useMemo(() => new Set(clipboard?.mode === 'cut' ? clipboard.paths : []), [clipboard]);

  const refresh = useCallback(() => setRefreshToken((v) => v + 1), []);

  const { visiblePaths, isDirectoryRow, focusOnly, endDrag, showArrived } = useTreeCallbacks({
    container, dragExpand, workspace, refresh, setExpanded, setSelected, setSelection, setDropTarget,
  });
  const [collapsedRoots, setCollapsedRoots] = useState<Set<string>>(new Set());
  const toggleRoot = (path: string) => setCollapsedRoots((prev) => toggledPath(prev, path));
  const root = workspace ?? '';
  const { entries } = useChildren(root, Boolean(workspace), refreshToken);

  const revealDir = useCallback((dir: string) => {
    const owner = [workspace, ...extraFolders].find((folder): folder is string => Boolean(folder && (dir === folder || dir.startsWith(`${folder}/`))));
    if (!owner) {
      return;
    }
    setCollapsedRoots((prev) => {
      if (!prev.has(owner)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(owner);
      return next;
    });
    setExpanded((prev) => withChain(prev, owner, dir.slice(owner.length + 1).split('/').filter(Boolean)));
  }, [workspace, extraFolders]);

  // A new workspace folder: reset the tree state.
  useEffect(() => {
    setExpanded(new Set());
    setSelected(null);
    setSelection(EMPTY_SELECTION);
    setRenaming(null);
    setCreating(null);
  }, [workspace]);

  // Rows that went away (deleted outside, folder collapsed) leave the selection.
  useEffect(() => {
    const timer = setTimeout(() => setSelection((prev) => keepVisible(prev, visiblePaths())), 400);
    return () => clearTimeout(timer);
  }, [refreshToken, expanded, collapsedRoots, visiblePaths]);

  useRefreshTriggers(refresh);
  useRevealActive(workspace, extraFolders, activePath, setExpanded);

  const selectedDir = (): string => {
    if (!selected) {
      return root;
    }
    return selected.isDirectory ? selected.path : parentOf(selected.path);
  };

  const ops: TreeOps = useMemo(() => ({
    isMac, notify, openFile, pathRenamed, refresh, focusOnly, setExpanded, setDropTarget, dragExpand, endDrag, showArrived,
  }), [isMac, notify, openFile, pathRenamed, refresh, focusOnly, endDrag, showArrived]);

  const api: TreeApi = useMemo(() => buildTreeApi({
    root, expanded, selected, selection, selectionSet, cutSet, dropTarget, renaming, creating, refreshToken, isMac,
    ops, visiblePaths, isDirectoryRow, focusOnly, endDrag, showArrived, refresh,
    setExpanded, setSelected, setSelection, setRenaming, setCreating, setMenu, revealDir,
  }), [
    root, expanded, selected, selection, selectionSet, cutSet, dropTarget, renaming, creating, refreshToken, isMac,
    refresh, visiblePaths, isDirectoryRow, focusOnly, endDrag, showArrived, ops, revealDir,
  ]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (renaming || creating) {
      // The name input stops its own keys; one that arrives here means it has lost the focus — Escape must still get out.
      if (event.key === 'Escape') {
        setCreating(null);
        setRenaming(null);
      }
      return;
    }
    handleTreeKey(event, {
      isMac, selection, selected, visiblePaths, selectedDir, setSelection, openFile,
      selectedPaths: api.selectedPaths,
      paste: api.paste,
      removeSelection: api.removeSelection,
      startRename: api.startRename,
      toggle: api.toggle,
    });
  };

  if (!workspace) {
    return <NoWorkspaceView />;
  }

  return (
    <div className="flex h-full flex-col">
      <ExplorerHeader
        workspace={workspace}
        extraFolders={extraFolders}
        onCreate={(isDir) => api.startCreate(isDir, selectedDir())}
        onRefresh={refresh}
        onCollapseAll={() => setExpanded(new Set())}
      />

      <TreeBody
        api={api}
        containerRef={container}
        entries={entries}
        extraFolders={extraFolders}
        collapsedRoots={collapsedRoots}
        onToggleRoot={toggleRoot}
        onKeyDown={onKeyDown}
        focusOnly={focusOnly}
        endDrag={endDrag}
      />

      {menu && <ContextMenu menu={menu} api={api} onClose={() => setMenu(null)} />}
      <NewJvmDialog />
    </div>
  );
}
