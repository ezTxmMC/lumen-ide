/**
 * Installed extensions.
 *
 * An extension is kept in two places:
 *   • The add-on goes through `userAddons.save` into the user add-on folder.
 *     It therefore gets the same validation, the same registration and the
 *     same on/off switch as a hand-built one — an extension off the network
 *     receives no special rights.
 *   • The manifest — origin, settings, pages — sits beside it under
 *     `userData/extensions/<id>.json`.
 *
 * Setting values live in the application settings, not in the manifest, so an
 * update never overwrites what someone typed.
 */

import { useStore } from '@/state/store'
import { userAddons } from '@/core/user-addons/manager'
import { blockingIssues } from '@/core/user-addons/validate'
import { normalizeModel } from '@/core/user-addons/schema'
import { t } from '@/i18n'
import { fetchManifest } from './client'
import { normalizeServerUrl } from './trust'
import { EXTENSION_ID_PATTERN, type ExtensionManifest, type ExtensionPage, type InstalledExtension } from './types'

const listeners = new Set<() => void>()
const installed = new Map<string, InstalledExtension>()
let version = 0
let started = false

function emit() {
  version++
  for (const fn of listeners) fn()
}

/** Read a stored manifest back — foreign data, so carefully. */
function toInstalled(raw: unknown): InstalledExtension | null {
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Record<string, unknown>
  const manifest = entry.manifest as ExtensionManifest | undefined
  if (!manifest || typeof manifest !== 'object') return null
  if (!EXTENSION_ID_PATTERN.test(String(manifest.id))) return null
  return {
    manifest,
    server: typeof entry.server === 'string' ? entry.server : '',
    installedAt: typeof entry.installedAt === 'number' ? entry.installedAt : Date.now(),
  }
}

export const extensions = {
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  },
  getVersion: () => version,

  list: (): InstalledExtension[] =>
    [...installed.values()].sort((a, b) => a.manifest.name.localeCompare(b.manifest.name)),

  get: (id: string | null | undefined) => (id ? installed.get(id) : undefined),
  has: (id: string) => installed.has(id),

  /** Every page of every installed extension, with where it came from. */
  pages(): { extensionId: string; extensionName: string; page: ExtensionPage }[] {
    const out: { extensionId: string; extensionName: string; page: ExtensionPage }[] = []
    for (const entry of extensions.list()) {
      for (const page of entry.manifest.pages ?? []) {
        out.push({ extensionId: entry.manifest.id, extensionName: entry.manifest.name, page })
      }
    }
    return out
  },

  /** On startup: read the stored manifests. `userAddons.init` loads the add-ons. */
  async init() {
    if (started) return
    started = true
    const stored = await window.lumen.extensions.list().catch(() => [])
    for (const entry of stored) {
      if (entry.error || !entry.data) continue
      const record = toInstalled(entry.data)
      if (!record) continue
      installed.set(record.manifest.id, record)
    }
    emit()
  },

  /**
   * Install or update a manifest.
   *
   * The add-on goes through the usual validation; when that fails nothing is
   * stored and the first message is passed on.
   */
  async install(manifest: ExtensionManifest, server: string): Promise<void> {
    const model = normalizeModel(structuredClone(manifest.addon))
    const issues = await userAddons.save(model, model.id)
    const blocking = blockingIssues(issues)
    if (blocking.length) throw new Error(blocking[0].message)

    const record: InstalledExtension = {
      manifest,
      server: normalizeServerUrl(server),
      installedAt: installed.get(manifest.id)?.installedAt ?? Date.now(),
    }
    await window.lumen.extensions.save(manifest.id, `${JSON.stringify(record, null, 2)}\n`)
    installed.set(manifest.id, record)
    useStore.getState().applyExtensionDefaults(manifest)
    emit()
  },

  /** Fetch from a server and install. */
  async installFrom(server: string, id: string, version?: string): Promise<ExtensionManifest> {
    const manifest = await fetchManifest(server, id, version)
    await extensions.install(manifest, server)
    return manifest
  },

  async uninstall(id: string) {
    if (!installed.has(id)) return
    await userAddons.remove(id)
    await window.lumen.extensions.remove(id)
    installed.delete(id)
    useStore.getState().forgetExtensionSettings(id)
    emit()
  },

  /**
   * Look for newer versions.
   *
   * One catalogue fetch per server rather than one request per extension, so a
   * server with many installed extensions is asked exactly once.
   */
  async checkUpdates(): Promise<{ id: string; from: string; to: string; server: string }[]> {
    const byServer = new Map<string, InstalledExtension[]>()
    for (const entry of installed.values()) {
      if (!entry.server) continue
      byServer.set(entry.server, [...(byServer.get(entry.server) ?? []), entry])
    }
    const out: { id: string; from: string; to: string; server: string }[] = []
    await Promise.all([...byServer.entries()].map(async ([server, entries]) => {
      const { fetchIndex } = await import('./client')
      const index = await fetchIndex(server).catch(() => null)
      if (!index) return
      for (const entry of entries) {
        const remote = index.extensions.find((candidate) => candidate.id === entry.manifest.id)
        if (!remote || remote.version === entry.manifest.version) continue
        out.push({ id: entry.manifest.id, from: entry.manifest.version, to: remote.version, server })
      }
    }))
    return out
  },

  /** Apply every update found; returns the names. */
  async updateAll(): Promise<string[]> {
    const updates = await extensions.checkUpdates()
    const done: string[] = []
    for (const update of updates) {
      try {
        const manifest = await extensions.installFrom(update.server, update.id, update.to)
        done.push(manifest.name)
      } catch (err) {
        useStore.getState().notify(t('extensions.updateFailed', { name: update.id, error: (err as Error).message }), 'warning')
      }
    }
    return done
  },
}
