/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  ChevronRight, ChevronsDownUp, Clipboard, ClipboardPaste, Copy, ExternalLink, FilePlus, Package, FolderInput, FolderOpen, FolderPlus,
  PenLine, RefreshCw, Scissors, SquareTerminal, Star, Trash2, X,
} from 'lucide-react';
import { useStore } from '@/state/store';
import { fileGlyph, folderIcon, folderTint } from '@/lib/file-icon';
import { FolderIcon, IconGlyph, useIconPackVersion } from '../icons/FileIcon';
import { useT } from '@/i18n';
import { openNewJvm } from '@/lib/new-jvm-class';
import { NewJvmDialog } from '../dialogs/NewJvmDialog';
import { formatBinding } from '@/core/keybindings';
import { Button, Empty } from '../ui';
import { ContextMenu as SharedContextMenu, type MenuItem } from '../ui/ContextMenu';
import { chainLabel, isSourceRoot, onlyChildFolder } from './folder-chain';
import {
  clickSelection, EMPTY_SELECTION, inVisibleOrder, keepVisible, single, topLevel, type TreeSelection,
} from './explorer-selection';
import {
  copyPathText, copyPaths, cutPaths, pasteInto, trashPaths, useFileClipboard,
} from './explorer-actions';
import {
  createEntry, DRAG_MIME, dragOverTree, dropOnTree, handleTreeKey, parentOf, renameEntry, toggledPath, useRefreshTriggers,
  useRevealActive, withPath, type Creating, type DragExpand, type TreeOps,
} from './explorer-tree-ops';
import { openWith, openWithHandlers } from '@/core/extensions/open-with';
import type { DirEntry } from '../../../electron/preload';

/** Does the icon pack draw a shape of its own for this folder? */
function hasFolderShape(name: string) {
  const icon = folderIcon(name);
  return Boolean(icon.shape || icon.path || icon.glyph);
}

/* ------------------------------------------------------------------ *
 * State of the tree
 * ------------------------------------------------------------------ */

interface MenuState {
  x: number;
  y: number;
  entry: DirEntry | null;
}

interface TreeApi {
  root: string;
  expanded: Set<string>;
  /** The row with the focus: F2, Enter and "new file in the selected folder" act on it. */
  selected: DirEntry | null;
  /** Every selected row (Ctrl/Shift-click). */
  selection: Set<string>;
  /** Rows cut to the explorer clipboard — drawn faded. */
  cut: Set<string>;
  /** The folder a drag would drop into. */
  dropTarget: string | null;
  renaming: string | null;
  creating: Creating | null;
  refreshToken: number;
  toggle(path: string): void;
  expand(path: string): void;
  select(entry: DirEntry | null): void;
  /** A click on a row; `true` for a plain click, which also opens or toggles. */
  click(event: React.MouseEvent, entry: DirEntry): boolean;
  dragStart(event: React.DragEvent, entry: DirEntry): void;
  /** Dragging over `dir`; `folder` is the hovered folder row, opened after a moment. */
  dragOver(event: React.DragEvent, dir: string, folder?: string): void;
  drop(event: React.DragEvent, dir: string): void;
  dragEnd(): void;
  /** Trash the selection (after one question). */
  removeSelection(): Promise<void>;
  paste(dir: string): Promise<void>;
  /** The selected paths in the order the tree shows them. */
  selectedPaths(): string[];
  startRename(path: string | null): void;
  startCreate(isDir: boolean, dir?: string): void;
  cancelCreate(): void;
  commitCreate(name: string): Promise<void>;
  commitRename(entry: DirEntry, name: string): Promise<void>;
  remove(entry: DirEntry): Promise<void>;
  openMenu(event: React.MouseEvent, entry: DirEntry | null): void;
}

function useChildren(dir: string, enabled: boolean, refreshToken: number) {
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    window.lumen.fs
      .readDir(dir)
      .then((list) => {
        if (cancelled) {
          return;
        }
        setEntries(list);
        setError(null);
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setError(err.message);
      });
    return () => { cancelled = true; };
  }, [dir, enabled, refreshToken]);

  return { entries, error };
}

/* ------------------------------------------------------------------ *
 * Input rows
 * ------------------------------------------------------------------ */

function NameInput({
  initial, depth, icon, onCommit, onCancel, selectStem,
}: {
  initial: string;
  depth: number;
  icon: ReactNode;
  onCommit: (value: string) => void;
  onCancel: () => void;
  selectStem?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const input = ref.current;
    if (!input) {
      return;
    }
    input.focus();
    const dot = initial.lastIndexOf('.');
    if (selectStem && dot > 0) {
      input.setSelectionRange(0, dot);
      return;
    }
    input.select();
  }, [initial, selectStem]);

  const finish = (commit: boolean) => {
    if (done.current) {
      return;
    }
    done.current = true;
    const value = ref.current?.value.trim() ?? '';
    if (commit && value) {
      onCommit(value);
      return;
    }
    onCancel();
  };

  return (
    <div className="lm-row mx-1 text-[12.5px]" style={{ paddingLeft: 6 + depth * 12 }} onClick={(e) => e.stopPropagation()}>
      <span className="flex w-[15px] shrink-0 justify-center">{icon}</span>
      <input
        ref={ref}
        defaultValue={initial}
        spellCheck={false}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            finish(true);
          }
          if (e.key === 'Escape') {
            finish(false);
          }
        }}
        className="w-full rounded-sm border border-accent bg-input px-1 text-fg outline-none"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Nodes
 * ------------------------------------------------------------------ */

function rowTone(selected: boolean, active: boolean, dropTarget: boolean): string {
  if (dropTarget) {
    return 'bg-accent/25 text-fg ring-1 ring-inset ring-accent/70';
  }
  if (selected) {
    return 'bg-accent/20 text-fg';
  }
  if (active) {
    return 'bg-hover text-fg';
  }
  return 'text-muted hover:bg-hover hover:text-fg';
}

/** A folder's own path, a file's folder: where something dropped on the row lands. */
const dropDirOf = (entry: DirEntry) => (entry.isDirectory ? entry.path : parentOf(entry.path));

function RowIcon({ entry, open, glyph, folderShape }: {
  entry: DirEntry;
  open: boolean;
  glyph: ReturnType<typeof fileGlyph> | null;
  folderShape: boolean;
}) {
  if (!entry.isDirectory) {
    return (
      <span className="flex w-[15px] shrink-0 justify-center">
        <IconGlyph icon={glyph!} size={13} />
      </span>
    );
  }
  return (
    <>
      <ChevronRight
        size={13}
        className="lm-transition shrink-0 opacity-70"
        style={{ transform: open ? 'rotate(90deg)' : 'none', color: folderShape ? undefined : folderTint(entry.name) }}
      />
      <FolderIcon name={entry.name} open={open} size={14} />
    </>
  );
}

/** The hover buttons at the end of a row. */
function RowActions({ entry, api }: { entry: DirEntry; api: TreeApi; }) {
  const t = useT();
  return (
    <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
      {entry.isDirectory && (
        <>
          <button
            title={t('explorer.newFileHere')}
            onClick={(e) => { e.stopPropagation(); api.startCreate(false, entry.path); }}
            className="lm-transition rounded p-0.5 text-subtle hover:text-fg"
          >
            <FilePlus size={11} />
          </button>
          <button
            title={t('explorer.newFolderHere')}
            onClick={(e) => { e.stopPropagation(); api.startCreate(true, entry.path); }}
            className="lm-transition rounded p-0.5 text-subtle hover:text-fg"
          >
            <FolderPlus size={11} />
          </button>
        </>
      )}
      <button
        title={`${t('explorer.rename')} (${formatBinding('F2')})`}
        onClick={(e) => { e.stopPropagation(); api.startRename(entry.path); }}
        className="lm-transition rounded p-0.5 text-subtle hover:text-fg"
      >
        <PenLine size={11} />
      </button>
      <button
        title={`${t('common.delete')} (${formatBinding('Delete')})`}
        onClick={(e) => { e.stopPropagation(); void api.remove(entry); }}
        className="lm-transition rounded p-0.5 text-subtle hover:text-bad"
      >
        <Trash2 size={11} />
      </button>
    </span>
  );
}

function TreeNode({ entry, depth, api, label = entry.name, packages = false }: {
  entry: DirEntry;
  depth: number;
  api: TreeApi;
  /** The row's label — for collapsed packages, the whole chain. */
  label?: string;
  /** Does this folder sit in a package tree? Then chains are collapsed. */
  packages?: boolean;
}) {
  const t = useT();
  const open = entry.isDirectory && api.expanded.has(entry.path);
  const { entries } = useChildren(entry.path, open, api.refreshToken);

  const openFile = useStore((s) => s.openFile);
  const activePath = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.path);
  const dirty = useStore((s) => s.tabs.some((t) => t.path === entry.path && t.content !== t.saved));

  const isActive = activePath === entry.path;
  const isSelected = api.selection.has(entry.path);
  const isFocused = api.selected?.path === entry.path && api.selection.size > 1;
  useIconPackVersion();
  const glyph = entry.isDirectory ? null : fileGlyph(entry.name);
  const folderShape = entry.isDirectory && hasFolderShape(entry.name);
  const creatingHere = api.creating?.dir === entry.path && open;

  if (api.renaming === entry.path) {
    return (
      <>
        <NameInput
          initial={entry.name}
          depth={depth}
          selectStem={!entry.isDirectory}
          icon={entry.isDirectory
            ? <ChevronRight size={13} className="opacity-70" />
            : <span className="font-mono text-[9.5px] font-bold" style={{ color: glyph!.color }}>{glyph!.glyph}</span>}
          onCommit={(name) => void api.commitRename(entry, name)}
          onCancel={() => api.startRename(null)}
        />
        {open && entries && <Children entries={entries} depth={depth + 1} api={api} parent={entry} packages={packages} />}
      </>
    );
  }

  return (
    <>
      <div
        role="treeitem"
        aria-expanded={entry.isDirectory ? open : undefined}
        aria-selected={isSelected}
        tabIndex={-1}
        data-path={entry.path}
        data-dir={entry.isDirectory ? '' : undefined}
        draggable
        className={[
          'lm-row lm-transition group mx-1 text-[12.5px]',
          rowTone(isSelected, isActive, api.dropTarget === entry.path),
          isFocused ? 'ring-1 ring-inset ring-accent/45' : '',
          api.cut.has(entry.path) ? 'opacity-50' : '',
        ].join(' ')}
        style={{ paddingLeft: 6 + depth * 12 }}
        onDragStart={(e) => api.dragStart(e, entry)}
        onDragOver={(e) => api.dragOver(e, dropDirOf(entry), entry.isDirectory && !open ? entry.path : undefined)}
        onDrop={(e) => api.drop(e, dropDirOf(entry))}
        onDragEnd={api.dragEnd}
        onClick={(e) => {
          if (!api.click(e, entry)) {
            return;
          }
          if (entry.isDirectory) {
            api.toggle(entry.path);
            return;
          }
          void openFile(entry.path, true);
        }}
        onDoubleClick={() => {
          if (entry.isDirectory) {
            return;
          }
          void openFile(entry.path);
        }}
        onContextMenu={(e) => api.openMenu(e, entry)}
        title={entry.path}
      >
        <RowIcon entry={entry} open={open} glyph={glyph} folderShape={folderShape} />

        <span className="flex-1 truncate">{label}</span>
        {dirty && <span className="size-[6px] shrink-0 rounded-full bg-accent" title={t('explorer.unsaved')} />}

        <RowActions entry={entry} api={api} />
      </div>

      {open && (
        <div className="lm-anim-expand" role="group">
          {creatingHere && <CreateRow depth={depth + 1} api={api} />}
          {entries && <Children entries={entries} depth={depth + 1} api={api} parent={entry} packages={packages} />}
          {entries?.length === 0 && !creatingHere && (
            <div className="py-1 text-[11.5px] text-subtle italic" style={{ paddingLeft: 22 + depth * 12 }}>
              {t('explorer.empty')}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/**
 * A folder that merges with its single-child folders into one row.
 *
 * This only runs inside a package tree, where fetching a collapsed folder is a
 * directory listing with exactly one hit — elsewhere the same lookahead would
 * open every visible folder.
 */
function PackageNode({ entry, depth, api, prefix }: {
  entry: DirEntry;
  depth: number;
  api: TreeApi;
  prefix: string[];
}) {
  const { entries } = useChildren(entry.path, true, api.refreshToken);
  const names = [...prefix, entry.name];
  const only = onlyChildFolder(entries);

  if (only) {
    return <PackageNode entry={only} depth={depth} api={api} prefix={names} />;
  }
  // Still loading: only show the row once its label is settled — otherwise
  // “com” visibly jumps to “com.example.project”.
  if (!entries) {
    return null;
  }
  return <TreeNode entry={entry} depth={depth} api={api} label={chainLabel(names)} packages />;
}

function Children({ entries, depth, api, parent, packages = false }: {
  entries: DirEntry[];
  depth: number;
  api: TreeApi;
  /** The folder whose children these are — `null` for the root. */
  parent: DirEntry | null;
  packages?: boolean;
}) {
  const compact = useStore((state) => state.effects.compactPackages);
  const inPackages = compact && (packages || Boolean(parent && isSourceRoot(parent.name)));
  return (
    <>
      {entries.map((child) => {
        if (inPackages && child.isDirectory) {
          return <PackageNode key={child.path} entry={child} depth={depth} api={api} prefix={[]} />;
        }
        return <TreeNode key={child.path} entry={child} depth={depth} api={api} />;
      })}
    </>
  );
}

function CreateRow({ depth, api }: { depth: number; api: TreeApi; }) {
  const isDir = api.creating?.isDir ?? false;
  return (
    <NameInput
      initial=""
      depth={depth}
      icon={isDir ? <FolderPlus size={12} className="text-accent" /> : <FilePlus size={12} className="text-accent" />}
      onCommit={(name) => void api.commitCreate(name)}
      onCancel={api.cancelCreate}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Context menu
 * ------------------------------------------------------------------ */

function ContextMenu({ menu, api, onClose }: { menu: MenuState; api: TreeApi; onClose: () => void; }) {
  const t = useT();
  const clipboard = useFileClipboard();
  const entry = menu.entry;
  const dir = menuDir(entry, api.root);
  const paste: MenuItem = {
    label: t('explorer.paste'), icon: ClipboardPaste, hint: formatBinding('Ctrl+V'), disabled: !clipboard, run: () => void api.paste(dir),
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
    items.push('sep', paste);
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

/* ------------------------------------------------------------------ *
 * Explorer
 * ------------------------------------------------------------------ */

function NoWorkspaceView() {
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

function ExplorerHeader({ workspace, extraFolders, onCreate, onRefresh, onCollapseAll }: {
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
  return (
    <div className="flex items-center gap-1 border-b border-edge px-2 py-1.5">
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

interface ApiContext {
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
}

/** The tree's actions, bound to the state the explorer owns. */
function buildTreeApi(c: ApiContext): TreeApi {
  const {
    root, selected, selection, selectionSet, isMac, ops, visiblePaths, focusOnly, refresh, showArrived,
    setExpanded, setSelected, setSelection, setRenaming, setCreating, setMenu,
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
      event.dataTransfer.effectAllowed = 'copyMove';
    },
    dragOver: (event, dir, folder) => dragOverTree(event, dir, folder, ops),
    drop: (event, dir) => dropOnTree(event, dir, ops),
    dragEnd: c.endDrag,
    async removeSelection() {
      const paths = selection.paths.length ? selection.paths : selected ? [selected.path] : [];
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
      if (target !== root) {
        setExpanded((prev) => withPath(prev, target));
      }
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
function useTreeCallbacks(d: TreeCallbackDeps) {
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

function TreeBody({ api, containerRef, entries, extraFolders, collapsedRoots, onToggleRoot, onKeyDown, focusOnly, endDrag }: {
  api: TreeApi;
  containerRef: React.RefObject<HTMLDivElement>;
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
      {multiRoot && <RootHeader path={root} active api={api} />}
      {creating?.dir === root && <CreateRow depth={0} api={api} />}
      {entries && (!multiRoot || !collapsedRoots.has(root)) && <Children entries={entries} depth={0} api={api} parent={null} />}
      {entries?.length === 0 && !creating && <Empty title={t('explorer.folderEmpty')} hint={t('explorer.folderEmptyHint')} />}
      {extraFolders.map((folder) => (
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
    setExpanded, setSelected, setSelection, setRenaming, setCreating, setMenu,
  }), [
    root, expanded, selected, selection, selectionSet, cutSet, dropTarget, renaming, creating, refreshToken, isMac,
    refresh, visiblePaths, isDirectoryRow, focusOnly, endDrag, showArrived, ops,
  ]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (renaming || creating) {
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

/* ------------------------------------------------------------------ *
 * Several folders (a workspace)
 * ------------------------------------------------------------------ */

function RootHeader({ path, active, api, collapsed, onToggle }: {
  path: string;
  active?: boolean;
  api: TreeApi;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const t = useT();
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
      <span className="truncate">{name}</span>
      {active && <span className="rounded-full bg-accent/15 px-1.5 text-[9.5px] normal-case tracking-normal text-accent">{t('workspaces.active')}</span>}
      <span className="flex-1" />
      <span className="hidden items-center gap-0.5 group-hover:flex" onClick={(e) => e.stopPropagation()}>
        <Button size="sm" title={t('common.add')} onClick={() => api.startCreate(false, path)}><FilePlus size={11} /></Button>
        {!active && (
          <Button size="sm" title={t('workspaces.setActive')} onClick={() => void useStore.getState().setActiveFolder(path)}><Star size={11} /></Button>
        )}
      </span>
      {menu && (
        <SharedContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: t('workspaces.setActive'), icon: Star, disabled: active, run: () => void useStore.getState().setActiveFolder(path) },
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

/** The folder the context menu creates in: the entry itself, its parent, or the root. */
function menuDir(entry: DirEntry | null, root: string) {
  if (!entry) {
    return root;
  }
  return entry.isDirectory ? entry.path : parentOf(entry.path);
}
