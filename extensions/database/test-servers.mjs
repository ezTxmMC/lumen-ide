#!/usr/bin/env node
/**
 * The server drivers against real servers — throwaway containers, say:
 *
 *   docker run -d --rm --name t-pg -e POSTGRES_PASSWORD=secret -p 15432:5432 postgres:16-alpine
 *   docker run -d --rm --name t-maria -e MARIADB_ROOT_PASSWORD=secret -e MARIADB_DATABASE=shop -p 13306:3306 mariadb:11
 *   docker run -d --rm --name t-mssql -e ACCEPT_EULA=Y -e 'MSSQL_SA_PASSWORD=Lumen!Secret123' -p 11433:1433 mcr.microsoft.com/mssql/server:2022-latest
 *   docker run -d --rm --name t-redis -p 16379:6379 redis:7-alpine
 *   docker run -d --rm --name t-mongo -p 27117:27017 mongo:7
 *
 *   LUMEN_TEST_PG=localhost:15432 LUMEN_TEST_MYSQL=localhost:13306 LUMEN_TEST_MSSQL=localhost:11433 \
 *   LUMEN_TEST_REDIS=localhost:16379 LUMEN_TEST_MONGO=localhost:27117 node extensions/database/test-servers.mjs
 *
 * A server without its variable is skipped.
 */

import assert from 'node:assert/strict'
import { openDriver } from './src/drivers/index.js'
import { ROWID, quoteIdent, rowIdSelect, selectPage } from './src/sql.js'
import { createPending, pendingStatements, setCell, addRow, toggleDelete } from './src/pending.js'
import { idKey, idFromKey, parseDocument } from './src/drivers/mongo.js'

const SERVERS = {
  postgres: { env: 'LUMEN_TEST_PG', user: 'postgres', password: 'secret', database: 'postgres', schema: 'public' },
  mysql: { env: 'LUMEN_TEST_MYSQL', user: 'root', password: 'secret', database: 'shop', schema: 'shop' },
  mssql: { env: 'LUMEN_TEST_MSSQL', user: 'sa', password: 'Lumen!Secret123', database: 'master', schema: 'dbo', ssl: 'require' },
}

const endpoint = (value) => {
  const [host, port] = String(value).split(':')
  return { host, port }
}

let failed = 0
async function test(name, fn) {
  try {
    await fn()
    process.stdout.write(`✓ ${name}\n`)
  } catch (err) {
    failed++
    process.stdout.write(`✗ ${name}\n  ${err.stack?.split('\n').slice(0, 30).join('\n  ')}\n`)
  }
}

for (const [type, server] of Object.entries(SERVERS)) {
  if (!process.env[server.env]) {
    process.stdout.write(`- ${type}: skipped (${server.env} not set)\n`)
    continue
  }
  await test(`${type}: tree, columns, paging, commit, rollback, truncation`, async () => {
    const connection = { type, ...endpoint(process.env[server.env]), user: server.user, database: server.database, ssl: server.ssl ?? 'off' }
    const db = await openDriver(connection, { password: server.password })
    const { schema } = server
    const q = (name) => quoteIdent(type, name)
    const marks = { postgres: '$1, $2', mysql: '?, ?', mssql: '@p1, @p2' }[type]
    const table = `${q(schema)}.${q('lumen_people')}`
    try {
      await db.query(`DROP TABLE IF EXISTS ${table}`)
      const idColumn = { postgres: 'id serial PRIMARY KEY', mysql: 'id int AUTO_INCREMENT PRIMARY KEY', mssql: 'id int IDENTITY PRIMARY KEY' }[type]
      await db.query(`CREATE TABLE ${table} (${idColumn}, name varchar(40) NOT NULL, age int NULL, note ${type === 'mssql' ? 'nvarchar(max)' : 'text'} NULL)`)
      await db.query(`CREATE INDEX lumen_people_name ON ${table} (name)`)
      for (const [name, age] of [['Ada', 36], ['Linus', 12], ['Grace', 45]]) {
        await db.query(`INSERT INTO ${table} (name, age) VALUES (${marks})`, [name, age])
      }

      const tree = await db.tree()
      const own = tree.find((entry) => entry.name === schema)
      assert.ok(own?.tables.some((entry) => entry.name === 'lumen_people' && entry.kind === 'table'), JSON.stringify(tree).slice(0, 300))

      const columns = await db.columns(schema, 'lumen_people')
      assert.deepEqual(columns.map((column) => [column.name, column.pk, column.nullable]), [['id', true, false], ['name', false, false], ['age', false, true], ['note', false, true]])
      const indexes = await db.indexes(schema, 'lumen_people')
      assert.ok(indexes.some((index) => index.name === 'lumen_people_name' && index.columns.includes('name')), JSON.stringify(indexes))

      const page = await db.query(selectPage(type, { schema, table: 'lumen_people', sort: { column: 'age', direction: 'desc' }, offset: 1, limit: 1 }))
      assert.deepEqual(page.rows.map((row) => row[1]), ['Ada'])
      const filtered = await db.query(selectPage(type, { schema, table: 'lumen_people', filter: 'age < 20', limit: 10 }))
      assert.deepEqual(filtered.rows.map((row) => row[1]), ['Linus'])

      // Pending changes: an edit, a new row, a delete — one transaction.
      const pending = createPending()
      setCell(pending, 'k1', 'age', '37', 36)
      setCell(pending, 'k1', 'note', 'first', null)
      const fresh = addRow(pending)
      setCell(pending, fresh, 'name', 'Barbara', undefined)
      toggleDelete(pending, ['k2'])
      const keys = { k1: { id: 1 }, k2: { id: 2 } }
      const result = await db.transaction(pendingStatements(pending, { dialect: type, schema, table: 'lumen_people', keyOf: (id) => keys[id] }))
      assert.equal(result.affected, 3)
      const after = await db.query(`SELECT name, age, note FROM ${table} ORDER BY name`)
      assert.deepEqual(after.rows.map((row) => [row[0], row[1] === null ? null : Number(row[1]), row[2]]), [['Ada', 37, 'first'], ['Barbara', null, null], ['Grace', 45, null]])

      // A failing statement leaves nothing behind.
      await assert.rejects(db.transaction([
        { sql: `UPDATE ${table} SET age = 99 WHERE name = 'Grace'`, params: [] },
        { sql: `INSERT INTO ${table} (name) VALUES (NULL)`, params: [] },
      ]))
      const grace = await db.query(`SELECT age FROM ${table} WHERE name = 'Grace'`)
      assert.equal(Number(grace.rows[0][0]), 45)

      const truncated = await db.query(`SELECT * FROM ${table}`, [], { maxRows: 2 })
      assert.equal(truncated.rows.length, 2)
      assert.equal(truncated.truncated, true)
      const affected = await db.query(`UPDATE ${table} SET note = 'x'`, [], { maxRows: 100 })
      assert.equal(affected.affected, 3)
      if (db.ddl) assert.match(await db.ddl(schema, 'lumen_people'), /lumen_people/)

      // A statement past the timeout is stopped; the connection keeps working.
      const sleep = { postgres: 'SELECT pg_sleep(5)', mysql: 'SELECT SLEEP(5)', mssql: "WAITFOR DELAY '00:00:05'" }[type]
      const started = Date.now()
      await db.query(sleep, [], { timeoutMs: 800, maxRows: 10 }).then(
        (answer) => assert.ok(type === 'mysql' && Date.now() - started < 4000, `not stopped: ${JSON.stringify(answer)}`),
        () => {},
      )
      assert.ok(Date.now() - started < 4000, 'the timeout took effect')
      assert.equal((await db.query(`SELECT COUNT(*) FROM ${table}`)).rows[0][0] + '', '3')
      await db.query(`DROP TABLE ${table}`)

      // PostgreSQL addresses rows of a table without a key by ctid.
      if (type === 'postgres') {
        await db.query('DROP TABLE IF EXISTS public.lumen_nokey')
        await db.query("CREATE TABLE public.lumen_nokey (v text); INSERT INTO public.lumen_nokey VALUES ('a'), ('b')")
        const rows = await db.query(selectPage(type, { schema: 'public', table: 'lumen_nokey', extra: [rowIdSelect(type)] }))
        const ctid = rows.rows.find((row) => row[1] === 'b')[0]
        const pendingNoKey = createPending()
        setCell(pendingNoKey, 'r', 'v', 'B', 'b')
        await db.transaction(pendingStatements(pendingNoKey, { dialect: type, schema: 'public', table: 'lumen_nokey', keyOf: () => ({ [ROWID.postgres]: ctid }) }))
        assert.deepEqual((await db.query('SELECT v FROM public.lumen_nokey ORDER BY v')).rows, [['B'], ['a']])
        await db.query('DROP TABLE public.lumen_nokey')
      }
    } finally {
      await db.close()
    }
  })
}

if (process.env.LUMEN_TEST_REDIS) {
  await test('redis: databases, scan, every type, TTL, rename, command', async () => {
    const db = await openDriver({ type: 'redis', ...endpoint(process.env.LUMEN_TEST_REDIS) }, { password: '' })
    try {
      await db.command(3, ['FLUSHDB'])
      await db.setString(3, 'lumen:string', 'hello')
      await db.hashSet(3, 'lumen:hash', 'a', '1')
      await db.hashSet(3, 'lumen:hash', 'b', '2')
      await db.listPush(3, 'lumen:list', 'x')
      await db.listPush(3, 'lumen:list', 'y')
      await db.listPush(3, 'lumen:list', 'w', 'left')
      await db.setAdd(3, 'lumen:set', ['m1', 'm2'])
      await db.zsetAdd(3, 'lumen:zset', 'z1', 5)
      await db.streamAdd(3, 'lumen:stream', [['f', 'v']])
      // Another database in between must not confuse the selection.
      await db.setString(0, 'lumen:other', 'db0')

      const scan = await db.scan(3, 'lumen:*', 100)
      assert.deepEqual(scan.entries.map((entry) => [entry.key, entry.type]), [
        ['lumen:hash', 'hash'], ['lumen:list', 'list'], ['lumen:set', 'set'], ['lumen:stream', 'stream'], ['lumen:string', 'string'], ['lumen:zset', 'zset'],
      ])
      const databases = await db.databases()
      assert.ok(databases.some((entry) => entry.index === 3 && entry.keys === 6), JSON.stringify(databases))

      assert.equal((await db.read(3, 'lumen:string')).value, 'hello')
      assert.deepEqual((await db.read(3, 'lumen:hash')).entries.sort(), [['a', '1'], ['b', '2']])
      await db.listSet(3, 'lumen:list', 1, 'X')
      await db.listRemove(3, 'lumen:list', [0])
      assert.deepEqual((await db.read(3, 'lumen:list')).items, ['X', 'y'])
      await db.zsetAdd(3, 'lumen:zset', 'z1', 7)
      assert.deepEqual((await db.read(3, 'lumen:zset')).members, [['z1', '7']])
      const stream = await db.read(3, 'lumen:stream')
      assert.deepEqual(stream.entries[0].fields, ['f', 'v'])
      await db.expire(3, 'lumen:string', 100)
      assert.ok((await db.read(3, 'lumen:string')).ttl > 90_000)
      await db.expire(3, 'lumen:string', 0)
      assert.equal((await db.read(3, 'lumen:string')).ttl, -1)
      await db.rename(3, 'lumen:set', 'lumen:set2')
      await assert.rejects(db.rename(3, 'lumen:set2', 'lumen:hash'))
      assert.equal(await db.command(3, ['GET', 'lumen:string']), 'hello')
      await assert.rejects(db.command(3, ['SELECT', '1']))
      assert.equal((await db.read(0, 'lumen:other')).value, 'db0')
      await db.remove(3, ['lumen:string'])
      assert.equal((await db.read(3, 'lumen:string')).type, 'none')
      await db.command(3, ['FLUSHDB'])
      await db.remove(0, ['lumen:other'])
    } finally {
      await db.close()
    }
  })
}

if (process.env.LUMEN_TEST_MONGO) {
  await test('mongo: databases, collections, find, replace, insert, delete', async () => {
    const db = await openDriver({ type: 'mongo', ...endpoint(process.env.LUMEN_TEST_MONGO) }, { password: '' })
    try {
      await db.dropCollection('lumen_test', 'people').catch(() => {})
      await db.createCollection('lumen_test', 'people')
      const first = await db.insert('lumen_test', 'people', parseDocument('{ "name": "Ada", "age": 36, "born": { "$date": "1815-12-10T00:00:00Z" } }'))
      await db.insert('lumen_test', 'people', { name: 'Linus', age: 12 })
      assert.ok((await db.databases()).includes('lumen_test'))
      assert.deepEqual((await db.collections('lumen_test')).map((entry) => entry.name), ['people'])
      const found = await db.find('lumen_test', 'people', { filter: parseDocument('{ "age": { "$gt": 20 } }'), limit: 10 })
      assert.equal(found.documents.length, 1)
      assert.equal(found.total, 1)
      assert.ok(found.documents[0].born instanceof Date)
      const key = idKey(first)
      assert.equal(String(idFromKey(key)), String(first))
      assert.equal(await db.replace('lumen_test', 'people', idFromKey(key), { name: 'Ada L.', age: 37 }), 1)
      assert.equal((await db.findOne('lumen_test', 'people', first)).name, 'Ada L.')
      assert.equal(await db.remove('lumen_test', 'people', [first]), 1)
      const sorted = await db.find('lumen_test', 'people', { sort: { age: -1 }, limit: 10 })
      assert.deepEqual(sorted.documents.map((document) => document.name), ['Linus'])
      await db.dropCollection('lumen_test', 'people')
    } finally {
      await db.close()
    }
  })
}

process.stdout.write(`\n${failed ? `${failed} failed` : 'all passed'}\n`)
if (failed) process.exit(1)
