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
 * Microsoft SQL Server through `tedious` — one connection, requests one after
 * another (tedious runs one at a time), parameters as `@p1 …`.
 */

import tedious from 'tedious';
import { createRequester } from './mssql-request.js';
import { mssqlColumns, mssqlIndexes, mssqlTree } from './mssql-catalog.js';

const { Connection } = tedious;

/**
 * `Server=host,1433;Database=db;User Id=sa;Password=…;Encrypt=true` — the
 * ADO.NET connection string — into the fields of a connection.
 */
export function parseMssqlConnectionString(text) {
  const out = {};
  for (const part of String(text).split(';')) {
    const index = part.indexOf('=');
    if (index < 0) {
      continue;
    }
    const key = part.slice(0, index).trim().toLowerCase().replace(/\s+/g, ' ');
    const value = part.slice(index + 1).trim();
    if (['server', 'data source', 'address', 'addr'].includes(key)) {
      const [host, port] = value.replace(/^tcp:/i, '').split(',');
      const [name, instance] = host.split('\\');
      out.host = name;
      if (instance) {
        out.instance = instance;
      }
      if (port) {
        out.port = Number(port);
      }
    }
    if (['database', 'initial catalog'].includes(key)) {
      out.database = value;
    }
    if (['user id', 'uid', 'user'].includes(key)) {
      out.user = value;
    }
    if (['password', 'pwd'].includes(key)) {
      out.password = value;
    }
    if (key === 'encrypt') {
      out.encrypt = /^(true|yes|mandatory|strict)$/i.test(value);
    }
    if (key === 'trustservercertificate') {
      out.trustServerCertificate = /^(true|yes)$/i.test(value);
    }
  }
  return out;
}

/** The tedious configuration: the connection's own fields first, its connection string as the fallback. */
function buildConfig(connection, password) {
  const fromUrl = connection.url ? parseMssqlConnectionString(connection.url) : {};
  const ssl = connection.ssl ?? 'off';
  const encrypt = fromUrl.encrypt ?? ssl !== 'off';
  return {
    server: connection.host || fromUrl.host || 'localhost',
    authentication: {
      type: 'default',
      options: { userName: connection.user || fromUrl.user || '', password: password || fromUrl.password || '' },
    },
    options: {
      ...(fromUrl.instance ? { instanceName: fromUrl.instance } : { port: Number(connection.port || fromUrl.port || 1433) }),
      database: connection.database || fromUrl.database || undefined,
      encrypt,
      trustServerCertificate: fromUrl.trustServerCertificate ?? ssl !== 'verify',
      connectTimeout: 15_000,
      requestTimeout: 0,
      rowCollectionOnRequestCompletion: false,
      useColumnNames: false,
      appName: 'Lumen',
    },
  };
}

export async function openMssql(connection, { password }) {
  const config = buildConfig(connection, password);
  const conn = new Connection(config);
  await new Promise((resolve, reject) => {
    conn.on('connect', (err) => (err ? reject(err) : resolve()));
    conn.connect();
  });
  conn.on('error', () => {});

  const { request, serial } = createRequester(conn);
  const rowsOf = async (sql, params) => (await request(sql, params)).rows;

  return {
    kind: 'sql',
    dialect: 'mssql',
    rowIds: false,
    query: request,

    // tedious's own transaction calls: a BEGIN sent as a statement would run
    // inside sp_executesql, which refuses to end with a transaction open.
    async transaction(statements, options = {}) {
      const call = (method) => serial(() => new Promise((resolve, reject) => conn[method]((err) => (err ? reject(err) : resolve()))));
      await call('beginTransaction');
      let affected = 0;
      try {
        for (const { sql, params } of statements) {
          affected += (await request(sql, params, options)).affected ?? 0;
        }
        await call('commitTransaction');
      } catch (err) {
        await call('rollbackTransaction').catch(() => {});
        throw err;
      }
      return { affected };
    },

    tree: () => mssqlTree(rowsOf),
    columns: (schema, table) => mssqlColumns(rowsOf, schema, table),
    indexes: (schema, table) => mssqlIndexes(rowsOf, schema, table),

    async close() {
      conn.close();
    },
  };
}
