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
 * MongoDB through the official driver: databases, collections, and documents
 * as Extended JSON (relaxed) — the form in which they can be read and edited
 * as text without losing ObjectIds, dates or decimals.
 */

import { MongoClient, BSON } from 'mongodb';
import { sslOptions } from './tls.js';

const { EJSON } = BSON;

/** Build the URI from the fields when no connection string is given. */
export function mongoUri(connection, password) {
  if (connection.url) {
    return connection.url;
  }
  const secret = password ? `:${encodeURIComponent(password)}` : '';
  const auth = connection.user ? `${encodeURIComponent(connection.user)}${secret}@` : '';
  const host = `${connection.host || 'localhost'}:${connection.port || 27017}`;
  return `mongodb://${auth}${host}/${encodeURIComponent(connection.database || '')}`;
}

/** Text → a document or filter; `{}` for empty text. Throws on invalid JSON. */
export function parseDocument(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) {
    return {};
  }
  const value = EJSON.parse(trimmed, { relaxed: true });
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('A JSON object is expected');
  }
  return value;
}

export const documentText = (document) => EJSON.stringify(document, null, 2, { relaxed: true });

/** One line for a cell: short values as they are, objects as compact Extended JSON. A missing field is empty, not NULL. */
export function fieldSummary(value) {
  if (value === undefined) {
    return '';
  }
  if (value === null) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value?.toHexString === 'function') {
    return value.toHexString();
  }
  return EJSON.stringify(value, { relaxed: true });
}

/** The `_id` of a document as a stable text key (for grid rows) and back. */
export const idKey = (id) => EJSON.stringify({ id }, { relaxed: false });
export const idFromKey = (key) => EJSON.parse(key, { relaxed: false }).id;

export async function openMongo(connection, { password }) {
  const tls = await sslOptions(connection);
  const client = new MongoClient(mongoUri(connection, password), {
    serverSelectionTimeoutMS: 15_000,
    appName: 'Lumen',
    ...(tls ? { tls: true, tlsAllowInvalidCertificates: !tls.rejectUnauthorized, ...(connection.sslCa ? { tlsCAFile: connection.sslCa } : {}) } : {}),
    ...(password && connection.url && !/\/\/[^/]*:[^/]*@/.test(connection.url) ? { auth: { username: connection.user || undefined, password } } : {}),
  });
  await client.connect();
  // A server we may see but not list: fall back to the database of the connection.
  const listDatabases = async () => {
    try {
      const { databases } = await client.db('admin').admin().listDatabases({ nameOnly: true });
      return databases.map((db) => db.name).sort();
    } catch {
      const own = client.options?.dbName || connection.database;
      return own ? [own] : [];
    }
  };

  return {
    kind: 'mongo',
    databases: listDatabases,

    async collections(db) {
      const list = await client.db(db).listCollections({}, { nameOnly: true }).toArray();
      return list.map((entry) => ({ name: entry.name, kind: entry.type === 'view' ? 'view' : 'collection' })).sort((a, b) => a.name.localeCompare(b.name));
    },

    async find(db, collection, { filter = {}, sort = {}, skip = 0, limit = 100, timeoutMs = 0 }) {
      const coll = client.db(db).collection(collection);
      const cursor = coll.find(filter, { sort, skip, limit, ...(timeoutMs ? { maxTimeMS: timeoutMs } : {}) });
      const documents = await cursor.toArray();
      const total = await coll.countDocuments(filter, timeoutMs ? { maxTimeMS: timeoutMs } : {}).catch(() => undefined);
      return { documents, total };
    },

    async findOne(db, collection, id) {
      return client.db(db).collection(collection).findOne({ _id: id });
    },

    async replace(db, collection, id, document) {
      const result = await client.db(db).collection(collection).replaceOne({ _id: id }, document);
      return result.matchedCount;
    },

    async insert(db, collection, document) {
      const result = await client.db(db).collection(collection).insertOne(document);
      return result.insertedId;
    },

    async remove(db, collection, ids) {
      const result = await client.db(db).collection(collection).deleteMany({ _id: { $in: ids } });
      return result.deletedCount;
    },

    async createCollection(db, name) {
      await client.db(db).createCollection(name);
    },

    async dropCollection(db, name) {
      await client.db(db).collection(name).drop();
    },

    async close() {
      await client.close().catch(() => {});
    },
  };
}
