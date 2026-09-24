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
 * Open connections: connecting (asking for a password that is not saved),
 * the object tree of each connection, and closing again. Everything that
 * shows a connection listens here for changes.
 */

import { openDriver } from './drivers/index.js';
import { errorText } from './drivers/errors.js';
import { createPasswordSource, loadTree } from './session-support.js';

export function createSessions({ ctx, t, connections }) {
  /** id → { status: 'connecting' | 'connected' | 'error', driver, tree, error, pending } */
  const sessions = new Map();
  const { passwordFor, forget } = createPasswordSource({ ctx, t, connections });
  const listeners = new Set();
  const changed = () => {
    for (const fn of listeners) {
      fn();
    }
  };

  const stateOf = (id) => sessions.get(id) ?? { status: 'idle' };

  async function connect(id) {
    const known = sessions.get(id);
    if (known?.status === 'connected') {
      return known.driver;
    }
    if (known?.pending) {
      return known.pending;
    }
    const connection = connections.get(id);
    if (!connection) {
      throw new Error(t('error.noConnection'));
    }

    const pending = (async () => {
      const password = await passwordFor(connection);
      if (password === null) {
        sessions.delete(id);
        changed();
        return null;
      }
      const driver = await openDriver(connection, { password, ctx, t });
      const tree = await loadTree(driver).catch((err) => ({ error: errorText(t, err) }));
      sessions.set(id, { status: 'connected', driver, tree });
      changed();
      return driver;
    })();
    sessions.set(id, { status: 'connecting', pending });
    changed();
    try {
      return await pending;
    } catch (err) {
      forget(id);
      sessions.set(id, { status: 'error', error: errorText(t, err) });
      changed();
      throw err;
    }
  }

  async function disconnect(id) {
    const known = sessions.get(id);
    sessions.delete(id);
    changed();
    await known?.driver?.close().catch(() => {});
  }

  return {
    state: stateOf,
    connect,
    disconnect,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** The driver of a connection, connecting first when needed. `null` when the user cancelled. */
    driver: (id) => connect(id),

    async refreshTree(id) {
      const known = sessions.get(id);
      if (known?.status !== 'connected') {
        return;
      }
      known.tree = await loadTree(known.driver).catch((err) => ({ error: errorText(t, err) }));
      changed();
    },

    /** Try a connection without keeping it open. */
    async test(connection, password) {
      const driver = await openDriver(connection, { password, ctx, t });
      try {
        if (driver.kind === 'sql') {
          await driver.query('SELECT 1', [], { maxRows: 1, timeoutMs: 15_000 });
        }
        if (driver.kind !== 'sql') {
          await loadTree(driver);
        }
      } finally {
        await driver.close().catch(() => {});
      }
    },

    async closeAll() {
      const all = [...sessions.values()];
      sessions.clear();
      await Promise.all(all.map((entry) => entry.driver?.close().catch(() => {})));
    },
  };
}
