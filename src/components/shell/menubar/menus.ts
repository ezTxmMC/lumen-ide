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
 * The menus of the menu bar, VS Code's order and grouping. Entries are command
 * ids wherever a command exists — the palette, the shortcuts and the menu stay
 * one thing; titles and shortcuts come from there.
 */

import { useStore } from '@/state/store';
import { t } from '@/i18n';
import { openProject } from '@/lib/open-project';
import type { MenuEntry, MenuSpec } from './model';

const item = (key: string) => t(`menubar.item.${key}`);

function recentEntries(): MenuEntry[] {
  const state = useStore.getState();
  const recent = [...state.recentProjects]
    .filter((project) => project.path !== state.workspace)
    .sort((a, b) => b.openedAt - a.openedAt)
    .slice(0, 10);
  const projects: MenuEntry[] = recent.map((project) => ({
    label: project.name,
    detail: project.path,
    run: () => void openProject(project.path),
  }));
  if (!projects.length) {
    projects.push({ label: item('noRecent'), run: () => {}, disabled: true });
  }
  return [...projects, 'sep', { command: 'project.switch', label: item('moreRecent') }, { command: 'project.clearRecent' }];
}

function appearanceEntries(): MenuEntry[] {
  const { effects, layout } = useStore.getState();
  const secondary = layout.navSide === 'left' ? 'right' : 'left';
  return [
    { command: 'view.sidebar', checked: layout[layout.navSide].open },
    { command: 'view.secondarySidebar', checked: layout[secondary].open },
    { command: 'view.panel', checked: layout.bottom.open },
    'sep',
    { command: 'view.navLeft' },
    { command: 'view.navRight' },
    { command: 'view.resetLayout' },
    'sep',
    { command: 'effects.glass', label: item('glass'), checked: effects.glass },
    { command: 'effects.glow', label: item('glow'), checked: effects.glow },
    { command: 'effects.animations', label: item('animations'), checked: effects.animations },
    'sep',
    { command: 'effects.zoomIn', label: item('zoomIn') },
    { command: 'effects.zoomOut', label: item('zoomOut') },
    { command: 'effects.zoomReset', label: item('zoomReset') },
    'sep',
    { command: 'view.themes' },
  ];
}

function editorLayoutEntries(): MenuEntry[] {
  return [
    { command: 'view.splitRight' },
    { command: 'view.splitDown' },
    { command: 'view.unsplit' },
    'sep',
    { command: 'view.focusNextGroup' },
    { command: 'view.moveTabToOtherGroup' },
    { command: 'editor.moveTabToNewWindow' },
  ];
}

function fileEntries(): MenuEntry[] {
  return [
    { command: 'file.new' },
    { command: 'window.new' },
    { command: 'project.new' },
    'sep',
    { command: 'file.open' },
    { label: item('openRecent'), submenu: recentEntries },
    { command: 'project.switch' },
    'sep',
    { command: 'file.save' },
    { command: 'file.saveAs' },
    { command: 'file.saveAll' },
    'sep',
    { command: 'view.settings' },
    'sep',
    { command: 'file.closeTab', label: item('closeEditor') },
    { command: 'file.closeWorkspace' },
    { command: 'window.close' },
    'sep',
    { command: 'app.exit', label: item('exit') },
  ];
}

function editEntries(): MenuEntry[] {
  return [
    { command: 'editor.undo' },
    { command: 'editor.redo' },
    'sep',
    { command: 'edit.cut', keys: 'Ctrl+X' },
    { command: 'edit.copy', keys: 'Ctrl+C' },
    { command: 'edit.paste', keys: 'Ctrl+V' },
    'sep',
    { command: 'editor.find' },
    { command: 'editor.replace' },
    'sep',
    { command: 'view.search', label: item('findInFiles') },
    { command: 'search.text' },
    'sep',
    { command: 'editor.toggleComment' },
    { command: 'editor.toggleBlockComment' },
  ];
}

function selectionEntries(): MenuEntry[] {
  return [
    { command: 'edit.selectAll', keys: 'Ctrl+A' },
    { command: 'editor.expandSelection' },
    { command: 'editor.shrinkSelection' },
    'sep',
    { command: 'editor.copyLineUp' },
    { command: 'editor.copyLineDown' },
    { command: 'editor.moveLineUp' },
    { command: 'editor.moveLineDown' },
    'sep',
    { command: 'editor.addCursorAbove' },
    { command: 'editor.addCursorBelow' },
    { command: 'editor.selectNextOccurrence' },
    { command: 'editor.selectAllOccurrences' },
    { command: 'editor.selectLine' },
  ];
}

function viewEntries(): MenuEntry[] {
  const { effects } = useStore.getState();
  return [
    { command: 'view.commandPalette' },
    { command: 'search.everywhere' },
    'sep',
    { label: item('appearance'), submenu: appearanceEntries },
    { label: item('editorLayout'), submenu: editorLayoutEntries },
    'sep',
    { command: 'view.explorer' },
    { command: 'view.search' },
    { command: 'view.outline' },
    { command: 'view.debug' },
    { command: 'view.extensions' },
    'sep',
    { command: 'view.problems' },
    { command: 'view.output' },
    { command: 'terminal.toggle' },
    'sep',
    { command: 'view.popOutView' },
    { command: 'editor.moveTabToNewWindow' },
    { command: 'editor.dockWindowBack' },
    { command: 'view.dockAllPoppedOut' },
    'sep',
    { command: 'effects.wrap', label: item('wordWrap'), checked: effects.wordWrap },
    { command: 'view.minimap', label: item('minimap'), checked: effects.minimap },
    { command: 'effects.inlayHints', label: item('inlayHints'), checked: effects.inlayHints },
  ];
}

function goEntries(): MenuEntry[] {
  return [
    { command: 'nav.back' },
    { command: 'nav.forward' },
    'sep',
    { command: 'tabs.next', label: item('nextEditor') },
    { command: 'tabs.previous', label: item('previousEditor') },
    { command: 'tabs.reopenClosed' },
    'sep',
    { command: 'file.quickOpen', label: item('gotoFile') },
    { command: 'editor.workspaceSymbols' },
    { command: 'editor.symbols' },
    { command: 'editor.gotoLine' },
    { command: 'editor.jumpToBracket' },
    'sep',
    { command: 'editor.definition' },
    { command: 'editor.declaration' },
    { command: 'editor.typeDefinition' },
    { command: 'editor.implementation' },
    { command: 'editor.references' },
  ];
}

function runEntries(): MenuEntry[] {
  return [
    { command: 'debug.start', label: item('startDebugging') },
    { command: 'project.run', label: item('runWithoutDebugging') },
    { command: 'run.file' },
    { command: 'debug.stop', label: item('stopDebugging') },
    { command: 'debug.restart', label: item('restartDebugging') },
    { command: 'run.stop' },
    'sep',
    { command: 'debug.openConfig' },
    'sep',
    { command: 'debug.stepOver' },
    { command: 'debug.stepInto' },
    { command: 'debug.stepOut' },
    { command: 'debug.continue' },
    'sep',
    { command: 'debug.toggleBreakpoint' },
    { command: 'debug.conditionalBreakpoint' },
    { command: 'debug.logpoint' },
    { command: 'debug.removeAllBreakpoints' },
    'sep',
    { command: 'project.build' },
    { command: 'project.test' },
  ];
}

function terminalEntries(): MenuEntry[] {
  return [
    { command: 'terminal.new' },
    { command: 'terminal.fileDir' },
    'sep',
    { command: 'project.tasks' },
    { command: 'project.build' },
    { command: 'terminal.runSelection' },
    'sep',
    { command: 'terminal.toggle' },
    { command: 'terminal.closeAll' },
    { command: 'terminal.external' },
  ];
}

function helpEntries(): MenuEntry[] {
  return [
    { command: 'view.commandPalette' },
    { command: 'help.docs' },
    { command: 'help.website' },
    'sep',
    { command: 'view.keybindings' },
    'sep',
    { command: 'help.reportIssue' },
    { command: 'app.devTools' },
    'sep',
    { command: 'updater.check' },
    'sep',
    { command: 'help.about' },
  ];
}

export function buildMenus(): MenuSpec[] {
  const menu = (key: string) => t(`menubar.menu.${key}`);
  return [
    { id: 'file', label: menu('file'), items: fileEntries },
    { id: 'edit', label: menu('edit'), items: editEntries },
    { id: 'selection', label: menu('selection'), items: selectionEntries },
    { id: 'view', label: menu('view'), items: viewEntries },
    { id: 'go', label: menu('go'), items: goEntries },
    { id: 'run', label: menu('run'), items: runEntries },
    { id: 'terminal', label: menu('terminal'), items: terminalEntries },
    { id: 'help', label: menu('help'), items: helpEntries },
  ];
}
