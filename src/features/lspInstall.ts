/**
 * A missing language server: ask once, and install on request.
 *
 * Opening a file whose language expects a server that is nowhere on the
 * machine used to produce nothing but a quiet “not found” in the status bar —
 * installing had to be started by hand in the language server panel. This
 * feature asks outright instead.
 *
 * It asks sparingly:
 *   • only where Lumen can install the server — into its own environment
 *     (`package`) or by an install command for this platform,
 *   • at most once per language and session,
 *   • never again once someone ticks “stop asking” (`lspInstallDeclined` in
 *     the settings),
 *   • and never while another dialog is open.
 *
 * The installation runs through `installServer` in the output panel, so it
 * stays visible and can be cancelled.
 */

import { useStore } from '@/state/store'
import { lsp } from '@/core/lsp/manager'
import { registry } from '@/core/registry'
import { installServer } from '@/lib/run'
import { overlayOpen } from '@/hooks/useEditorRefocus'
import { t } from '@/i18n'
import type { LspConfig } from '@/core/types'

/** Record an adjusted command under this platform. */
function platformCommand(command: string): LspConfig['installCommands'] {
  const platform = useStore.getState().platform
  if (platform === 'win32') return { win32: command }
  if (platform === 'darwin') return { darwin: command }
  return { linux: command }
}

let started = false
/** Already asked in this session — whatever the answer was. */
const asked = new Set<string>()
let prompting = false

/** The language's display name, or its id. */
function languageName(languageId: string): string {
  const spec = registry.languages().find((language) => language.id === languageId)
  return spec?.name ?? languageId
}

function ask(languageId: string, config: LspConfig, command: string | null) {
  prompting = true
  asked.add(languageId)
  const language = languageName(languageId)
  const store = useStore.getState()

  store.openForm({
    title: t('lsp.installTitle'),
    description: t('lsp.installBody', { language, name: config.label }),
    submitLabel: t('lsp.installSubmit'),
    fields: [
      // A shell command is shown and can be edited — some systems need a
      // different package manager from the one on record. A package goes into
      // Lumen's own environment, so there is nothing to adjust.
      ...(command ? [{ id: 'command', label: t('lsp.installCommandLabel'), default: command, mono: true }] : []),
      { id: 'never', label: t('lsp.installNeverAsk', { language }), type: 'toggle' as const, default: '' },
    ],
    onSubmit: async (values) => {
      prompting = false
      if (values.never === 'true') {
        useStore.getState().declineLspInstall(languageId)
        return
      }
      const wanted = (values.command ?? '').trim()
      if (!command || !wanted || wanted === command) {
        await installServer(config)
        return
      }
      await installServer({ ...config, package: undefined, installCommands: platformCommand(wanted) })
    },
  })
}

/** The first language among the open tabs that lacks a server one could install. */
function candidate(): { languageId: string; config: LspConfig; command: string | null } | null {
  const state = useStore.getState()
  const open = new Set(
    state.tabs.map((tab) => state.languageFor(tab)?.id).filter((id): id is string => Boolean(id)),
  )
  for (const { languageId, config } of lsp.missingServers()) {
    if (!open.has(languageId)) continue
    if (asked.has(languageId)) continue
    if (state.lspInstallDeclined.includes(languageId)) continue
    if (!lsp.canInstall(config)) continue
    const command = lsp.hasPackage(config) ? null : lsp.installCommand(config)
    return { languageId, config, command }
  }
  return null
}

function check() {
  if (prompting) return
  const state = useStore.getState()
  if (!state.ready || !state.effects.lsp) return
  // Do not put a prompt on top of an open dialog.
  if (overlayOpen(state)) return
  const found = candidate()
  if (!found) return
  ask(found.languageId, found.config, found.command)
}

export function init() {
  if (started) return
  started = true
  lsp.subscribe(check)
  useStore.subscribe(check)
}
