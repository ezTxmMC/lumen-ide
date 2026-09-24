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
 * The add-on registry.
 *
 * Holds every known add-on, handles activation and deactivation, and supplies
 * the combined languages, themes and commands of the active ones.
 */

import type {
  Addon, AddonContext, AddonPanel, AddonSnippet, Command, IconPack, LanguageSpec, ProjectKind, ProjectTemplate, Theme,
} from './types';

type Notifier = (message: string, kind?: 'info' | 'success' | 'warning' | 'error') => void;

const STORAGE_PREFIX = 'lumen.addon.';

class Registry {
  private addons = new Map<string, Addon>();
  private active = new Set<string>();
  private disposers = new Map<string, () => void>();

  /** Contributions registered at runtime, from `activate`. */
  private dynLanguages = new Map<string, LanguageSpec[]>();
  private dynThemes = new Map<string, Theme[]>();
  private dynCommands = new Map<string, Command[]>();
  private dynProjectKinds = new Map<string, ProjectKind[]>();
  private dynProjectTemplates = new Map<string, ProjectTemplate[]>();

  /** Themes made in the Theme Studio — they belong to no add-on. */
  private userThemes: Theme[] = [];
  /** Icon packs made in the Icon Studio. */
  private userIconPacks: IconPack[] = [];

  private listeners = new Set<() => void>();
  notify: Notifier = () => {};

  /* -------------------------------------------------- */

  register(...addons: Addon[]) {
    for (const addon of addons) {
      if (this.addons.has(addon.id)) {
        console.warn(`[lumen] Add-on "${addon.id}" is already registered.`);
        continue;
      }
      this.addons.set(addon.id, addon);
    }
    this.emit();
  }

  /** Removes an add-on; deactivate it first. Built-in ones stay. */
  unregister(id: string): boolean {
    const addon = this.addons.get(id);
    if (!addon || addon.builtin) {
      return false;
    }
    this.deactivate(id);
    this.addons.delete(id);
    this.emit();
    return true;
  }

  /**
   * Replaces an add-on without a restart — user add-ons after saving. If it
   * was active, it is activated again in its new form.
   */
  replace(addon: Addon) {
    const existing = this.addons.get(addon.id);
    if (existing?.builtin) {
      return;
    }
    const wasActive = this.active.has(addon.id);
    if (wasActive) {
      this.deactivate(addon.id);
    }
    this.addons.set(addon.id, addon);
    if (wasActive) {
      this.activate(addon.id);
    }
    this.emit();
  }

  /** Made in the Add-on Studio? */
  isUser(id: string): boolean {
    return Boolean(this.addons.get(id)?.user);
  }

  all(): Addon[] {
    return [...this.addons.values()].sort((a, b) => {
      if (!!a.builtin !== !!b.builtin) {
        return a.builtin ? -1 : 1;
      }
      return a.name.localeCompare(b.name, 'de');
    });
  }

  get(id: string): Addon | undefined {
    return this.addons.get(id);
  }

  isActive(id: string): boolean {
    return this.active.has(id);
  }

  activeIds(): string[] {
    return [...this.active];
  }

  /* -------------------------------------------------- */

  private contextFor(addon: Addon): AddonContext {
    return {
      notify: (message, kind) => this.notify(message, kind),
      storage: {
        get: <T>(key: string, fallback: T): T => {
          const raw = localStorage.getItem(`${STORAGE_PREFIX}${addon.id}.${key}`);
          if (raw === null) {
            return fallback;
          }
          try { return JSON.parse(raw) as T; } catch { return fallback; }
        },
        set: (key, value) => {
          localStorage.setItem(
            `${STORAGE_PREFIX}${addon.id}.${key}`,
            JSON.stringify(value),
          );
        },
      },
      registerLanguage: (spec) => {
        const list = this.dynLanguages.get(addon.id) ?? [];
        list.push(spec);
        this.dynLanguages.set(addon.id, list);
        this.emit();
      },
      registerTheme: (theme) => {
        const list = this.dynThemes.get(addon.id) ?? [];
        list.push(theme);
        this.dynThemes.set(addon.id, list);
        this.emit();
      },
      registerCommand: (command) => {
        const list = this.dynCommands.get(addon.id) ?? [];
        list.push(command);
        this.dynCommands.set(addon.id, list);
        this.emit();
      },
      registerProjectKind: (kind) => {
        const list = this.dynProjectKinds.get(addon.id) ?? [];
        list.push(kind);
        this.dynProjectKinds.set(addon.id, list);
        this.emit();
      },
      registerProjectTemplate: (template) => {
        const list = this.dynProjectTemplates.get(addon.id) ?? [];
        list.push(template);
        this.dynProjectTemplates.set(addon.id, list);
        this.emit();
      },
    };
  }

  activate(id: string): boolean {
    const addon = this.addons.get(id);
    if (!addon || this.active.has(id)) {
      return false;
    }
    this.active.add(id);
    try {
      const dispose = addon.activate?.(this.contextFor(addon));
      if (typeof dispose === 'function') {
        this.disposers.set(id, dispose);
      }
    } catch (err) {
      this.active.delete(id);
      console.error(`[lumen] Could not activate add-on "${id}":`, err);
      this.notify(`Add-on "${addon.name}" fehlgeschlagen`, 'error');
      return false;
    }
    this.emit();
    return true;
  }

  deactivate(id: string): boolean {
    const addon = this.addons.get(id);
    if (!addon || addon.builtin || !this.active.has(id)) {
      return false;
    }
    try {
      this.disposers.get(id)?.();
    } catch (err) {
      console.error(`[lumen] Error deactivating "${id}":`, err);
    }
    this.disposers.delete(id);
    this.dynLanguages.delete(id);
    this.dynThemes.delete(id);
    this.dynCommands.delete(id);
    this.dynProjectKinds.delete(id);
    this.dynProjectTemplates.delete(id);
    this.active.delete(id);
    this.emit();
    return true;
  }

  toggle(id: string): boolean {
    return this.isActive(id) ? !this.deactivate(id) : this.activate(id);
  }

  /** Activates every built-in add-on plus the ones passed in. */
  applyEnabled(ids: string[]) {
    const wanted = new Set(ids);
    for (const addon of this.addons.values()) {
      const should = addon.builtin || wanted.has(addon.id);
      const active = this.active.has(addon.id);
      if (should && !active) {
        this.activate(addon.id);
      }
      if (!should && active) {
        this.deactivate(addon.id);
      }
    }
  }

  /* -------------------------------------------------- */

  languages(): LanguageSpec[] {
    const out: LanguageSpec[] = [];
    for (const id of this.active) {
      out.push(...(this.addons.get(id)?.languages ?? []));
      out.push(...(this.dynLanguages.get(id) ?? []));
    }
    return out;
  }

  themes(): Theme[] {
    const out: Theme[] = [];
    for (const id of this.active) {
      out.push(...(this.addons.get(id)?.themes ?? []));
      out.push(...(this.dynThemes.get(id) ?? []));
    }
    out.push(...this.userThemes);
    return out;
  }

  /** Replaces the user's own themes. */
  setUserThemes(themes: Theme[]) {
    this.userThemes = themes;
    this.emit();
  }

  isUserTheme(id: string) {
    return this.userThemes.some((t) => t.id === id);
  }

  /** Snippets the active add-ons contribute to this language. */
  snippetsFor(languageId: string): AddonSnippet[] {
    return [...this.active].flatMap((id) => (this.addons.get(id)?.snippets ?? []).filter((snippet) => snippet.languageId === languageId));
  }

  /** Icon packs of the active add-ons, then the user's — first one per id wins. */
  /** The panels of every active add-on, with where they come from. */
  panels(): { addonId: string; addonName: string; panel: AddonPanel; }[] {
    return [...this.active].flatMap((id) => {
      const addon = this.addons.get(id);
      return (addon?.panels ?? []).map((panel) => ({ addonId: id, addonName: addon!.name, panel }));
    });
  }

  iconPacks(): IconPack[] {
    const seen = new Set<string>();
    const out: IconPack[] = [];
    const all = [...[...this.active].flatMap((id) => this.addons.get(id)?.iconPacks ?? []), ...this.userIconPacks];
    for (const pack of all) {
      if (seen.has(pack.id)) {
        continue;
      }
      seen.add(pack.id);
      out.push(pack);
    }
    return out;
  }

  setUserIconPacks(packs: IconPack[]) {
    this.userIconPacks = packs;
    this.emit();
  }

  isUserIconPack(id: string) {
    return this.userIconPacks.some((pack) => pack.id === id);
  }

  commands(): Command[] {
    const out: Command[] = [];
    for (const id of this.active) {
      out.push(...(this.addons.get(id)?.commands ?? []));
      out.push(...(this.dynCommands.get(id) ?? []));
    }
    return out;
  }

  /** Project kinds of the active add-ons — first one per id wins. */
  projectKinds(): ProjectKind[] {
    const seen = new Set<string>();
    const out: ProjectKind[] = [];
    for (const id of this.active) {
      for (const kind of [
        ...(this.addons.get(id)?.projectKinds ?? []),
        ...(this.dynProjectKinds.get(id) ?? []),
      ]) {
        if (seen.has(kind.id)) {
          continue;
        }
        seen.add(kind.id);
        out.push(kind);
      }
    }
    return out;
  }

  projectTemplates(): ProjectTemplate[] {
    const seen = new Set<string>();
    const out: ProjectTemplate[] = [];
    for (const id of this.active) {
      for (const template of [
        ...(this.addons.get(id)?.projectTemplates ?? []),
        ...(this.dynProjectTemplates.get(id) ?? []),
      ]) {
        if (seen.has(template.id)) {
          continue;
        }
        seen.add(template.id);
        out.push(template);
      }
    }
    return out;
  }

  /* -------------------------------------------------- */

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private version = 0;
  getVersion = () => this.version;

  private emit() {
    this.version++;
    for (const fn of this.listeners) {
      fn();
    }
  }
}

export const registry = new Registry();
