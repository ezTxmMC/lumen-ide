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
 * Running the window part of extension code (`code.renderer`).
 *
 * The main process keeps the approved code and hands it out only while it
 * still matches the approved hash (`extensions:code:renderer`). It is imported
 * from a blob URL and its `addon(lumen)` becomes an add-on in the registry
 * under `<extension id>#code` — hidden from the add-on lists, and switched on
 * and off together with the extension's own add-on.
 */

import { snippet } from '@codemirror/autocomplete';
import type { Addon } from '@/core/types';
import { registry } from '@/core/registry';
import { GITIGNORE, identifier, pascalCase, slugify, snakeCase } from '@/core/project/scaffold';
import { grepValue, wrapperOr } from '@/core/project/detect';
import { editorBridge } from '@/lib/editor-bridge';
import { getLanguage } from '@/i18n';
import { useStore } from '@/state/store';
import { appVersion } from './app-version';
import { fitsApp } from './compat';
import { extensions } from './manager';
import type { MessageTables, RendererApi, RendererModule } from './renderer-api';
import type { InstalledExtension } from './types';

const SUFFIX = '#code';

/** Loaded per extension: the approved hash the add-on was built from. */
const loaded = new Map<string, string>();
let syncing: Promise<void> | null = null;
let pending = false;

export const codeAddonId = (extensionId: string) => `${extensionId}${SUFFIX}`;

function format(message: string, params?: Record<string, string | number>): string {
  if (!params) {
    return message;
  }
  return message.replace(/\{(\w+)\}/g, (whole, key: string) => (key in params ? String(params[key]) : whole));
}

function apiFor(extensionId: string): RendererApi {
  const store = () => useStore.getState();
  return {
    apiVersion: 1,
    extensionId,
    language: () => getLanguage(),
    i18n(tables: MessageTables) {
      return (key, params) => {
        const message = tables[getLanguage()]?.[key] ?? tables.en?.[key] ?? key;
        return format(message, params);
      };
    },
    net: {
      fetchJson: <T>(url: string) => window.lumen.net.fetchJson<T>(url),
      fetchText: (url: string) => window.lumen.net.fetchText(url),
    },
    project: {
      slugify,
      identifier,
      pascalCase,
      snakeCase,
      gitignore: { ...GITIGNORE },
      grepValue,
      wrapperOr,
    },
    editor: {
      insertSnippet(body) {
        const view = editorBridge.view;
        if (!view) {
          return false;
        }
        const { from, to } = view.state.selection.main;
        snippet(body.replaceAll('$0', '${}'))(view, null, from, to);
        view.focus();
        return true;
      },
      languageId: () => store().activeTab()?.languageId ?? null,
    },
    ui: {
      notify: (message, kind = 'info') => store().notify(message, kind),
      openForm: (spec) => store().openForm(spec),
    },
    settings: {
      get: (key) => store().extensionSettings[extensionId]?.[key],
      all: () => ({ ...(store().extensionSettings[extensionId] ?? {}) }),
    },
  };
}

async function importModule(code: string): Promise<RendererModule> {
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try {
    return await import(/* @vite-ignore */ url) as RendererModule;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The code add-on follows the extension's own add-on — on while that is on. */
function followActivation(extensionId: string) {
  const id = codeAddonId(extensionId);
  if (!registry.get(id)) {
    return;
  }
  const wanted = !registry.get(extensionId) || registry.isActive(extensionId);
  if (wanted && !registry.isActive(id)) {
    registry.activate(id);
  }
  if (!wanted && registry.isActive(id)) {
    registry.deactivate(id);
  }
}

async function load(entry: InstalledExtension) {
  const { manifest, codeHash } = entry;
  if (!codeHash || loaded.get(manifest.id) === codeHash) {
    return;
  }
  if (!fitsApp(manifest.minAppVersion, appVersion())) {
    unload(manifest.id);
    return;
  }
  const code = await window.lumen.extensions.rendererCode(manifest.id).catch(() => null);
  unload(manifest.id);
  if (!code) {
    return;
  }
  const mod = await importModule(code);
  if (typeof mod.addon !== 'function') {
    throw new Error(`${manifest.id}: the window code exports no addon()`);
  }
  const part = await mod.addon(apiFor(manifest.id));
  const addon: Addon = {
    ...part,
    id: codeAddonId(manifest.id),
    name: part.name ?? manifest.name,
    version: manifest.version,
    author: part.author ?? manifest.author,
    hidden: true,
  };
  registry.register(addon);
  loaded.set(manifest.id, codeHash);
  followActivation(manifest.id);
}

function unload(extensionId: string) {
  if (!loaded.has(extensionId)) {
    return;
  }
  loaded.delete(extensionId);
  registry.unregister(codeAddonId(extensionId));
}

async function syncOnce() {
  const installed = extensions.list();
  const ids = new Set(installed.map((entry) => entry.manifest.id));
  for (const id of [...loaded.keys()]) {
    if (!ids.has(id)) {
      unload(id);
    }
  }
  for (const entry of installed) {
    await load(entry).catch((err: Error) => {
      console.error(`[lumen] ${entry.manifest.id}: window code not loaded:`, err);
      useStore.getState().notify(`${entry.manifest.name}: ${err.message}`, 'error');
    });
  }
}

/** Bring the loaded code in line with the installed extensions — one run at a time, the last request wins. */
export function syncRendererCode(): Promise<void> {
  if (syncing) {
    pending = true;
    return syncing;
  }
  syncing = syncOnce().finally(() => {
    syncing = null;
    if (!pending) {
      return;
    }
    pending = false;
    void syncRendererCode();
  });
  return syncing;
}

let started = false;

/** Load at startup and follow installs, removals and the extensions' on/off switches. */
export function initRendererCode() {
  if (started) {
    return;
  }
  started = true;
  extensions.subscribe(() => void syncRendererCode());
  registry.subscribe(() => {
    for (const id of loaded.keys()) {
      followActivation(id);
    }
  });
  void syncRendererCode();
}
