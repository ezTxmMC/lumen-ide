/**
 * Icons for files and folders, from the active icon pack.
 *
 * The store sets the pack through `setActiveIconPack`; components subscribe
 * with `subscribeIconPack` (see `components/icons/FileIcon.tsx`) so the
 * explorer, the tabs and the lists redraw when it changes.
 */

import { registry } from '@/core/registry'
import { resolveFileIcon, resolveFolderIcon, type ResolvedIcon } from '@/core/icon-pack'
import type { IconDef, IconPack } from '@/core/types'

export type FileGlyph = ResolvedIcon

let active: IconPack | null = null
let version = 0
const listeners = new Set<() => void>()
const fileCache = new Map<string, ResolvedIcon>()
let cachedRegistryVersion = -1

export function setActiveIconPack(pack: IconPack | null) {
  if (pack === active) return
  active = pack
  fileCache.clear()
  version++
  for (const listener of listeners) listener()
}

export function activeIconPack(): IconPack | null {
  return active
}

export function subscribeIconPack(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function iconPackVersion() {
  return version
}

export function fileGlyph(name: string): FileGlyph {
  // Languages change with add-ons — which invalidates the cache.
  if (registry.getVersion() !== cachedRegistryVersion) {
    fileCache.clear()
    cachedRegistryVersion = registry.getVersion()
  }
  const hit = fileCache.get(name)
  if (hit) return hit
  const resolved = resolveFileIcon(active, name, registry.languages())
  fileCache.set(name, resolved)
  return resolved
}

export function folderIcon(name: string): IconDef & { color: string } {
  return resolveFolderIcon(active, name)
}

/** The folder's colour only, for the tinted arrows. */
export function folderTint(name: string): string {
  return folderIcon(name).color
}
