/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useT } from '@/i18n';
import {
  NODE_CATEGORIES, canConnect, categoryColor, categoryLabel, nodeDefs, nodeTitle,
  type NodeDef,
} from '@/core/user-addons/catalog';
import type { PinType } from '@/core/user-addons/schema';

export interface PendingPin {
  node: string;
  pin: string;
  type: PinType;
  side: 'in' | 'out';
}

/** The first pin of a node that fits the pin being dragged. */
export function matchingPin(def: NodeDef, from: PendingPin | null | undefined) {
  if (!from) {
    return null;
  }
  if (from.side === 'out') {
    return def.inputs.find((p) => canConnect(from.type, p.type)) ?? null;
  }
  return def.outputs.find((p) => canConnect(p.type, from.type)) ?? null;
}

/** The nodes on offer, filtered by the search, the allowed set and the dragged pin, in category order. */
function usePaletteEntries(query: string, from: PendingPin | null | undefined, allow: ((def: NodeDef) => boolean) | undefined) {
  return useMemo(() => {
    const needle = query.trim().toLowerCase();
    const defs = nodeDefs()
      .filter((def) => !allow || allow(def))
      .filter((def) => !from || matchingPin(def, from))
      .filter((def) => {
        if (!needle) {
          return true;
        }
        const haystack = `${nodeTitle(def.type)} ${categoryLabel(def.category)} ${def.type}`.toLowerCase();
        return needle.split(/\s+/).every((part) => haystack.includes(part));
      });
    const order = NODE_CATEGORIES.map((c) => c.id);
    return defs.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  }, [query, from, allow]);
}

function PaletteList({ entries, index, onHover, onPick }: {
  entries: NodeDef[];
  index: number;
  onHover: (index: number) => void;
  onPick: (def: NodeDef) => void;
}) {
  const t = useT();
  let lastCategory = '';
  return (
    <>
      {entries.length === 0 && (
        <div className="px-2 py-4 text-center text-[12px] text-subtle">{t('common.nothingFound')}</div>
      )}
      {entries.map((def, i) => {
        const header = def.category !== lastCategory;
        lastCategory = def.category;
        return (
          <div key={def.type}>
            {header && (
              <div className="px-2 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-subtle">
                {categoryLabel(def.category)}
              </div>
            )}
            <button
              data-index={i}
              tabIndex={-1}
              onMouseEnter={() => onHover(i)}
              onClick={() => onPick(def)}
              className={[
                'lm-transition flex w-full items-center gap-2 rounded-lumen-sm px-2 py-1 text-left text-[12.5px]',
                i === index ? 'bg-active text-fg' : 'text-muted',
              ].join(' ')}
            >
              <span className="size-2 shrink-0 rounded-full" style={{ background: categoryColor(def.category) }} />
              <span className="min-w-0 flex-1 truncate">{nodeTitle(def.type)}</span>
            </button>
          </div>
        );
      })}
    </>
  );
}

/** The node palette with a search — filtered by allowed nodes and the dragged pin. */
export function NodePalette({
  x, y, from, allow, onPick, onClose,
}: {
  /** Position inside the container, in px. */
  x: number;
  y: number;
  from?: PendingPin | null;
  allow?: (def: NodeDef) => boolean;
  onPick: (def: NodeDef) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const entries = usePaletteEntries(query, from, allow);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIndex((i) => Math.min(entries.length - 1, i + 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (event.key === 'Enter' && entries[index]) {
      event.preventDefault();
      onPick(entries[index]);
    }
  };

  return (
    <div
      className="lm-glass lm-shadow lm-anim-pop absolute z-20 flex max-h-[360px] w-[260px] flex-col overflow-hidden rounded-lumen border border-edge"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
    >
      <label className="flex items-center gap-2 border-b border-edge px-2.5 py-2">
        <Search size={12} className="shrink-0 text-subtle" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={(e) => {
            if (!e.currentTarget.closest('.lm-glass')?.contains(e.relatedTarget as Node | null)) {
              onClose();
            }
          }}
          placeholder={t('addonStudio.graph.searchNodes')}
          className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-subtle"
        />
      </label>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1">
        <PaletteList entries={entries} index={index} onHover={setIndex} onPick={onPick} />
      </div>
    </div>
  );
}
