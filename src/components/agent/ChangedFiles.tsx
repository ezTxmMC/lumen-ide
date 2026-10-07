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
 * The files the agent changed in this chat. Agents never open their edits as
 * editor tabs on their own — this list is where the user opens them on purpose.
 */

import { useMemo, useState } from 'react';
import { ChevronRight, FileDiff } from 'lucide-react';
import { useStore } from '@/state/store';
import { useT } from '@/i18n';
import type { ChatItem } from '@/core/agent/chat';

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/** Absolute paths of the files changed, with the number of edits, in order of first change. */
function changedFiles(items: ChatItem[]): { path: string; edits: number; }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.role !== 'tool' || item.status === 'error' || !FILE_TOOLS.has(item.name)) {
      continue;
    }
    const file = item.input.file_path ?? item.input.notebook_path;
    if (typeof file !== 'string' || !file.startsWith('/')) {
      continue;
    }
    counts.set(file, (counts.get(file) ?? 0) + 1);
  }
  return [...counts].map(([path, edits]) => ({ path, edits }));
}

export function ChangedFiles({ items }: { items: ChatItem[]; }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const workspace = useStore((s) => s.workspace);
  const files = useMemo(() => changedFiles(items), [items]);
  if (files.length === 0) {
    return null;
  }
  const label = (path: string) => (workspace && path.startsWith(`${workspace}/`) ? path.slice(workspace.length + 1) : path);
  return (
    <div className="shrink-0 border-t border-edge text-[11.5px]">
      <button onClick={() => setOpen(!open)} className="lm-transition flex w-full items-center gap-1.5 px-2.5 py-1 text-left text-muted hover:bg-hover">
        <ChevronRight size={11} className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
        <FileDiff size={12} className="shrink-0 text-accent" />
        <span className="font-medium text-fg">{t('agent.changedFiles', { count: files.length })}</span>
      </button>
      {open && (
        <div className="max-h-32 overflow-y-auto pb-1">
          {files.map((file) => (
            <button
              key={file.path}
              title={t('agent.openFile')}
              onClick={() => void useStore.getState().openFile(file.path)}
              className="lm-transition flex w-full items-center gap-2 px-6 py-0.5 text-left text-muted hover:bg-hover hover:text-fg"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{label(file.path)}</span>
              {file.edits > 1 && <span className="shrink-0 text-[10px] text-subtle">×{file.edits}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
