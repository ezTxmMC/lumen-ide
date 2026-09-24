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
 * How Lumen looks: themes and their studio, effects, icon packs and their
 * studio — and switching add-ons, which can bring either.
 */

import { registry } from '@/core/registry';
import { lsp } from '@/core/lsp/manager';
import { matchLanguage } from '@/core/language';
import { applyEffects, applyTheme, DEFAULT_EFFECTS } from '@/core/theme';
import { isIconPack, uniqueIconPackId } from '@/core/icon-pack';
import { DEFAULT_ENABLED } from '@/addons';
import { DEFAULT_THEME_ID, lumenDark } from '@/addons/builtin/themes';
import { DEFAULT_ICON_PACK_ID } from '@/addons/builtin/icons';
import type { IconPack, Theme } from '@/core/types';
import { t } from '@/i18n';
import { applyIconPack, isTheme, uniqueThemeId } from '../helpers';
import type { AppearanceSlice, Slice, State } from '../types';

interface Ctx {
  get: () => State;
  set: Parameters<Slice<AppearanceSlice>>[0];
}

/** Hand the custom themes to the registry and remember them. */
function commitThemes({ set }: Ctx, customThemes: Theme[]) {
  registry.setUserThemes(customThemes);
  set({ customThemes, registryVersion: registry.getVersion() });
}

function commitIconPacks({ set }: Ctx, customIconPacks: IconPack[]) {
  registry.setUserIconPacks(customIconPacks);
  set({ customIconPacks, registryVersion: registry.getVersion() });
}

/** A copy of a theme or pack, named and credited as the user's own. */
function ownCopy<T extends Theme | IconPack>(source: T, id: string): T {
  return {
    ...structuredClone(source),
    id,
    name: t('notify.theme.copyName', { name: source.name }),
    author: t('notify.theme.authorMe'),
  };
}

async function writeJson({ get }: Ctx, target: string | null, value: unknown, done: string) {
  if (!target) {
    return;
  }
  try {
    await window.lumen.fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
    get().notify(done, 'success');
  } catch (err) {
    get().notify((err as Error).message, 'error');
  }
}

let themeTransitionTimer = 0;

function formatActions(ctx: Ctx): Pick<AppearanceSlice, 'setFormat' | 'resetFormat'> {
  const { get, set } = ctx;
  return {
    setFormat(languageId, patch) {
      set((s) => ({ formatSettings: { ...s.formatSettings, [languageId]: { ...s.formatSettings[languageId], ...patch } } }));
      get().persist();
    },

    resetFormat(languageId) {
      const { [languageId]: _removed, ...rest } = get().formatSettings;
      set({ formatSettings: rest });
      get().persist();
    },
  };
}

function themeActions(ctx: Ctx): Pick<AppearanceSlice, 'setTheme' | 'setEffects' | 'resetEffects' | 'openThemeStudio' | 'closeThemeStudio' | 'previewTheme' | 'saveCustomTheme' | 'deleteCustomTheme' | 'duplicateTheme' | 'importTheme' | 'exportTheme'> {
  const { get, set } = ctx;
  return {
    setTheme(id) {
      const theme = registry.themes().find((entry) => entry.id === id);
      if (!theme) {
        return;
      }
      set({ themeId: id });
      const root = document.documentElement;
      if (get().effects.animations && !get().editingThemeId) {
        root.classList.add('lm-theme-transition');
        window.clearTimeout(themeTransitionTimer);
        themeTransitionTimer = window.setTimeout(() => root.classList.remove('lm-theme-transition'), 450);
      }
      applyTheme(theme, get().effects);
      get().persist();
    },

    setEffects(patch) {
      const effects = { ...get().effects, ...patch };
      set({ effects });
      applyEffects(effects);
      if (patch.lsp !== undefined) {
        lsp.setEnabled(patch.lsp);
      }
      get().persist();
    },

    resetEffects() {
      set({ effects: DEFAULT_EFFECTS });
      applyEffects(DEFAULT_EFFECTS);
      get().persist();
    },

    openThemeStudio(baseId) {
      const s = get();
      // An existing theme of your own is edited directly, everything else copied.
      if (baseId && registry.isUserTheme(baseId)) {
        set({ editingThemeId: baseId });
        s.setTheme(baseId);
        return;
      }
      const source = registry.themes().find((theme) => theme.id === (baseId ?? s.themeId)) ?? lumenDark;
      const copy = ownCopy(source, uniqueThemeId(source.id, s.customThemes));
      commitThemes(ctx, [...s.customThemes, copy]);
      set({ editingThemeId: copy.id });
      get().setTheme(copy.id);
    },

    closeThemeStudio(cancel) {
      const s = get();
      const id = s.editingThemeId;
      set({ editingThemeId: null });
      if (!id) {
        return;
      }
      if (!cancel) {
        get().persist();
        get().notify(t('notify.theme.saved'), 'success');
        return;
      }
      commitThemes(ctx, s.customThemes.filter((theme) => theme.id !== id));
      get().setTheme(registry.themes().some((theme) => theme.id === s.themeId) ? s.themeId : DEFAULT_THEME_ID);
    },

    previewTheme(theme) {
      commitThemes(ctx, get().customThemes.map((entry) => (entry.id === theme.id ? theme : entry)));
      applyTheme(theme, get().effects);
    },

    saveCustomTheme(theme) {
      const existing = get().customThemes.some((entry) => entry.id === theme.id);
      commitThemes(ctx, existing
        ? get().customThemes.map((entry) => (entry.id === theme.id ? theme : entry))
        : [...get().customThemes, theme]);
      get().persist();
    },

    deleteCustomTheme(id) {
      commitThemes(ctx, get().customThemes.filter((theme) => theme.id !== id));
      if (get().themeId === id) {
        get().setTheme(DEFAULT_THEME_ID);
      }
      get().persist();
      get().notify(t('notify.theme.deleted'), 'info');
    },

    duplicateTheme(id) {
      const source = registry.themes().find((theme) => theme.id === id);
      if (!source) {
        return null;
      }
      const copy = ownCopy(source, uniqueThemeId(source.id, get().customThemes));
      get().saveCustomTheme(copy);
      return copy.id;
    },

    async importTheme() {
      const picked = await window.lumen.dialog.openFile();
      if (!picked) {
        return;
      }
      try {
        const parsed = JSON.parse(picked.content) as Theme;
        if (!isTheme(parsed)) {
          throw new Error(t('notify.theme.invalid'));
        }
        const theme: Theme = { ...parsed, id: uniqueThemeId(parsed.id, get().customThemes), author: parsed.author ?? 'Import' };
        get().saveCustomTheme(theme);
        get().setTheme(theme.id);
        get().notify(t('notify.theme.imported', { name: theme.name }), 'success');
      } catch (err) {
        get().notify(t('notify.theme.importFailed', { error: (err as Error).message }), 'error');
      }
    },

    async exportTheme(id) {
      const theme = registry.themes().find((entry) => entry.id === id);
      if (!theme) {
        return;
      }
      const target = await window.lumen.dialog.saveFile(`${theme.id}.lumen-theme.json`);
      await writeJson(ctx, target, theme, t('notify.theme.exported', { name: theme.name }));
    },
  };
}

function iconPackActions(ctx: Ctx): Pick<AppearanceSlice, 'setIconPack' | 'openIconStudio' | 'closeIconStudio' | 'saveCustomIconPack' | 'deleteCustomIconPack' | 'duplicateIconPack' | 'importIconPack' | 'exportIconPack'> {
  const { get, set } = ctx;
  return {
    setIconPack(id) {
      if (!registry.iconPacks().some((pack) => pack.id === id)) {
        return;
      }
      set({ iconPackId: id });
      applyIconPack(id);
      get().persist();
    },

    openIconStudio(baseId, blank = false) {
      const packs = registry.iconPacks();
      const taken = packs.map((pack) => pack.id);
      if (blank) {
        const draft: IconPack = { id: uniqueIconPackId('eigene-icons', taken), name: t('iconPacks.newName'), author: t('notify.theme.authorMe') };
        set({ iconStudio: { draft, isNew: true }, dialog: null });
        return;
      }
      const source = packs.find((pack) => pack.id === (baseId ?? get().iconPackId)) ?? packs[0];
      if (!source) {
        return;
      }
      if (registry.isUserIconPack(source.id)) {
        set({ iconStudio: { draft: structuredClone(source), isNew: false }, dialog: null });
        return;
      }
      set({ iconStudio: { draft: ownCopy(source, uniqueIconPackId(source.id, taken)), isNew: true }, dialog: null });
    },

    closeIconStudio() {
      set({ iconStudio: null, dialog: 'themes', dialogSection: 'icons' });
    },

    saveCustomIconPack(pack) {
      const existing = get().customIconPacks.some((entry) => entry.id === pack.id);
      commitIconPacks(ctx, existing
        ? get().customIconPacks.map((entry) => (entry.id === pack.id ? pack : entry))
        : [...get().customIconPacks, pack]);
      // An edited active pack is applied again straight away.
      if (get().iconPackId === pack.id) {
        applyIconPack(pack.id);
      }
      get().persist();
    },

    deleteCustomIconPack(id) {
      commitIconPacks(ctx, get().customIconPacks.filter((pack) => pack.id !== id));
      if (get().iconPackId === id) {
        get().setIconPack(DEFAULT_ICON_PACK_ID);
      }
      get().persist();
      get().notify(t('iconPacks.deleted'), 'info');
    },

    duplicateIconPack(id) {
      const source = registry.iconPacks().find((pack) => pack.id === id);
      if (!source) {
        return null;
      }
      const copy = ownCopy(source, uniqueIconPackId(source.id, registry.iconPacks().map((pack) => pack.id)));
      get().saveCustomIconPack(copy);
      return copy.id;
    },

    async importIconPack() {
      const picked = await window.lumen.dialog.openFile();
      if (!picked) {
        return;
      }
      try {
        const parsed = JSON.parse(picked.content) as IconPack;
        if (!isIconPack(parsed)) {
          throw new Error(t('iconPacks.invalid'));
        }
        const pack: IconPack = {
          ...parsed,
          id: uniqueIconPackId(parsed.id, registry.iconPacks().map((entry) => entry.id)),
          author: parsed.author ?? 'Import',
        };
        get().saveCustomIconPack(pack);
        get().setIconPack(pack.id);
        get().notify(t('iconPacks.imported', { name: pack.name }), 'success');
      } catch (err) {
        get().notify(t('iconPacks.importFailed', { error: (err as Error).message }), 'error');
      }
    },

    async exportIconPack(id) {
      const pack = registry.iconPacks().find((entry) => entry.id === id);
      if (!pack) {
        return;
      }
      const target = await window.lumen.dialog.saveFile(`${pack.id}.lumen-icons.json`);
      await writeJson(ctx, target, pack, t('iconPacks.exported', { name: pack.name }));
    },
  };
}

function addonActions(ctx: Ctx): Pick<AppearanceSlice, 'toggleAddon' | 'openAddonStudio' | 'closeAddonStudio'> {
  const { get, set } = ctx;
  return {
    toggleAddon(id) {
      const addon = registry.get(id);
      if (!addon || addon.builtin) {
        return;
      }
      registry.toggle(id);

      const enabledAddons = registry.activeIds().filter((activeId) => !registry.get(activeId)?.builtin);
      set({ enabledAddons, registryVersion: registry.getVersion() });

      // When the theme disappears with the add-on, fall back to the default theme.
      if (!registry.themes().some((theme) => theme.id === get().themeId)) {
        get().setTheme(DEFAULT_THEME_ID);
      }

      // Work out the language of the open tabs afresh.
      const languages = registry.languages();
      set((s) => ({
        tabs: s.tabs.map((tab) =>
          tab.path && !tab.virtual ? { ...tab, languageId: matchLanguage(tab.path, languages)?.id ?? null } : tab),
      }));

      get().persist();
      get().applyKeybindings();
      get().notify(t(registry.isActive(id) ? 'notify.addonEnabled' : 'notify.addonDisabled', { name: addon.name }), 'info');
      // The project kinds may have changed.
      void get().refreshProject();
    },

    openAddonStudio(addonId = null, starter) {
      set({ addonStudio: { addonId, starter }, dialog: null });
    },

    closeAddonStudio() {
      set({ addonStudio: null });
    },
  };
}

export const createAppearanceSlice: Slice<AppearanceSlice> = (set, get) => {
  const ctx: Ctx = { get, set };
  return {
    themeId: DEFAULT_THEME_ID,
    customThemes: [],
    editingThemeId: null,
    effects: DEFAULT_EFFECTS,
    enabledAddons: DEFAULT_ENABLED,
    registryVersion: 0,
    addonStudio: null,
    iconPackId: DEFAULT_ICON_PACK_ID,
    customIconPacks: [],
    iconStudio: null,
    formatSettings: {},

    ...formatActions(ctx),
    ...themeActions(ctx),
    ...iconPackActions(ctx),
    ...addonActions(ctx),

    themes: () => registry.themes(),
  };
};
