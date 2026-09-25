/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/**
 * Extensions from the network: read at startup, register their views and
 * commands, and look for newer versions in the background.
 *
 * The add-ons themselves are loaded by `userAddons.init` — they live in the
 * same folder and go through the same validation. What is added here is what
 * an extension has beyond a user add-on: pages and views in the docks, the
 * commands its code handles, and the bridge to that code.
 */

import { Blocks } from 'lucide-react';
import { createElement } from 'react';
import { useStore } from '@/state/store';
import { registerCommandProvider } from '@/core/commands';
import { extensions } from '@/core/extensions/manager';
import { registry } from '@/core/registry';
import { extensionHost, parseViewTabPath } from '@/core/extensions/host';
import { migrateMovedAddons } from '@/core/extensions/migrations';
import { loadAppVersion } from '@/core/extensions/app-version';
import { initRendererCode } from '@/core/extensions/renderer-code';
import { installOpenWith } from '@/core/extensions/open-with';
import { viewRegistry, type Dock, type ViewDef } from '@/core/views';
import type { ExtensionPage, InstalledExtension } from '@/core/extensions/types';
import { namedIcon } from '@/components/ui/named-icons';
import { ExtensionPageView } from '@/components/panels/ExtensionPageView';
import { ExtensionView, ExtensionViewToolbar } from '@/components/extension-view/ExtensionView';
import { getLanguage, t } from '@/i18n';
import { localizeCommand, localizeTitle } from '@/core/extensions/localize';
import type { Command } from '@/core/types';

let started = false;

/** Not immediately at startup: the fetch should not slow a cold start down. */
const UPDATE_DELAY_MS = 20_000;

/** Where a page goes; `sidebar` is the old name of `left`, `editor` pages are not docked. */
const PAGE_DOCKS: Partial<Record<NonNullable<ExtensionPage['location']>, Dock>> = {
  sidebar: 'left', left: 'left', right: 'right', bottom: 'bottom',
};

function pageViews(entry: InstalledExtension, index: number): ViewDef[] {
  const { manifest } = entry;
  return (manifest.pages ?? []).flatMap((page, pageIndex) => {
    const dock = PAGE_DOCKS[page.location ?? 'editor'];
    if (!dock) {
      return [];
    }
    return [{
      id: `ext:${manifest.id}:${page.id}`,
      title: () => page.title,
      icon: page.icon ? namedIcon(page.icon) : Blocks,
      defaultDock: dock,
      order: 100 + index * 10 + pageIndex,
      source: () => manifest.name,
      render: () => createElement(ExtensionPageView, { page }),
    }];
  });
}

function codeViews(entry: InstalledExtension, index: number): ViewDef[] {
  const { manifest } = entry;
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
      const badge = extensionHost.view(manifest.id, view.id).content?.badge;
      if (badge === undefined || badge === '' || badge === 0) {
        return null;
      }
      return { text: String(badge), tone: 'text-accent' };
    },
  }]));
}

/** What the main process was last told about each extension's code, so only changes cross over. */
const hostState = new Map<string, string>();

/** An add-on that is off is treated as not installed: its code stops, its open view tabs close. */
function syncActivation() {
  const activeIds = new Set(extensions.listActive().map(({ manifest }) => manifest.id));
  for (const { manifest, codeHash } of extensions.list()) {
    const on = activeIds.has(manifest.id);
    if (!codeHash) {
      continue;
    }
    // The hash is part of the key: an update starts the code anew, even for an add-on that is off.
    const key = `${on}:${codeHash}`;
    const known = hostState.get(manifest.id);
    hostState.set(manifest.id, key);
    // Everything starts at launch, so an add-on that is on needs no message the first time.
    if (known === key || (on && known === undefined)) {
      continue;
    }
    void window.lumen.extensions.setCodeEnabled(manifest.id, on).catch(() => {});
  }
  const state = useStore.getState();
  for (const tab of state.tabs) {
    const view = parseViewTabPath(tab.path);
    if (view && !activeIds.has(view.extensionId)) {
      state.closeTabEverywhere(tab.id);
    }
  }
}

/** Hand the pages and views of every installed extension to the docks. */
function syncViews() {
  const list = extensions.listActive();
  viewRegistry.sync('ext:', list.flatMap(pageViews));
  viewRegistry.sync('view:', list.flatMap(codeViews));
}

function manifestCommands(): Command[] {
  return extensions.listActive().flatMap(({ manifest }) => (manifest.commands ?? []).map((declared) => localizeCommand(declared, getLanguage())).map((command) => ({
    id: `ext.${manifest.id}.${command.id}`,
    title: command.title,
    category: command.category ?? manifest.name,
    keybinding: command.keybinding,
    run: () => extensionHost.runCommand(manifest.id, command.id),
  })));
}

function extensionCommands(): Command[] {
  const store = () => useStore.getState();
  const category = t('extensions.title');
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
          : t('extensions.updatesNone');
        store().notify(message, names.length ? 'success' : 'info');
      }),
    },
  ];
}

/** What the project screen's window needs for its add-ons dialog: the installed list, without pages, views or code. */
export async function initInstalled() {
  await loadAppVersion();
  await extensions.init();
}

export async function init() {
  if (started) {
    return;
  }
  started = true;
  await loadAppVersion();
  await extensions.init();
  migrateMovedAddons();
  initRendererCode();
  extensionHost.init();
  installOpenWith();
  syncViews();
  extensions.subscribe(syncViews);
  // Switching an add-on on or off shows or hides its pages, views and commands.
  registry.subscribe(syncViews);
  registry.subscribe(syncActivation);
  extensions.subscribe(syncActivation);
  syncActivation();
  registerCommandProvider(extensionCommands);
  registerCommandProvider(manifestCommands);

  // Look quietly in the background and speak up only when there is something.
  window.setTimeout(() => {
    void extensions.checkUpdates().then((updates) => {
      if (!updates.length) {
        return;
      }
      useStore.getState().notify(t('extensions.updatesFound', { count: updates.length }), 'info');
    }).catch(() => {});
  }, UPDATE_DELAY_MS);
}
