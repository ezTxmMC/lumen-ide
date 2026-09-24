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
 * Redis writing: the mutating operations of a connection, each run through the
 * connection's serialized `inDb` so it targets the right database.
 */

import { DriverError } from './errors.js';

export function createWriters(client, inDb) {
  return {
    setString(db, key, value) {
      return inDb(db, async () => {
        // KEEPTTL: editing the text must not make a key permanent.
        await client.set(key, value, 'KEEPTTL');
      });
    },
    hashSet(db, key, field, value) {
      return inDb(db, async () => {
        await client.hset(key, field, value);
      });
    },
    hashDelete(db, key, fields) {
      return inDb(db, async () => {
        await client.hdel(key, ...fields);
      });
    },
    listSet(db, key, index, value) {
      return inDb(db, async () => {
        await client.lset(key, index, value);
      });
    },
    listPush(db, key, value, side = 'right') {
      return inDb(db, async () => {
        if (side === 'left') {
          await client.lpush(key, value);
        }
        if (side !== 'left') {
          await client.rpush(key, value);
        }
      });
    },
    /** Remove list items by position: mark them, then remove the marks (LREM works by value). */
    listRemove(db, key, indexes) {
      return inDb(db, async () => {
        const mark = `__lumen_removed_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const multi = client.multi();
        for (const index of indexes) {
          multi.lset(key, index, mark);
        }
        multi.lrem(key, 0, mark);
        await multi.exec();
      });
    },
    setAdd(db, key, members) {
      return inDb(db, async () => {
        await client.sadd(key, ...members);
      });
    },
    setRemove(db, key, members) {
      return inDb(db, async () => {
        await client.srem(key, ...members);
      });
    },
    zsetAdd(db, key, member, score) {
      return inDb(db, async () => {
        await client.zadd(key, score, member);
      });
    },
    zsetRemove(db, key, members) {
      return inDb(db, async () => {
        await client.zrem(key, ...members);
      });
    },
    streamAdd(db, key, fields) {
      return inDb(db, async () => {
        await client.xadd(key, '*', ...fields.flat());
      });
    },
    streamDelete(db, key, ids) {
      return inDb(db, async () => {
        await client.xdel(key, ...ids);
      });
    },
    /** Seconds; 0 or less makes the key permanent. */
    expire(db, key, seconds) {
      return inDb(db, async () => {
        if (seconds > 0) {
          await client.expire(key, seconds);
        }
        if (seconds <= 0) {
          await client.persist(key);
        }
      });
    },
    rename(db, key, name) {
      return inDb(db, async () => {
        const done = await client.renamenx(key, name);
        if (!done) {
          throw new DriverError('keyExists', { key: name });
        }
      });
    },
    remove(db, keys) {
      return inDb(db, async () => {
        await client.del(...keys);
      });
    },
    exists(db, key) {
      return inDb(db, async () => {
        return (await client.exists(key)) > 0;
      });
    },
  };
}
