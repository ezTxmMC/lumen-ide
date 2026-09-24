/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useMemo, useState } from 'react';
import { AlertCircle, ChevronRight, Folder, FolderTree, Loader2 } from 'lucide-react';
import { fileTree, type FileTreeNode } from '@/core/project/catalog';
import { useT } from '@/i18n';
import { FileIcon, FolderIcon } from '../../icons/FileIcon';
import type { Preview } from './usePreview';

/** The files a template will generate, as a collapsible tree under the target folder. */
export function FilePreview({ preview, rootName }: { preview: Preview; rootName: string; }) {
  const t = useT();
  const tree = useMemo(() => fileTree(preview.files ?? []), [preview.files]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = (path: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(path)) {
      next.delete(path);
      return next;
    }
    next.add(path);
    return next;
  });

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-lumen border border-edge bg-surface/60">
      <header className="flex items-center gap-2 border-b border-edge px-3 py-2">
        <FolderTree size={13} className="text-accent" />
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">{t('forms.newProject.previewTitle')}</span>
        <span className="flex-1" />
        {preview.loading && <Loader2 size={12} className="lm-anim-spin text-subtle" />}
        {preview.files && (
          <span className="text-[10.5px] tabular-nums text-subtle">{t('forms.newProject.fileCount', { count: preview.files.length })}</span>
        )}
      </header>
      <div className={`min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5 font-mono text-[11.5px] transition-opacity ${preview.loading ? 'opacity-60' : ''}`}>
        {preview.error && (
          <p className="lm-anim-fade m-1.5 flex items-start gap-1.5 rounded-lumen-sm border border-bad/40 bg-bad/10 px-2 py-1.5 font-sans text-[11.5px] text-bad">
            <AlertCircle size={12} className="mt-px shrink-0" />{t('forms.newProject.previewFailed', { error: preview.error })}
          </p>
        )}
        {!preview.files && !preview.error && (
          <p className="px-2 py-3 font-sans text-[11.5px] text-subtle">{t('forms.newProject.previewPending')}</p>
        )}
        {preview.files && (
          <>
            <div className="flex items-center gap-1.5 px-1.5 py-0.5 text-fg">
              <Folder size={12} className="shrink-0 text-accent" />
              <span className="truncate">{rootName}/</span>
            </div>
            <TreeLevel nodes={tree} depth={1} collapsed={collapsed} onToggle={toggle} />
            {preview.files.length === 0 && <p className="px-2 py-2 font-sans text-[11.5px] text-subtle">{t('forms.newProject.previewEmpty')}</p>}
          </>
        )}
      </div>
    </section>
  );
}

function TreeLevel({ nodes, depth, collapsed, onToggle }: {
  nodes: FileTreeNode[];
  depth: number;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        const pad = { paddingLeft: depth * 12 + 6 };
        if (!node.children) {
          return (
            <div key={node.path} className="flex items-center gap-1.5 rounded py-0.5 pr-1.5 text-muted hover:bg-hover hover:text-fg" style={pad} title={node.path}>
              <span className="w-2.5 shrink-0" />
              <FileIcon name={node.name} size={12} />
              <span className="truncate">{node.name}</span>
            </div>
          );
        }
        const open = !collapsed.has(node.path);
        return (
          <div key={node.path}>
            <button
              type="button"
              onClick={() => onToggle(node.path)}
              className="flex w-full items-center gap-1.5 rounded py-0.5 pr-1.5 text-left text-muted hover:bg-hover hover:text-fg"
              style={pad}
              aria-expanded={open}
            >
              <ChevronRight size={10} className={`lm-transition shrink-0 ${open ? 'rotate-90' : ''}`} />
              <FolderIcon name={node.name} open={open} size={12} />
              <span className="truncate">{node.name}</span>
            </button>
            {open && (
              <div className="lm-anim-expand">
                <TreeLevel nodes={node.children} depth={depth + 1} collapsed={collapsed} onToggle={onToggle} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
