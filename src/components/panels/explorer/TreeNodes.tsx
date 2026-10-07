/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, FilePlus, FolderPlus, PenLine, Trash2 } from 'lucide-react';
import { useStore } from '@/state/store';
import { fileGlyph, folderIcon, folderTint } from '@/lib/files/file-icon';
import { FolderIcon, IconGlyph, useIconPackVersion } from '../../icons/FileIcon';
import { useMinecraftFolderIcon } from '@/lib/files/minecraft-icon';
import { useT } from '@/i18n';
import { formatBinding } from '@/core/keybindings';
import { chainLabel, isSourceRoot, onlyChildFolder } from './folder-chain';
import { parentOf } from './explorer-tree-ops';
import type { TreeApi } from './tree-types';
import type { DirEntry } from '../../../../electron/preload';

/** Does the icon pack draw a shape of its own for this folder? */
function hasFolderShape(name: string) {
  const icon = folderIcon(name);
  return Boolean(icon.shape || icon.path || icon.glyph);
}

export function useChildren(dir: string, enabled: boolean, refreshToken: number) {
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const showBuildFolders = useStore((state) => state.effects.showBuildFolders);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    window.lumen.fs
      .readDir(dir, showBuildFolders)
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
  }, [dir, enabled, refreshToken, showBuildFolders]);

  return { entries, error };
}

export function NameInput({
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
  const image = useMinecraftFolderIcon(entry.isDirectory ? entry.path : '');
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
        style={{ transform: open ? 'rotate(90deg)' : 'none', color: folderShape || image ? undefined : folderTint(entry.name) }}
      />
      {image ? <img src={image} width={14} height={14} alt="" className="shrink-0" draggable={false} /> : <FolderIcon name={entry.name} open={open} size={14} />}
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

export function Children({ entries, depth, api, parent, packages = false }: {
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

export function CreateRow({ depth, api }: { depth: number; api: TreeApi; }) {
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
