/**
 * One way in for every kind of database. A driver is a plain object:
 *
 *   SQL (`kind: 'sql'`, sqlite · h2 · postgres · mysql · mssql)
 *     dialect, rowIds (can address rows without a primary key)
 *     query(sql, params, { maxRows, timeoutMs }) → { columns: [{ name, type }], rows: [[…]], affected?, truncated }
 *     transaction([{ sql, params }], { timeoutMs }) → { affected }   all or nothing
 *     tree() → [{ name: schema, tables: [{ name, kind: 'table' | 'view' }] }]
 *     columns(schema, table) → [{ name, type, nullable, defaultValue, pk, pkOrder, generated, autoIncrement }]
 *     indexes(schema, table) → [{ name, columns, unique, primary }]
 *     ddl?(schema, table) → text
 *   Redis (`kind: 'redis'`) and MongoDB (`kind: 'mongo'`) — see their files.
 *   close()
 *
 * The drivers are loaded when first used: nobody pays for MongoDB's start-up
 * who only opens SQLite files.
 */

const OPENERS = {
  sqlite: async () => (await import('./sqlite.js')).openSqlite,
  h2: async () => (await import('./h2/index.js')).openH2,
  postgres: async () => (await import('./postgres.js')).openPostgres,
  mysql: async () => (await import('./mysql.js')).openMysql,
  mssql: async () => (await import('./mssql.js')).openMssql,
  redis: async () => (await import('./redis.js')).openRedis,
  mongo: async () => (await import('./mongo.js')).openMongo,
}

export async function openDriver(connection, deps) {
  const load = OPENERS[connection.type]
  if (!load) throw new Error(`Unknown database type: ${connection.type}`)
  const open = await load()
  return open(connection, deps)
}
