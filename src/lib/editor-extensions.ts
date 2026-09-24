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
 * The editor's extension points: features such as the debugger — breakpoints
 * in the gutter, the current line — contribute CodeMirror extensions here
 * without touching `Editor.tsx`. Each factory is called once per tab.
 */

import type { Extension } from '@codemirror/state';

export interface EditorContext {
  tabId: string;
  groupId: string;
  /** File path or virtual URI; `null` for unnamed tabs. */
  path: string | null;
  languageId: string | null;
  readonly: boolean;
}

type Factory = (ctx: EditorContext) => Extension;

const factories = new Set<Factory>();
const listeners = new Set<() => void>();
let version = 0;

export function registerEditorExtension(factory: Factory) {
  factories.add(factory);
  version++;
  for (const fn of listeners) {
    fn();
  }
  return () => {
    factories.delete(factory);
    version++;
    for (const fn of listeners) {
      fn();
    }
  };
}

export function editorExtensions(ctx: EditorContext): Extension[] {
  return [...factories].map((factory) => {
    try {
      return factory(ctx);
    } catch (err) {
      console.error('[lumen] Editor-Erweiterung fehlgeschlagen:', err);
      return [];
    }
  });
}

export const subscribeEditorExtensions = (fn: () => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

export const getEditorExtensionVersion = () => version;
