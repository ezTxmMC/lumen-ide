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
 * Running requests on a tedious connection: one at a time, parameters as
 * `@p1 …`, a row limit and a timeout that both cancel the running request.
 */

import tedious from 'tedious';
import { DriverError } from './errors.js';

const { Request, TYPES } = tedious;

function paramType(value) {
  if (value === null || value === undefined) {
    return TYPES.NVarChar;
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? TYPES.BigInt : TYPES.Float;
  }
  if (typeof value === 'boolean') {
    return TYPES.Bit;
  }
  if (value instanceof Uint8Array) {
    return TYPES.VarBinary;
  }
  return TYPES.NVarChar;
}

export function createRequester(conn) {
  /** Requests queue up: tedious refuses a second one while the first runs. */
  let queue = Promise.resolve();
  const serial = (fn) => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
  };

  function request(sql, params = [], options = {}) {
    return serial(() => new Promise((resolve, reject) => {
      const max = options.maxRows ?? Infinity;
      let columns = [];
      let rows = [];
      let truncated = false;
      let affected;
      let timer = null;
      let cancelled = false;
      const req = new Request(sql, (err, rowCount) => {
        clearTimeout(timer);
        if (err && cancelled && !truncated) {
          reject(new DriverError('timeout', { seconds: Math.round((options.timeoutMs ?? 0) / 1000) }));
          return;
        }
        if (err && !(cancelled && truncated)) {
          reject(err);
          return;
        }
        if (!columns.length) {
          affected = rowCount;
        }
        resolve({ columns, rows, affected, truncated });
      });
      params.forEach((value, index) => req.addParameter(`p${index + 1}`, paramType(value), value ?? null));
      req.on('columnMetadata', (meta) => {
        // A batch with several result sets shows the last one.
        columns = meta.map((column) => ({ name: column.colName, type: column.type?.name?.toLowerCase() ?? '' }));
        rows = [];
      });
      req.on('row', (row) => {
        if (rows.length >= max) {
          if (!truncated) {
            truncated = true;
            cancelled = true;
            conn.cancel();
          }
          return;
        }
        rows.push(row.map((cell) => cell.value));
      });
      if (options.timeoutMs) {
        timer = setTimeout(() => {
          cancelled = true;
          conn.cancel();
        }, options.timeoutMs);
      }
      conn.execSql(req);
    }));
  }

  return { request, serial };
}
