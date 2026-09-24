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
 * What an extension's window code (`code.renderer`) receives.
 *
 * The module exports `addon(lumen)` and returns the parts of an add-on it
 * brings — project templates and kinds whose files and tasks are computed,
 * snippets, commands, an `activate(ctx)`. It never imports the app: all it
 * needs from Lumen comes through `lumen`, so the app can change inside
 * without breaking extensions, and `apiVersion` rises when this shape does.
 *
 * Extension sources written in TypeScript import these types directly
 * (`import type { RendererApi } from '../../src/core/extensions/renderer-api'`);
 * type imports vanish in the bundle.
 */

import type { Addon, ProjectContext } from '@/core/types';
import type { FormDialogSpec } from '@/state/types';

export type MessageTables = Record<string, Record<string, string>>;

export interface RendererApi {
  apiVersion: 1;
  extensionId: string;
  /** The interface language, `de`, `en` … */
  language(): string;
  /**
   * A `t(key, params)` over the extension's own messages, per language —
   * falling back to English, then to the key. `{name}` in a message takes
   * `params.name`.
   */
  i18n(tables: MessageTables): (key: string, params?: Record<string, string | number>) => string;
  net: {
    fetchJson<T>(url: string): Promise<T>;
    fetchText(url: string): Promise<string>;
  };
  project: {
    slugify(name: string): string;
    identifier(name: string): string;
    pascalCase(name: string): string;
    snakeCase(name: string): string;
    /** Lumen's `.gitignore` bodies per ecosystem (`java`, `node`, `c` …). */
    gitignore: Record<string, string>;
    /** The value of `key = value` / `key: value` in a properties-like text. */
    grepValue(text: string, key: string): string | undefined;
    /** `./gradlew` when the wrapper exists in the project, the fallback otherwise. */
    wrapperOr(ctx: ProjectContext, wrapper: string, fallback: string): Promise<string>;
  };
  editor: {
    /** Insert a snippet (`${1:name}` placeholders) at the cursor of the active editor; false without one. */
    insertSnippet(body: string): boolean;
    /** Language of the active editor tab. */
    languageId(): string | null;
  };
  ui: {
    notify(message: string, kind?: 'info' | 'success' | 'warning' | 'error'): void;
    openForm(spec: FormDialogSpec): void;
  };
  /** The extension's settings as the user set them (`extension.json` → `settings`). */
  settings: {
    get(key: string): string | undefined;
    all(): Record<string, string>;
  };
}

/** What `addon(lumen)` returns — the extension's id, name and version are filled in from its manifest. */
export type RendererAddon = Omit<Addon, 'id' | 'name' | 'version' | 'builtin' | 'user'> & { name?: string; };

export interface RendererModule {
  addon(lumen: RendererApi): RendererAddon | Promise<RendererAddon>;
}
