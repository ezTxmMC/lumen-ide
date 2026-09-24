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
 * The menu bar in the title bar: File, Edit, Selection, View, Go, Run,
 * Terminal, Help — as in VS Code.
 *
 * - A click opens a menu; while one is open, pointing at a neighbour switches.
 * - Alt on its own focuses the bar; ←/→ move, ↓/Enter open, Esc leaves.
 * - Inside a menu ↑/↓ move, → opens a submenu or goes to the next menu,
 *   ← goes back, a letter jumps to the next entry starting with it.
 * - Narrow windows get a single button holding every menu as a submenu.
 *
 * Nothing here takes focus, so the editor keeps its selection for the
 * clipboard entries.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Menu } from 'lucide-react';
import { useT } from '@/i18n';
import { buildCommands } from '@/core/commands';
import { buildMenus } from './menus';
import { isSelectable, nextSelectable, resolveRows, type CommandIndex, type MenuSpec, type Row } from './model';
import { MENUBAR_ATTR, MenuPopup, type Anchor } from './MenuPopup';

/** Below this window width the menus fold into one button. */
const COMPACT_BELOW = 1200;

interface Level {
  rows: Row[];
  active: number;
  anchor: Anchor;
}

function subscribeResize(fn: () => void) {
  window.addEventListener('resize', fn);
  return () => window.removeEventListener('resize', fn);
}

const useCompact = () => useSyncExternalStore(subscribeResize, () => window.innerWidth < COMPACT_BELOW);

function commandIndex(): CommandIndex {
  return new Map(buildCommands({ includeHidden: true }).map((command) => [command.id, command]));
}

function rowElement(level: number, index: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${MENUBAR_ATTR}][data-level="${level}"] [data-row="${index}"]`);
}

function submenuAnchor(element: HTMLElement): Anchor {
  const rect = element.getBoundingClientRect();
  return { x: rect.right + 2, y: rect.top - 5, flipX: rect.left - 2 };
}

interface BarState {
  open: number | null;
  focused: number | null;
  stack: Level[];
  menus: MenuSpec[];
  openMenu(index: number, selectFirst: boolean): void;
  close(): void;
  setActive(level: number, index: number): void;
  openSubmenu(level: number, index: number, element: HTMLElement, selectFirst: boolean): void;
  activate(level: number, index: number, element: HTMLElement | null): void;
  setFocused(index: number | null): void;
  setStack(update: (current: Level[]) => Level[]): void;
}

/** Alt on its own, closing on outside clicks, and the keyboard while the bar is engaged. */
function useMenuBarListeners(latest: React.MutableRefObject<BarState>, engaged: boolean) {
  // Alt pressed and released on its own focuses the bar (or leaves it).
  useEffect(() => {
    let armed = false;
    const onDown = (event: KeyboardEvent) => {
      armed = event.key === 'Alt' && !event.ctrlKey && !event.shiftKey && !event.metaKey && !event.repeat;
    };
    const onUp = (event: KeyboardEvent) => {
      if (event.key !== 'Alt' || !armed) {
        return;
      }
      armed = false;
      event.preventDefault();
      const state = latest.current;
      if (state.open !== null || state.focused !== null) {
        state.close();
        return;
      }
      state.setFocused(0);
    };
    const disarm = () => { armed = false; };
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    window.addEventListener('mousedown', disarm, true);
    window.addEventListener('blur', disarm);
    return () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
      window.removeEventListener('mousedown', disarm, true);
      window.removeEventListener('blur', disarm);
    };
  }, []);

  // Closing: a click elsewhere, the window losing focus or changing size.
  useEffect(() => {
    if (!engaged) {
      return;
    }
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(`[${MENUBAR_ATTR}]`)) {
        return;
      }
      latest.current.close();
    };
    const onLeave = () => latest.current.close();
    document.addEventListener('mousedown', onPointer, true);
    window.addEventListener('blur', onLeave);
    window.addEventListener('resize', onLeave);
    return () => {
      document.removeEventListener('mousedown', onPointer, true);
      window.removeEventListener('blur', onLeave);
      window.removeEventListener('resize', onLeave);
    };
  }, [engaged]);

  // Keyboard while the bar is focused or a menu is open.
  useEffect(() => {
    if (!engaged) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        return;
      }
      const state = latest.current;
      const handled = state.open === null ? barKey(event, state) : menuKey(event, state);
      if (!handled) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [engaged]);
}

/** The bar has focus, no menu open. Returns whether the key was used. */
function barKey(event: KeyboardEvent, state: BarState): boolean {
  const count = state.menus.length;
  const current = state.focused ?? 0;
  const keys: Record<string, () => void> = {
    ArrowRight: () => state.setFocused((current + 1) % count),
    ArrowLeft: () => state.setFocused((current - 1 + count) % count),
    ArrowDown: () => state.openMenu(current, true),
    Enter: () => state.openMenu(current, true),
    ' ': () => state.openMenu(current, true),
    Escape: () => state.close(),
  };
  const handler = keys[event.key];
  if (!handler) {
    // Any other key goes where it was meant to; the bar lets go.
    state.close();
    return false;
  }
  handler();
  return true;
}

/** A menu is open. Every key is used, so nothing types into the editor behind it. */
function menuKey(event: KeyboardEvent, state: BarState): boolean {
  const level = state.stack.length - 1;
  const top = state.stack[level];
  if (!top || state.open === null) {
    return false;
  }
  const count = state.menus.length;
  const activeRow = top.rows[top.active];
  const closeLevel = () => state.setStack((current) => current.slice(0, level));
  const keys: Record<string, () => void> = {
    ArrowDown: () => state.setActive(level, nextSelectable(top.rows, top.active, 1)),
    ArrowUp: () => state.setActive(level, nextSelectable(top.rows, top.active < 0 ? top.rows.length : top.active, -1)),
    Home: () => state.setActive(level, nextSelectable(top.rows, -1, 1)),
    End: () => state.setActive(level, nextSelectable(top.rows, top.rows.length, -1)),
    ArrowRight: () => {
      const element = rowElement(level, top.active);
      if (activeRow?.kind === 'submenu' && element) {
        state.openSubmenu(level, top.active, element, true);
        return;
      }
      state.openMenu(((state.open ?? 0) + 1) % count, true);
    },
    ArrowLeft: () => {
      if (level > 0) {
        closeLevel();
        return;
      }
      state.openMenu(((state.open ?? 0) - 1 + count) % count, true);
    },
    Enter: () => state.activate(level, top.active, rowElement(level, top.active)),
    ' ': () => state.activate(level, top.active, rowElement(level, top.active)),
    Escape: () => {
      if (level > 0) {
        closeLevel();
        return;
      }
      state.close();
    },
    Tab: () => state.close(),
  };
  const handler = keys[event.key];
  if (handler) {
    handler();
    return true;
  }
  jumpToLetter(state, level, top, event.key);
  return true;
}

/** A letter: the next entry whose label starts with it. */
function jumpToLetter(state: BarState, level: number, top: Level, key: string) {
  if (key.length !== 1) {
    return;
  }
  const letter = key.toLowerCase();
  const count = top.rows.length;
  for (let offset = 1; offset <= count; offset++) {
    const index = (top.active + offset + count) % count;
    const row = top.rows[index];
    if (!isSelectable(row) || row.kind === 'sep') {
      continue;
    }
    if (!row.label.toLowerCase().startsWith(letter)) {
      continue;
    }
    state.setActive(level, index);
    return;
  }
}

/** Which menu is open, which level of submenus, and the actions that move through them. */
function useMenuBarState(menus: MenuSpec[], buttons: React.MutableRefObject<(HTMLButtonElement | null)[]>) {
  const [open, setOpen] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [stack, setStack] = useState<Level[]>([]);

  const close = () => {
    setOpen(null);
    setFocused(null);
    setStack([]);
  };

  const openMenu = (index: number, selectFirst: boolean) => {
    const spec = menus[index];
    const button = buttons.current[index];
    if (!spec || !button) {
      return;
    }
    const rows = resolveRows(spec.items(), commandIndex());
    const rect = button.getBoundingClientRect();
    setOpen(index);
    setFocused(null);
    setStack([{ rows, active: selectFirst ? nextSelectable(rows, -1, 1) : -1, anchor: { x: rect.left, y: rect.bottom + 3 } }]);
  };

  const setActive = (level: number, index: number) => {
    setStack((current) => current.slice(0, level + 1).map((entry, i) => (i === level ? { ...entry, active: index } : entry)));
  };

  const openSubmenu = (level: number, index: number, element: HTMLElement, selectFirst: boolean) => {
    const row = stack[level]?.rows[index];
    if (row?.kind !== 'submenu') {
      return;
    }
    const rows = row.rows();
    const child: Level = { rows, active: selectFirst ? nextSelectable(rows, -1, 1) : -1, anchor: submenuAnchor(element) };
    setStack((current) => [
      ...current.slice(0, level + 1).map((entry, i) => (i === level ? { ...entry, active: index } : entry)),
      child,
    ]);
  };

  const activate = (level: number, index: number, element: HTMLElement | null) => {
    const row = stack[level]?.rows[index];
    if (!row || !isSelectable(row)) {
      return;
    }
    if (row.kind === 'submenu') {
      if (element) {
        openSubmenu(level, index, element, true);
      }
      return;
    }
    if (row.kind !== 'action') {
      return;
    }
    close();
    row.run();
  };

  const hover = (level: number, index: number, element: HTMLElement) => {
    const row = stack[level]?.rows[index];
    if (row?.kind === 'submenu') {
      openSubmenu(level, index, element, false);
      return;
    }
    setActive(level, index);
  };

  return { open, focused, stack, setFocused, setStack, close, openMenu, setActive, openSubmenu, activate, hover };
}

export function MenuBar() {
  const t = useT();
  const compact = useCompact();
  const specs = buildMenus();
  const menus: MenuSpec[] = compact
    ? [{ id: 'application', label: t('menubar.menu.application'), items: () => specs.map((spec) => ({ label: spec.label, submenu: spec.items })) }]
    : specs;

  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const {
    open, focused, stack, setFocused, setStack, close, openMenu, setActive, openSubmenu, activate, hover,
  } = useMenuBarState(menus, buttons);

  // The listeners below read the latest state through this ref rather than re-subscribing on every change.
  const latest = useRef<BarState>(null as unknown as BarState);
  latest.current = { open, focused, stack, menus, openMenu, close, setActive, openSubmenu, activate, setFocused, setStack };
  useMenuBarListeners(latest, open !== null || focused !== null);

  return (
    <div
      role="menubar"
      {...{ [MENUBAR_ATTR]: '' }}
      className="flex shrink-0 items-center"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {menus.map((spec, index) => {
        const highlighted = open === index || focused === index;
        return (
          <button
            key={spec.id}
            ref={(element) => { buttons.current[index] = element; }}
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === index}
            title={compact ? spec.label : undefined}
            aria-label={spec.label}
            data-menu={spec.id}
            onMouseDown={(event) => {
              event.preventDefault();
              if (event.button !== 0) {
                return;
              }
              if (open === index) {
                close();
                return;
              }
              openMenu(index, false);
            }}
            onMouseEnter={() => {
              if (open === null || open === index) {
                return;
              }
              openMenu(index, false);
            }}
            className={[
              'lm-transition flex h-6 items-center rounded-lumen-sm px-2 text-[12px]',
              highlighted ? 'bg-hover text-fg' : 'text-muted hover:bg-hover hover:text-fg',
            ].join(' ')}
          >
            {compact ? <Menu size={14} /> : spec.label}
          </button>
        );
      })}
      {open !== null && stack.map((level, index) => (
        <MenuPopup
          key={`${open}-${index}`}
          rows={level.rows}
          active={level.active}
          anchor={level.anchor}
          level={index}
          onHover={(row, element) => hover(index, row, element)}
          onActivate={(row, element) => activate(index, row, element)}
        />
      ))}
    </div>
  );
}
