/**
 * Starting the “userAddons” feature: load and register user add-ons, and
 * register the Add-on Studio's commands.
 */

import { createElement } from 'react'
import { Blocks } from 'lucide-react'
import { useStore } from '@/state/store'
import { registerCommandProvider } from '@/core/commands'
import { registry } from '@/core/registry'
import { userAddons } from '@/core/user-addons/manager'
import { viewRegistry, type ViewDef } from '@/core/views'
import { namedIcon } from '@/components/ui/named-icons'
import { ExtensionPageView } from '@/components/panels/ExtensionPageView'
import { t } from '@/i18n'

/** What was last handed to the docks — the registry reports far more often than panels change. */
let lastPanels = ''

/** The panels of every active add-on become views of the docks. */
function syncPanels() {
  const key = JSON.stringify(registry.panels())
  if (key === lastPanels) return
  lastPanels = key
  const views: ViewDef[] = registry.panels().map(({ addonId, addonName, panel }, index) => ({
    id: `addon:${addonId}:${panel.id}`,
    title: () => panel.title,
    icon: panel.icon ? namedIcon(panel.icon) : Blocks,
    defaultDock: panel.location ?? 'right',
    order: 300 + index,
    source: () => addonName,
    render: () => createElement(ExtensionPageView, { page: { ...panel, format: panel.format ?? 'markdown' } }),
  }))
  viewRegistry.sync('addon:', views)
}

export function init() {
  syncPanels()
  registry.subscribe(syncPanels)
  registerCommandProvider(() => {
    const category = t('addonStudio.commands.category')
    return [
      {
        id: 'addonStudio.new',
        title: t('addonStudio.commands.new'),
        category,
        run: () => useStore.getState().openAddonStudio(null),
      },
      {
        id: 'addonStudio.import',
        title: t('addonStudio.commands.import'),
        category,
        run: async () => {
          const model = await userAddons.importFile()
          if (model) useStore.getState().openAddonStudio(model.id)
        },
      },
      ...userAddons.list().map((model) => ({
        id: `addonStudio.edit.${model.id}`,
        title: t('addonStudio.commands.edit', { name: model.name }),
        category,
        run: () => useStore.getState().openAddonStudio(model.id),
      })),
    ]
  })
  return userAddons.init()
}
