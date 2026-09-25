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
 * The shell: startup, persistence, overlays, notifications, the interface
 * language and the keyboard shortcuts.
 *
 * `init` is the one place that reads `settings.json` and hands each slice its
 * part; `persist` writes all of it back.
 */

import { isProjectsWindow, startWorkspace } from '@/lib/window-mode';
import { createFormatDecorator } from '@/core/format-settings';
import { registry } from '@/core/registry';
import { lsp } from '@/core/lsp/manager';
import { applyTheme, DEFAULT_EFFECTS, type Effects } from '@/core/theme';
import { isIconPack } from '@/core/icon-pack';
import { ALL_ADDONS, DEFAULT_ENABLED } from '@/addons';
import { DEFAULT_THEME_ID } from '@/addons/builtin/themes';
import { DEFAULT_ICON_PACK_ID } from '@/addons/builtin/icons';
import { setLanguage as applyLanguage, type LanguageSetting } from '@/i18n';
import { keybindings, setKeybindingPlatform, type BindingMap } from '@/core/keybindings';
import { normalizeLayout } from '../layout';
import { applyIconPack, isTheme, isWorkspaceDef, withOfficialServer } from '../helpers';
import type { AppSlice, PersistedSettings, RecentProject, Slice, State, Toast } from '../types';

let toastCounter = 0;
let appliedKeybindings = '';

/** Older settings knew only paths — those become projects. */
function recentFromStored(stored: Partial<PersistedSettings>): RecentProject[] {
  if (stored.recentProjects) {
    return stored.recentProjects;
  }
  return (stored.recentFolders ?? []).map((path, i) => ({
    path,
    name: path.split(/[\\/]/).filter(Boolean).pop() ?? path,
    openedAt: Date.now() - i,
  }));
}

interface Ctx {
  get: () => State;
  set: Parameters<Slice<AppSlice>>[0];
}

/** What is written back to `settings.json`. */
function settingsSnapshot(s: State): PersistedSettings {
  return {
    themeId: s.themeId,
    customThemes: s.customThemes,
    effects: s.effects,
    enabledAddons: s.enabledAddons,
    lastFolder: s.workspace ?? s.recentProjects[0]?.path ?? null,
    recentFolders: s.recentProjects.slice(0, 12).map((p) => p.path),
    recentProjects: s.recentProjects.slice(0, 12),
    layout: s.layout,
    language: s.language,
    keymapPreset: s.keymapPreset,
    keybindingOverrides: s.keybindingOverrides,
    splitRatio: s.splitRatio,
    workspaces: s.workspaces,
    currentWorkspaceId: s.currentWorkspaceId,
    iconPackId: s.iconPackId,
    customIconPacks: s.customIconPacks,
    lspInstallDeclined: s.lspInstallDeclined,
    extensionServers: s.extensionServers,
    extensionSettings: s.extensionSettings,
    formatSettings: s.formatSettings,
  };
}

/** The registry, the language servers and their callbacks into the store. */
function wireRegistryAndLsp({ get, set }: Ctx) {
  registry.notify = (message, kind) => get().notify(message, kind);
  registry.register(...ALL_ADDONS);
  registry.subscribe(() => set({ registryVersion: registry.getVersion() }));
  lsp.subscribe(() => set({ lspVersion: lsp.getVersion(), lspLogVersion: lsp.getLogVersion() }));
  lsp.showMessage = (server, params) => {
    const kind = ({ 1: 'error', 2: 'warning' } as const)[params.type as 1 | 2] ?? 'info';
    if (params.type <= 3) {
      get().notify(`${server}: ${params.message}`, kind);
    }
  };
  lsp.documentFor = (path) => {
    const tab = get().tabs.find((open) => open.path === path);
    if (!tab) {
      return null;
    }
    return { spec: get().languageFor(tab), text: tab.content };
  };
}

type AppInfo = Awaited<ReturnType<typeof window.lumen.app.info>> | null;

async function configureLspPaths(info: AppInfo) {
  lsp.setPaths({
    home: info?.home ?? '',
    userData: info?.userData ?? '',
    platform: info?.platform ?? 'linux',
    platformKey: await window.lumen.lspPackages.platform().catch(() => undefined),
  });
}

/** Add-ons, themes and icon packs from the stored settings, applied to the registry and the page. */
function applyStoredAppearance({ get }: Ctx, stored: Partial<PersistedSettings>, effects: Effects) {
  const enabledAddons = stored.enabledAddons ?? DEFAULT_ENABLED;
  const customThemes = (stored.customThemes ?? []).filter(isTheme);

  registry.applyEnabled(enabledAddons);
  registry.setUserThemes(customThemes);
  const customIconPacks = (stored.customIconPacks ?? []).filter(isIconPack);
  registry.setUserIconPacks(customIconPacks);
  const iconPackId = registry.iconPacks().some((pack) => pack.id === stored.iconPackId)
    ? stored.iconPackId!
    : DEFAULT_ICON_PACK_ID;
  applyIconPack(iconPackId);
  // When the pack disappears with an add-on, the default pack applies again.
  registry.subscribe(() => applyIconPack(get().iconPackId));
  lsp.setEnabled(effects.lsp);
  lsp.addConfigDecorator(createFormatDecorator(() => get().formatSettings));

  const themeId = stored.themeId ?? DEFAULT_THEME_ID;
  const theme = registry.themes().find((entry) => entry.id === themeId);
  applyTheme(theme ?? registry.themes()[0], effects);
  return { enabledAddons, customThemes, customIconPacks, iconPackId, themeId: theme ? themeId : DEFAULT_THEME_ID };
}

/** Workspaces from the stored settings, and whichever project this window starts with. */
async function restoreWorkspaces({ get, set }: Ctx, stored: Partial<PersistedSettings>, effects: Effects) {
  const workspaces = (stored.workspaces ?? []).filter(isWorkspaceDef);
  // A window opened for a project (`?project=…`, see `electron/main.ts`) starts with that one;
  // a further empty window (`?fresh`) at the project screen.
  const params = new URLSearchParams(window.location.search);
  const initialProject = params.get('project');
  // Without “open last project on start”, Lumen begins at the project screen.
  const reopen = effects.reopenLastProject && !initialProject && !params.has('fresh') && !isProjectsWindow;
  const current = reopen ? workspaces.find((w) => w.id === stored.currentWorkspaceId) ?? null : null;
  set({
    workspaces,
    currentWorkspaceId: current?.id ?? null,
    extraFolders: current ? current.folders.filter((f) => f !== current.activeFolder) : [],
  });

  if (initialProject) {
    await get().setWorkspace(initialProject).catch(() => {});
    return;
  }
  // A saved workspace chosen in the project screen's window.
  if (startWorkspace) {
    await get().openWorkspace(startWorkspace).catch(() => {});
    return;
  }
  if (!reopen) {
    return;
  }
  if (current) {
    await get().openWorkspace(current.id).catch(() => {});
    return;
  }
  if (stored.lastFolder) {
    await get().setWorkspace(stored.lastFolder).catch(() => {});
  }
}

type KeybindingActions = Pick<AppSlice, 'setKeymapPreset' | 'setKeybinding' | 'resetKeybindings' | 'applyKeybindings'>;

function keybindingActions({ get, set }: Ctx): KeybindingActions {
  return {
    setKeymapPreset(preset) {
      set({ keymapPreset: preset });
      get().applyKeybindings();
      get().persist();
    },

    setKeybinding(commandId, bindings) {
      const overrides = { ...get().keybindingOverrides };
      delete overrides[commandId];
      if (bindings) {
        overrides[commandId] = bindings;
      }
      set({ keybindingOverrides: overrides });
      get().applyKeybindings();
      get().persist();
    },

    resetKeybindings() {
      set({ keybindingOverrides: {} });
      get().applyKeybindings();
      get().persist();
    },

    applyKeybindings() {
      const defaults: BindingMap = {};
      for (const command of registry.commands()) {
        if (command.keybinding) {
          defaults[command.id] = [command.keybinding];
        }
      }
      // The registry reports often (on every colour change in the theme studio, say) — rebind only on real changes.
      const key = JSON.stringify([get().keymapPreset, get().keybindingOverrides, defaults]);
      if (key === appliedKeybindings) {
        return;
      }
      appliedKeybindings = key;
      keybindings.configure(get().keymapPreset, get().keybindingOverrides, defaults);
    },
  };
}

export const createAppSlice: Slice<AppSlice> = (set, get) => {
  const ctx: Ctx = { get, set };
  return {
    ready: false,
    platform: 'linux',
    language: 'system',
    keymapPreset: 'lumen',
    keybindingOverrides: {},
    dialog: null,
    dialogSection: null,
    chordHint: null,
    debugActive: false,
    paletteOpen: false,
    everywhereTab: 'all',
    newProjectOpen: false,
    formDialog: null,
    toasts: [],
    lspVersion: 0,
    lspLogVersion: 0,

    async init() {
      wireRegistryAndLsp(ctx);

      const info = await window.lumen.app.info().catch(() => null);
      await configureLspPaths(info);

      const stored = (await window.lumen.settings.load().catch(() => ({}))) as Partial<PersistedSettings>;

      const language = stored.language ?? 'system';
      applyLanguage(language);
      setKeybindingPlatform(info?.platform ?? 'linux');

      const effects: Effects = { ...DEFAULT_EFFECTS, ...(stored.effects ?? {}) };
      const appearance = applyStoredAppearance(ctx, stored, effects);

      set({
        ready: true,
        platform: info?.platform ?? 'linux',
        ...appearance,
        effects,
        recentProjects: recentFromStored(stored),
        lspInstallDeclined: stored.lspInstallDeclined ?? [],
        extensionServers: withOfficialServer(stored.extensionServers),
        extensionSettings: stored.extensionSettings ?? {},
        formatSettings: stored.formatSettings ?? {},
        layout: normalizeLayout(stored.layout, { sidebarWidth: stored.sidebarWidth, panelHeight: stored.panelHeight }),
        splitRatio: stored.splitRatio ?? 0.5,
        language,
        keymapPreset: stored.keymapPreset ?? 'lumen',
        keybindingOverrides: stored.keybindingOverrides ?? {},
        registryVersion: registry.getVersion(),
      });
      get().applyKeybindings();
      registry.subscribe(() => get().applyKeybindings());

      await restoreWorkspaces(ctx, stored, effects);
    },

    persist() {
      const data = settingsSnapshot(get());
      return window.lumen.settings.save(data as unknown as Record<string, unknown>).catch(() => {});
    },

    openDialog(id, section) {
      set({ dialog: id, dialogSection: section ?? null, paletteOpen: false });
    },

    closeDialog() {
      // The section stays put so the dialog does not jump when hidden; `openDialog` sets it anew.
      set({ dialog: null });
    },

    setChordHint(hint) {
      set({ chordHint: hint });
    },

    setLanguage(language) {
      const value = (language || 'system') as LanguageSetting;
      applyLanguage(value);
      set({ language: value, registryVersion: registry.getVersion() });
      get().persist();
    },

    ...keybindingActions(ctx),

    setPalette(open) {
      set({ paletteOpen: open });
    },

    openEverywhere(tab = 'all') {
      set({ paletteOpen: 'everywhere', everywhereTab: tab });
    },

    setEverywhereTab(tab) {
      set({ everywhereTab: tab });
    },

    setNewProjectOpen(open) {
      set({ newProjectOpen: open });
    },

    openForm(spec) {
      set({ formDialog: spec });
    },

    closeForm() {
      set({ formDialog: null });
    },

    notify(message, kind = 'info') {
      const toast: Toast = { id: ++toastCounter, message, kind };
      set((s) => ({ toasts: [...s.toasts, toast].slice(-4) }));
      setTimeout(() => get().dismissToast(toast.id), kind === 'error' ? 6000 : 3800);
    },

    dismissToast(id) {
      set((s) => ({ toasts: s.toasts.filter((toast) => toast.id !== id) }));
    },
  };
};
