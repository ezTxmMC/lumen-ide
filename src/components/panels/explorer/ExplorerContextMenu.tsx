/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import {
  Boxes, Clipboard, ClipboardPaste, Copy, ExternalLink, FilePlus, Package, FolderPlus, PenLine, Scissors, SquareTerminal, Trash2,
} from 'lucide-react';
import { useStore } from '@/state/store';
import { useT } from '@/i18n';
import { openNewJvm } from '@/lib/project/new-jvm-class';
import { openNewModule } from '@/lib/project/new-module';
import { formatBinding } from '@/core/keybindings';
import { ContextMenu as SharedContextMenu, type MenuItem } from '../../ui/ContextMenu';
import { copyPathText, copyPaths, cutPaths } from './explorer-actions';
import { parentOf } from './explorer-tree-ops';
import { openWith, openWithHandlers } from '@/core/extensions/integration/open-with';
import type { DirEntry } from '../../../../electron/preload';
import type { MenuState, TreeApi } from './tree-types';

/** The folder the context menu creates in: the entry itself, its parent, or the root. */
function menuDir(entry: DirEntry | null, root: string) {
  if (!entry) {
    return root;
  }
  return entry.isDirectory ? entry.path : parentOf(entry.path);
}

export function ContextMenu({ menu, api, onClose }: { menu: MenuState; api: TreeApi; onClose: () => void; }) {
  const t = useT();
  const entry = menu.entry;
  const dir = menuDir(entry, api.root);
  const paste: MenuItem = {
    label: t('explorer.paste'), icon: ClipboardPaste, hint: formatBinding('Ctrl+V'), run: () => void api.paste(dir),
  };

  // Several rows selected and the menu opened on one of them: what makes sense for all at once.
  if (entry && api.selection.has(entry.path) && api.selection.size > 1) {
    const paths = api.selectedPaths();
    const batch: MenuItem[] = [
      { label: t('explorer.cut'), icon: Scissors, hint: formatBinding('Ctrl+X'), run: () => cutPaths(paths) },
      { label: t('explorer.copy'), icon: Copy, hint: formatBinding('Ctrl+C'), run: () => copyPaths(paths) },
      paste,
      'sep',
      {
        label: t('explorer.deleteSelected', { count: paths.length }), icon: Trash2, hint: formatBinding('Delete'), danger: true,
        run: () => void api.removeSelection(),
      },
      'sep',
      { label: t('explorer.copyPaths'), icon: Clipboard, run: () => void copyPathText(paths, false) },
      { label: t('explorer.copyRelativePaths'), icon: Clipboard, run: () => void copyPathText(paths, true) },
    ];
    return <SharedContextMenu x={menu.x} y={menu.y} items={batch} onClose={onClose} />;
  }

  const openTerminal = useStore.getState().openTerminal;
  const openExternalTerminal = useStore.getState().openExternalTerminal;
  const jvmLanguages = useStore.getState().project?.languages ?? [];
  const isJvm = jvmLanguages.includes('java') || jvmLanguages.includes('kotlin');
  const items: MenuItem[] = [
    ...(isJvm ? [
      { label: t('explorer.jvmNewClass'), icon: FilePlus, run: () => openNewJvm(dir, 'class') },
      { label: t('explorer.jvmNewPackage'), icon: Package, run: () => openNewJvm(dir, 'package') },
      { label: t('explorer.moduleNew'), icon: Boxes, run: () => void openNewModule(dir) },
      'sep' as const,
    ] : []),
    { label: t('explorer.newFile'), icon: FilePlus, run: () => api.startCreate(false, dir) },
    { label: t('explorer.newFolder'), icon: FolderPlus, run: () => api.startCreate(true, dir) },
    'sep',
    { label: t('explorer.openInTerminal'), icon: SquareTerminal, run: () => void openTerminal({ cwd: dir }) },
    { label: t('explorer.openInExternalTerminal'), icon: ExternalLink, run: () => void openExternalTerminal(dir) },
  ];
  // Extensions that open this kind of file themselves (a database viewer, say).
  const handlers = entry && !entry.isDirectory ? openWithHandlers(entry.path) : [];
  if (handlers.length) {
    items.push('sep', ...handlers.map((handler): MenuItem => ({
      label: t('extensionView.openWith.menu', { title: handler.title }), run: () => void openWith(handler, entry!.path),
    })));
  }
  if (!entry) {
    // Nothing under the pointer: the project root is what these act on.
    items.push(
      'sep',
      paste,
      'sep',
      { label: t('shell.groups.copyPath'), icon: Clipboard, run: () => void copyPathText([dir], false) },
      { label: t('explorer.revealInFileManager'), icon: ExternalLink, run: () => void window.lumen.shell.showItemInFolder(dir) },
    );
  }
  if (entry) {
    items.push(
      'sep',
      { label: t('explorer.cut'), icon: Scissors, hint: formatBinding('Ctrl+X'), run: () => cutPaths([entry.path]) },
      { label: t('explorer.copy'), icon: Copy, hint: formatBinding('Ctrl+C'), run: () => copyPaths([entry.path]) },
      paste,
      'sep',
      { label: t('explorer.rename'), icon: PenLine, hint: formatBinding('F2'), run: () => api.startRename(entry.path) },
      { label: t('common.delete'), icon: Trash2, hint: formatBinding('Delete'), danger: true, run: () => void api.remove(entry) },
      'sep',
      { label: t('shell.groups.copyPath'), icon: Clipboard, run: () => void copyPathText([entry.path], false) },
      { label: t('explorer.copyRelativePath'), icon: Clipboard, run: () => void copyPathText([entry.path], true) },
      { label: t('explorer.revealInFileManager'), icon: ExternalLink, run: () => void window.lumen.shell.showItemInFolder(entry.path) },
    );
  }

  return <SharedContextMenu x={menu.x} y={menu.y} items={items} onClose={onClose} />;
}
