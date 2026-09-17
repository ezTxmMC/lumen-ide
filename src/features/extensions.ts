/**
 * Extensions from the network: read at startup, register the commands, and
 * look for newer versions in the background.
 *
 * The add-ons themselves are loaded by `userAddons.init` — they live in the
 * same folder and go through the same validation. What is added here is only
 * what an extension has beyond a user add-on: origin, settings and pages.
 */

import { useStore } from '@/state/store'
import { registerCommandProvider } from '@/core/commands'
import { extensions } from '@/core/extensions/manager'
import { t } from '@/i18n'
import type { Command } from '@/core/types'

let started = false

/** Not immediately at startup: the fetch should not slow a cold start down. */
const UPDATE_DELAY_MS = 20_000

function extensionCommands(): Command[] {
  const store = () => useStore.getState()
  const category = t('extensions.title')
  return [
    {
      id: 'extensions.open',
      title: t('extensions.title'),
      category,
      run: () => store().openDialog('extensions'),
    },
    {
      id: 'extensions.servers',
      title: t('extensions.servers'),
      category,
      run: () => store().openDialog('extensions', 'servers'),
    },
    {
      id: 'extensions.updateAll',
      title: t('extensions.updateAll'),
      category,
      when: () => extensions.list().length > 0,
      run: () => void extensions.updateAll().then((names) => {
        const message = names.length
          ? t('extensions.updated', { names: names.join(', ') })
          : t('extensions.updatesNone')
        store().notify(message, names.length ? 'success' : 'info')
      }),
    },
  ]
}

export async function init() {
  if (started) return
  started = true
  await extensions.init()
  registerCommandProvider(extensionCommands)

  // Look quietly in the background and speak up only when there is something.
  window.setTimeout(() => {
    void extensions.checkUpdates().then((updates) => {
      if (!updates.length) return
      useStore.getState().notify(t('extensions.updatesFound', { count: updates.length }), 'info')
    }).catch(() => {})
  }, UPDATE_DELAY_MS)
}
