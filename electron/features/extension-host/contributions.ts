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
 * What extension code adds to the interface: views (panels), commands and
 * status-bar items.
 *
 * The interface pulls a view's content (`render`) when the view becomes
 * visible and whenever the extension says it changed (`refresh`) — a view
 * nobody looks at costs nothing.
 */

import { BrowserWindow } from 'electron';
import type { StatusItem, ViewActionEvent, ViewContent, ViewProvider } from './contract';

const LOCAL_ID = /^[a-z][a-z0-9.-]{0,63}$/;
const MAX_NODES = 5000;
/** Rows of all grids of a view together; a grid only draws the visible ones. */
const MAX_GRID_ROWS = 200_000;

type CommandHandler = (args?: unknown) => unknown;

const views = new Map<string, ViewProvider>();
const commands = new Map<string, CommandHandler>();
const status = new Map<string, StatusItem & { extensionId: string; id: string; }>();

const keyOf = (extensionId: string, id: string) => `${extensionId}/${id}`;

/** Views and status items show in every window, so every window hears of changes. */
function send(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

function checkLocalId(id: string, what: string) {
  if (typeof id !== 'string' || !LOCAL_ID.test(id)) {
    throw new Error(`Invalid ${what} id: ${id}`);
  }
}

/** Count the nodes (and grid rows) of a view, so a runaway extension cannot flood the interface. */
function countNodes(content: ViewContent): { nodes: number; rows: number; } {
  let count = 0;
  let rows = 0;
  const walk = (nodes: ViewContent['nodes']) => {
    for (const node of nodes) {
      count++;
      if (node.type === 'section' || node.type === 'row') {
        walk(node.children);
      }
      if (node.type === 'item' && node.children) {
        walk(node.children);
      }
      if (node.type === 'grid') {
        rows += node.rows?.length ?? 0;
      }
    }
  };
  walk(content.nodes ?? []);
  return { nodes: count, rows };
}

export const contributions = {
  registerView(extensionId: string, viewId: string, provider: ViewProvider) {
    checkLocalId(viewId, 'view');
    views.set(keyOf(extensionId, viewId), provider);
    send('extensions:view:changed', { extensionId, viewId });
  },

  /** Tell the interface a view's content changed; it asks for it again when visible. No `instance`: every tab of an editor view. */
  refreshView(extensionId: string, viewId: string, instance?: string) {
    send('extensions:view:changed', { extensionId, viewId, ...(typeof instance === 'string' ? { instance } : {}) });
  },

  registerCommand(extensionId: string, commandId: string, handler: CommandHandler) {
    checkLocalId(commandId, 'command');
    commands.set(keyOf(extensionId, commandId), handler);
  },

  setStatus(extensionId: string, itemId: string, item: StatusItem | null) {
    checkLocalId(itemId, 'status item');
    const key = keyOf(extensionId, itemId);
    if (!item) {
      status.delete(key);
    }
    if (item) {
      status.set(key, { ...item, text: String(item.text ?? '').slice(0, 120), extensionId, id: itemId });
    }
    send('extensions:status:changed', null);
  },

  statusItems() {
    return [...status.values()];
  },

  async render(extensionId: string, viewId: string, instance?: string): Promise<ViewContent> {
    const provider = views.get(keyOf(extensionId, viewId));
    if (!provider) {
      return { nodes: [] };
    }
    const content = await provider.render(typeof instance === 'string' ? instance : undefined);
    if (!content || !Array.isArray(content.nodes)) {
      return { nodes: [] };
    }
    const size = countNodes(content);
    if (size.nodes > MAX_NODES) {
      throw new Error(`The view ${viewId} is too large (more than ${MAX_NODES} entries)`);
    }
    if (size.rows > MAX_GRID_ROWS) {
      throw new Error(`The view ${viewId} is too large (more than ${MAX_GRID_ROWS} rows)`);
    }
    return content;
  },

  async action(extensionId: string, viewId: string, event: ViewActionEvent) {
    const provider = views.get(keyOf(extensionId, viewId));
    if (!provider) {
      throw new Error(`View not available: ${viewId}`);
    }
    const instance = typeof event?.instance === 'string' ? event.instance : undefined;
    if (event?.action === '__show') {
      provider.onShow?.(instance);
      return null;
    }
    if (event?.action === '__close') {
      if (instance !== undefined) {
        provider.onClose?.(instance);
      }
      return null;
    }
    if (!provider.onAction) {
      return null;
    }
    return provider.onAction({
      action: String(event?.action ?? ''), payload: event?.payload, inputs: event?.inputs ?? {},
      ...(instance !== undefined ? { instance } : {}),
    });
  },

  async runCommand(extensionId: string, commandId: string, args?: unknown) {
    const handler = commands.get(keyOf(extensionId, commandId));
    if (!handler) {
      throw new Error(`Command not available: ${commandId}`);
    }
    return handler(args);
  },

  removeExtension(extensionId: string) {
    const prefix = `${extensionId}/`;
    for (const map of [views, commands, status] as Map<string, unknown>[]) {
      for (const key of [...map.keys()]) {
        if (key.startsWith(prefix)) {
          map.delete(key);
        }
      }
    }
    send('extensions:status:changed', null);
  },
};
