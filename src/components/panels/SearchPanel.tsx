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
import { Search, Loader2 } from 'lucide-react';
import { useStore } from '@/state/store';
import { useT } from '@/i18n';
import { Empty } from '../ui';
import type { SearchHit } from '../../../electron/preload';

export function SearchPanel() {
  const t = useT();
  const workspace = useStore((s) => s.workspace);
  const openFile = useStore((s) => s.openFile);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!workspace || query.trim().length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setBusy(true);
    const timer = setTimeout(() => {
      window.lumen.fs
        .search(workspace, query.trim(), 300)
        .then((result) => !cancelled && setHits(result))
        .catch(() => !cancelled && setHits([]))
        .finally(() => !cancelled && setBusy(false));
    }, 220);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, workspace]);

  const grouped = useMemo(() => {
    const map = new Map<string, SearchHit[]>();
    for (const hit of hits) {
      const list = map.get(hit.path) ?? [];
      list.push(hit);
      map.set(hit.path, list);
    }
    return [...map.entries()];
  }, [hits]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-edge p-2">
        <div className="lm-transition flex items-center gap-2 rounded-lumen-sm border border-edge bg-input px-2 py-1.5 focus-within:border-accent">
          {busy ? (
            <Loader2 size={13} className="lm-anim-spin shrink-0 text-accent" />
          ) : (
            <Search size={13} className="shrink-0 text-subtle" />
          )}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.placeholder')}
            className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-subtle"
          />
        </div>
        {hits.length > 0 && (
          <div className="mt-1.5 px-0.5 text-[11px] text-subtle">
            {t('search.hits', { count: hits.length })} {t('search.inFiles', { count: grouped.length })}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {!workspace && <Empty title={t('explorer.noFolder')} />}
        {workspace && query.trim().length >= 2 && !busy && hits.length === 0 && (
          <Empty title={t('search.noHits')} hint={t('search.noHitsHint', { query })} />
        )}
        {grouped.map(([path, fileHits]) => (
          <div key={path} className="mb-1">
            <div className="px-3 pt-1.5 pb-0.5 truncate text-[11px] font-medium text-muted" title={path}>
              {path.replace(`${workspace}/`, '')}
              <span className="ml-1.5 text-subtle">{fileHits.length}</span>
            </div>
            {fileHits.map((hit, index) => (
              <button
                key={`${hit.line}-${index}`}
                onClick={() => void openFile(hit.path, true)}
                className="lm-transition flex w-full items-baseline gap-2 px-3 py-[3px] text-left hover:bg-hover"
              >
                <span className="w-7 shrink-0 text-right font-mono text-[10.5px] text-subtle tabular-nums">
                  {hit.line}
                </span>
                <span className="truncate font-mono text-[11.5px] text-muted">{hit.text}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
