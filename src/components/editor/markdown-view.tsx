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
 * Markdown files in three modes: raw (the editor), preview, and split (the
 * editor left, the rendered document right). The mode is per tab and lives
 * only for the session.
 */

import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { Columns2, Eye, FileCode2 } from 'lucide-react';
import { useStore } from '@/state/store';
import { useT } from '@/i18n';
import { renderMarkdown } from '@/lib/files/markdown';
import { Button } from '../ui';

export type MarkdownMode = 'raw' | 'preview' | 'split';

const modes = new Map<string, MarkdownMode>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function setMode(tabId: string, mode: MarkdownMode) {
  modes.set(tabId, mode);
  for (const listener of listeners) {
    listener();
  }
}

export function isMarkdownPath(path: string | null | undefined): boolean {
  return Boolean(path && /\.(?:md|markdown|mdown)$/i.test(path));
}

/** The mode of a tab; `raw` for anything that is not a Markdown file. */
export function useMarkdownMode(tabId: string | null): MarkdownMode {
  const markdown = useStore((s) => isMarkdownPath(s.tabs.find((open) => open.id === tabId)?.path));
  const mode = useSyncExternalStore(subscribe, () => (tabId ? modes.get(tabId) : undefined));
  return markdown ? (mode ?? 'raw') : 'raw';
}

const PROSE = [
  'lm-md min-w-0 break-words px-6 py-4 text-[13.5px] leading-relaxed text-fg',
  '[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-0.5',
  '[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:border-b [&_h1]:border-edge [&_h1]:pb-1 [&_h1]:text-2xl [&_h1]:font-semibold',
  '[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:border-b [&_h2]:border-edge [&_h2]:pb-1 [&_h2]:text-xl [&_h2]:font-semibold',
  '[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-semibold',
  '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-edge [&_blockquote]:pl-3 [&_blockquote]:text-muted',
  '[&_hr]:my-4 [&_hr]:border-edge [&_a]:text-accent [&_a]:underline-offset-2 hover:[&_a]:underline',
  '[&_code]:font-mono [&_code]:text-[12px] [&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-input [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-px',
  '[&_pre]:my-2 [&_pre]:overflow-auto [&_pre]:rounded-lumen-sm [&_pre]:border [&_pre]:border-edge [&_pre]:bg-input [&_pre]:px-3 [&_pre]:py-2',
].join(' ');

/** The rendered document of a Markdown tab. */
export function MarkdownPreview({ tabId, className = '' }: { tabId: string; className?: string; }) {
  const content = useStore((s) => s.tabs.find((open) => open.id === tabId)?.content ?? '');
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    element.replaceChildren();
    renderMarkdown(content, element, 1);
  }, [content]);

  return (
    <div className={`overflow-auto bg-bg ${className}`}>
      <div ref={ref} className={PROSE} />
    </div>
  );
}

const MODE_ICONS = { raw: FileCode2, preview: Eye, split: Columns2 } as const;
const MODE_ORDER: MarkdownMode[] = ['raw', 'split', 'preview'];

/** Three buttons in the group's action bar — only for the active Markdown tab. */
export function MarkdownModeToggle({ tabId }: { tabId: string | null; }) {
  const t = useT();
  const mode = useMarkdownMode(tabId);
  const markdown = useStore((s) => isMarkdownPath(s.tabs.find((open) => open.id === tabId)?.path));
  if (!tabId || !markdown) {
    return null;
  }
  return (
    <div className="flex items-center">
      {MODE_ORDER.map((entry) => {
        const Icon = MODE_ICONS[entry];
        return (
          <Button
            key={entry}
            size="sm"
            title={t(`editor.markdown.${entry}`)}
            className={mode === entry ? 'text-accent' : ''}
            onClick={() => setMode(tabId, entry)}
          >
            <Icon size={13} />
          </Button>
        );
      })}
    </div>
  );
}
