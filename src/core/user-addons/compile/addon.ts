/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { Addon, Theme } from '@/core/types';
import type { UserAddonModel, UserCommand, UserTemplateField } from '../schema';
import { compileLanguage } from './language';
import { compileTemplate } from './template';
import { compileProjectKind } from './kind';

export interface CompileDeps {
  /** Runs a command's graph. */
  runCommand?(model: UserAddonModel, command: UserCommand): void | Promise<void>;
  /** Starts the event graphs; the return value cleans up on deactivation. */
  startEvents?(model: UserAddonModel): () => void;
  /** Loaded choices of a field with `choicesUrl`, or `undefined` while none have arrived. */
  remoteChoices?(field: UserTemplateField): { value: string; label: string; }[] | undefined;
  /** Resolves references to themes from the Theme Studio. */
  resolveTheme?(id: string): Theme | undefined;
}

export function compileAddon(model: UserAddonModel, deps: CompileDeps = {}): Addon {
  const themes: Theme[] = [];
  for (const entry of model.themes) {
    if ('theme' in entry) {
      themes.push(entry.theme);
      continue;
    }
    const resolved = deps.resolveTheme?.(entry.ref);
    if (resolved) {
      themes.push(resolved);
    }
  }

  const addon: Addon = {
    id: model.id,
    name: model.name || model.id,
    version: model.version,
    description: model.description || undefined,
    author: model.author || undefined,
    icon: model.icon || undefined,
    category: model.category,
    user: true,
    languages: model.languages.map(compileLanguage),
    themes,
    commands: model.commands.map((command) => ({
      id: `${model.id}.${command.id}`,
      title: command.title,
      category: command.category || model.name,
      keybinding: command.keybinding || undefined,
      run: () => deps.runCommand?.(model, command),
    })),
    projectTemplates: model.templates.map((template) =>
      compileTemplate(template, model.id, deps, new Set((model.projectKinds ?? []).map((kind) => kind.id)))),
    projectKinds: (model.projectKinds ?? []).map((kind) => compileProjectKind(kind, model.id)),
    snippets: (model.snippets ?? [])
      .filter((snippet) => snippet.languageId && snippet.label && snippet.body)
      .map((snippet) => ({ languageId: snippet.languageId, label: snippet.label, detail: snippet.detail || undefined, body: snippet.body, files: snippet.files?.length ? snippet.files : undefined, scope: snippet.scope?.length ? snippet.scope : undefined })),
    panels: (model.panels ?? [])
      .filter((panel) => panel.id && panel.title && panel.content)
      .map((panel) => ({ ...panel, icon: panel.icon || undefined })),
  };
  const startEvents = deps.startEvents;
  if (model.events.length && startEvents) {
    addon.activate = () => startEvents(model);
  }
  // Leave out empty lists so a compiled add-on has the same shape as a
  // hand-written one. `addon.snippets?.length` behaves the same either way,
  // but comparisons and dumps get noisy with empty fields.
  for (const key of ['languages', 'themes', 'commands', 'projectTemplates', 'projectKinds', 'snippets', 'panels'] as const) {
    if (addon[key]?.length === 0) {
      delete addon[key];
    }
  }
  return addon;
}
