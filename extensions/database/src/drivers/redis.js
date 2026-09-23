/**
 * Redis through `ioredis`: the keys of a database (found with SCAN, never
 * KEYS), their types and time to live, and type-aware reading and writing.
 */

import Redis from 'ioredis'
import { sslOptions } from './tls.js'
import { DriverError } from './errors.js'

/** Members read per collection value at most — a hash of a million fields is not drawn whole. */
export const MAX_MEMBERS = 5000

export async function openRedis(connection, { password }) {
  const tls = await sslOptions(connection)
  const options = {
    ...(connection.host ? { host: connection.host } : {}),
    ...(connection.port ? { port: Number(connection.port) } : {}),
    ...(connection.user ? { username: connection.user } : {}),
    ...(password ? { password } : {}),
    ...(tls ? { tls } : {}),
    db: Number(connection.database || 0),
    lazyConnect: true,
    connectTimeout: 15_000,
    maxRetriesPerRequest: 1,
    // Reconnect a few times quietly, then give up rather than retry forever.
    retryStrategy: (times) => (times > 3 ? null : times * 500),
  }
  const client = connection.url ? new Redis(connection.url, { ...options, lazyConnect: true }) : new Redis(options)
  client.on('error', () => {})
  await client.connect()

  // One connection serves every tab, each on its own database: an operation
  // selects its database and runs before the next one may switch away.
  let current = Number(connection.database || 0)
  let queue = Promise.resolve()
  const inDb = (db, fn) => {
    const next = queue.then(async () => {
      if (db !== undefined && Number(db) !== current) {
        await client.select(Number(db))
        current = Number(db)
      }
      return fn()
    })
    queue = next.catch(() => {})
    return next
  }

  return {
    kind: 'redis',

    /** Databases with keys (from INFO keyspace), plus the connection's own. */
    async databases() {
      const info = await inDb(undefined, () => client.info('keyspace'))
      const found = new Map()
      for (const match of info.matchAll(/^db(\d+):keys=(\d+)/gm)) found.set(Number(match[1]), Number(match[2]))
      const own = Number(connection.database || 0)
      if (!found.has(own)) found.set(own, 0)
      return [...found].sort((a, b) => a[0] - b[0]).map(([index, keys]) => ({ index, keys }))
    },

    /** Keys matching a pattern, with type and TTL — at most `limit`. */
    scan(db, pattern, limit) {
      return inDb(db, async () => {
        const keys = []
        let cursor = '0'
        do {
          const [next, batch] = await client.scan(cursor, 'MATCH', pattern || '*', 'COUNT', 500)
          cursor = next
          keys.push(...batch)
        } while (cursor !== '0' && keys.length < limit)
        const shown = [...new Set(keys)].slice(0, limit).sort()
        const pipeline = client.pipeline()
        for (const key of shown) pipeline.type(key).pttl(key)
        const answers = await pipeline.exec()
        const entries = shown.map((key, index) => ({
          key,
          type: answers[index * 2]?.[1] ?? 'none',
          ttl: Number(answers[index * 2 + 1]?.[1] ?? -1),
        }))
        return { entries, complete: cursor === '0' && keys.length <= limit }
      })
    },

    /** A key's value in a shape per type. */
    read(db, key) {
      return inDb(db, async () => {
        const type = await client.type(key)
        const ttl = await client.pttl(key)
        const readers = {
          string: async () => ({ value: await client.get(key) }),
          hash: async () => {
            const entries = []
            let cursor = '0'
            do {
              const [next, batch] = await client.hscan(key, cursor, 'COUNT', 500)
              cursor = next
              for (let i = 0; i < batch.length; i += 2) entries.push([batch[i], batch[i + 1]])
            } while (cursor !== '0' && entries.length < MAX_MEMBERS)
            return { entries: entries.slice(0, MAX_MEMBERS), total: await client.hlen(key) }
          },
          list: async () => ({ items: await client.lrange(key, 0, MAX_MEMBERS - 1), total: await client.llen(key) }),
          set: async () => {
            const members = []
            let cursor = '0'
            do {
              const [next, batch] = await client.sscan(key, cursor, 'COUNT', 500)
              cursor = next
              members.push(...batch)
            } while (cursor !== '0' && members.length < MAX_MEMBERS)
            return { members: [...new Set(members)].slice(0, MAX_MEMBERS).sort(), total: await client.scard(key) }
          },
          zset: async () => {
            const flat = await client.zrange(key, 0, MAX_MEMBERS - 1, 'WITHSCORES')
            const members = []
            for (let i = 0; i < flat.length; i += 2) members.push([flat[i], flat[i + 1]])
            return { members, total: await client.zcard(key) }
          },
          stream: async () => {
            const entries = await client.xrevrange(key, '+', '-', 'COUNT', 1000)
            return { entries: entries.map(([id, fields]) => ({ id, fields })), total: await client.xlen(key) }
          },
        }
        const reader = readers[type]
        if (!reader) return { type, ttl }
        return { type, ttl, ...(await reader()) }
      })
    },

    setString(db, key, value) {
      return inDb(db, async () => {
        // KEEPTTL: editing the text must not make a key permanent.
        await client.set(key, value, 'KEEPTTL')
      })
    },
    hashSet(db, key, field, value) {
      return inDb(db, async () => {
        await client.hset(key, field, value)
      })
    },
    hashDelete(db, key, fields) {
      return inDb(db, async () => {
        await client.hdel(key, ...fields)
      })
    },
    listSet(db, key, index, value) {
      return inDb(db, async () => {
        await client.lset(key, index, value)
      })
    },
    listPush(db, key, value, side = 'right') {
      return inDb(db, async () => {
        if (side === 'left') await client.lpush(key, value)
        if (side !== 'left') await client.rpush(key, value)
      })
    },
    /** Remove list items by position: mark them, then remove the marks (LREM works by value). */
    listRemove(db, key, indexes) {
      return inDb(db, async () => {
        const mark = `__lumen_removed_${Date.now()}_${Math.random().toString(36).slice(2)}`
        const multi = client.multi()
        for (const index of indexes) multi.lset(key, index, mark)
        multi.lrem(key, 0, mark)
        await multi.exec()
      })
    },
    setAdd(db, key, members) {
      return inDb(db, async () => {
        await client.sadd(key, ...members)
      })
    },
    setRemove(db, key, members) {
      return inDb(db, async () => {
        await client.srem(key, ...members)
      })
    },
    zsetAdd(db, key, member, score) {
      return inDb(db, async () => {
        await client.zadd(key, score, member)
      })
    },
    zsetRemove(db, key, members) {
      return inDb(db, async () => {
        await client.zrem(key, ...members)
      })
    },
    streamAdd(db, key, fields) {
      return inDb(db, async () => {
        await client.xadd(key, '*', ...fields.flat())
      })
    },
    streamDelete(db, key, ids) {
      return inDb(db, async () => {
        await client.xdel(key, ...ids)
      })
    },
    /** Seconds; 0 or less makes the key permanent. */
    expire(db, key, seconds) {
      return inDb(db, async () => {
        if (seconds > 0) await client.expire(key, seconds)
        if (seconds <= 0) await client.persist(key)
      })
    },
    rename(db, key, name) {
      return inDb(db, async () => {
        const done = await client.renamenx(key, name)
        if (!done) throw new DriverError('keyExists', { key: name })
      })
    },
    remove(db, keys) {
      return inDb(db, async () => {
        await client.del(...keys)
      })
    },
    exists(db, key) {
      return inDb(db, async () => {
        return (await client.exists(key)) > 0
      })
    },
    /** A raw command, split like a shell line would (quotes group words). */
    async command(db, args) {
      // The tab stays on its database; switching belongs to the tree.
      if (/^select$/i.test(args[0] ?? '')) throw new DriverError('redisSelect')
      return inDb(db, () => client.call(args[0], ...args.slice(1)))
    },

    async close() {
      await client.quit().catch(() => client.disconnect())
    },
  }
}

/** `SET "a b" 'c'` → ['SET', 'a b', 'c'] — for the command line of the key browser. */
export function splitCommand(line) {
  const args = []
  const pattern = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g
  for (const match of String(line).matchAll(pattern)) {
    if (match[1] !== undefined) {
      args.push(match[1].replace(/\\(.)/g, (_, char) => ({ n: '\n', t: '\t', r: '\r' })[char] ?? char))
      continue
    }
    args.push(match[2] ?? match[3])
  }
  return args
}
