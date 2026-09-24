/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { useOwner } from '@/hooks/useOwner';
import { LAYER } from './layers';

export interface MenuAction {
  label: string;
  icon?: LucideIcon;
  run: () => void;
  danger?: boolean;
  /** Right-aligned and dimmed — a shortcut, a count. */
  hint?: string;
  /** A second, monospaced line under the label — the command a task runs, say. */
  detail?: string;
  disabled?: boolean;
  /** Shows a check mark in front instead of the icon. */
  checked?: boolean;
}

/** An entry: an action, a separator, or a small heading above a group. */
export type MenuItem = MenuAction | 'sep' | { header: string; };

/** The gap the menu keeps from the window edge. */
const EDGE_MARGIN = 6;

interface Placement {
  left: number;
  top: number;
  maxHeight: number;
}

const isAction = (item: MenuItem): item is MenuAction => typeof item === 'object' && 'run' in item;

/** Where the menu fits horizontally: at the pointer, or flipped to its left. */
function placeX(win: Window, width: number, x: number): number {
  const viewWidth = win.innerWidth;
  if (x + width <= viewWidth - EDGE_MARGIN) {
    return x;
  }
  return Math.max(EDGE_MARGIN, Math.min(x - width, viewWidth - width - EDGE_MARGIN));
}

/** Where the menu fits vertically: below the pointer, above it, or pushed against the bottom. */
function placeY(win: Window, height: number, y: number): number {
  const viewHeight = win.innerHeight;
  if (y + height <= viewHeight - EDGE_MARGIN) {
    return y;
  }
  const above = y - height;
  if (above >= EDGE_MARGIN) {
    return above;
  }
  return Math.max(EDGE_MARGIN, viewHeight - height - EDGE_MARGIN);
}

/**
 * Places the menu with its top-left corner at the pointer, flipping to the
 * other side where it does not fit — as in VS Code. Measuring goes through
 * `offsetWidth`/`offsetHeight`: `getBoundingClientRect()` would count the
 * running fade-in (`scale(0.975)`) and come out too small.
 */
function place(win: Window, element: HTMLElement, x: number, y: number): Placement {
  const maxHeight = win.innerHeight - 2 * EDGE_MARGIN;
  const height = Math.min(element.offsetHeight, maxHeight);
  return { left: placeX(win, element.offsetWidth, x), top: placeY(win, height, y), maxHeight };
}

/** The next enabled action from `from` in direction `step`, wrapping around. */
function nextEnabled(items: MenuItem[], from: number, step: 1 | -1): number {
  for (let offset = 1; offset <= items.length; offset++) {
    const index = (from + step * offset + items.length * 2) % items.length;
    const item = items[index];
    if (isAction(item) && !item.disabled) {
      return index;
    }
  }
  return -1;
}

/**
 * A floating menu at a pointer position; closes on a click beside it, Esc, or
 * losing the window. Arrow keys move, Enter runs.
 *
 * It renders into the `body` of its window (a pop-out has its own) through a portal: a `position: fixed`
 * element inside a transformed or `backdrop-filter`ed ancestor (the sidebar's
 * slide-in, the glass panels) is positioned relative to that ancestor rather
 * than the window — the menu would appear offset and below its neighbours.
 */
export function ContextMenu({ x, y, items, onClose }: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const { win, doc } = useOwner();
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [focused, setFocused] = useState(-1);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    setPlacement(place(win, element, x, y));
  }, [win, x, y, items.length]);

  useEffect(() => {
    const close = () => onClose();
    win.addEventListener('blur', close);
    win.addEventListener('resize', close);
    return () => {
      win.removeEventListener('blur', close);
      win.removeEventListener('resize', close);
    };
  }, [win, onClose]);

  useEffect(() => {
    const keys: Record<string, (event: KeyboardEvent) => void> = {
      Escape: () => onClose(),
      ArrowDown: () => setFocused((current) => nextEnabled(items, current, 1)),
      ArrowUp: () => setFocused((current) => nextEnabled(items, current < 0 ? 0 : current, -1)),
      Enter: () => {
        const item = items[focused];
        if (!item || !isAction(item) || item.disabled) {
          return;
        }
        onClose();
        item.run();
      },
    };
    const onKey = (event: KeyboardEvent) => {
      const handler = keys[event.key];
      if (!handler) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      handler(event);
    };
    win.addEventListener('keydown', onKey, true);
    return () => win.removeEventListener('keydown', onKey, true);
  }, [win, items, focused, onClose]);

  return createPortal(
    <>
      <div
        className={`fixed inset-0 ${LAYER.menuBackdrop}`}
        onMouseDown={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        ref={ref}
        role="menu"
        className={`lm-glass lm-shadow lm-anim-pop fixed ${LAYER.menu} min-w-[210px] max-w-[min(440px,calc(100vw-12px))] overflow-y-auto rounded-lumen border border-edge p-1`}
        style={{
          left: placement?.left ?? x,
          top: placement?.top ?? y,
          maxHeight: placement?.maxHeight,
          // Invisible until measured: otherwise the menu flashes briefly at the
          // unchecked raw position when it does not fit there.
          visibility: placement ? undefined : 'hidden',
        }}
      >
        {items.map((item, index) => (
          <MenuRow
            key={rowKey(item, index)}
            item={item}
            focused={index === focused}
            onHover={() => setFocused(index)}
            onRun={() => {
              if (!isAction(item)) {
                return;
              }
              onClose();
              item.run();
            }}
          />
        ))}
      </div>
    </>,
    doc.body,
  );
}

function rowKey(item: MenuItem, index: number): string {
  if (item === 'sep') {
    return `sep-${index}`;
  }
  if (!isAction(item)) {
    return `header-${index}`;
  }
  return `${item.label}-${index}`;
}

function MenuRow({ item, focused, onHover, onRun }: {
  item: MenuItem;
  focused: boolean;
  onHover: () => void;
  onRun: () => void;
}) {
  if (item === 'sep') {
    return <div className="my-1 h-px bg-edge" />;
  }
  if (!isAction(item)) {
    return (
      <div className="truncate px-2 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle">
        {item.header}
      </div>
    );
  }
  const Icon = item.icon;
  const tone = item.danger ? 'text-bad hover:bg-bad/12' : 'text-muted hover:bg-hover hover:text-fg';
  return (
    <button
      role="menuitem"
      disabled={item.disabled}
      onMouseEnter={onHover}
      onClick={onRun}
      className={[
        'lm-transition flex w-full items-center gap-2 rounded-lumen-sm px-2 py-1 text-left text-[12.5px] disabled:pointer-events-none disabled:opacity-40',
        tone,
        focused ? 'bg-hover text-fg' : '',
      ].join(' ')}
    >
      <RowIcon icon={Icon} checked={item.checked} />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{item.label}</span>
        {item.detail && <span className="block truncate font-mono text-[10px] text-subtle">{item.detail}</span>}
      </span>
      {item.hint && <span className="shrink-0 text-[10.5px] text-subtle">{item.hint}</span>}
    </button>
  );
}

function RowIcon({ icon: Icon, checked }: { icon?: LucideIcon; checked?: boolean; }) {
  if (checked) {
    return <span className="w-3 shrink-0 text-center text-[11px] text-accent">✓</span>;
  }
  if (!Icon) {
    return <span className="w-3 shrink-0" />;
  }
  return <Icon size={12} className="shrink-0 opacity-80" />;
}

/** Open a menu under an element — for dropdown buttons. */
export function menuBelow(element: HTMLElement): { x: number; y: number; } {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.bottom + 4 };
}
