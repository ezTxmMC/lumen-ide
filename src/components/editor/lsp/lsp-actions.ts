/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { offsetToPos, posToOffset } from '@/core/completion/apply';
import { EditorView, keymap, showTooltip } from '@codemirror/view';
import { Prec, StateEffect, StateField } from '@codemirror/state';
import { lsp } from '@/core/lsp/manager';
import type { LspClient } from '@/core/lsp/client';
import { type CodeAction, type LspCommand, type Range } from '@/core/lsp/protocol';
import { applyWorkspaceEdit } from '@/lib/editor/workspace-edit';
import { t } from '@/i18n';
import { useStore } from '@/state/store';
import { selectionRange, readyClient } from './lsp-support';

interface MenuItem {
  label: string;
  detail?: string;
  disabled?: string;
  preferred?: boolean;
  run: () => void | Promise<void>;
}

interface MenuSpec {
  title: string;
  items: MenuItem[];
  pos: number;
  selected: number;
}

const setMenu = StateEffect.define<MenuSpec | null>();

export const menuField = StateField.define<MenuSpec | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setMenu)) {
        return e.value;
      }
    }
    if (value && tr.docChanged) {
      return null;
    }
    return value;
  },
  provide: (field) =>
    showTooltip.compute([field], (state) => {
      const menu = state.field(field);
      if (!menu) {
        return null;
      }
      return {
        pos: menu.pos,
        above: false,
        strictSide: false,
        arrow: false,
        create: (view) => ({ dom: renderMenu(view, menu) }),
      };
    }),
});

function renderMenu(view: EditorView, menu: MenuSpec): HTMLElement {
  const dom = document.createElement('div');
  dom.className = 'lm-menu';
  const title = document.createElement('div');
  title.className = 'lm-menu-title';
  title.textContent = menu.title;
  dom.append(title);
  if (!menu.items.length) {
    const empty = document.createElement('div');
    empty.className = 'lm-menu-empty';
    empty.textContent = t('editor.nav.noActions');
    dom.append(empty);
  }
  menu.items.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'lm-menu-item';
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(i === menu.selected));
    if (item.disabled) {
      row.setAttribute('aria-disabled', 'true');
      row.title = item.disabled;
    }
    const label = document.createElement('span');
    label.textContent = (item.preferred ? '★ ' : '') + item.label;
    row.append(label);
    if (item.detail) {
      const kind = document.createElement('span');
      kind.className = 'lm-menu-kind';
      kind.textContent = item.detail;
      row.append(kind);
    }
    row.addEventListener('mousedown', (e) => e.preventDefault());
    row.addEventListener('click', () => {
      if (item.disabled) {
        return;
      }
      closeMenu(view);
      void item.run();
    });
    dom.append(row);
  });
  queueMicrotask(() => dom.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
  return dom;
}

function closeMenu(view: EditorView) {
  view.dispatch({ effects: setMenu.of(null) });
  view.focus();
}

export const menuKeymap = Prec.highest(keymap.of([
  {
    key: 'ArrowDown',
    run: (view) => {
      const menu = view.state.field(menuField, false);
      if (!menu || !menu.items.length) {
        return false;
      }
      view.dispatch({ effects: setMenu.of({ ...menu, selected: (menu.selected + 1) % menu.items.length }) });
      return true;
    },
  },
  {
    key: 'ArrowUp',
    run: (view) => {
      const menu = view.state.field(menuField, false);
      if (!menu || !menu.items.length) {
        return false;
      }
      view.dispatch({ effects: setMenu.of({ ...menu, selected: (menu.selected - 1 + menu.items.length) % menu.items.length }) });
      return true;
    },
  },
  {
    key: 'Enter',
    run: (view) => {
      const menu = view.state.field(menuField, false);
      if (!menu) {
        return false;
      }
      const item = menu.items[menu.selected];
      closeMenu(view);
      if (item && !item.disabled) {
        void item.run();
      }
      return true;
    },
  },
  {
    key: 'Escape',
    run: (view) => {
      if (!view.state.field(menuField, false)) {
        return false;
      }
      closeMenu(view);
      return true;
    },
  },
]));

function overlaps(a: Range, b: Range) {
  const before = a.end.line < b.start.line || (a.end.line === b.start.line && a.end.character < b.start.character);
  const after = b.end.line < a.start.line || (b.end.line === a.start.line && b.end.character < a.start.character);
  return !before && !after;
}

export async function showCodeActions(
  view: EditorView, filePath: string, only?: string[], range?: Range,
): Promise<boolean> {
  const client = readyClient(filePath);
  if (!client?.supports('codeActionProvider')) {
    useStore.getState().notify(t('lsp.editor.noCodeActions'), 'info');
    return false;
  }
  const target = range ?? selectionRange(view);
  const diagnostics = lsp.diagnostics(filePath).filter((d) => overlaps(d.range, target));
  const pos = posToOffset(view.state.doc, target.start);

  view.dispatch({ effects: setMenu.of({ title: 'Aktionen werden geladen…', items: [], pos, selected: 0 }) });
  const actions = await client.codeActions(filePath, target, diagnostics, only);

  const items: MenuItem[] = actions.map((action) => {
    const isCommand = !('kind' in action) && !('edit' in action) && 'command' in action && typeof action.command === 'string';
    const codeAction = action as CodeAction;
    return {
      label: action.title,
      detail: isCommand ? 'Befehl' : kindLabel(codeAction.kind),
      disabled: codeAction.disabled?.reason,
      preferred: codeAction.isPreferred,
      run: () => runCodeAction(client, isCommand ? (action as LspCommand) : codeAction),
    };
  });
  items.sort((a, b) => Number(b.preferred ?? false) - Number(a.preferred ?? false));

  view.dispatch({
    effects: setMenu.of({
      title: only?.includes('source.organizeImports') ? 'Imports' : 'Code-Aktionen',
      items,
      pos,
      selected: 0,
    }),
  });
  return true;
}

export function kindLabel(kind: string | undefined): string {
  if (!kind) {
    return '';
  }
  if (kind.startsWith('quickfix')) {
    return 'Korrektur';
  }
  if (kind.startsWith('refactor.extract')) {
    return 'Extrahieren';
  }
  if (kind.startsWith('refactor.inline')) {
    return 'Inline';
  }
  if (kind.startsWith('refactor.rewrite')) {
    return 'Umschreiben';
  }
  if (kind.startsWith('refactor')) {
    return 'Refactoring';
  }
  if (kind.startsWith('source.organizeImports')) {
    return 'Imports';
  }
  if (kind.startsWith('source.fixAll')) {
    return 'Alles korrigieren';
  }
  if (kind.startsWith('source')) {
    return 'Quelle';
  }
  return kind;
}

async function runCodeAction(client: LspClient, action: CodeAction | LspCommand) {
  try {
    if ('command' in action && typeof action.command === 'string') {
      await client.executeCommand(action as LspCommand);
      return;
    }
    const resolved = await client.resolveCodeAction(action as CodeAction);
    if (resolved.edit) {
      await applyWorkspaceEdit(resolved.edit, resolved.title);
    }
    if (resolved.command) {
      await client.executeCommand(resolved.command);
    }
  } catch (err) {
    useStore.getState().notify(t('lsp.editor.actionFailed', { error: (err as Error).message }), 'error');
  }
}

/** Organise imports: run the first matching `source.organizeImports` action straight away. */
export async function organizeImports(view: EditorView, filePath: string): Promise<boolean> {
  const client = readyClient(filePath);
  if (!client?.supports('codeActionProvider')) {
    return false;
  }
  const doc = view.state.doc;
  const whole: Range = { start: { line: 0, character: 0 }, end: offsetToPos(doc, doc.length) };
  const actions = await client.codeActions(filePath, whole, [], ['source.organizeImports']);
  const action = actions.find((a) => (a as CodeAction).kind?.startsWith('source.organizeImports')) ?? actions[0];
  if (!action) {
    return false;
  }
  await runCodeAction(client, action);
  return true;
}
