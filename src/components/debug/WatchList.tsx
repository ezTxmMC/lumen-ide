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
import { ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { useT } from '@/i18n';
import { debug } from '@/core/debug/manager';
import { VariableChildren } from './VariableTree';
import { DebugSection, IconButton, valueTone } from './shared';

function WatchInput({ initial, onDone }: { initial: string; onDone: (value: string | null) => void; }) {
  const t = useT();
  const [value, setValue] = useState(initial);
  return (
    <input
      autoFocus
      value={value}
      placeholder={t('debug.watch.placeholder')}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onDone(value.trim() ? value : null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onDone(value);
        }
        if (e.key === 'Escape') {
          onDone(null);
        }
        e.stopPropagation();
      }}
      className="mx-2 my-0.5 w-[calc(100%-16px)] rounded-lumen-sm border border-accent bg-input px-1.5 py-0.5 font-mono text-[11.5px] text-fg outline-none"
    />
  );
}

const openWatches = new Set<string>();

function WatchRow({ expression, index, generation }: { expression: string; index: number; generation: number; }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(openWatches.has(expression));
  const result = debug.watchResults.get(expression);
  const session = debug.focusedSession();
  const expandable = Boolean(result && result.variablesReference > 0 && session);

  if (editing) {
    return (
      <WatchInput
        initial={expression}
        onDone={(value) => {
          setEditing(false);
          if (value !== null) {
            debug.editWatch(index, value);
          }
        }}
      />
    );
  }

  const toggle = () => {
    if (!expandable) {
      return;
    }
    if (open) {
      openWatches.delete(expression);
    }
    if (!open) {
      openWatches.add(expression);
    }
    setOpen(!open);
  };

  return (
    <>
      <div
        className="lm-row lm-transition group mx-1 flex items-center gap-1 pr-1 font-mono text-[11.5px] text-muted hover:bg-hover"
        style={{ paddingLeft: 4 }}
        onClick={toggle}
        onDoubleClick={() => setEditing(true)}
        title={result?.type}
      >
        <ChevronRight size={11} className={`lm-transition shrink-0 opacity-70 ${expandable ? '' : 'invisible'}`} style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
        <span className="shrink-0 text-accent">{expression}</span>
        <span className="shrink-0 text-subtle">=</span>
        <span className={`min-w-0 flex-1 truncate ${result?.error ? 'text-bad' : valueTone(result?.value ?? '', result?.type)}`}>
          {result ? result.value : t('debug.watch.unavailable')}
        </span>
        <span className="opacity-0 group-hover:opacity-100">
          <IconButton title={t('debug.watch.remove')} onClick={() => debug.removeWatch(index)} tone="hover:text-bad"><X size={11} /></IconButton>
        </span>
      </div>
      {open && expandable && session && result && (
        <VariableChildren sessionId={session.id} reference={result.variablesReference} depth={1} path={`watch:${expression}`} generation={generation} />
      )}
    </>
  );
}

export function WatchList() {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const watches = debug.watches;
  return (
    <DebugSection
      id="watch"
      title={t('debug.section.watch')}
      count={watches.length}
      actions={(
        <>
          <IconButton title={t('debug.watch.add')} onClick={() => setAdding(true)}><Plus size={12} /></IconButton>
          <IconButton title={t('debug.watch.clear')} onClick={() => debug.clearWatches()} disabled={!watches.length} tone="hover:text-bad"><Trash2 size={12} /></IconButton>
        </>
      )}
    >
      {watches.map((expression, index) => (
        <WatchRow key={`${index}:${expression}`} expression={expression} index={index} generation={debug.generation} />
      ))}
      {adding && (
        <WatchInput
          initial=""
          onDone={(value) => {
            setAdding(false);
            if (value) {
              debug.addWatch(value);
            }
          }}
        />
      )}
      {!adding && !watches.length && (
        <button className="lm-transition mx-1 w-[calc(100%-8px)] rounded-lumen-sm px-2 py-1 text-left text-[11.5px] text-subtle hover:bg-hover hover:text-fg" onClick={() => setAdding(true)}>
          {t('debug.watch.addHint')}
        </button>
      )}
    </DebugSection>
  );
}
