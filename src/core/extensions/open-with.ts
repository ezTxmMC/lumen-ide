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
 * “Open with …”: files an extension declares it can open (`openWith` in its
 * manifest — patterns such as `*.db`). Opening such a file asks whether it
 * should go to the extension or into the text editor; the explorer's context
 * menu offers the extension directly.
 */

import { useStore } from '@/state/store';
import { setFileOpenClaim } from '@/core/file-open-claims';
import { getLanguage, t } from '@/i18n';
import { localizeTitle } from './localize';
import { extensions } from './manager';
import { extensionHost } from './host';

export interface OpenWithHandler {
  extensionId: string;
  command: string;
  title: string;
}

const TEXT_EDITOR = '__text';

/** `*.db` matches `x.db` and `X.DB`; a pattern without `*` must match the whole name. */
export function matchesFilePattern(name: string, pattern: string): boolean {
  const lower = name.toLowerCase();
  const wanted = pattern.toLowerCase();
  if (wanted.startsWith('*')) {
    return lower.endsWith(wanted.slice(1));
  }
  return lower === wanted;
}

export function openWithHandlers(path: string): OpenWithHandler[] {
  const name = path.split(/[\\/]/).pop() ?? path;
  return extensions.list().flatMap(({ manifest }) => (manifest.openWith ?? [])
    .filter((entry) => entry.patterns.some((pattern) => matchesFilePattern(name, pattern)))
    .map((entry) => ({ extensionId: manifest.id, command: entry.command, title: localizeTitle(entry, getLanguage()).title })));
}

export function openWith(handler: OpenWithHandler, path: string) {
  return extensionHost.runCommand(handler.extensionId, handler.command, { path });
}

/** Ask where a file goes; resolves `true` unless the text editor was chosen. */
function ask(path: string, handlers: OpenWithHandler[]): Promise<boolean> {
  const name = path.split(/[\\/]/).pop() ?? path;
  return new Promise((resolve) => {
    useStore.getState().openForm({
      title: t('extensionView.openWith.title', { name }),
      fields: [{
        id: 'choice',
        label: t('extensionView.openWith.label'),
        type: 'select',
        default: `0`,
        choices: [
          ...handlers.map((handler, index) => ({ value: String(index), label: handler.title })),
          { value: TEXT_EDITOR, label: t('extensionView.openWith.textEditor') },
        ],
      }],
      onSubmit: (values) => {
        const handler = handlers[Number(values.choice)];
        if (!handler) {
          resolve(false);
          return;
        }
        void openWith(handler, path);
        resolve(true);
      },
      onCancel: () => resolve(true),
    });
  });
}

/** Once at startup: let the editor hand matching files over. */
export function installOpenWith() {
  setFileOpenClaim(async (path) => {
    const handlers = openWithHandlers(path);
    if (!handlers.length) {
      return false;
    }
    return ask(path, handlers);
  });
}
