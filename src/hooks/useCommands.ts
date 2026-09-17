import { useMemo, useSyncExternalStore } from 'react'
import { useStore } from '@/state/store'
import { lsp } from '@/core/lsp/manager'
import { terminals } from '@/lib/terminals'
import { keybindings } from '@/core/keybindings'
import { useLanguage } from '@/i18n'
import {
  buildCommands, getCommandProviderVersion, subscribeCommandProviders,
} from '@/core/commands'
import type { Command } from '@/core/types'

/** Every command — built in plus those of the active add-ons — recomputed when anything changes. */
export function useCommands(options: { includeHidden?: boolean } = {}): Command[] {
  const registryVersion = useStore((s) => s.registryVersion)
  const themeId = useStore((s) => s.themeId)
  const effects = useStore((s) => s.effects)
  const project = useStore((s) => s.project)
  const config = useStore((s) => s.projectConfig)
  const lspVersion = useStore((s) => s.lspVersion)
  const groups = useStore((s) => s.groups.length)
  const activeTabId = useStore((s) => s.activeTabId)
  const workspaces = useStore((s) => s.workspaces)
  const extraFolders = useStore((s) => s.extraFolders)
  const language = useLanguage()
  const terminalVersion = useSyncExternalStore(terminals.subscribe.bind(terminals), terminals.getVersion)
  const bindingVersion = useSyncExternalStore(keybindings.subscribe, keybindings.getVersion)
  const providerVersion = useSyncExternalStore(subscribeCommandProviders, getCommandProviderVersion)
  void lsp

  return useMemo(
    () => buildCommands(options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      registryVersion, themeId, effects, project, config, lspVersion, terminalVersion, groups, activeTabId,
      language, bindingVersion, providerVersion, options.includeHidden, workspaces, extraFolders,
    ],
  )
}
