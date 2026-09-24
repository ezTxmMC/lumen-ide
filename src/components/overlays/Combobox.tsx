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
 * A select with a search box, for long lists — every Minecraft version, every
 * loader build. The list opens in a popover above everything (dialogs
 * included), grouped under headings, with badges beside the labels.
 *
 * Keyboard: ↓/Enter/Space or simply typing opens it; ↑/↓, PageUp/PageDown,
 * Home/End move; Enter picks; Escape and Tab close. While it is open the
 * popover carries `data-lm-escape-owner`, so the dialog around it leaves
 * Escape alone.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useOwner } from '@/hooks/useOwner';
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react';
import type { FieldChoice } from '@/core/types';
import { filterChoices, groupChoices } from '@/core/project/choices';
import { tr, useT } from '@/i18n';
import { LAYER } from '../ui/layers';

/** More rows than this are not drawn; the search narrows the rest. */
const RENDER_LIMIT = 250;
const PAGE = 8;

export function ChoiceBadge({ text }: { text: string; }) {
  return (
    <span className="shrink-0 rounded-full border border-accent/30 bg-accent/12 px-1.5 py-px text-[9.5px] font-medium uppercase tracking-[0.06em] text-accent">
      {tr(text)}
    </span>
  );
}

export function Combobox({
  id, value, choices, onChange, loading, invalid, mono, placeholder, onSubmit,
}: {
  id: string;
  value: string;
  choices: FieldChoice[];
  onChange: (value: string) => void;
  loading?: boolean;
  invalid?: boolean;
  mono?: boolean;
  placeholder?: string;
  onSubmit?: () => void;
}) {
  const t = useT();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = choices.find((choice) => choice.value === value);

  const close = (refocus = true) => {
    setOpen(false);
    setQuery('');
    if (refocus) {
      trigger.current?.focus();
    }
  };

  const onTriggerKey = (event: ReactKeyboardEvent) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      onSubmit?.();
      return;
    }
    const opens = ['ArrowDown', 'ArrowUp', 'Enter', ' ', 'F4'].includes(event.key);
    const typed = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== ' ';
    if (!opens && !typed) {
      return;
    }
    event.preventDefault();
    setQuery(typed ? event.key : '');
    setOpen(true);
  };

  return (
    <>
      <button
        id={id}
        ref={trigger}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={onTriggerKey}
        className={[
          'lm-transition flex w-full items-center gap-2 rounded-lumen-sm border bg-input px-2.5 py-1.5 text-left text-[13px] outline-none focus:border-accent',
          invalid ? 'border-bad' : 'border-edge hover:border-edge-strong',
          open ? 'border-accent' : '',
        ].join(' ')}
      >
        <span className={`min-w-0 flex-1 truncate ${mono ? 'font-mono text-[12px]' : ''} ${selected || value ? 'text-fg' : 'text-subtle'}`}>
          {selected ? tr(selected.label) : value || placeholder || t('forms.choices.pick')}
        </span>
        {selected?.badge && <ChoiceBadge text={selected.badge} />}
        {loading
          ? <Loader2 size={12} className="lm-anim-spin shrink-0 text-subtle" />
          : <ChevronsUpDown size={12} className="shrink-0 text-subtle" />}
      </button>
      {open && trigger.current && (
        <ComboboxPopover
          anchor={trigger.current}
          choices={choices}
          value={value}
          query={query}
          onQuery={setQuery}
          loading={loading}
          mono={mono}
          onPick={(picked) => {
            onChange(picked);
            close();
          }}
          onClose={close}
        />
      )}
    </>
  );
}

type Placement = { left: number; top: number; width: number; maxHeight: number; above: boolean; };

/** Where the popover sits: below the trigger, or above it when there is no room. */
function usePopoverPlacement(anchor: HTMLElement, win: Window): Placement | null {
  const [place, setPlace] = useState<Placement | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const rect = anchor.getBoundingClientRect();
      const below = win.innerHeight - rect.bottom - 12;
      const aboveSpace = rect.top - 12;
      const above = below < 240 && aboveSpace > below;
      const maxHeight = Math.min(360, Math.max(160, above ? aboveSpace : below));
      const width = Math.min(Math.max(rect.width, 280), win.innerWidth - 16);
      const left = Math.min(rect.left, win.innerWidth - width - 8);
      setPlace({ left, top: above ? rect.top - 4 : rect.bottom + 4, width, maxHeight, above });
    };
    measure();
    win.addEventListener('resize', measure);
    return () => win.removeEventListener('resize', measure);
  }, [win, anchor]);
  return place;
}

function ChoiceGroups({ groups, value, active, mono, onActive, onPick }: {
  groups: ReturnType<typeof groupChoices>;
  value: string;
  active: number;
  mono?: boolean;
  onActive(index: number): void;
  onPick(value: string): void;
}) {
  let index = -1;
  return (
    <>
    {groups.map((group) => (
      <div key={group.group || '_'} role="group" aria-label={group.group ? tr(group.group) : undefined}>
        {group.group && (
          <div className="sticky top-0 z-[1] bg-overlay/95 px-2 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle">
            {tr(group.group)}
          </div>
        )}
        {group.choices.map((choice) => {
          index++;
          const at = index;
          const isActive = at === active;
          const isSelected = choice.value === value;
          return (
            <button
              key={`${group.group}:${choice.value}`}
              id={`choice-${at}`}
              type="button"
              role="option"
              aria-selected={isSelected}
              data-active={isActive}
              onMouseMove={() => onActive(at)}
              onClick={() => onPick(choice.value)}
              className={[
                'flex w-full items-center gap-2 rounded-lumen-sm px-2 py-1 text-left text-[12.5px]',
                isActive ? 'bg-hover text-fg' : 'text-muted',
              ].join(' ')}
            >
              <span className="w-3 shrink-0 text-accent">{isSelected && <Check size={12} />}</span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${mono ? 'font-mono text-[12px]' : ''}`}>{tr(choice.label)}</span>
                {choice.hint && <span className="block truncate text-[10.5px] text-subtle">{tr(choice.hint)}</span>}
              </span>
              {choice.badge && <ChoiceBadge text={choice.badge} />}
            </button>
          );
        })}
      </div>
    ))}
    </>
  );
}

function ComboSearchBar({ inputRef, query, onQuery, onKeyDown, activeId, loading, count }: {
  inputRef: React.RefObject<HTMLInputElement>;
  query: string;
  onQuery(query: string): void;
  onKeyDown(event: ReactKeyboardEvent): void;
  activeId?: string;
  loading?: boolean;
  count: number;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-2 border-b border-edge px-2.5 py-1.5">
      <Search size={12} className="shrink-0 text-subtle" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t('forms.choices.search')}
        aria-activedescendant={activeId}
        spellCheck={false}
        className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-subtle"
      />
      {loading && <Loader2 size={12} className="lm-anim-spin shrink-0 text-subtle" />}
      <span className="shrink-0 text-[10.5px] tabular-nums text-subtle">{count}</span>
    </div>
  );
}

function ComboboxPopover({
  anchor, choices, value, query, onQuery, loading, mono, onPick, onClose,
}: {
  anchor: HTMLElement;
  choices: FieldChoice[];
  value: string;
  query: string;
  onQuery: (query: string) => void;
  loading?: boolean;
  mono?: boolean;
  onPick: (value: string) => void;
  onClose: (refocus?: boolean) => void;
}) {
  const t = useT();
  const { win, doc } = useOwner();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const place = usePopoverPlacement(anchor, win);

  const matches = useMemo(() => filterChoices(choices, query, tr), [choices, query]);
  const shown = matches.slice(0, RENDER_LIMIT);
  const groups = useMemo(() => groupChoices(shown), [shown]);
  // Flat order as drawn: the keyboard walks it, groups and all.
  const order = useMemo(() => groups.flatMap((group) => group.choices), [groups]);
  const [active, setActive] = useState(() => Math.max(0, order.findIndex((choice) => choice.value === value)));

  useEffect(() => {
    if (!query) {
      return;
    }
    setActive(0);
  }, [query]);

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, place]);

  const move = (delta: number) => setActive((current) => Math.max(0, Math.min(order.length - 1, current + delta)));
  const keys: Record<string, () => void> = {
    ArrowDown: () => move(1),
    ArrowUp: () => move(-1),
    PageDown: () => move(PAGE),
    PageUp: () => move(-PAGE),
    Home: () => setActive(0),
    End: () => setActive(order.length - 1),
    Enter: () => {
      const choice = order[active];
      if (choice) {
        onPick(choice.value);
      }
    },
    Escape: () => onClose(),
    Tab: () => onClose(false),
  };
  const onKey = (event: ReactKeyboardEvent) => {
    const handler = keys[event.key];
    if (!handler) {
      return;
    }
    // Home/End belong to the text while there is one.
    if ((event.key === 'Home' || event.key === 'End') && query) {
      return;
    }
    if (event.key !== 'Tab') {
      event.preventDefault();
    }
    event.stopPropagation();
    handler();
  };

  return createPortal(
    <>
      <div className={`fixed inset-0 ${LAYER.menuBackdrop}`} onMouseDown={() => onClose(false)} />
      <div
        data-lm-escape-owner=""
        role="listbox"
        className={`lm-glass lm-shadow lm-anim-pop fixed ${LAYER.menu} flex flex-col overflow-hidden rounded-lumen border border-edge`}
        style={{
          left: place?.left,
          top: place?.top,
          width: place?.width,
          maxHeight: place?.maxHeight,
          transform: place?.above ? 'translateY(-100%)' : undefined,
          visibility: place ? undefined : 'hidden',
        }}
      >
        <ComboSearchBar
          inputRef={input}
          query={query}
          onQuery={onQuery}
          onKeyDown={onKey}
          activeId={order[active] ? `choice-${active}` : undefined}
          loading={loading}
          count={matches.length}
        />
        <div ref={list} className="min-h-0 flex-1 overflow-y-auto p-1">
          <ChoiceGroups groups={groups} value={value} active={active} mono={mono} onActive={setActive} onPick={onPick} />
          {!matches.length && (
            <p className="px-2 py-3 text-center text-[12px] text-subtle">
              {loading ? t('forms.choices.loading') : t('forms.choices.noMatch')}
            </p>
          )}
          {matches.length > shown.length && (
            <p className="px-2 py-1.5 text-center text-[11px] text-subtle">
              {t('forms.choices.more', { count: matches.length - shown.length })}
            </p>
          )}
        </div>
      </div>
    </>,
    doc.body,
  );
}
