/**
 * Language servers for a freshly installed extension.
 *
 * An extension brings languages, and most languages expect a language server
 * that is not part of the extension itself. Rather than leaving the install to
 * the language-server panel, Lumen asks right after installing — the install
 * dialog lists every missing server, all selected, each one deselectable.
 *
 * Only servers that are worth asking about are offered:
 *   • languages that already have a working server are left alone,
 *   • a server needs a way to install it here — a package, the system's
 *     package manager or an install command,
 *   • a program shared by several languages is offered once.
 */

import { useStore } from '@/state/store'
import { lsp } from '@/core/lsp/manager'
import { openServersInstall } from '@/lib/lsp-install'
import type { LspConfig } from '@/core/types'
import type { ExtensionManifest } from './types'

/** Every server of the language, or none when one of them is already there. */
async function missingFor(servers: LspConfig[]): Promise<LspConfig[]> {
  const installed = await Promise.all(servers.map((config) => lsp.isInstalled(config)))
  if (installed.some(Boolean)) return []
  return servers
}

/** The servers of the extension that are missing and could be installed here. */
export async function installableServers(manifest: ExtensionManifest): Promise<LspConfig[]> {
  const perLanguage = await Promise.all(
    (manifest.addon.languages ?? []).map((language) => missingFor(language.lsp ?? [])),
  )
  const byCommand = new Map<string, LspConfig>()
  for (const config of perLanguage.flat()) {
    if (!lsp.canInstall(config)) continue
    if (byCommand.has(config.command)) continue
    byCommand.set(config.command, config)
  }
  return [...byCommand.values()]
}

/** Offer the extension's missing language servers in the install dialog — all selected, each deselectable. */
export async function offerServers(manifest: ExtensionManifest): Promise<void> {
  if (!useStore.getState().effects.lsp) return
  const servers = await installableServers(manifest)
  if (!servers.length) return
  openServersInstall(manifest.name, servers)
}
