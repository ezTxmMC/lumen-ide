/**
 * Starting the “userAddons” feature: load and register user add-ons, and
 * register the Add-on Studio's commands.
 */

import { useStore } from '@/state/store'
import { registerCommandProvider } from '@/core/commands'
import { userAddons } from '@/core/user-addons/manager'
import { t } from '@/i18n'

export function init() {
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
