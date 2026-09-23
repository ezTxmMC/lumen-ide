/** Small, stateless helpers shared by the slices and exported for the interface. */

import { registry } from '@/core/registry'
import { isOfficial } from '@/core/extensions/trust'
import { OFFICIAL_SERVER_URL, type ExtensionServer } from '@/core/extensions/types'
import { DEFAULT_ICON_PACK_ID } from '@/addons/builtin/icons'
import { setActiveIconPack } from '@/lib/file-icon'
import type { Theme } from '@/core/types'
import type { Tab, WorkspaceDef } from './types'

/** The vetted server is always in the list and cannot be removed. */
export const DEFAULT_EXTENSION_SERVER: ExtensionServer = { url: OFFICIAL_SERVER_URL, name: 'Lumen', trusted: true }

/**
 * Read the stored servers and put the official one in front.
 *
 * It is never taken from the file but always set afresh: otherwise an edited
 * settings file could record it as “untrusted” or, worse, list a foreign host
 * under its name.
 */
export function withOfficialServer(stored: ExtensionServer[] | undefined): ExtensionServer[] {
  const rest = (Array.isArray(stored) ? stored : [])
    .filter((server) => server && typeof server.url === 'string' && !isOfficial(server.url))
    .map((server) => ({
      url: server.url,
      name: typeof server.name === 'string' ? server.name : undefined,
      trusted: server.trusted === true,
      disabled: server.disabled === true,
    }))
  return [DEFAULT_EXTENSION_SERVER, ...rest]
}

export const WORKSPACE_COLORS = ['#7c8cff', '#22d3ee', '#5ecf8f', '#fbbf24', '#f472b6', '#fb7185', '#c084fc', '#f97316']

/** The last segment of a path — a folder's display name. */
export const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path

export function isWorkspaceDef(value: unknown): value is WorkspaceDef {
  const w = value as WorkspaceDef | null
  return Boolean(
    w && typeof w.id === 'string' && typeof w.name === 'string' && Array.isArray(w.folders) &&
    w.folders.every((f) => typeof f === 'string') && typeof w.activeFolder === 'string',
  )
}

/** A rough structural check for themes loaded and imported. */
export function isTheme(value: unknown): value is Theme {
  const theme = value as Theme | null
  return Boolean(
    theme && typeof theme.id === 'string' && typeof theme.name === 'string' &&
    (theme.type === 'dark' || theme.type === 'light') &&
    theme.ui && typeof theme.ui === 'object' && typeof theme.ui.bg === 'string' &&
    theme.syntax && typeof theme.syntax === 'object',
  )
}

/** Produces a theme identifier not yet taken. */
export function uniqueThemeId(base: string, existing: Theme[]): string {
  const clean = base.replace(/-kopie(-\d+)?$/, '')
  const taken = new Set([...registry.themes(), ...existing].map((theme) => theme.id))
  let candidate = `${clean}-kopie`
  let counter = 2
  while (taken.has(candidate)) candidate = `${clean}-kopie-${counter++}`
  return candidate
}

/** Set the active icon pack; an unknown id falls back to the default pack. */
export function applyIconPack(id: string) {
  const packs = registry.iconPacks()
  setActiveIconPack(packs.find((pack) => pack.id === id) ?? packs.find((pack) => pack.id === DEFAULT_ICON_PACK_ID) ?? null)
}

/** Split the identifier of an extension page (`ext:<extension>:<page>`). */
export function parseExtensionView(view: string | null): { extensionId: string; pageId: string } | null {
  if (!view?.startsWith('ext:')) return null
  const rest = view.slice(4)
  const cut = rest.lastIndexOf(':')
  if (cut <= 0) return null
  return { extensionId: rest.slice(0, cut), pageId: rest.slice(cut + 1) }
}

/** A selector helper for the dirty state. */
export const isDirty = (tab: Tab) => tab.content !== tab.saved && !tab.readonly

/** The path relative to the working folder, otherwise unchanged. */
export function relativeToWorkspace(path: string, workspace: string | null): string {
  if (!workspace) return path
  const prefix = `${workspace.replace(/[\\/]$/, '')}/`
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}
