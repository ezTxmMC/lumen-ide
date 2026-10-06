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
 * Formatting settings per language: tab width, tabs or spaces, line endings,
 * trailing whitespace, the final newline. They drive the editor's indentation,
 * the options sent with formatting requests, what happens on save, and — for
 * language servers that carry a formatter of their own — the settings they
 * receive at start.
 *
 * Everything about *style* (quotes, semicolons, print width, which rules a
 * project follows) is not here: that is the business of a formatter add-on,
 * which reads the project's own files (`.pureline`, `.prettierrc` …). The
 * core only knows the editor-level choices every language shares, and each
 * language spec states its own conventions (`LanguageSpec.format`).
 */

import { EditorState, Prec, type Extension } from '@codemirror/state';
import { indentUnit } from '@codemirror/language';
import type { FormatOptions } from '../../electron/features/extension-host/contract';
import type { LanguageSpec, LspConfig } from './types';

export interface LanguageFormat {
  tabWidth: number;
  useTabs: boolean;
  endOfLine: 'keep' | 'lf' | 'crlf';
  trimTrailingWhitespace: boolean;
  insertFinalNewline: boolean;
}

export type FormatSettings = Record<string, Partial<LanguageFormat>>;

export const DEFAULT_FORMAT: LanguageFormat = {
  tabWidth: 2,
  useTabs: false,
  endOfLine: 'keep',
  trimTrailingWhitespace: false,
  insertFinalNewline: false,
};

/** What a language spec contributes to its own defaults. */
export type FormatSubject = Pick<LanguageSpec, 'id' | 'indentUnit' | 'format'> | null | undefined;

/** The effective settings of a language: stored values over the language's own conventions over the global defaults. */
export function formatFor(settings: FormatSettings, language: FormatSubject): LanguageFormat {
  const base: LanguageFormat = {
    ...DEFAULT_FORMAT,
    ...(language?.indentUnit ? { tabWidth: language.indentUnit } : {}),
    ...(language?.format ?? {}),
  };
  return { ...base, ...(settings[language?.id ?? ''] ?? {}) };
}

/** Indentation for the editor: overrides the language's own `indentUnit`. */
export function formatExtension(format: LanguageFormat): Extension {
  return Prec.high([
    EditorState.tabSize.of(format.tabWidth),
    indentUnit.of(format.useTabs ? '\t' : ' '.repeat(format.tabWidth)),
  ]);
}

/** Options of `textDocument/formatting`. */
export function lspFormattingOptions(format: LanguageFormat) {
  return {
    tabSize: format.tabWidth,
    insertSpaces: !format.useTabs,
    trimTrailingWhitespace: format.trimTrailingWhitespace,
    insertFinalNewline: format.insertFinalNewline,
    trimFinalNewlines: format.insertFinalNewline,
  };
}

/** What a formatter add-on is told about the editor's choices. */
export function formatOptionsOf(format: LanguageFormat): FormatOptions {
  return {
    tabWidth: format.tabWidth,
    useTabs: format.useTabs,
    endOfLine: format.endOfLine,
    trimTrailingWhitespace: format.trimTrailingWhitespace,
    insertFinalNewline: format.insertFinalNewline,
  };
}

/** What saving does to the text: trailing whitespace, the final newline. Line endings are handled by the caller. */
export function applySaveRules(text: string, format: LanguageFormat): string {
  let out = text;
  if (format.trimTrailingWhitespace) {
    out = out.replace(/[ \t]+$/gm, '');
  }
  if (format.insertFinalNewline && out.length > 0) {
    out = out.replace(/\n*$/, '\n');
  }
  return out;
}

/** Merge (deeply, objects only) `extra` into `base`; `base` wins where both set a value. */
function mergeDeep(base: unknown, extra: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(base && typeof base === 'object' ? base as Record<string, unknown> : {}) };
  for (const [key, value] of Object.entries(extra)) {
    const current = out[key];
    const bothObjects = value && typeof value === 'object' && current && typeof current === 'object';
    out[key] = bothObjects ? mergeDeep(current, value as Record<string, unknown>) : (current ?? value);
  }
  return out;
}

/**
 * A decorator for `lsp.addConfigDecorator`: gives language servers the
 * formatting settings of the editor at start, in the shape each server
 * config asks for (`LspConfig.formatSettings`).
 */
export function createFormatDecorator(read: () => FormatSettings, languageOf: (languageId: string) => FormatSubject) {
  return (config: LspConfig, languageId: string): LspConfig => {
    if (!config.formatSettings) {
      return config;
    }
    const extra = config.formatSettings(formatFor(read(), languageOf(languageId)));
    if (!extra || typeof extra !== 'object') {
      return config;
    }
    // What the server config sets itself wins — the user's choice fills the gaps.
    return { ...config, settings: mergeDeep(config.settings, extra as Record<string, unknown>) };
  };
}
