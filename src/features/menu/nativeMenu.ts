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
 * macOS: hands the menu bar's menus to the native menu bar at the top of the
 * screen. Same menus, same commands as the in-window menu bar of the other
 * systems; a click comes back by id and runs the command here.
 */

import { buildCommands } from '@/core/commands';
import { useStore } from '@/state/store';
import { buildMenus } from '@/components/shell/menubar/menus';
import { resolveRows, type Row } from '@/components/shell/menubar/model';

interface NativeItem {
  label?: string;
  id?: string;
  role?: 'cut' | 'copy' | 'paste' | 'selectAll';
  checked?: boolean;
  enabled?: boolean;
  separator?: boolean;
  submenu?: NativeItem[];
}

const ROLES: Record<string, NativeItem['role']> = {
  'edit.cut': 'cut', 'edit.copy': 'copy', 'edit.paste': 'paste', 'edit.selectAll': 'selectAll',
};

let actions = new Map<string, () => void>();
let last = '';

function convert(rows: Row[], into: Map<string, () => void>): NativeItem[] {
  return rows.map((row): NativeItem => {
    if (row.kind === 'sep') {
      return { separator: true };
    }
    if (row.kind === 'submenu') {
      return { label: row.label, submenu: convert(row.rows(), into) };
    }
    const id = String(into.size);
    into.set(id, row.run);
    const role = row.commandId ? ROLES[row.commandId] : undefined;
    return {
      label: row.label,
      id,
      role,
      enabled: !row.disabled,
      ...(row.checked === undefined ? {} : { checked: row.checked }),
    };
  });
}

function push() {
  const commands = new Map(buildCommands({ includeHidden: true }).map((command) => [command.id, command]));
  const next = new Map<string, () => void>();
  const menus = buildMenus().map((menu) => ({ label: menu.label, items: convert(resolveRows(menu.items(), commands), next) }));
  const json = JSON.stringify(menus);
  // Clicks map to the newest actions even when the menus themselves did not change.
  actions = next;
  if (json === last) {
    return;
  }
  last = json;
  void window.lumen.menu.set(menus).catch(() => { last = ''; });
}

export async function init() {
  const info = await window.lumen.app.info();
  if (info.platform !== 'darwin') {
    return;
  }
  window.lumen.menu.onClick((id) => actions.get(id)?.());
  let timer: number | undefined;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(push, 250);
  };
  useStore.subscribe(schedule);
  // Another window may have set the shared menu bar since.
  window.addEventListener('focus', () => {
    last = '';
    schedule();
  });
  schedule();
}
