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
 * The commands the menu bar brought along — windows, Save As, the clipboard,
 * back and forward, shrinking a selection, help — and the history they rely
 * on. Registered as a command provider, so the palette and the shortcuts know
 * them as well.
 */

import { selectAll } from '@codemirror/commands';
import { useStore } from '@/state/store';
import { registerCommandProvider } from '@/core/commands';
import { lsp } from '@/core/lsp/manager';
import { editorBridge } from '@/lib/editor-bridge';
import { initNavHistory, navHistory } from '@/lib/nav-history';
import { initSelectionHistory, shrinkSelection } from '@/lib/selection-history';
import { useProjectSwitcher } from '@/lib/open-project';
import { t } from '@/i18n';
import type { Command } from '@/core/types';
import type { RecentProject } from '@/state/store';

const REPOSITORY = 'https://github.com/ezTxmMC/lumen-ide';

let started = false;

export function init() {
  if (started) {
    return;
  }
  started = true;
  initNavHistory();
  initSelectionHistory();
  registerCommandProvider(menuCommands);
  // Several windows share settings.json: on focus, take over what another window changed meanwhile.
  window.addEventListener('focus', () => void syncSharedSettings());
}

async function syncSharedSettings() {
  const stored = await window.lumen.settings.load().catch(() => null) as {
    recentProjects?: RecentProject[];
    effects?: { openProjectsIn?: unknown; };
  } | null;
  if (!stored) {
    return;
  }
  const state = useStore.getState();
  const recent = Array.isArray(stored.recentProjects) ? stored.recentProjects : null;
  if (recent && JSON.stringify(recent) !== JSON.stringify(state.recentProjects)) {
    useStore.setState({ recentProjects: recent });
  }
  const where = stored.effects?.openProjectsIn;
  if (where !== 'ask' && where !== 'this' && where !== 'new') {
    return;
  }
  if (where === state.effects.openProjectsIn) {
    return;
  }
  useStore.setState({ effects: { ...state.effects, openProjectsIn: where } });
}

/** Save the active tab under another name; it then stands for the new file, as in VS Code. */
async function saveAs() {
  const state = useStore.getState();
  const tab = state.activeTab();
  if (!tab || tab.readonly) {
    return;
  }
  if (!tab.path || tab.virtual) {
    await state.saveTab(tab.id);
    return;
  }
  const target = await window.lumen.dialog.saveFile(tab.path);
  if (!target) {
    return;
  }
  if (target !== tab.path) {
    lsp.closeDocument(tab.path);
    state.retargetTab(tab.id, target);
    const moved = useStore.getState().tabs.find((open) => open.id === tab.id);
    if (moved) {
      void lsp.openDocument(useStore.getState().languageFor(moved), target, moved.content);
    }
  }
  await useStore.getState().saveTab(tab.id);
}

function selectEverything() {
  const view = editorBridge.view;
  if (!view) {
    void window.lumen.window.edit('selectAll');
    return;
  }
  selectAll(view);
  view.focus();
}

function openExternal(url: string) {
  void window.lumen.shell.openExternal(url);
}

function menuCommands(): Command[] {
  const s = () => useStore.getState();
  const cmd = (key: string) => t(`menubar.cmd.${key}`);
  const cat = (key: string) => t(`commands.category.${key}`);
  const help = t('menubar.menu.help');
  const editable = () => Boolean(s().activeTab() && !s().activeTab()?.readonly);
  return [
    { id: 'window.new', title: cmd('newWindow'), category: cat('file'), run: () => void window.lumen.window.openProject() },
    { id: 'window.close', title: cmd('closeWindow'), category: cat('file'), run: () => void window.lumen.window.close() },
    { id: 'app.exit', title: cmd('exit'), category: cat('file'), run: () => void window.lumen.app.quit() },
    { id: 'file.saveAs', title: cmd('saveAs'), category: cat('file'), run: saveAs, when: editable },
    { id: 'project.switch', title: cmd('switchProject'), category: cat('project'), run: () => useProjectSwitcher.setState({ open: true }) },
    {
      id: 'project.clearRecent', title: cmd('clearRecent'), category: cat('project'),
      run: () => {
        useStore.setState({ recentProjects: [] });
        s().persist();
      },
      when: () => s().recentProjects.length > 0,
    },

    { id: 'edit.cut', title: cmd('cut'), category: cat('editor'), run: () => void window.lumen.window.edit('cut') },
    { id: 'edit.copy', title: cmd('copy'), category: cat('editor'), run: () => void window.lumen.window.edit('copy') },
    { id: 'edit.paste', title: cmd('paste'), category: cat('editor'), run: () => void window.lumen.window.edit('paste') },
    { id: 'edit.selectAll', title: cmd('selectAll'), category: cat('selection'), run: selectEverything },
    {
      id: 'editor.shrinkSelection', title: cmd('shrinkSelection'), category: cat('selection'), scope: 'editor',
      run: () => {
        const view = editorBridge.view;
        if (view) {
          shrinkSelection(view);
        }
      },
      when: () => Boolean(editorBridge.view),
    },

    { id: 'nav.back', title: cmd('back'), category: cat('editor'), run: navHistory.back, when: navHistory.canGoBack },
    { id: 'nav.forward', title: cmd('forward'), category: cat('editor'), run: navHistory.forward, when: navHistory.canGoForward },

    { id: 'help.docs', title: cmd('docs'), category: help, run: () => openExternal(`${REPOSITORY}#readme`) },
    { id: 'help.website', title: cmd('website'), category: help, run: () => openExternal(REPOSITORY) },
    { id: 'help.reportIssue', title: cmd('reportIssue'), category: help, run: () => openExternal(`${REPOSITORY}/issues/new`) },
    { id: 'help.about', title: cmd('about'), category: help, run: () => s().openDialog('settings', 'about') },
    { id: 'app.devTools', title: cmd('devTools'), category: help, run: () => void window.lumen.window.toggleDevTools() },
  ];
}
