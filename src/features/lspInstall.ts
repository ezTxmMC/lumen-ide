/**
 * A missing language server: ask once, and install on request.
 *
 * Opening a file whose language expects a server that is nowhere on the
 * machine opens the install dialog (`LspInstallDialog`) with every server of
 * that language and the way each one would be installed here — Lumen's own
 * environment, the system's package manager (asking for the administrator
 * password where needed) or the add-on's install command.
 *
 * It asks sparingly:
 *   • only where Lumen can install a server of the language on this machine,
 *   • at most once per language and session,
 *   • never again once someone ticks “don't ask again” (`lspInstallDeclined`
 *     in the settings),
 *   • and never while another dialog is open.
 *
 * At startup the main process reports the package managers it found; until
 * then only what needs none of them counts.
 */

import { useStore } from '@/state/store'
import { lsp } from '@/core/lsp/manager'
import { registry } from '@/core/registry'
import { openLspInstall, lspInstall } from '@/lib/lsp-install'
import { overlayOpen } from '@/hooks/useEditorRefocus'

let started = false
/** Already asked in this session — whatever the answer was. */
const asked = new Set<string>()

/** The first language among the open tabs that lacks a server one could install. */
function candidate(): { languageId: string; server: string } | null {
  const state = useStore.getState()
  const open = new Set(
    state.tabs.map((tab) => state.languageFor(tab)?.id).filter((id): id is string => Boolean(id)),
  )
  for (const { languageId, config } of lsp.missingServers()) {
    if (!open.has(languageId)) continue
    if (asked.has(languageId)) continue
    if (state.lspInstallDeclined.includes(languageId)) continue
    const servers = registry.languages().find((language) => language.id === languageId)?.lsp ?? [config]
    const installable = servers.find((server) => lsp.canInstall(server))
    if (!installable) continue
    return { languageId, server: installable.label }
  }
  return null
}

function check() {
  if (lspInstall.isOpen()) return
  const state = useStore.getState()
  if (!state.ready || !state.effects.lsp) return
  // Do not put a prompt on top of an open dialog.
  if (overlayOpen(state)) return
  const found = candidate()
  if (!found) return
  asked.add(found.languageId)
  openLspInstall(found.languageId, { server: found.server, prompt: true })
}

export function init() {
  if (started) return
  started = true
  void window.lumen.privileged.system().then((info) => lsp.setSystemInfo(info)).catch(() => {})
  lsp.subscribe(check)
  useStore.subscribe(check)
}
