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
 * Helpers of the sessions: the password of a connection (asked for when it
 * is not saved) and the object tree shown under a connected one.
 */

/** Passwords are typed once per run for connections that do not save theirs. */
export function createPasswordSource({ ctx, t, connections }) {
  /** Passwords typed for this run only (connections that do not save theirs). */
  const typed = new Map();

  async function passwordFor(connection) {
    if (connection.type === 'sqlite') {
      return '';
    }
    if (connection.savePassword !== false) {
      return connections.password(connection.id);
    }
    if (typed.has(connection.id)) {
      return typed.get(connection.id);
    }
    const answer = await ctx.ui.input(t('connect.passwordTitle', { name: connection.name }), [
      { id: 'password', label: t('field.password'), type: 'password' },
    ], { submitLabel: t('connect.submit') });
    if (!answer) {
      return null;
    }
    typed.set(connection.id, answer.password ?? '');
    return answer.password ?? '';
  }

  return { passwordFor, forget: (id) => typed.delete(id) };
}

/** What the tree shows under a connection. */
export async function loadTree(driver) {
  if (driver.kind === 'sql') {
    return { schemas: await driver.tree() };
  }
  if (driver.kind === 'redis') {
    return { databases: await driver.databases() };
  }
  const names = await driver.databases();
  const databases = await Promise.all(names.slice(0, 64).map(async (name) => ({
    name,
    collections: await driver.collections(name).catch(() => []),
  })));
  return { databases };
}
