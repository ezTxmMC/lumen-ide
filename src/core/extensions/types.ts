/**
 * Data model of extensions fetched from a server.
 *
 * An extension is a user add-on (`UserAddonModel` — the same format the
 * Add-on Studio writes) plus what only a server adds: where it came from, its
 * settings and its own pages.
 *
 * Deliberately no program code. What a server delivers is read and
 * interpreted, never executed; the graph interpreter of user add-ons stays the
 * only place anything runs. A hostile extension can therefore ship a wrong
 * language definition or an ugly page, but it cannot reach files, the network
 * or a shell except through an interpreter node that already allows it.
 */

import type { UserAddonModel } from '@/core/user-addons/schema'

/** Version of the manifest format Lumen understands. */
export const EXTENSION_SCHEMA = 1

/** Ids of server extensions — kept apart from `user.` out of the Studio. */
export const EXTENSION_ID_PATTERN = /^ext\.[a-z0-9][a-z0-9._-]{0,63}$/

/** The one server Lumen installs from without asking. */
export const OFFICIAL_HOST = 'lumen-extensions.eztxm.de'

export const OFFICIAL_SERVER_URL = `https://${OFFICIAL_HOST}`

export type ExtensionSettingType = 'text' | 'number' | 'toggle' | 'select'

/** A setting that shows up under “Extensions”. */
export interface ExtensionSetting {
  key: string
  label: string
  type?: ExtensionSettingType
  default?: string
  hint?: string
  placeholder?: string
  choices?: { value: string; label: string }[]
}

export type ExtensionPageFormat = 'markdown' | 'html'
export type ExtensionPageLocation = 'sidebar' | 'editor'

/** A page the extension contributes to Lumen. */
export interface ExtensionPage {
  id: string
  title: string
  icon?: string
  location?: ExtensionPageLocation
  format?: ExtensionPageFormat
  content: string
}

/** The full manifest, as a server delivers it. */
export interface ExtensionManifest {
  schema: number
  id: string
  name: string
  version: string
  description?: string
  author?: string
  icon?: string
  color?: string
  category?: 'language' | 'theme' | 'tool'
  keywords?: string[]
  license?: string
  homepage?: string
  repository?: string
  minAppVersion?: string
  readme?: string
  settings?: ExtensionSetting[]
  pages?: ExtensionPage[]
  addon: UserAddonModel
}

/** One entry in the catalogue — without the add-on itself. */
export interface ExtensionSummary {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  icon?: string
  color?: string
  category?: 'language' | 'theme' | 'tool'
  keywords?: string[]
  license?: string
  homepage?: string
  repository?: string
  minAppVersion?: string
  provides?: Record<string, number>
  versions?: string[]
/** A newer prerelease, when there is one. */
  preview?: string
  publishedAt?: string
  updatedAt?: string
}

/** A server someone has added. */
export interface ExtensionServer {
  /** Root address, with no trailing slash. */
  url: string
  /** Display name, as reported by the server. */
  name?: string
  /** Marked trusted by the user; the official one always is. */
  trusted?: boolean
  /** Skip fetching without losing the entry. */
  disabled?: boolean
}

/** What Lumen remembers about an installed extension. */
export interface InstalledExtension {
  manifest: ExtensionManifest
  /** Server it came from. */
  server: string
  installedAt: number
}

/** A server's catalogue response. */
export interface ExtensionIndex {
  schema: number
  server?: { name?: string; url?: string }
  updatedAt?: string
  extensions: ExtensionSummary[]
}
