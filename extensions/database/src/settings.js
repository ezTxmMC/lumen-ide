/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The extension's settings as numbers and switches, with the defaults of `extension.json`. */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function createSettings(ctx) {
  const number = (key, fallback, min, max) => {
    const value = Number(ctx.settings.get(key));
    return Number.isFinite(value) && ctx.settings.get(key) !== '' ? clamp(value, min, max) : fallback;
  };
  return {
    pageSize: () => number('pageSize', 200, 10, 10_000),
    maxRows: () => number('maxRows', 1000, 10, 100_000),
    /** Milliseconds; 0 means no limit. */
    timeoutMs: () => number('queryTimeout', 30, 0, 86_400) * 1000,
    confirmCommit: () => ctx.settings.get('confirmCommit') !== 'false',
    redisScanLimit: () => number('redisScanLimit', 1000, 50, 100_000),
  };
}
