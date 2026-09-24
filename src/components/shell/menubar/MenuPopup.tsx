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
 * One dropdown of the menu bar — the top-level menu or a submenu beside its
 * row. Rows look like `ContextMenu`'s; unlike it there is no backdrop, so the
 * pointer can move on to the neighbouring menu (VS Code's hover-to-switch).
 *
 * Every row cancels `mousedown`: focus stays where it was — the editor keeps
 * its selection for Cut, Copy, Paste and Undo.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { LAYER } from '../../ui/layers';
import type { Row } from './model';

/** Where a popup hangs: `x`/`y` its preferred top-left corner, `flipX` its right edge when it has to go left instead. */
export interface Anchor {
  x: number;
  y: number;
  flipX?: number;
}

const EDGE_MARGIN = 6;

/** Marks the bar and every popup, so a click on any of them does not count as “outside”. */
export const MENUBAR_ATTR = 'data-lumen-menubar';

function place(element: HTMLElement, anchor: Anchor) {
  const width = element.offsetWidth;
  const height = Math.min(element.offsetHeight, window.innerHeight - 2 * EDGE_MARGIN);
  const fitsRight = anchor.x + width <= window.innerWidth - EDGE_MARGIN;
  const left = fitsRight ? anchor.x : Math.max(EDGE_MARGIN, (anchor.flipX ?? window.innerWidth) - width);
  const top = Math.max(EDGE_MARGIN, Math.min(anchor.y, window.innerHeight - height - EDGE_MARGIN));
  return { left, top, maxHeight: window.innerHeight - 2 * EDGE_MARGIN };
}

export function MenuPopup({ rows, active, anchor, level, onHover, onActivate }: {
  rows: Row[];
  active: number;
  anchor: Anchor;
  level: number;
  /** The pointer is over a row (`element` for placing a submenu beside it). */
  onHover: (index: number, element: HTMLElement) => void;
  onActivate: (index: number, element: HTMLElement) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<ReturnType<typeof place> | null>(null);

  useLayoutEffect(() => {
    if (!ref.current) {
      return;
    }
    setPlacement(place(ref.current, anchor));
  }, [anchor, rows.length]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      {...{ [MENUBAR_ATTR]: '' }}
      data-level={level}
      onMouseDown={(event) => event.preventDefault()}
      className={`lm-glass lm-shadow lm-anim-pop fixed ${LAYER.menu} min-w-[240px] max-w-[min(460px,calc(100vw-12px))] overflow-y-auto rounded-lumen border border-edge p-1`}
      style={{
        left: placement?.left ?? anchor.x,
        top: placement?.top ?? anchor.y,
        maxHeight: placement?.maxHeight,
        visibility: placement ? undefined : 'hidden',
      }}
    >
      {rows.map((row, index) => (
        <MenuRow
          key={index}
          row={row}
          index={index}
          active={index === active}
          onHover={onHover}
          onActivate={onActivate}
        />
      ))}
    </div>,
    document.body,
  );
}

function MenuRow({ row, index, active, onHover, onActivate }: {
  row: Row;
  index: number;
  active: boolean;
  onHover: (index: number, element: HTMLElement) => void;
  onActivate: (index: number, element: HTMLElement) => void;
}) {
  if (row.kind === 'sep') {
    return <div className="my-1 h-px bg-edge" />;
  }
  const disabled = row.kind === 'action' && row.disabled;
  return (
    <button
      role="menuitem"
      data-row={index}
      disabled={disabled}
      aria-haspopup={row.kind === 'submenu' || undefined}
      aria-checked={row.kind === 'action' && row.checked !== undefined ? row.checked : undefined}
      onMouseEnter={(event) => onHover(index, event.currentTarget)}
      onClick={(event) => onActivate(index, event.currentTarget)}
      className={[
        'lm-transition flex w-full items-center gap-2 rounded-lumen-sm px-2 py-1 text-left text-[12.5px] disabled:pointer-events-none disabled:opacity-40',
        active ? 'bg-hover text-fg' : 'text-muted',
      ].join(' ')}
    >
      <span className="w-3 shrink-0 text-center text-[11px] text-accent">{row.kind === 'action' && row.checked ? '✓' : ''}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{row.label}</span>
        {row.kind === 'action' && row.detail && <span className="block truncate font-mono text-[10px] text-subtle">{row.detail}</span>}
      </span>
      {row.kind === 'action' && row.hint && <span className="ml-4 shrink-0 text-[10.5px] text-subtle">{row.hint}</span>}
      {row.kind === 'submenu' && <ChevronRight size={12} className="shrink-0 opacity-70" />}
    </button>
  );
}
