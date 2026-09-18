/**
 * Fetching from an extension server.
 *
 * Everything goes through the main process (`window.lumen.extensions`): the
 * renderer's CSP allows `default-src 'self'` and therefore no foreign
 * addresses. That is the point rather than an inconvenience — exactly one
 * place talks to a foreign server, and it caps protocol, time and response
 * size.
 *
 * Whatever comes back is unvetted foreign data. This file forces it into the
 * expected shape and throws the moment something does not fit, before anything
 * else in the program starts counting on it.
 */

import { EXTENSION_ID_PATTERN, EXTENSION_SCHEMA, type ExtensionIndex, type ExtensionManifest, type ExtensionSummary } from './types'
import { normalizeServerUrl } from './trust'

export interface ServerInfo {
  name: string
  url: string
  extensions: number
}

function asObject(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${what}: unexpected response`)
  return value as Record<string, unknown>
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

/** Fetch the profile — which also tells us an extension server is there at all. */
export async function fetchServerInfo(url: string): Promise<ServerInfo> {
  const server = normalizeServerUrl(url)
  const data = asObject(await window.lumen.extensions.info(server), 'Steckbrief')
  if (data.product !== 'lumen-extension-server') {
    throw new Error('No Lumen extension server answers there')
  }
  return {
    name: asString(data.name) || server,
    url: server,
    extensions: typeof data.extensions === 'number' ? data.extensions : 0,
  }
}

/** Reduce a catalogue entry to the fields Lumen knows. */
function toSummary(raw: unknown): ExtensionSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Record<string, unknown>
  const id = asString(entry.id)
  if (!EXTENSION_ID_PATTERN.test(id)) return null
  const name = asString(entry.name)
  const version = asString(entry.version)
  if (!name || !version) return null
  return {
    id,
    name,
    version,
    description: asString(entry.description),
    author: asString(entry.author),
    icon: asString(entry.icon) || name.slice(0, 2),
    color: asString(entry.color) || '#7c8cff',
    category: (['language', 'theme', 'tool'] as const).find((c) => c === entry.category),
    keywords: Array.isArray(entry.keywords) ? entry.keywords.filter((word): word is string => typeof word === 'string') : [],
    license: asString(entry.license) || undefined,
    homepage: asString(entry.homepage) || undefined,
    repository: asString(entry.repository) || undefined,
    minAppVersion: asString(entry.minAppVersion) || undefined,
    provides: entry.provides && typeof entry.provides === 'object' ? entry.provides as Record<string, number> : undefined,
    versions: Array.isArray(entry.versions) ? entry.versions.filter((v): v is string => typeof v === 'string') : [version],
    preview: asString(entry.preview) || undefined,
    publishedAt: asString(entry.publishedAt) || undefined,
    updatedAt: asString(entry.updatedAt) || undefined,
  }
}

/** A server's catalogue, optionally searched. */
export async function fetchIndex(url: string, query?: string): Promise<ExtensionIndex> {
  const server = normalizeServerUrl(url)
  const data = asObject(await window.lumen.extensions.index(server, query), 'Katalog')
  const list = Array.isArray(data.extensions) ? data.extensions : []
  return {
    schema: typeof data.schema === 'number' ? data.schema : EXTENSION_SCHEMA,
    server: data.server && typeof data.server === 'object'
      ? { name: asString((data.server as Record<string, unknown>).name), url: asString((data.server as Record<string, unknown>).url) }
      : undefined,
    updatedAt: asString(data.updatedAt) || undefined,
    extensions: list.map(toSummary).filter((entry): entry is ExtensionSummary => entry !== null),
  }
}

/**
 * Fetch a manifest and check that it hangs together.
 *
 * Only the envelope is checked here. The add-on inside goes through the same
 * validation as a hand-built one when it is saved, so an extension never gets
 * past the rules that apply to user add-ons.
 */
export async function fetchManifest(url: string, id: string, version?: string): Promise<ExtensionManifest> {
  const server = normalizeServerUrl(url)
  if (!EXTENSION_ID_PATTERN.test(id)) throw new Error(`Invalid id: ${id}`)

  const raw = version
    ? await window.lumen.extensions.manifest(server, id, version)
    : asObject(await window.lumen.extensions.detail(server, id), 'Einzelheiten').manifest

  const data = asObject(raw, 'Manifest')
  if (data.schema !== EXTENSION_SCHEMA) throw new Error(`Unknown manifest format: ${String(data.schema)}`)
  if (data.id !== id) throw new Error('The manifest names a different id than the one requested')

  const addon = data.addon
  if (!addon || typeof addon !== 'object' || Array.isArray(addon)) throw new Error('The manifest has no add-on')
  const model = addon as Record<string, unknown>
  if (model.id !== data.id) throw new Error('The add-on id does not match the extension')
  if (model.version !== data.version) throw new Error('The add-on version does not match the extension')

  // Foreign data: what the panel and the loader rely on has to have the right shape.
  if (data.code !== undefined) {
    const code = data.code as Record<string, unknown> | null
    if (!code || typeof code !== 'object' || typeof code.main !== 'string' || !code.main) throw new Error('The manifest\'s code is malformed')
  }
  if (data.agents !== undefined) {
    if (!Array.isArray(data.agents)) throw new Error('The manifest\'s agents are malformed')
    for (const agent of data.agents as Record<string, unknown>[]) {
      if (!agent || typeof agent.id !== 'string' || typeof agent.name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(agent.id)) {
        throw new Error('The manifest\'s agents are malformed')
      }
    }
  }

  return data as unknown as ExtensionManifest
}
