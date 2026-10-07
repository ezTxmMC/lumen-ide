/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { StateEffect, StateField } from '@codemirror/state';
import { EditorView, showTooltip, type Tooltip } from '@codemirror/view';
import { t } from '@/i18n';
import { breakpoints } from '../state/breakpoints';
import { debug } from '../manager';
import { editBreakpoint } from '../actions';
import { infoFacet } from './marks';

/* ------------------------------------------------------------------ *
 * Right-click menu
 * ------------------------------------------------------------------ */

interface MenuState {
  pos: number;
  line: number;
}

export const setMenu = StateEffect.define<MenuState | null>();

interface MenuItem {
  label: string;
  run: () => void;
  danger?: boolean;
}

function menuItems(path: string, line: number): MenuItem[] {
  const bp = breakpoints.at(path, line);
  const running = debug.hasSessions;
  const debugItem: MenuItem = running
    ? { label: t('debug.menu.runToLine'), run: () => void debug.runToCursor(path, line) }
    : { label: t('debug.menu.debugFromHere'), run: () => void debug.debugFrom(path, line) };
  if (!bp) {
    return [
      { label: t('debug.menu.add'), run: () => breakpoints.add(path, line) },
      { label: t('debug.menu.addConditional'), run: () => editBreakpoint(path, line, 'condition') },
      { label: t('debug.menu.addLogpoint'), run: () => editBreakpoint(path, line, 'logMessage') },
      debugItem,
    ];
  }
  return [
    { label: t('debug.menu.editCondition'), run: () => editBreakpoint(path, line, 'condition') },
    { label: t('debug.menu.editHitCount'), run: () => editBreakpoint(path, line, 'hitCondition') },
    { label: t('debug.menu.editLogpoint'), run: () => editBreakpoint(path, line, 'logMessage') },
    { label: bp.enabled ? t('debug.menu.disable') : t('debug.menu.enable'), run: () => breakpoints.update(bp.id, { enabled: !bp.enabled }) },
    debugItem,
    { label: t('debug.menu.remove'), run: () => breakpoints.remove(bp.id), danger: true },
  ];
}

function renderMenu(view: EditorView, menu: MenuState): HTMLElement {
  const dom = document.createElement('div');
  dom.className = 'lm-menu lm-debug-menu';
  const path = view.state.facet(infoFacet).path;
  const title = document.createElement('div');
  title.className = 'lm-menu-title';
  title.textContent = t('debug.menu.title', { line: menu.line + 1 });
  dom.append(title);
  const close = () => view.dispatch({ effects: setMenu.of(null) });
  for (const item of path ? menuItems(path, menu.line) : []) {
    const row = document.createElement('div');
    row.className = item.danger ? 'lm-menu-item lm-debug-menu-danger' : 'lm-menu-item';
    row.setAttribute('role', 'menuitem');
    row.textContent = item.label;
    row.addEventListener('mousedown', (event) => event.preventDefault());
    row.addEventListener('click', () => {
      close();
      item.run();
    });
    dom.append(row);
  }
  return dom;
}

export const menuField = StateField.define<MenuState | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setMenu)) {
        return effect.value;
      }
    }
    if (value && tr.docChanged) {
      return null;
    }
    return value;
  },
  provide: (field) => showTooltip.compute([field], (state): Tooltip | null => {
    const menu = state.field(field);
    if (!menu) {
      return null;
    }
    return {
      pos: menu.pos,
      above: false,
      strictSide: false,
      arrow: false,
      create: (view) => {
        const dom = renderMenu(view, menu);
        const outside = (event: MouseEvent) => {
          if (dom.contains(event.target as Node)) {
            return;
          }
          view.dispatch({ effects: setMenu.of(null) });
        };
        const escape = (event: KeyboardEvent) => {
          if (event.key !== 'Escape') {
            return;
          }
          event.stopPropagation();
          view.dispatch({ effects: setMenu.of(null) });
        };
        return {
          dom,
          mount: () => {
            document.addEventListener('mousedown', outside, true);
            document.addEventListener('keydown', escape, true);
          },
          destroy: () => {
            document.removeEventListener('mousedown', outside, true);
            document.removeEventListener('keydown', escape, true);
          },
        };
      },
    };
  }),
});
