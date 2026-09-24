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
 * A stand-in for the API Lumen hands to `addon(lumen)`, for running the
 * extension under Node: real network (fetch), the app's naming helpers
 * re-implemented, messages in the chosen language.
 */

import type { RendererApi } from '../../../src/core/extensions/renderer-api';
import type { ProjectContext } from '../../../src/core/types';

function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'projekt';
}

const identifier = (name: string) => {
  const id = slugify(name).replace(/-/g, '');
  return /^[0-9]/.test(id) ? `p${id}` : id;
};

function pascalCase(name: string): string {
  const words = slugify(name).split('-').filter(Boolean);
  const out = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  if (!out) { return 'App'; }
  return /^[0-9]/.test(out) ? `P${out}` : out;
}

const snakeCase = (name: string) => {
  const id = slugify(name).replace(/-/g, '_');
  return /^[0-9]/.test(id) ? `p_${id}` : id;
};

export interface FakeOptions {
  language?: string;
  /** Replaces the network (offline tests); defaults to fetch. */
  net?: RendererApi['net'];
  settings?: Record<string, string>;
}

export const nodeNet: RendererApi['net'] = {
  async fetchText(url) {
    const response = await fetch(url, { headers: { 'User-Agent': 'Lumen-IDE (minecraft extension tests)' } });
    if (!response.ok) { throw new Error(`HTTP ${response.status} for ${url}`); }
    return response.text();
  },
  async fetchJson<T>(url: string) {
    return JSON.parse(await nodeNet.fetchText(url)) as T;
  },
};

/** A network that is down: every request fails. */
export const offlineNet: RendererApi['net'] = {
  fetchText: async (url) => { throw new Error(`offline: ${url}`); },
  fetchJson: async (url) => { throw new Error(`offline: ${url}`); },
};

export function fakeLumen(options: FakeOptions = {}): RendererApi {
  const language = options.language ?? 'en';
  const settings = options.settings ?? {};
  return {
    apiVersion: 1,
    extensionId: 'ext.minecraft',
    language: () => language,
    i18n(tables) {
      return (key, params) => {
        const message = tables[language]?.[key] ?? tables.en?.[key] ?? key;
        if (!params) { return message; }
        return message.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
      };
    },
    net: options.net ?? nodeNet,
    project: {
      slugify,
      identifier,
      pascalCase,
      snakeCase,
      gitignore: { java: 'target/\nbuild/\n.gradle/\nout/\n*.class\n*.jar\n!gradle/wrapper/*.jar\n.idea/\n*.iml\n' },
      grepValue(text, key) {
        const m = new RegExp(`^\\s*${key}\\s*[=:]\\s*["']?([^"'\\n]+)["']?`, 'm').exec(text);
        return m?.[1]?.trim();
      },
      async wrapperOr(ctx: ProjectContext, wrapper: string, fallback: string) {
        const name = ctx.platform === 'win32' ? `${wrapper}.bat` : wrapper;
        if (!(await ctx.exists(name))) { return fallback; }
        return ctx.platform === 'win32' ? name : `./${name}`;
      },
    },
    editor: { insertSnippet: () => false, languageId: () => null },
    ui: { notify: () => undefined, openForm: () => undefined },
    settings: {
      get: (key) => settings[key],
      all: () => ({ ...settings }),
    },
  };
}
