/**
 * The saved connections: kept in the extension's storage, passwords apart in
 * the system's key store (`ctx.secrets`), never in the storage document.
 */

export const TYPES = ['sqlite', 'h2', 'postgres', 'mysql', 'mssql', 'redis', 'mongo']

/** Types that live in a file rather than on a server. */
export const FILE_TYPES = ['sqlite', 'h2']
export const SQL_TYPES = ['sqlite', 'h2', 'postgres', 'mysql', 'mssql']

export const DEFAULT_PORTS = { postgres: 5432, mysql: 3306, mssql: 1433, redis: 6379, mongo: 27017 }

export const TYPE_ICONS = {
  sqlite: 'database', h2: 'database', postgres: 'database', mysql: 'database', mssql: 'database', redis: 'layers', mongo: 'leaf',
}

/** File name endings and the type they open as. `.mv.db` must be checked before `.db`. */
const FILE_ENDINGS = [['.mv.db', 'h2'], ['.sqlite3', 'sqlite'], ['.sqlite', 'sqlite'], ['.db3', 'sqlite'], ['.db', 'sqlite']]

export function typeOfFile(file) {
  const lower = String(file).toLowerCase()
  return FILE_ENDINGS.find(([ending]) => lower.endsWith(ending))?.[1] ?? null
}

/** A key for `ctx.secrets`: letters and digits only. */
export const secretKey = (id) => `pw${id}`

export function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** What the tree shows under a connection's name. */
export function describe(connection) {
  if (FILE_TYPES.includes(connection.type)) return connection.file ?? connection.url ?? ''
  if (connection.url) return redactUrl(connection.url)
  const host = `${connection.host || 'localhost'}${connection.port ? `:${connection.port}` : ''}`
  return connection.database ? `${host}/${connection.database}` : host
}

/** A connection string without its password, for showing. */
export function redactUrl(url) {
  return String(url)
    .replace(/(\/\/[^:/@]+:)[^@/]*@/, '$1•••@')
    .replace(/((?:^|;)\s*(?:password|pwd)\s*=)[^;]*/gi, '$1•••')
}

export function createConnections(ctx) {
  const listeners = new Set()
  let list = ctx.storage.get('connections', []).filter((entry) => entry && TYPES.includes(entry.type))

  async function save() {
    await ctx.storage.set('connections', list)
    for (const fn of listeners) fn()
  }

  return {
    list: () => list,
    get: (id) => list.find((entry) => entry.id === id) ?? null,
    onChange(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },

    /**
     * Add or replace. `password`: a string sets it, `''` removes it, `undefined`
     * keeps it. The connection is saved even when the key store refuses the
     * password — the error is thrown afterwards, for the caller to show.
     */
    async put(connection, password) {
      const entry = { ...connection, id: connection.id || newId() }
      const index = list.findIndex((known) => known.id === entry.id)
      list = index >= 0 ? list.map((known) => (known.id === entry.id ? entry : known)) : [...list, entry]
      await save()
      if (entry.savePassword === false) await ctx.secrets.delete(secretKey(entry.id)).catch(() => {})
      if (password !== undefined && entry.savePassword !== false) await ctx.secrets.set(secretKey(entry.id), password)
      return entry
    },

    async remove(id) {
      list = list.filter((entry) => entry.id !== id)
      await ctx.secrets.delete(secretKey(id)).catch(() => {})
      await save()
    },

    password: async (id) => (await ctx.secrets.get(secretKey(id)).catch(() => undefined)) ?? '',

    /** The connection for a file — the one already saved, or a new one. */
    async forFile(file) {
      const known = list.find((entry) => entry.file === file)
      if (known) return known
      const type = typeOfFile(file) ?? 'sqlite'
      const name = String(file).split(/[\\/]/).pop()
      return this.put({ type, name, file, ...(type === 'h2' ? { user: 'sa' } : {}), savePassword: true })
    },
  }
}
