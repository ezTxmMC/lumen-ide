/**
 * Language servers for a freshly installed extension.
 *
 * An extension brings languages, and most languages expect a language server
 * that is not part of the extension itself. Rather than leaving the install to
 * the language-server panel, Lumen asks right after installing: one server,
 * all of them, or none.
 *
 * Only servers that are worth asking about are offered:
 *   • languages that already have a working server are left alone,
 *   • a server needs a package or an install command for this platform,
 *   • a program shared by several languages is offered once.
 */

import { useStore } from '@/state/store'
import { lsp } from '@/core/lsp/manager'
import { installServers } from '@/lib/run'
import { t } from '@/i18n'
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

/** Ask whether to install one or all of the extension's language servers. */
export async function offerServers(manifest: ExtensionManifest): Promise<void> {
  const state = useStore.getState()
  if (!state.effects.lsp) return
  const servers = await installableServers(manifest)
  if (!servers.length) return

  const modes = [
    { value: 'all', label: t('lsp.serversAll', { count: String(servers.length) }) },
    { value: 'one', label: t('lsp.serversOne') },
    { value: 'none', label: t('lsp.serversNone') },
  ].filter((mode) => mode.value !== 'one' || servers.length > 1)

  state.openForm({
    title: t('lsp.serversTitle'),
    description: t('lsp.serversBody', {
      name: manifest.name,
      servers: servers.map((config) => config.label).join(', '),
    }),
    submitLabel: t('lsp.installSubmit'),
    fields: [
      { id: 'mode', label: t('lsp.serversChoice'), type: 'select', default: 'all', choices: modes },
      {
        id: 'server',
        label: t('lsp.serversPick'),
        type: 'select',
        default: servers[0].command,
        choices: servers.map((config) => ({
          value: config.command,
          label: config.label,
          hint: lsp.installHint(config) ?? undefined,
        })),
        when: (values) => values.mode === 'one',
      },
    ],
    onSubmit: async (values) => {
      if (values.mode === 'none') return
      if (values.mode === 'one') {
        await installServers(servers.filter((config) => config.command === values.server))
        return
      }
      await installServers(servers)
    },
  })
}
