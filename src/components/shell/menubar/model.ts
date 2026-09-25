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
 * The menu bar's model: menus describe their entries — mostly command ids —
 * and `resolveRows` turns them into rows at the moment a menu opens, with the
 * command's current title, shortcut and `when` state.
 */

import { formatBinding, formatBindingsFor } from '@/core/keybindings';
import type { Command } from '@/core/types';

export type MenuEntry =
  | 'sep'
  /** A command from the registry. `keys`: a shortcut to show when the command has none of its own (the clipboard's). */
  | { command: string; label?: string; checked?: boolean; keys?: string; }
  | { label: string; run: () => void; disabled?: boolean; checked?: boolean; hint?: string; detail?: string; }
  | { label: string; submenu: () => MenuEntry[]; };

export interface MenuSpec {
  id: string;
  label: string;
  items: () => MenuEntry[];
}

export interface ActionRow {
  kind: 'action';
  /** The command behind the row, when there is one. */
  commandId?: string;
  label: string;
  run: () => void;
  hint?: string;
  detail?: string;
  disabled?: boolean;
  checked?: boolean;
}

export interface SubmenuRow {
  kind: 'submenu';
  label: string;
  rows: () => Row[];
}

export type Row = ActionRow | SubmenuRow | { kind: 'sep'; };

/** Every command by id, hidden ones included — a menu shows those greyed out. */
export type CommandIndex = Map<string, Command>;

function commandRow(entry: Extract<MenuEntry, { command: string; }>, commands: CommandIndex): Row | null {
  const command = commands.get(entry.command);
  // Commands of features that are off (no debugger, no updater) simply leave no row.
  if (!command) {
    return null;
  }
  const hint = formatBindingsFor(command.id) ?? (entry.keys ? formatBinding(entry.keys) : undefined);
  return {
    kind: 'action',
    commandId: command.id,
    label: entry.label ?? command.title,
    hint,
    checked: entry.checked,
    disabled: command.when ? !command.when() : false,
    run: () => void command.run(),
  };
}

function toRow(entry: MenuEntry, commands: CommandIndex): Row | null {
  if (entry === 'sep') {
    return { kind: 'sep' };
  }
  if ('command' in entry) {
    return commandRow(entry, commands);
  }
  if ('submenu' in entry) {
    const make = entry.submenu;
    return { kind: 'submenu', label: entry.label, rows: () => resolveRows(make(), commands) };
  }
  return { kind: 'action', ...entry };
}

/** Rows for entries; separators only where something stands on both sides. */
export function resolveRows(entries: MenuEntry[], commands: CommandIndex): Row[] {
  const rows: Row[] = [];
  for (const entry of entries) {
    const row = toRow(entry, commands);
    if (!row) {
      continue;
    }
    if (row.kind === 'sep' && (!rows.length || rows[rows.length - 1].kind === 'sep')) {
      continue;
    }
    rows.push(row);
  }
  if (rows[rows.length - 1]?.kind === 'sep') {
    rows.pop();
  }
  return rows;
}

export const isSelectable = (row: Row | undefined) =>
  Boolean(row && row.kind !== 'sep' && !(row.kind === 'action' && row.disabled));

/** The next selectable row from `from` in direction `step`, wrapping around; -1 when there is none. */
export function nextSelectable(rows: Row[], from: number, step: 1 | -1): number {
  for (let offset = 1; offset <= rows.length; offset++) {
    const index = (from + step * offset + rows.length * 2) % rows.length;
    if (isSelectable(rows[index])) {
      return index;
    }
  }
  return -1;
}
