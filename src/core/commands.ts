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
 * Every command of the IDE in one place — for the command palette, “search
 * everywhere”, the shortcuts and the shortcut dialog.
 *
 * Features such as the debugger register their commands through
 * `registerCommandProvider` rather than extending this file.
 */

import { useStore } from '@/state/store';
import { registry } from '@/core/registry';
import {
  runActiveFile, runWithConfig, runDefault, runTask, stopRun, installServer,
} from '@/lib/run';
import { lsp } from '@/core/lsp/manager';
import type { EditorView } from '@codemirror/view';
import { editorBridge } from '@/lib/editor-bridge';
import { terminals } from '@/lib/terminals';
import {
  findReferences, formatDocument, gotoLocation, organizeImports, showCodeActions,
  startRename, triggerSignatureHelp,
} from '@/components/editor/lsp-extension';
import { EDITOR_COMMANDS } from '@/core/editor-commands';
import { formatBindingsFor } from '@/core/keybindings';
import { visibleGroups } from '@/state/popout';
import { activeDockViewId, dockBackTargetKey } from '@/core/popout/active';
import { LANGUAGES, t } from '@/i18n';
import type { Command } from '@/core/types';

type Provider = () => Command[];

const providers = new Set<Provider>();
const providerListeners = new Set<() => void>();
let providerVersion = 0;

/** Contribute further commands (debugger, workspaces, user add-ons). */
export function registerCommandProvider(provider: Provider) {
  providers.add(provider);
  providerVersion++;
  for (const fn of providerListeners) {
    fn();
  }
  return () => {
    providers.delete(provider);
    providerVersion++;
    for (const fn of providerListeners) {
      fn();
    }
  };
}

export function subscribeCommandProviders(fn: () => void) {
  providerListeners.add(fn);
  return () => { providerListeners.delete(fn); };
}

/**
 * Does focus sit in one of the editor's input fields — the search bar, say?
 *
 * CodeMirror's panels hang inside the editor's DOM. A command that opens such
 * a field has already put focus there; pulling it back into the text
 * afterwards would make the opening pointless.
 */
function focusInEditorField(view: EditorView): boolean {
  const active = document.activeElement;
  if (!active || active === view.contentDOM || !view.dom.contains(active)) {
    return false;
  }
  return Boolean(active.closest('input, textarea, select'));
}

export const getCommandProviderVersion = () => providerVersion;

const c = (key: string, params?: Record<string, string | number>) => t(`commands.${key}`, params);

interface Ctx {
  s: () => ReturnType<typeof useStore.getState>;
  effects: ReturnType<typeof useStore.getState>['effects'];
  cat: Record<string, string>;
  withEditor: (fn: (view: NonNullable<typeof editorBridge.view>, path: string) => unknown) => () => void;
  hasLsp: () => boolean;
  hasEditor: () => boolean;
}


function fileCommands({ s, cat }: Ctx): Command[] {
  return [
    { id: 'file.open', title: c('file.open'), category: cat.file, run: () => s().openFolder() },
    { id: 'file.new', title: c('file.new'), category: cat.file, run: () => s().newFile() },
    { id: 'file.save', title: c('file.save'), category: cat.file, run: () => s().saveTab() },
    { id: 'file.saveAll', title: c('file.saveAll'), category: cat.file, run: () => s().saveAll() },
    { id: 'file.quickOpen', title: c('file.quickOpen'), category: cat.file, run: () => s().setPalette(s().paletteOpen === 'files' ? false : 'files') },
    {
      id: 'file.closeTab', title: c('file.closeTab'), category: cat.file,
      run: () => { const id = s().activeTabId; if (id) {
        s().closeTab(id);
      } },
      when: () => s().tabs.length > 0,
    },
    {
      id: 'file.closeOthers', title: c('file.closeOthers'), category: cat.file,
      run: () => { const id = s().activeTabId; if (id) {
        s().closeOthers(id);
      } },
      when: () => s().tabs.length > 1,
    },
    {
      id: 'file.reload', title: c('file.reload'), category: cat.file,
      run: () => { const id = s().activeTabId; if (id) {
        void s().reloadTab(id);
      } },
      when: () => Boolean(s().activeTab()?.path && !s().activeTab()?.virtual),
    },
    { id: 'file.closeAll', title: c('file.closeAll'), category: cat.file, run: () => s().closeAll(), when: () => s().tabs.length > 0 },
    { id: 'file.closeWorkspace', title: c('file.closeWorkspace'), category: cat.file, run: () => s().closeWorkspace(), when: () => Boolean(s().workspace) },

    { id: 'tabs.next', title: c('tabs.next'), category: cat.tabs, run: () => s().cycleTab(1), when: () => s().tabs.length > 1 },
    { id: 'tabs.previous', title: c('tabs.previous'), category: cat.tabs, run: () => s().cycleTab(-1), when: () => s().tabs.length > 1 },
    { id: 'tabs.reopenClosed', title: c('tabs.reopenClosed'), category: cat.tabs, run: () => s().reopenClosedTab(), when: () => s().closedTabs.length > 0 },
  ];
}

function projectCommands({ s, cat }: Ctx): Command[] {
  return [
    { id: 'project.new', title: c('project.new'), category: cat.project, run: () => s().setNewProjectOpen(true) },
    { id: 'project.panel', title: c('project.panel'), category: cat.project, run: () => s().showSidebar('project') },
    { id: 'project.build', title: c('project.build'), category: cat.project, run: () => runDefault('build'), when: () => Boolean(s().project) },
    { id: 'project.run', title: c('project.run'), category: cat.project, run: () => runDefault('run') },
    { id: 'project.test', title: c('project.test'), category: cat.project, run: () => runDefault('test'), when: () => Boolean(s().project) },
    { id: 'project.tasks', title: c('project.tasks'), category: cat.project, run: () => s().setPalette(s().paletteOpen === 'tasks' ? false : 'tasks'), when: () => Boolean(s().project) },
    {
      id: 'project.addDependency', title: c('project.addDependency'), category: cat.project,
      run: () => s().openDependencyDialog(),
      when: () => Boolean(s().project?.kinds.some((k) => k.kind.dependencies)),
    },
    ...(s().project?.kinds ?? []).filter((k) => k.kind.dependencies).map<Command>((k) => ({
      id: `project.addDependency.${k.kind.id}`,
      title: c('project.addDependencyVia', { manager: k.kind.dependencies!.manager }),
      category: cat.project,
      run: () => s().openDependencyDialog(k.kind.id),
    })),
    { id: 'project.refresh', title: c('project.refresh'), category: cat.project, run: () => s().refreshProject(), when: () => Boolean(s().workspace) },
    {
      id: 'project.config', title: c('project.config'), category: cat.project,
      run: () => s().openProjectConfig(),
      when: () => Boolean(s().workspace),
    },
    {
      id: 'project.buildFile', title: c('project.buildFile'), category: cat.project,
      run: () => {
        const p = s().project;
        const file = p?.meta.buildFile ?? p?.primary?.markers[0];
        if (p && file) {
          void s().openFile(`${p.root}/${file}`);
        }
      },
      when: () => Boolean(s().project?.meta.buildFile ?? s().project?.primary),
    },
  ];
}

function viewCommands({ s, effects, cat }: Ctx): Command[] {
  return [
    { id: 'view.commandPalette', title: c('view.commandPalette'), category: cat.view, run: () => s().setPalette(s().paletteOpen === 'commands' ? false : 'commands') },
    { id: 'view.explorer', title: c('view.explorer'), category: cat.view, run: () => s().showSidebar('explorer') },
    { id: 'view.search', title: c('view.search'), category: cat.view, run: () => s().showSidebar('search') },
    { id: 'view.outline', title: c('view.outline'), category: cat.view, run: () => s().showSidebar('outline') },
    { id: 'view.debug', title: c('view.debug'), category: cat.view, run: () => s().showSidebar('debug') },
    { id: 'view.addons', title: c('view.addons'), category: cat.view, run: () => s().openDialog('extensions', 'installed') },
    { id: 'view.extensions', title: c('view.extensions'), category: cat.view, run: () => s().openDialog('extensions') },
    { id: 'view.themes', title: c('view.themes'), category: cat.view, run: () => s().openDialog('themes') },
    { id: 'view.settings', title: c('view.settings'), category: cat.view, run: () => s().openDialog('settings') },
    { id: 'view.keybindings', title: c('view.keybindings'), category: cat.view, run: () => s().openDialog('keybindings') },
    { id: 'view.panel', title: c('view.panel'), category: cat.view, run: () => s().togglePanel() },
    { id: 'view.output', title: c('view.output'), category: cat.view, run: () => s().showPanel('output') },
    { id: 'view.problems', title: c('view.problems'), category: cat.view, run: () => s().showPanel('problems') },
    { id: 'view.references', title: c('view.references'), category: cat.view, run: () => s().showPanel('references') },
    { id: 'view.lsp', title: c('view.lsp'), category: cat.view, run: () => s().showPanel('lsp') },
    { id: 'view.sidebar', title: c('view.sidebar'), category: cat.view, run: () => s().toggleDock(s().layout.navSide) },
    { id: 'view.secondarySidebar', title: c('view.secondarySidebar'), category: cat.view, run: () => s().toggleDock(s().layout.navSide === 'left' ? 'right' : 'left') },
    { id: 'view.navLeft', title: c('view.navLeft'), category: cat.view, run: () => s().setNavSide('left'), when: () => s().layout.navSide === 'right' },
    { id: 'view.navRight', title: c('view.navRight'), category: cat.view, run: () => s().setNavSide('right'), when: () => s().layout.navSide === 'left' },
    { id: 'view.resetLayout', title: c('view.resetLayout'), category: cat.view, run: () => s().resetLayout() },
    { id: 'view.splitRight', title: c('view.splitRight'), category: cat.view, run: () => s().splitEditor('right'), when: () => Boolean(s().activeTabId) },
    { id: 'view.splitDown', title: c('view.splitDown'), category: cat.view, run: () => s().splitEditor('down'), when: () => Boolean(s().activeTabId) },
    { id: 'view.unsplit', title: c('view.unsplit'), category: cat.view, run: () => s().unsplitEditor(), when: () => visibleGroups(s().groups, s().popouts).length > 1 },
    { id: 'view.focusNextGroup', title: c('view.focusNextGroup'), category: cat.view, run: () => s().focusNextGroup(), when: () => visibleGroups(s().groups, s().popouts).length > 1 },
    { id: 'view.focusGroup1', title: c('view.focusGroup', { n: 1 }), category: cat.view, run: () => s().focusGroup(0) },
    { id: 'view.focusGroup2', title: c('view.focusGroup', { n: 2 }), category: cat.view, run: () => s().focusGroup(1), when: () => s().groups.length > 1 },
    { id: 'view.moveTabToOtherGroup', title: c('view.moveTabToOtherGroup'), category: cat.view, run: () => s().moveTabToOtherGroup(), when: () => Boolean(s().activeTabId) },
    {
      id: 'view.popOutView', title: c('view.popOutView'), category: cat.view,
      run: () => { const id = activeDockViewId(); if (id) {
        s().popOutView(id);
      } },
      when: () => Boolean(activeDockViewId()),
    },
    {
      id: 'view.dockAllPoppedOut', title: c('view.dockAllPoppedOut'), category: cat.view,
      run: () => s().dockAllBack(), when: () => s().popouts.length > 0,
    },
    { id: 'editor.moveTabToNewWindow', title: c('editor.moveTabToNewWindow'), category: cat.editor, run: () => s().popOutTab(), when: () => Boolean(s().activeTabId) },
    {
      id: 'editor.dockWindowBack', title: c('editor.dockWindowBack'), category: cat.editor,
      run: () => { const key = dockBackTargetKey(); if (key) {
        s().dockBack(key);
      } },
      when: () => s().popouts.length > 0,
    },
    {
      id: 'view.minimap', title: c(effects.minimap ? 'view.minimapOff' : 'view.minimapOn'), category: cat.view,
      run: () => s().setEffects({ minimap: !s().effects.minimap }),
    },
  ];
}

function workspaceCommands({ s, cat }: Ctx): Command[] {
  return [
    { id: 'workspace.manage', title: c('workspace.manage'), category: cat.workspace, run: () => s().openDialog('workspaces') },
    { id: 'workspace.importFolder', title: t('workspaces.importDir'), category: cat.workspace, run: () => s().importWorkspaceFolder() },
    { id: 'workspace.addFolder', title: c('workspace.addFolder'), category: cat.workspace, run: () => s().addFolderToWorkspace() },
    { id: 'workspace.save', title: c('workspace.save'), category: cat.workspace, run: () => { s().saveWorkspace(); }, when: () => Boolean(s().workspace) },
    ...s().workspaces.map<Command>((ws) => ({
      id: `workspace.open.${ws.id}`,
      title: `${c('workspace.openPrefix')}: ${ws.name}${ws.id === s().currentWorkspaceId ? '  ✓' : ''}`,
      category: cat.workspace,
      run: () => s().openWorkspace(ws.id),
    })),
  ];
}

function runEditorCommands({ s, cat, withEditor, hasLsp, hasEditor }: Ctx): Command[] {
  return [
    { id: 'run.file', title: c('run.file'), category: cat.run, run: runActiveFile },
    { id: 'run.stop', title: c('run.stop'), category: cat.run, run: stopRun, when: () => s().runningId !== null },

    { id: 'editor.symbols', title: c('editor.symbols'), category: cat.editor, run: () => s().setPalette(s().paletteOpen === 'symbols' ? false : 'symbols'), when: () => Boolean(s().activeTab()) },
    { id: 'editor.workspaceSymbols', title: c('editor.workspaceSymbols'), category: cat.editor, run: () => s().setPalette(s().paletteOpen === 'workspace-symbols' ? false : 'workspace-symbols') },
    { id: 'editor.definition', title: c('editor.definition'), category: cat.editor, scope: 'editor', run: withEditor((v, p) => gotoLocation(v, p, 'definition')), when: hasLsp },
    { id: 'editor.declaration', title: c('editor.declaration'), category: cat.editor, scope: 'editor', run: withEditor((v, p) => gotoLocation(v, p, 'declaration')), when: hasLsp },
    { id: 'editor.typeDefinition', title: c('editor.typeDefinition'), category: cat.editor, scope: 'editor', run: withEditor((v, p) => gotoLocation(v, p, 'typeDefinition')), when: hasLsp },
    { id: 'editor.implementation', title: c('editor.implementation'), category: cat.editor, scope: 'editor', run: withEditor((v, p) => gotoLocation(v, p, 'implementation')), when: hasLsp },
    { id: 'editor.references', title: c('editor.references'), category: cat.editor, scope: 'editor', run: withEditor(findReferences), when: hasLsp },
    { id: 'editor.rename', title: c('editor.rename'), category: cat.editor, scope: 'editor', run: withEditor(startRename), when: hasLsp },
    { id: 'editor.codeActions', title: c('editor.codeActions'), category: cat.editor, scope: 'editor', run: withEditor((v, p) => showCodeActions(v, p)), when: hasLsp },
    { id: 'editor.refactor', title: c('editor.refactor'), category: cat.editor, scope: 'editor', run: withEditor((v, p) => showCodeActions(v, p, ['refactor'])), when: hasLsp },
    { id: 'editor.fixAll', title: c('editor.fixAll'), category: cat.editor, scope: 'editor', run: withEditor((v, p) => showCodeActions(v, p, ['source.fixAll'])), when: hasLsp },
    { id: 'editor.format', title: c('editor.format'), category: cat.editor, scope: 'editor', run: withEditor(formatDocument), when: hasLsp },
    { id: 'editor.organizeImports', title: c('editor.organizeImports'), category: cat.editor, scope: 'editor', run: withEditor(organizeImports), when: hasLsp },
    { id: 'editor.signature', title: c('editor.signature'), category: cat.editor, scope: 'editor', run: withEditor((v, p) => triggerSignatureHelp(v, p)), when: hasLsp },

    ...Object.entries(EDITOR_COMMANDS).map<Command>(([id, command]) => ({
      id,
      title: c(id),
      category: editorCategory(id, cat),
      scope: 'editor',
      when: hasEditor,
      run: () => {
        const view = editorBridge.view;
        if (!view) {
          return;
        }
        command(view);
        // Commands that hand focus on themselves — find and replace puts it in
        // the search field — keep it. Only the rest come back to the text, so
        // the shortcut does not lead nowhere.
        if (focusInEditorField(view)) {
          return;
        }
        view.focus();
      },
    })),
  ];
}

function appearanceCommands({ s, effects, cat }: Ctx): Command[] {
  return [
    { id: 'effects.animations', title: c(effects.animations ? 'effects.animationsOff' : 'effects.animationsOn'), category: cat.appearance, run: () => s().setEffects({ animations: !s().effects.animations }) },
    { id: 'effects.glass', title: c(effects.glass ? 'effects.glassOff' : 'effects.glassOn'), category: cat.appearance, run: () => s().setEffects({ glass: !s().effects.glass }) },
    { id: 'effects.glow', title: c(effects.glow ? 'effects.glowOff' : 'effects.glowOn'), category: cat.appearance, run: () => s().setEffects({ glow: !s().effects.glow }) },
    { id: 'effects.wrap', title: c(effects.wordWrap ? 'effects.wrapOff' : 'effects.wrapOn'), category: cat.appearance, run: () => s().setEffects({ wordWrap: !s().effects.wordWrap }) },
    { id: 'effects.inlayHints', title: c(effects.inlayHints ? 'effects.inlayHintsOff' : 'effects.inlayHintsOn'), category: cat.appearance, run: () => s().setEffects({ inlayHints: !s().effects.inlayHints }) },
    { id: 'effects.zoomIn', title: c('effects.zoomIn'), category: cat.appearance, run: () => s().setEffects({ fontSize: Math.min(28, s().effects.fontSize + 1) }) },
    { id: 'effects.zoomOut', title: c('effects.zoomOut'), category: cat.appearance, run: () => s().setEffects({ fontSize: Math.max(9, s().effects.fontSize - 1) }) },
    { id: 'effects.zoomReset', title: c('effects.zoomReset'), category: cat.appearance, run: () => s().setEffects({ fontSize: 13 }) },
    { id: 'effects.reset', title: c('effects.reset'), category: cat.appearance, run: () => s().resetEffects() },
    { id: 'theme.new', title: c('theme.new'), category: cat.appearance, run: () => s().openThemeStudio() },
    { id: 'theme.edit', title: c('theme.edit'), category: cat.appearance, run: () => s().openThemeStudio(s().themeId) },
    { id: 'theme.import', title: c('theme.import'), category: cat.appearance, run: () => s().importTheme() },
    { id: 'theme.export', title: c('theme.export'), category: cat.appearance, run: () => s().exportTheme(s().themeId) },
  ];
}

function languageServerCommands({ s, effects, cat }: Ctx): Command[] {
  return [
    { id: 'lsp.toggle', title: c(effects.lsp ? 'lsp.off' : 'lsp.on'), category: cat.language, run: () => s().setEffects({ lsp: !s().effects.lsp }) },
    {
      id: 'lsp.restart', title: c('lsp.restart'), category: cat.language,
      when: () => Boolean(s().languageFor(s().activeTab())?.lsp?.length),
      run: () => {
        const tab = s().activeTab();
        void lsp.restart(s().languageFor(tab), tab?.path ?? null);
      },
    },
    { id: 'lsp.restartAll', title: c('lsp.stopAll'), category: cat.language, run: () => lsp.shutdownAll(), when: () => lsp.list().length > 0 },
    {
      id: 'lsp.rescan', title: c('lsp.rescan'), category: cat.language,
      run: () => {
        lsp.rescan();
        s().notify(c('lsp.rescanning'), 'info');
      },
    },
    { id: 'lsp.servers', title: c('lsp.servers'), category: cat.language, run: () => s().showPanel('lsp') },
    {
      id: 'lsp.javaReimport', title: c('lsp.javaReimport'), category: cat.language,
      when: () => lsp.list().some((server) => /jdtls/i.test(server.command)),
      run: async () => {
        await lsp.reimportJava();
        s().notify(t('lsp.java.reimporting'), 'info');
      },
    },
    {
      id: 'lsp.javaClean', title: c('lsp.javaClean'), category: cat.language,
      when: () => lsp.list().some((server) => /jdtls/i.test(server.command)),
      run: async () => {
        s().notify(t('lsp.java.cleaning'), 'info');
        await lsp.cleanJavaWorkspace();
      },
    },
  ];
}

function searchCommands({ s, cat }: Ctx): Command[] {
  return [
    { id: 'search.everywhere', title: c('search.everywhere'), category: cat.search, run: () => s().openEverywhere('all') },
    { id: 'search.files', title: c('search.files'), category: cat.search, run: () => s().openEverywhere('files') },
    { id: 'search.symbols', title: c('search.symbols'), category: cat.search, run: () => s().openEverywhere('symbols') },
    { id: 'search.actions', title: c('search.actions'), category: cat.search, run: () => s().openEverywhere('actions') },
    { id: 'search.text', title: c('search.text'), category: cat.search, run: () => s().openEverywhere('text') },
  ];
}

function terminalCommands({ s, cat }: Ctx): Command[] {
  return [
    { id: 'terminal.new', title: c('terminal.new'), category: cat.terminal, run: () => s().openTerminal() },
    { id: 'terminal.toggle', title: c('terminal.toggle'), category: cat.terminal, run: () => s().toggleTerminal() },
    {
      id: 'terminal.fileDir', title: c('terminal.fileDir'), category: cat.terminal,
      run: () => {
        const path = s().activeTab()?.path;
        if (!path) {
          return;
        }
        void s().openTerminal({ cwd: path.replace(/[\\/][^\\/]+$/, '') });
      },
      when: () => Boolean(s().activeTab()?.path && !s().activeTab()?.virtual),
    },
    {
      id: 'terminal.runSelection', title: c('terminal.runSelection'), category: cat.terminal,
      run: () => {
        const view = editorBridge.view;
        if (!view) {
          return;
        }
        const { from, to } = view.state.selection.main;
        const text = from === to ? view.state.doc.lineAt(from).text : view.state.sliceDoc(from, to);
        if (!text.trim()) {
          return;
        }
        const active = terminals.get(terminals.activeId);
        if (!active || active.exitCode !== null) {
          void s().openTerminal({ command: text.trimEnd() });
          return;
        }
        s().showPanel('terminal');
        terminals.send(active.id, `${text.trimEnd()}\r`);
      },
      when: () => Boolean(editorBridge.view),
    },
    { id: 'terminal.closeAll', title: c('terminal.closeAll'), category: cat.terminal, run: () => terminals.closeAll(), when: () => terminals.list().length > 0 },
    { id: 'terminal.external', title: c('terminal.external'), category: cat.terminal, run: () => s().openExternalTerminal(), when: () => terminals.externals.length > 0 },
  ];
}

/** The active file, with its language server attached, as the editor commands see it. */
function editorHelpers(s: Ctx['s']): Pick<Ctx, 'withEditor' | 'hasLsp' | 'hasEditor'> {
  const editorPath = () => {
    const tab = s().activeTab();
    return tab?.path && !tab.virtual && editorBridge.view ? tab.path : null;
  };
  const withEditor: Ctx['withEditor'] = (fn) => () => {
    const path = editorPath();
    if (path && editorBridge.view) {
      void fn(editorBridge.view, path);
    }
  };
  const hasLsp = () => Boolean(s().languageFor(s().activeTab())?.lsp?.length && editorPath());
  const hasEditor = () => Boolean(editorBridge.view && s().activeTab());
  return { withEditor, hasLsp, hasEditor };
}

function categoryLabels(): Record<string, string> {
  return {
    file: c('category.file'), project: c('category.project'), view: c('category.view'),
    run: c('category.run'), editor: c('category.editor'), appearance: c('category.appearance'),
    language: c('category.language'), search: c('category.search'), terminal: c('category.terminal'),
    addons: c('category.addons'), tabs: c('category.tabs'), selection: c('category.selection'),
    folding: c('category.folding'), workspace: c('category.workspace'),
  };
}

/** One command per detected shell and per external terminal. */
function terminalLaunchCommands({ s, cat }: Ctx): { shells: Command[]; externals: Command[]; } {
  const shells: Command[] = terminals.shells.map((shell) => ({
    id: `terminal.new.${shell.id}`,
    title: c(shell.isDefault ? 'terminal.newWithDefault' : 'terminal.newWith', { shell: shell.label }),
    category: cat.terminal,
    run: () => s().openTerminal({ shell: shell.path }),
  }));
  const externals: Command[] = terminals.externals.map((term) => ({
    id: `terminal.external.${term.id}`,
    title: c('terminal.externalWith', { terminal: term.label }),
    category: cat.terminal,
    run: () => s().openExternalTerminal(undefined, term.id),
  }));
  return { shells, externals };
}

function themeCommands({ s, cat }: Ctx): Command[] {
  return registry.themes().map((theme) => ({
    id: `theme.${theme.id}`,
    title: `${c('theme.prefix')}: ${theme.name}${theme.id === s().themeId ? '  ✓' : ''}`,
    category: cat.appearance,
    run: () => useStore.getState().setTheme(theme.id),
  }));
}

function interfaceLanguageCommands({ s, cat }: Ctx): Command[] {
  return [
    { id: 'language.system', name: c('language.system') },
    ...LANGUAGES.map((l) => ({ id: `language.${l.id}`, name: l.name })),
  ].map(({ id, name }) => ({
    id,
    title: `${c('language.prefix')}: ${name}`,
    category: cat.appearance,
    run: () => s().setLanguage(id.slice('language.'.length)),
  }));
}

function runConfigCommands({ s, cat }: Ctx): Command[] {
  const language = s().languageFor(s().activeTab());
  return (language?.run ?? []).map((cfg) => ({
    id: `run.${language!.id}.${cfg.label}`,
    title: c('run.with', { runner: cfg.label }),
    category: cat.run,
    run: () => runWithConfig(cfg),
  }));
}

function taskCommands({ s, cat }: Ctx): Command[] {
  return [...s().projectConfig.tasks, ...(s().project?.tasks ?? [])].map((task) => ({
    id: `task.${task.id}`,
    title: `${c('run.taskPrefix')}: ${task.label}`,
    category: cat.project,
    run: () => runTask(task),
  }));
}

function serverInstallCommands({ cat }: Ctx): Command[] {
  return lsp.missingServers()
    .filter(({ config }) => lsp.canInstall(config))
    .map(({ config, languageId }) => ({
      id: `lsp.install.${config.command}`,
      title: c('lsp.install', { server: config.label, language: languageId }),
      category: cat.language,
      run: () => installServer(config, languageId),
    }));
}

function addonToggleCommands({ cat }: Ctx): Command[] {
  return registry
    .all()
    .filter((addon) => !addon.builtin)
    .map((addon) => ({
      id: `addon.toggle.${addon.id}`,
      title: c(registry.isActive(addon.id) ? 'addons.disable' : 'addons.enable', { name: addon.name }),
      category: cat.addons,
      run: () => useStore.getState().toggleAddon(addon.id),
    }));
}

/** Commands that other parts of the app contribute; one failing source does not take the rest down. */
function providedCommands(): Command[] {
  return [...providers].flatMap((provider) => {
    try {
      return provider();
    } catch (err) {
      console.error('[lumen] Befehlsquelle fehlgeschlagen:', err);
      return [];
    }
  });
}

/** Every command. `includeHidden` also returns those whose `when` does not currently hold. */
export function buildCommands(options: { includeHidden?: boolean; } = {}): Command[] {
  const s = () => useStore.getState();
  const x: Ctx = { s, effects: s().effects, cat: categoryLabels(), ...editorHelpers(s) };
  const core: Command[] = [
    ...fileCommands(x),
    ...projectCommands(x),
    ...viewCommands(x),
    ...workspaceCommands(x),
    ...runEditorCommands(x),
    ...appearanceCommands(x),
    ...languageServerCommands(x),
    ...searchCommands(x),
    ...terminalCommands(x),
  ];
  const launch = terminalLaunchCommands(x);

  const all = [
    ...core,
    ...providedCommands(),
    ...launch.shells,
    ...launch.externals,
    ...taskCommands(x),
    ...runConfigCommands(x),
    ...serverInstallCommands(x),
    ...themeCommands(x),
    ...interfaceLanguageCommands(x),
    ...addonToggleCommands(x),
    ...registry.commands(),
  ].map((command) => ({ ...command, keybinding: formatBindingsFor(command.id) }));

  if (options.includeHidden) {
    return all;
  }
  return all.filter((command) => command.when?.() ?? true);
}

function editorCategory(id: string, cat: Record<string, string>) {
  if (/fold/i.test(id)) {
    return cat.folding;
  }
  if (/select|cursor|Occurrence/i.test(id)) {
    return cat.selection;
  }
  return cat.editor;
}

/** Run a command — those whose `when` does not currently hold are skipped. */
export function runCommandById(id: string): boolean {
  const command = buildCommands({ includeHidden: true }).find((cmd) => cmd.id === id);
  if (!command) {
    return false;
  }
  if (command.when && !command.when()) {
    return false;
  }
  void command.run();
  return true;
}
