/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useEffect, useState } from 'react';
import {
  Check, Download, FolderOpen, FolderPlus, Layers, Pencil, Plus, Trash2, Upload, X,
} from 'lucide-react';
import { useStore, type WorkspaceDef } from '@/state/store';
import { useDialogVisible } from '@/hooks/usePresence';
import { locale, useT } from '@/i18n';
import { Button, Empty } from '../ui';
import { DialogShell } from './DialogShell';
import { sortedByName } from '../panels/Explorer';

const COLORS = ['#7c8cff', '#22d3ee', '#5ecf8f', '#fbbf24', '#f472b6', '#fb7185', '#c084fc', '#f97316'];

const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

/** Folders of the saved workspaces that no longer exist on disk. */
function useMissingFolders(open: boolean, workspaces: WorkspaceDef[]) {
  const [missing, setMissing] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const gone = new Set<string>();
      for (const folder of workspaces.flatMap((w) => w.folders)) {
        if (!(await window.lumen.fs.exists(folder))) {
          gone.add(folder);
        }
      }
      if (!cancelled) {
        setMissing(gone);
      }
    })();
    return () => { cancelled = true; };
  }, [open, workspaces]);

  return missing;
}

type Store = ReturnType<typeof useStore.getState>;

/** The folders of the open workspace, with the one everything is relative to. */
function CurrentFolders({ workspace, extraFolders, title, store }: {
  workspace: string;
  extraFolders: string[];
  title: string | undefined;
  store: Store;
}) {
  const t = useT();
  return (
    <section className="mb-5">
      <h3 className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">
        {title}
      </h3>
      <div className="lm-stagger space-y-1">
        {sortedByName([workspace, ...extraFolders]).map((folder) => {
          return (
            <div key={folder} className="lm-transition group flex items-center gap-2 rounded-lumen-sm border border-edge px-2.5 py-1.5 hover:bg-hover">
              <FolderOpen size={13} className="text-subtle" />
              <span className="text-[12.5px] text-fg">{baseName(folder)}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-subtle" title={folder}>{folder}</span>
              {extraFolders.length > 0 && (
                <Button size="sm" title={t('workspaces.removeFolder')} onClick={() => void store.removeFolderFromWorkspace(folder)}>
                  <X size={11} />
                </Button>
              )}
            </div>
          );
        })}
        <button
          onClick={() => void store.addFolderToWorkspace()}
          className="lm-transition flex w-full items-center gap-2 rounded-lumen-sm border border-dashed border-edge px-2.5 py-1.5 text-[12px] text-subtle hover:border-accent hover:text-fg"
        >
          <FolderPlus size={13} /> {t('workspaces.addFolder')}
        </button>
      </div>
    </section>
  );
}

function WorkspaceCard({
  def, isCurrent, missing, editing, draftName, dateFormat, store, onDraftName, onStartRename, onCommitRename, onCancelRename,
}: {
  def: WorkspaceDef;
  isCurrent: boolean;
  missing: Set<string>;
  editing: boolean;
  draftName: string;
  dateFormat: Intl.DateTimeFormat;
  store: Store;
  onDraftName: (name: string) => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
}) {
  const t = useT();
  const files = def.session?.groups.flat().length ?? 0;
  return (
    <div
    key={def.id}
    className={[
      'lm-transition lm-lift group relative overflow-hidden rounded-lumen border p-3',
      isCurrent ? 'border-accent bg-accent/5' : 'border-edge hover:border-edge-strong',
    ].join(' ')}
  >
    <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: def.color }} />
    <div className="flex items-center gap-2">
      {editing
        ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => onDraftName(e.target.value)}
            onBlur={onCommitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onCommitRename();
              }
              if (e.key === 'Escape') { e.stopPropagation(); onCancelRename(); }
            }}
            className="min-w-0 flex-1 rounded-lumen-sm border border-accent bg-input px-1.5 py-0.5 text-[13px] outline-none"
          />
        )
        : <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{def.name}</span>}
      {isCurrent && <span className="rounded-full bg-accent/15 px-1.5 text-[10px] text-accent">{t('workspaces.current')}</span>}
    </div>

    <div className="mt-1 text-[11px] text-subtle">
      {t('workspaces.folders', { count: def.folders.length })}
      {files > 0 && ` · ${t('workspaces.session', { files })}`}
      {` · ${t('workspaces.lastOpened', { date: dateFormat.format(def.openedAt) })}`}
    </div>

    <ul className="mt-2 space-y-0.5">
      {sortedByName(def.folders).map((folder) => (
        <li key={folder} className="flex items-center gap-1.5 text-[11.5px]" title={folder}>
          <FolderOpen size={11} className="text-subtle" />
          <span className={missing.has(folder) ? 'text-bad line-through' : 'text-muted'}>{baseName(folder)}</span>
          {missing.has(folder) && <span className="text-[10px] text-bad">{t('workspaces.missing')}</span>}
        </li>
      ))}
    </ul>

    <div className="mt-2.5 flex items-center gap-1">
      <Button size="sm" variant={isCurrent ? 'outline' : 'solid'} onClick={() => { store.closeDialog(); void store.openWorkspace(def.id); }}>
        {isCurrent ? <Check size={11} /> : <FolderOpen size={11} />} {t('workspaces.open')}
      </Button>
      <span className="flex-1" />
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {COLORS.map((color) => (
          <button
            key={color}
            title={t('workspaces.color')}
            onClick={() => store.updateWorkspace(def.id, { color })}
            className={`lm-transition size-3 rounded-full hover:scale-125 ${def.color === color ? 'ring-1 ring-fg' : ''}`}
            style={{ background: color }}
          />
        ))}
      </div>
      <Button size="sm" title={t('workspaces.rename')} onClick={() => onStartRename()}><Pencil size={11} /></Button>
      <Button size="sm" title={t('workspaces.export')} onClick={() => void store.exportWorkspace(def.id)}><Download size={11} /></Button>
      <Button size="sm" variant="danger" title={t('workspaces.delete')} onClick={() => {
        if (confirm(t('workspaces.confirmDelete', { name: def.name }))) {
          store.deleteWorkspace(def.id);
        }
      }}>
        <Trash2 size={11} />
      </Button>
    </div>
  </div>
  );
}

/** Managing named workspaces made of several folders. */
export function WorkspacesDialog() {
  const t = useT();
  const open = useDialogVisible('workspaces');
  const workspaces = useStore((s) => s.workspaces);
  const currentId = useStore((s) => s.currentWorkspaceId);
  const workspace = useStore((s) => s.workspace);
  const extraFolders = useStore((s) => s.extraFolders);
  const store = useStore.getState();
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const missing = useMissingFolders(open, workspaces);

  if (!open) {
    return null;
  }

  const sorted = [...workspaces].sort((a, b) => b.openedAt - a.openedAt);
  const dateFormat = new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' });

  const startRename = (def: WorkspaceDef) => {
    setEditing(def.id);
    setDraftName(def.name);
  };

  const commitRename = (def: WorkspaceDef) => {
    const name = draftName.trim();
    setEditing(null);
    if (name && name !== def.name) {
      store.updateWorkspace(def.id, { name });
    }
  };

  return (
    <DialogShell
      id="workspaces"
      title={t('shell.dialog.workspaces')}
      icon={Layers}
      headerExtra={
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" disabled={!workspace} onClick={() => {
            const def = store.saveWorkspace(workspace ? baseName(workspace) : undefined);
            if (def) {
              store.notify(t('workspaces.saved', { name: def.name }), 'success');
            }
          }}>
            <Plus size={12} /> {t('workspaces.new')}
          </Button>
          <Button size="sm" title={t('workspaces.import')} onClick={() => void store.importWorkspace()}>
            <Upload size={12} />
          </Button>
          <Button size="sm" title={t('workspaces.importDirHint')} onClick={() => void store.importWorkspaceFolder()}>
            <FolderPlus size={12} /> {t('workspaces.importDir')}
          </Button>
        </div>
      }
    >
      <div className="px-5 py-4">
        {/* Aktuelle Ordner */}
        {workspace && (
          <CurrentFolders
            workspace={workspace}
            extraFolders={extraFolders}
            title={currentId ? workspaces.find((w) => w.id === currentId)?.name : t('workspaces.folderOnly')}
            store={store}
          />
        )}

        {sorted.length === 0 && (
          <Empty icon={<Layers size={24} strokeWidth={1.4} />} title={t('workspaces.empty')} hint={t('workspaces.emptyHint')} />
        )}

        <div className="lm-stagger grid gap-2 sm:grid-cols-2">
          {sorted.map((def) => (
            <WorkspaceCard
              key={def.id}
              def={def}
              isCurrent={def.id === currentId}
              missing={missing}
              editing={editing === def.id}
              draftName={draftName}
              dateFormat={dateFormat}
              store={store}
              onDraftName={setDraftName}
              onStartRename={() => startRename(def)}
              onCommitRename={() => commitRename(def)}
              onCancelRename={() => setEditing(null)}
            />
          ))}
        </div>
      </div>
    </DialogShell>
  );
}
