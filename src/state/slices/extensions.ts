/**
 * Extension servers, the values of extension settings, and the languages for
 * which nobody wants to be asked about a language server again.
 */

import { fetchServerInfo } from '@/core/extensions/client'
import { isOfficial, normalizeServerUrl } from '@/core/extensions/trust'
import { t } from '@/i18n'
import { DEFAULT_EXTENSION_SERVER } from '../helpers'
import type { ExtensionSlice, Slice } from '../types'

export const createExtensionSlice: Slice<ExtensionSlice> = (set, get) => ({
  extensionServers: [DEFAULT_EXTENSION_SERVER],
  extensionSettings: {},
  lspInstallDeclined: [],

  async addExtensionServer(url) {
    let normalized: string
    try {
      normalized = normalizeServerUrl(url)
    } catch (err) {
      return (err as Error).message
    }
    if (get().extensionServers.some((server) => server.url === normalized)) return t('extensions.serverKnown')
    // Ask first whether one is running there — an entry that never answers is
    // a silent source of trouble in every later list.
    const info = await fetchServerInfo(normalized).catch((err: Error) => err)
    if (info instanceof Error) return info.message
    set((s) => ({ extensionServers: [...s.extensionServers, { url: info.url, name: info.name, trusted: false }] }))
    get().persist()
    return null
  },

  removeExtensionServer(url) {
    if (isOfficial(url)) return
    set((s) => ({ extensionServers: s.extensionServers.filter((server) => server.url !== url) }))
    get().persist()
  },

  setExtensionServer(url, patch) {
    set((s) => ({
      extensionServers: s.extensionServers.map((server) => {
        if (server.url !== url) return server
        // The vetted server stays trusted and switched on.
        if (isOfficial(url)) return { ...server, ...patch, trusted: true, disabled: false }
        return { ...server, ...patch }
      }),
    }))
    get().persist()
  },

  setExtensionSetting(extensionId, key, value) {
    set((s) => ({
      extensionSettings: {
        ...s.extensionSettings,
        [extensionId]: { ...s.extensionSettings[extensionId], [key]: value },
      },
    }))
    get().persist()
  },

  applyExtensionDefaults(manifest) {
    const current = get().extensionSettings[manifest.id] ?? {}
    const next = { ...current }
    let changed = false
    for (const setting of manifest.settings ?? []) {
      if (setting.key in next) continue
      // Secrets never live in the settings file — their value sits in the main process.
      if (setting.type === 'secret') continue
      next[setting.key] = setting.default ?? (setting.type === 'toggle' ? 'false' : '')
      changed = true
    }
    if (!changed) return
    set((s) => ({ extensionSettings: { ...s.extensionSettings, [manifest.id]: next } }))
    get().persist()
  },

  forgetExtensionSettings(extensionId) {
    const { [extensionId]: _removed, ...rest } = get().extensionSettings
    void _removed
    set({ extensionSettings: rest })
    get().persist()
  },

  declineLspInstall(languageId) {
    if (get().lspInstallDeclined.includes(languageId)) return
    set((s) => ({ lspInstallDeclined: [...s.lspInstallDeclined, languageId] }))
    get().persist()
  },
})
