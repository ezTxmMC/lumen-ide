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
 * Managing user add-ons: loading, saving, registering, importing, exporting,
 * duplicating, deleting, and copying from the bundled add-ons.
 *
 * Activation: a new add-on is switched on and written into `enabledAddons`,
 * which is what counts at startup. After saving, `registry.replace` swaps the
 * old version out without a restart.
 */

import { useStore } from '@/state/store';
import { registry } from '@/core/registry';
import { matchLanguage } from '@/core/language';
import { DEFAULT_THEME_ID } from '@/addons/builtin/themes';
import { t } from '@/i18n';
import type { Addon, LanguageSpec, Theme } from '@/core/types';
import { compileAddon, extractChoices } from './compile';
import { runUserCommand, startUserEvents } from './runtime';
import {
  createUserAddon, normalizeModel, slugify, uniqueAddonId, USER_ADDON_EXTENSION, USER_ADDON_PREFIX,
  type UserAddonModel, type UserLanguage, type UserTemplateField,
} from './schema';
import { blockingIssues, validateAddon, type ValidationIssue } from './validate';

export interface LoadProblem {
  file: string;
  message: string;
}

const listeners = new Set<() => void>();
const models = new Map<string, UserAddonModel>();
let loadProblems: LoadProblem[] = [];
let version = 0;
let started = false;

function emit() {
  version++;
  for (const fn of listeners) {
    fn();
  }
}

/* ------------------------------------------------------------------ *
 * Choice lists from the network, such as version lists
 * ------------------------------------------------------------------ */

type Choice = { value: string; label: string; };

const CHOICES_TTL_MS = 6 * 60 * 60 * 1000;
const CHOICES_STORAGE = 'lumen.userAddons.choices.';
/** Answers per URL, stored so templates still show the last list offline. */
const remoteData = new Map<string, { data: unknown; fetchedAt: number; }>();
const pending = new Set<string>();

function storedResponse(url: string): { data: unknown; fetchedAt: number; } | undefined {
  const hit = remoteData.get(url);
  if (hit) {
    return hit;
  }
  try {
    const raw = localStorage.getItem(CHOICES_STORAGE + url);
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as { data: unknown; fetchedAt: number; };
    remoteData.set(url, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

function remoteChoices(field: UserTemplateField): Choice[] | undefined {
  if (!field.choicesUrl) {
    return undefined;
  }
  const response = storedResponse(field.choicesUrl);
  if (!response) {
    return undefined;
  }
  const list = extractChoices(response.data, field);
  return list.length ? list : undefined;
}

/** Load missing or stale lists and re-register the add-on afterwards. */
async function refreshRemoteChoices(model: UserAddonModel, force = false) {
  const urls = new Set(model.templates.flatMap((tpl) => tpl.fields.map((field) => field.choicesUrl ?? '')).filter(Boolean));
  let changed = false;
  for (const url of urls) {
    const known = storedResponse(url);
    if (!force && known && Date.now() - known.fetchedAt < CHOICES_TTL_MS) {
      continue;
    }
    if (pending.has(url) || !/^https:\/\//.test(url)) {
      continue;
    }
    pending.add(url);
    try {
      const data = await window.lumen.net.fetchJson(url);
      const entry = { data, fetchedAt: Date.now() };
      remoteData.set(url, entry);
      try {
        localStorage.setItem(CHOICES_STORAGE + url, JSON.stringify(entry));
      } catch {
        // Storage full or locked — then only for this session.
      }
      changed = true;
    } catch (err) {
      console.warn(`[lumen] Choice list not loaded (${url}):`, err);
    } finally {
      pending.delete(url);
    }
  }
  const current = models.get(model.id);
  if (!changed || !current || !registry.get(model.id)) {
    return;
  }
  registry.replace(compileAddon(current, deps));
  refreshStore();
}

const deps = {
  remoteChoices,
  runCommand: runUserCommand,
  startEvents: startUserEvents,
  // References point at themes the Theme Studio shows anyway.
  resolveTheme: (id: string) => (registry.isUserTheme(id) ? undefined : useStore.getState().customThemes.find((th) => th.id === id)),
};

/** After registry changes: bring the languages of open tabs and the theme in line. */
function refreshStore() {
  const s = useStore.getState();
  const languages = registry.languages();
  useStore.setState({
    tabs: s.tabs.map((tab) =>
      tab.path && !tab.virtual ? { ...tab, languageId: matchLanguage(tab.path, languages)?.id ?? null } : tab),
    registryVersion: registry.getVersion(),
  });
  if (!registry.themes().some((theme) => theme.id === s.themeId)) {
    s.setTheme(DEFAULT_THEME_ID);
  }
  s.applyKeybindings();
}

function setEnabled(id: string, enabled: boolean) {
  const s = useStore.getState();
  const rest = s.enabledAddons.filter((entry) => entry !== id);
  useStore.setState({ enabledAddons: enabled ? [...rest, id] : rest });
  s.persist();
}

function registerModel(model: UserAddonModel, activate: boolean) {
  const addon = compileAddon(model, deps);
  if (registry.get(model.id)) {
    registry.replace(addon);
    void refreshRemoteChoices(model);
    return;
  }
  registry.register(addon);
  if (activate) {
    registry.activate(model.id);
  }
  void refreshRemoteChoices(model);
}

export const userAddons = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  getVersion: () => version,

  list: (): UserAddonModel[] => [...models.values()].sort((a, b) => a.name.localeCompare(b.name)),
  get: (id: string | null | undefined) => (id ? models.get(id) : undefined),
  ids: () => [...models.keys()],
  problems: () => loadProblems,
  /** Reload the choice lists of every user add-on (the “refresh lists” command). */
  async refreshChoices() {
    await Promise.all([...models.values()].map((model) => refreshRemoteChoices(model, true)));
  },

  /** Loads every file and registers them — once, at startup. */
  async init() {
    if (started) {
      return;
    }
    started = true;
    const enabled = new Set(useStore.getState().enabledAddons);
    const stored = await window.lumen.userAddons.list().catch((err: Error) => {
      loadProblems = [{ file: '', message: err.message }];
      return [];
    });
    loadProblems = [];
    for (const entry of stored) {
      if (entry.error || !entry.data) {
        loadProblems.push({ file: entry.file, message: entry.error ?? t('addonStudio.validate.unreadable') });
        continue;
      }
      const model = normalizeModel(entry.data);
      const errors = blockingIssues(validateAddon(model));
      if (errors.length) {
        loadProblems.push({ file: entry.file, message: errors[0].message });
        continue;
      }
      if (models.has(model.id) || (registry.get(model.id) && !registry.isUser(model.id))) {
        loadProblems.push({ file: entry.file, message: t('addonStudio.validate.duplicateId', { id: model.id }) });
        continue;
      }
      models.set(model.id, model);
      try {
        registerModel(model, enabled.has(model.id));
      } catch (err) {
        loadProblems.push({ file: entry.file, message: (err as Error).message });
      }
    }
    // Add-ons listed as enabled but not yet active; registration happens after applyEnabled.
    for (const id of enabled) {
      if (models.has(id) && !registry.isActive(id)) {
        registry.activate(id);
      }
    }
    if (loadProblems.length) {
      console.warn('[lumen] User add-ons with problems:', loadProblems);
      useStore.getState().notify(t('addonStudio.manager.loadProblems', { count: loadProblems.length }), 'warning');
    }
    refreshStore();
    emit();
  },

  /**
   * Saves and re-registers. On errors nothing is stored; `previousId` allows
   * renaming the id.
   */
  async save(input: UserAddonModel, previousId?: string | null): Promise<ValidationIssue[]> {
    const model = normalizeModel(structuredClone(input));
    const issues = validateAddon(model);
    if (blockingIssues(issues).length) {
      return issues;
    }
    const taken = registry.get(model.id);
    if (taken && !taken.user) {
      return [{ section: 'general', field: 'id', message: t('addonStudio.validate.duplicateId', { id: model.id }) }];
    }
    if (model.id !== previousId && models.has(model.id)) {
      return [{ section: 'general', field: 'id', message: t('addonStudio.validate.duplicateId', { id: model.id }) }];
    }

    await window.lumen.userAddons.save(model.id, `${JSON.stringify(model, null, 2)}\n`);
    // A renamed id: drop the old file and registration, carry the activation over.
    const oldId = previousId && previousId !== model.id && models.has(previousId) ? previousId : null;
    const activate = oldId ? registry.isActive(oldId) : true;
    if (oldId) {
      await window.lumen.userAddons.remove(oldId);
      models.delete(oldId);
      registry.unregister(oldId);
      setEnabled(oldId, false);
    }
    const isNew = !registry.get(model.id);
    models.set(model.id, model);
    registerModel(model, isNew && activate);
    if (isNew) {
      setEnabled(model.id, activate);
    }
    refreshStore();
    emit();
    return issues;
  },

  async remove(id: string) {
    if (!models.has(id)) {
      return;
    }
    await window.lumen.userAddons.remove(id);
    models.delete(id);
    registry.unregister(id);
    setEnabled(id, false);
    refreshStore();
    emit();
  },

  /** A copy under a new id, saved immediately. */
  async duplicate(id: string): Promise<UserAddonModel | null> {
    const source = models.get(id);
    if (!source) {
      return null;
    }
    const copy = structuredClone(source);
    copy.id = uniqueAddonId(source.id, [...models.keys()]);
    copy.name = t('addonStudio.manager.copyName', { name: source.name });
    const issues = await userAddons.save(copy);
    if (blockingIssues(issues).length) {
      return null;
    }
    return copy;
  },

  /** JSON for export — theme references are embedded. */
  serialize(model: UserAddonModel): string {
    const customThemes = useStore.getState().customThemes;
    const themes = model.themes.map((entry) => {
      if ('theme' in entry) {
        return entry;
      }
      const theme = customThemes.find((th) => th.id === entry.ref);
      return theme ? { theme: structuredClone(theme) } : entry;
    });
    return `${JSON.stringify({ ...model, themes }, null, 2)}\n`;
  },

  async exportModel(model: UserAddonModel) {
    const target = await window.lumen.userAddons.exportFile(`${model.id}${USER_ADDON_EXTENSION}`, userAddons.serialize(model));
    if (target) {
      useStore.getState().notify(t('addonStudio.manager.exported', { name: model.name }), 'success');
    }
  },

  /** Pick a file, check it, and save it as a user add-on. */
  async importFile(): Promise<UserAddonModel | null> {
    const s = useStore.getState();
    const picked = await window.lumen.userAddons.importFile();
    if (!picked) {
      return null;
    }
    let model: UserAddonModel;
    try {
      model = normalizeModel(JSON.parse(picked.content));
    } catch (err) {
      s.notify(t('addonStudio.manager.importFailed', { message: (err as Error).message }), 'error');
      return null;
    }
    const existing = [...models.keys(), ...registry.all().map((a) => a.id)];
    if (!model.id.startsWith(USER_ADDON_PREFIX)) {
      model.id = uniqueAddonId(slugify(model.id || model.name), existing);
    }
    const replace = models.has(model.id) && confirm(t('addonStudio.manager.confirmReplace', { name: model.name || model.id }));
    if (registry.get(model.id) && !replace) {
      model.id = uniqueAddonId(model.id, existing);
    }
    const issues = blockingIssues(await userAddons.save(model, replace ? model.id : null));
    if (issues.length) {
      s.notify(t('addonStudio.manager.importFailed', { message: issues[0].message }), 'error');
      return null;
    }
    s.notify(t('addonStudio.manager.imported', { name: model.name }), 'success');
    return model;
  },

  /** A bundled add-on as an editable user add-on (languages, snippets, themes). */
  async copyFromAddon(addon: Addon): Promise<UserAddonModel | null> {
    const existing = [...models.keys(), ...registry.all().map((a) => a.id)];
    const model = createUserAddon(t('addonStudio.manager.copyName', { name: addon.name }), existing);
    model.id = uniqueAddonId(slugify(addon.id.replace(/^[a-z]+\./, '')), existing);
    model.description = addon.description ?? '';
    model.author = addon.author ?? '';
    model.icon = addon.icon ?? addon.name.slice(0, 2);
    model.color = addon.languages?.[0]?.color ?? model.color;
    model.category = addon.category ?? 'tool';
    const takenLanguages = new Set(registry.all().flatMap((a) => a.languages ?? []).map((l) => l.id));
    model.languages = (addon.languages ?? []).map((spec) => languageFromSpec(spec, takenLanguages));
    model.themes = (addon.themes ?? []).map((theme: Theme) => ({
      theme: { ...structuredClone(theme), id: `${theme.id}-${slugify(model.id)}`, name: t('addonStudio.manager.copyName', { name: theme.name }) },
    }));
    if (addon.languages?.some((spec) => spec.tokenizer)) {
      useStore.getState().notify(t('addonStudio.manager.tokenizerSkipped'), 'warning');
    }
    const issues = blockingIssues(await userAddons.save(model));
    if (issues.length) {
      useStore.getState().notify(issues[0].message, 'error');
      return null;
    }
    return model;
  },
};

/** `LanguageSpec` → a serialisable language with a new id and precedence over the original. */
function languageFromSpec(spec: LanguageSpec, taken: Set<string>): UserLanguage {
  let id = `${spec.id}-custom`;
  let n = 2;
  while (taken.has(id)) {
    id = `${spec.id}-custom${n++}`;
  }
  taken.add(id);
  const source = (re: RegExp | undefined) => re?.source;
  const clone = <T,>(value: T): T => (value === undefined ? value : structuredClone(value));
  return {
    id,
    name: spec.name,
    extensions: [...spec.extensions],
    filenames: clone(spec.filenames),
    icon: spec.icon,
    color: spec.color,
    comments: clone(spec.comments),
    keywords: clone(spec.keywords),
    controls: clone(spec.controls),
    types: clone(spec.types),
    builtins: clone(spec.builtins),
    constants: clone(spec.constants),
    strings: clone(spec.strings),
    numbers: source(spec.numbers),
    identifier: source(spec.identifier),
    operators: source(spec.operators),
    meta: source(spec.meta),
    caseInsensitive: spec.caseInsensitive,
    capitalizedAsType: spec.capitalizedAsType,
    indentOpen: source(spec.indentOpen),
    indentClose: source(spec.indentClose),
    indentUnit: spec.indentUnit,
    completions: clone(spec.completions),
    snippets: clone(spec.snippets),
    run: clone(spec.run),
    // Language servers still expect the original language id.
    lsp: spec.lsp?.map((server) => ({ ...structuredClone(server), languageId: server.languageId ?? spec.id })),
    priority: (spec.priority ?? 0) + 1,
  };
}
