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
 * Redis reading: SCAN-based key listing and type-aware value reads.
 */

/** Members read per collection value at most — a hash of a million fields is not drawn whole. */
export const MAX_MEMBERS = 5000;

/** Keys matching a pattern, with type and TTL — at most `limit`. */
export async function scanKeys(client, pattern, limit) {
  const keys = [];
  let cursor = '0';
  do {
    const [next, batch] = await client.scan(cursor, 'MATCH', pattern || '*', 'COUNT', 500);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== '0' && keys.length < limit);
  const shown = [...new Set(keys)].slice(0, limit).sort();
  const pipeline = client.pipeline();
  for (const key of shown) {
    pipeline.type(key).pttl(key);
  }
  const answers = await pipeline.exec();
  const entries = shown.map((key, index) => ({
    key,
    type: answers[index * 2]?.[1] ?? 'none',
    ttl: Number(answers[index * 2 + 1]?.[1] ?? -1),
  }));
  return { entries, complete: cursor === '0' && keys.length <= limit };
}

async function readHash(client, key) {
  const entries = [];
  let cursor = '0';
  do {
    const [next, batch] = await client.hscan(key, cursor, 'COUNT', 500);
    cursor = next;
    for (let i = 0; i < batch.length; i += 2) {
      entries.push([batch[i], batch[i + 1]]);
    }
  } while (cursor !== '0' && entries.length < MAX_MEMBERS);
  return { entries: entries.slice(0, MAX_MEMBERS), total: await client.hlen(key) };
}

async function readSet(client, key) {
  const members = [];
  let cursor = '0';
  do {
    const [next, batch] = await client.sscan(key, cursor, 'COUNT', 500);
    cursor = next;
    members.push(...batch);
  } while (cursor !== '0' && members.length < MAX_MEMBERS);
  return { members: [...new Set(members)].slice(0, MAX_MEMBERS).sort(), total: await client.scard(key) };
}

async function readZset(client, key) {
  const flat = await client.zrange(key, 0, MAX_MEMBERS - 1, 'WITHSCORES');
  const members = [];
  for (let i = 0; i < flat.length; i += 2) {
    members.push([flat[i], flat[i + 1]]);
  }
  return { members, total: await client.zcard(key) };
}

async function readStream(client, key) {
  const entries = await client.xrevrange(key, '+', '-', 'COUNT', 1000);
  return { entries: entries.map(([id, fields]) => ({ id, fields })), total: await client.xlen(key) };
}

const READERS = {
  string: async (client, key) => ({ value: await client.get(key) }),
  hash: readHash,
  list: async (client, key) => ({ items: await client.lrange(key, 0, MAX_MEMBERS - 1), total: await client.llen(key) }),
  set: readSet,
  zset: readZset,
  stream: readStream,
};

/** A key's value in a shape per type. */
export async function readValue(client, key) {
  const type = await client.type(key);
  const ttl = await client.pttl(key);
  const reader = READERS[type];
  if (!reader) {
    return { type, ttl };
  }
  return { type, ttl, ...(await reader(client, key)) };
}
