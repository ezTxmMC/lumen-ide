/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useState } from 'react';
import { ChevronRight, ChevronsDownUp, Clipboard, ExternalLink, FilePlus, FolderInput, FolderOpen, FolderPlus, RefreshCw, X } from 'lucide-react';
import { useStore } from '@/state/store';
import { useMinecraftFolderIcon } from '@/lib/files/minecraft-icon';
import { useT } from '@/i18n';
import { Button, Empty } from '../../ui';
import { ContextMenu as SharedContextMenu } from '../../ui/ContextMenu';
import { copyPathText } from './explorer-actions';
import { sortedByName } from './folder-chain';
import { Children, CreateRow, useChildren } from './TreeNodes';
import type { DirEntry } from '../../../../electron/preload';
import type { TreeApi } from './tree-types';

export function NoWorkspaceView() {
  const t = useT();
  const openFolder = useStore((s) => s.openFolder);
  const recent = useStore((s) => s.recentProjects);
  const setWorkspace = useStore((s) => s.setWorkspace);
  const setNewProjectOpen = useStore((s) => s.setNewProjectOpen);
  return (
    <div className="flex flex-col">
      <Empty
        icon={<FolderOpen size={26} strokeWidth={1.4} />}
        title={t('explorer.noFolder')}
        hint={t('explorer.noFolderHint')}
      />
      <div className="flex flex-col gap-1.5 px-3">
        <Button variant="outline" onClick={() => void openFolder()} className="w-full">
          {t('explorer.openFolder')}
        </Button>
        <Button variant="ghost" onClick={() => setNewProjectOpen(true)} className="w-full">
          {t('explorer.newProject')}
        </Button>
      </div>
      {recent.length > 0 && (
        <div className="mt-5 px-3">
          <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">
            {t('explorer.recent')}
          </div>
          {recent.map((p) => (
            <button
              key={p.path}
              onClick={() => void setWorkspace(p.path)}
              className="lm-transition block w-full truncate rounded-lumen-sm px-2 py-1 text-left text-[12px] text-muted hover:bg-hover hover:text-fg"
              title={p.path}
            >
              {p.name}
              {p.kind && <span className="ml-1.5 text-[10px] text-subtle">{p.kind}</span>}
              <span className="ml-2 text-[10.5px] text-subtle">{p.path}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExplorerHeader({ workspace, extraFolders, onCreate, onRefresh, onCollapseAll }: {
  workspace: string;
  extraFolders: string[];
  onCreate(isDir: boolean): void;
  onRefresh(): void;
  onCollapseAll(): void;
}) {
  const t = useT();
  const workspaceName = useStore((s) => s.workspaces.find((w) => w.id === s.currentWorkspaceId)?.name ?? null);
  const multiRoot = extraFolders.length > 0;
  const baseName = workspace.split(/[\\/]/).filter(Boolean).pop();
  const image = useMinecraftFolderIcon(multiRoot ? '' : workspace);
  return (
    <div className="flex items-center gap-1 border-b border-edge px-2 py-1.5">
      {image && <img src={image} width={14} height={14} alt="" className="shrink-0" draggable={false} />}
      <span
        className="flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.07em] text-muted"
        title={multiRoot ? [workspace, ...extraFolders].join('\n') : workspace}
      >
        {multiRoot ? (workspaceName ?? baseName) : baseName}
      </span>
      <Button size="sm" title={t('workspaces.addFolder')} onClick={() => void useStore.getState().addFolderToWorkspace()}>
        <FolderInput size={13} />
      </Button>
      <Button size="sm" title={t('explorer.newFileInSelected')} onClick={() => onCreate(false)}>
        <FilePlus size={13} />
      </Button>
      <Button size="sm" title={t('explorer.newFolderInSelected')} onClick={() => onCreate(true)}>
        <FolderPlus size={13} />
      </Button>
      <Button size="sm" title={t('explorer.refresh')} onClick={onRefresh}>
        <RefreshCw size={13} />
      </Button>
      <Button size="sm" title={t('explorer.collapseAll')} onClick={onCollapseAll}>
        <ChevronsDownUp size={13} />
      </Button>
    </div>
  );
}

export function TreeBody({ api, containerRef, entries, extraFolders, collapsedRoots, onToggleRoot, onKeyDown, focusOnly, endDrag }: {
  api: TreeApi;
  containerRef: React.RefObject<HTMLDivElement | null>;
  entries: DirEntry[] | null;
  extraFolders: string[];
  collapsedRoots: Set<string>;
  onToggleRoot(path: string): void;
  onKeyDown(event: React.KeyboardEvent): void;
  focusOnly(entry: DirEntry | null): void;
  endDrag(): void;
}) {
  const t = useT();
  const root = api.root;
  const creating = api.creating;
  const multiRoot = extraFolders.length > 0;
  return (
    <div
      ref={containerRef}
      role="tree"
      tabIndex={0}
      aria-multiselectable
      className={['flex-1 overflow-y-auto py-1 outline-none', api.dropTarget === root ? 'bg-accent/5' : ''].join(' ')}
      onKeyDown={onKeyDown}
      onClick={(e) => { if (e.target === e.currentTarget) {
        focusOnly(null);
      } }}
      onContextMenu={(e) => api.openMenu(e, null)}
      onDragOver={(e) => api.dragOver(e, root)}
      onDrop={(e) => api.drop(e, root)}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
        endDrag();
      } }}
    >
      {!multiRoot && creating?.dir === root && <CreateRow depth={0} api={api} />}
      {!multiRoot && entries && <Children entries={entries} depth={0} api={api} parent={null} />}
      {!multiRoot && entries?.length === 0 && !creating && <Empty title={t('explorer.folderEmpty')} hint={t('explorer.folderEmptyHint')} />}
      {/* Several folders: all alike, each collapsible, in the order of their names. */}
      {multiRoot && sortedByName([root, ...extraFolders]).map((folder) => (
        <ExtraRoot
          key={folder}
          path={folder}
          api={api}
          collapsed={collapsedRoots.has(folder)}
          onToggle={() => onToggleRoot(folder)}
        />
      ))}
      <div className="h-8" onClick={() => focusOnly(null)} onContextMenu={(e) => api.openMenu(e, null)} />
    </div>
  );
}

function RootHeader({ path, api, collapsed, onToggle }: {
  path: string;
  api: TreeApi;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const t = useT();
  const image = useMinecraftFolderIcon(path);
  const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
  const [menu, setMenu] = useState<{ x: number; y: number; } | null>(null);
  return (
    <div
      className="lm-transition group mt-1 flex h-7 items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted hover:bg-hover"
      title={path}
      onClick={onToggle}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY }); }}
    >
      <ChevronRight size={12} className={`lm-transition shrink-0 ${collapsed ? '' : 'rotate-90'}`} />
      {image && <img src={image} width={13} height={13} alt="" className="shrink-0" draggable={false} />}
      <span className="truncate">{name}</span>
      <span className="flex-1" />
      <span className="hidden items-center gap-0.5 group-hover:flex" onClick={(e) => e.stopPropagation()}>
        <Button size="sm" title={t('common.add')} onClick={() => api.startCreate(false, path)}><FilePlus size={11} /></Button>
      </span>
      {menu && (
        <SharedContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: t('shell.groups.copyPath'), icon: Clipboard, run: () => void copyPathText([path], false) },
            { label: t('explorer.revealInFileManager'), icon: ExternalLink, run: () => void window.lumen.shell.showItemInFolder(path) },
            'sep',
            { label: t('workspaces.removeFolder'), icon: X, run: () => void useStore.getState().removeFolderFromWorkspace(path) },
            'sep',
            { label: t('workspaces.addFolder'), icon: FolderInput, run: () => void useStore.getState().addFolderToWorkspace() },
          ]}
        />
      )}
    </div>
  );
}

function ExtraRoot({ path, api, collapsed, onToggle }: {
  path: string;
  api: TreeApi;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { entries } = useChildren(path, !collapsed, api.refreshToken);
  return (
    <div className="border-t border-edge/60" onDragOver={(e) => api.dragOver(e, path)} onDrop={(e) => api.drop(e, path)}>
      <RootHeader path={path} api={api} collapsed={collapsed} onToggle={onToggle} />
      {!collapsed && api.creating?.dir === path && <CreateRow depth={0} api={api} />}
      {!collapsed && entries && <div className="lm-anim-expand"><Children entries={entries} depth={0} api={api} parent={null} /></div>}
    </div>
  );
}
