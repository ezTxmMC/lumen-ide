/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ListTree, Search } from 'lucide-react';
import { useStore } from '@/state/store';
import { lsp } from '@/core/lsp/manager';
import { SYMBOL_GLYPH, symbolKindLabel } from '@/core/lsp/protocol';
import { symbolStore, symbolPathAt, type OutlineNode } from '@/lib/symbols';
import { t, useT } from '@/i18n';
import { Empty } from '../ui';

/** Farbton je Symbolart — Klassen, Funktionen, Variablen unterscheidbar. */
export function symbolTone(kind: number): string {
  if ([5, 10, 11, 23, 26].includes(kind)) {
    return 'var(--s-type, #e5c07b)';
  }
  if ([6, 9, 12].includes(kind)) {
    return 'var(--s-function, #61afef)';
  }
  if ([2, 3, 4].includes(kind)) {
    return 'var(--s-keyword, #c678dd)';
  }
  if ([7, 8, 13, 14, 22].includes(kind)) {
    return 'var(--s-variable, #e06c75)';
  }
  return 'var(--c-text-subtle)';
}

function useSymbols(path: string | null) {
  const [version, setVersion] = useState(symbolStore.getVersion());
  useEffect(() => symbolStore.subscribe(() => setVersion(symbolStore.getVersion())), []);
  return useMemo(() => symbolStore.get(path), [path, version]);
}

function matches(node: OutlineNode, needle: string): boolean {
  if (!needle) {
    return true;
  }
  return node.name.toLowerCase().includes(needle) || node.children.some((c) => matches(c, needle));
}

function Node({ node, depth, needle, activePath, onOpen }: {
  node: OutlineNode;
  depth: number;
  needle: string;
  activePath: Set<OutlineNode>;
  onOpen: (node: OutlineNode) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(depth < 2);
  const visible = matches(node, needle);
  if (!visible) {
    return null;
  }
  const expanded = open || needle.length > 0;
  const inPath = activePath.has(node);
  const isLeaf = node.children.length === 0;
  return (
    <>
      <div
        className={[
          'lm-row lm-transition group mx-1 text-[12.5px]',
          inPath && !activePath.has(node.children.find((c) => activePath.has(c)) as OutlineNode)
            ? 'bg-active text-fg'
            : 'text-muted hover:bg-hover hover:text-fg',
        ].join(' ')}
        style={{ paddingLeft: 6 + depth * 12 }}
        onClick={() => onOpen(node)}
        title={`${symbolKindLabel(node.kind)}${node.detail ? ` — ${node.detail}` : ''} · ${t('outline.line', { line: node.selectionRange.start.line + 1 })}`}
      >
        <button
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          className={`flex size-4 shrink-0 items-center justify-center ${isLeaf ? 'invisible' : ''}`}
          aria-label={expanded ? t('outline.collapse') : t('outline.expand')}
        >
          <ChevronRight size={12} className="lm-transition opacity-70" style={{ transform: expanded ? 'rotate(90deg)' : 'none' }} />
        </button>
        <span
          className="w-[16px] shrink-0 text-center font-mono text-[9.5px] font-bold"
          style={{ color: symbolTone(node.kind) }}
        >
          {SYMBOL_GLYPH[node.kind] ?? '·'}
        </span>
        <span className={`truncate ${node.deprecated ? 'line-through opacity-70' : ''}`}>{node.name}</span>
        {node.detail && (
          <span className="ml-1 hidden truncate text-[10.5px] text-subtle group-hover:inline">{node.detail}</span>
        )}
      </div>
      {expanded && node.children.map((child, i) => (
        <Node key={`${child.name}-${child.range.start.line}-${i}`} node={child} depth={depth + 1} needle={needle} activePath={activePath} onOpen={onOpen} />
      ))}
    </>
  );
}

function outlineHint(hasServer: boolean, status: string, label: string): string {
  if (!hasServer) {
    return t('outline.hintNoServer');
  }
  if (status === 'ready') {
    return t('outline.hintNoSymbols');
  }
  if (status === 'unavailable') {
    return t('outline.hintNotInstalled', { label });
  }
  return t('outline.hintWaiting');
}

export function OutlinePanel() {
  const t = useT();
  const tab = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null);
  const cursor = useStore((s) => s.cursor);
  const openAt = useStore((s) => s.openAt);
  const lspVersion = useStore((s) => s.lspVersion);
  const language = useStore((s) => s.languageFor(tab));
  const [query, setQuery] = useState('');

  const symbols = useSymbols(tab?.path ?? null);
  const activePath = useMemo(() => new Set(symbolPathAt(symbols, cursor)), [symbols, cursor]);
  const status = useMemo(() => lsp.status(language), [language, lspVersion]);
  const needle = query.trim().toLowerCase();

  const count = useMemo(() => {
    const walk = (nodes: OutlineNode[]): number => nodes.reduce((n, node) => n + 1 + walk(node.children), 0);
    return walk(symbols);
  }, [symbols]);

  const onOpen = (node: OutlineNode) => {
    if (!tab?.path) {
      return;
    }
    void openAt(
      tab.path,
      node.selectionRange.start.line, node.selectionRange.start.character,
      node.selectionRange.end.line, node.selectionRange.end.character,
    );
  };

  if (!tab) {
    return <Empty icon={<ListTree size={24} strokeWidth={1.4} />} title={t('outline.noFile')} />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-edge p-2">
        <div className="lm-transition flex items-center gap-2 rounded-lumen-sm border border-edge bg-input px-2 py-1.5 focus-within:border-accent">
          <Search size={13} className="shrink-0 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('outline.filterPlaceholder')}
            className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-subtle"
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between px-0.5 text-[11px] text-subtle">
          <span className="truncate" title={tab.path ?? undefined}>{tab.name}</span>
          <span>{t('outline.symbols', { count })}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {symbols.length === 0 && (
          <Empty
            title={status.status === 'ready' ? t('outline.noSymbols') : t('outline.noOutline')}
            hint={outlineHint(Boolean(language?.lsp?.length), status.status, status.label)}
          />
        )}
        {symbols.map((node, i) => (
          <Node key={`${node.name}-${node.range.start.line}-${i}`} node={node} depth={0} needle={needle} activePath={activePath} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
