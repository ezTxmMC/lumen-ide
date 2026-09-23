/**
 * Extensions from the network: read at startup, register their views and
 * commands, and look for newer versions in the background.
 *
 * The add-ons themselves are loaded by `userAddons.init` — they live in the
 * same folder and go through the same validation. What is added here is what
 * an extension has beyond a user add-on: pages and views in the docks, the
 * commands its code handles, and the bridge to that code.
 */

import { Blocks } from 'lucide-react'
import { createElement } from 'react'
import { useStore } from '@/state/store'
import { registerCommandProvider } from '@/core/commands'
import { extensions } from '@/core/extensions/manager'
import { extensionHost } from '@/core/extensions/host'
import { migrateMovedAddons } from '@/core/extensions/migrations'
import { loadAppVersion } from '@/core/extensions/app-version'
import { initRendererCode } from '@/core/extensions/renderer-code'
import { installOpenWith } from '@/core/extensions/open-with'
import { viewRegistry, type Dock, type ViewDef } from '@/core/views'
import type { ExtensionPage, InstalledExtension } from '@/core/extensions/types'
import { namedIcon } from '@/components/ui/named-icons'
import { ExtensionPageView } from '@/components/panels/ExtensionPageView'
import { ExtensionView, ExtensionViewToolbar } from '@/components/extension-view/ExtensionView'
import { getLanguage, t } from '@/i18n'
import { localizeCommand, localizeTitle } from '@/core/extensions/localize'
import type { Command } from '@/core/types'

let started = false

/** Not immediately at startup: the fetch should not slow a cold start down. */
const UPDATE_DELAY_MS = 20_000

/** Where a page goes; `sidebar` is the old name of `left`, `editor` pages are not docked. */
const PAGE_DOCKS: Partial<Record<NonNullable<ExtensionPage['location']>, Dock>> = {
  sidebar: 'left', left: 'left', right: 'right', bottom: 'bottom',
}

function pageViews(entry: InstalledExtension, index: number): ViewDef[] {
  const { manifest } = entry
  return (manifest.pages ?? []).flatMap((page, pageIndex) => {
    const dock = PAGE_DOCKS[page.location ?? 'editor']
    if (!dock) return []
    return [{
      id: `ext:${manifest.id}:${page.id}`,
      title: () => page.title,
      icon: page.icon ? namedIcon(page.icon) : Blocks,
      defaultDock: dock,
      order: 100 + index * 10 + pageIndex,
      source: () => manifest.name,
      render: () => createElement(ExtensionPageView, { page }),
    }]
  })
}

function codeViews(entry: InstalledExtension, index: number): ViewDef[] {
  const { manifest } = entry
  // Editor views are tabs the code opens, not docks.
  return (manifest.views ?? []).flatMap((view, viewIndex) => (view.location === 'editor' ? [] : [{
    id: `view:${manifest.id}/${view.id}`,
    title: () => extensionHost.view(manifest.id, view.id).content?.title ?? localizeTitle(view, getLanguage()).title,
    icon: namedIcon(view.icon ?? 'blocks'),
    defaultDock: view.location ?? 'left',
    order: view.order ?? 100 + index * 10 + viewIndex,
    source: () => manifest.name,
    render: () => createElement(ExtensionView, { key: `${manifest.id}/${view.id}`, extensionId: manifest.id, viewId: view.id }),
    toolbar: () => createElement(ExtensionViewToolbar, { extensionId: manifest.id, viewId: view.id }),
    badge: () => {
      const badge = extensionHost.view(manifest.id, view.id).content?.badge
      if (badge === undefined || badge === '' || badge === 0) return null
      return { text: String(badge), tone: 'text-accent' }
    },
  }]))
}

/** Hand the pages and views of every installed extension to the docks. */
function syncViews() {
  const list = extensions.list()
  viewRegistry.sync('ext:', list.flatMap(pageViews))
  viewRegistry.sync('view:', list.flatMap(codeViews))
}

function manifestCommands(): Command[] {
  return extensions.list().flatMap(({ manifest }) => (manifest.commands ?? []).map((declared) => localizeCommand(declared, getLanguage())).map((command) => ({
    id: `ext.${manifest.id}.${command.id}`,
    title: command.title,
    category: command.category ?? manifest.name,
    keybinding: command.keybinding,
    run: () => extensionHost.runCommand(manifest.id, command.id),
  })))
}

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
  await loadAppVersion()
  await extensions.init()
  migrateMovedAddons()
  initRendererCode()
  extensionHost.init()
  installOpenWith()
  syncViews()
  extensions.subscribe(syncViews)
  registerCommandProvider(extensionCommands)
  registerCommandProvider(manifestCommands)

  // Look quietly in the background and speak up only when there is something.
  window.setTimeout(() => {
    void extensions.checkUpdates().then((updates) => {
      if (!updates.length) return
      useStore.getState().notify(t('extensions.updatesFound', { count: updates.length }), 'info')
    }).catch(() => {})
  }, UPDATE_DELAY_MS)
}
