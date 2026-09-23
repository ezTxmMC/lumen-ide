/**
 * Things that used to be built in and now come as extensions.
 *
 * Someone who had such an add-on switched on hears once where it went; the old
 * id is dropped from the enabled list afterwards, so the hint does not repeat.
 */

import { useStore } from '@/state/store'
import { t } from '@/i18n'
import { extensions } from './manager'

/** Old bundled add-on id → the extension that replaces it, and the hint to show. */
const MOVED: { addonId: string; extensionId: string; message: string }[] = [
  { addonId: 'tool.discord', extensionId: 'ext.discord', message: 'discord.moved' },
  { addonId: 'tool.minecraft', extensionId: 'ext.minecraft', message: 'minecraft.moved' },
]

/** Once at startup, after the installed extensions are known. */
export function migrateMovedAddons() {
  const store = useStore.getState()
  const moved = MOVED.filter((entry) => store.enabledAddons.includes(entry.addonId))
  if (!moved.length) return
  const gone = new Set(moved.map((entry) => entry.addonId))
  useStore.setState({ enabledAddons: store.enabledAddons.filter((id) => !gone.has(id)) })
  store.persist()
  for (const entry of moved) {
    if (extensions.has(entry.extensionId)) continue
    store.notify(t(entry.message), 'info')
  }
}
