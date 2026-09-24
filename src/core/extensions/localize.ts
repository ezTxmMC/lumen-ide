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
 * Manifest texts in the interface language.
 *
 * A manifest is written in one language; settings and commands may carry
 * `i18n: { en: { … }, fr: { … } }` with the same texts in others. Whatever a
 * language leaves out keeps the manifest's own text. Pure, so the settings
 * page, the palette and the checks can share it.
 */

import type { ExtensionCommand, ExtensionOpenWith, ExtensionSetting, ExtensionView } from './types';

/** The entry for `language`, or for its base (`pt-BR` → `pt`). */
function textsFor<T>(table: Record<string, T> | undefined, language: string): T | undefined {
  if (!table || typeof table !== 'object') {
    return undefined;
  }
  return table[language] ?? table[language.split('-')[0]];
}

const pick = (value: unknown, fallback: string | undefined) => (typeof value === 'string' && value ? value : fallback);

export function localizeSetting(setting: ExtensionSetting, language: string): ExtensionSetting {
  const texts = textsFor(setting.i18n, language);
  if (!texts) {
    return setting;
  }
  const choices = texts.choices;
  return {
    ...setting,
    label: pick(texts.label, setting.label) ?? setting.label,
    hint: pick(texts.hint, setting.hint),
    placeholder: pick(texts.placeholder, setting.placeholder),
    section: pick(texts.section, setting.section),
    choices: setting.choices?.map((choice) => ({ ...choice, label: pick(choices?.[choice.value], choice.label) ?? choice.label })),
  };
}

export function localizeCommand(command: ExtensionCommand, language: string): ExtensionCommand {
  const texts = textsFor(command.i18n, language);
  if (!texts) {
    return command;
  }
  return {
    ...command,
    title: pick(texts.title, command.title) ?? command.title,
    category: pick(texts.category, command.category),
  };
}

/** Anything with a translatable `title` alone: views and “open with” entries. */
export function localizeTitle<T extends ExtensionView | ExtensionOpenWith>(entry: T, language: string): T {
  const texts = textsFor(entry.i18n, language);
  if (!texts) {
    return entry;
  }
  return { ...entry, title: pick(texts.title, entry.title) ?? entry.title };
}
