/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { CheckDiagnostic, CheckRequest, FileRef, FormatRequest, FormatResult } from '../../../electron/features/extension-host/contract';
import type { AddonSnippet, LanguageSpec } from './language';
import type { ProjectKind, ProjectTemplate } from './project-kinds';
import type { Theme } from './theme';
import type { IconPack } from './icons';

/* ------------------------------------------------------------------ *
 * Befehle
 * ------------------------------------------------------------------ */

export interface Command {
  id: string;
  title: string;
  /** Group in the command palette, such as "File" or "View". */
  category?: string;
  /**
   * Suggested binding, such as `'Ctrl+Shift+P'` or `'Ctrl+K Ctrl+X'`. It
   * applies as long as neither the preset nor the user says otherwise.
   */
  keybinding?: string;
  run: () => void | Promise<void>;
  /** Hide the command when `false`. */
  when?: () => boolean;
  /** `editor`: the shortcut only fires while the editor has focus. */
  scope?: 'editor' | 'global';
}

/* ------------------------------------------------------------------ *
 * Add-on
 * ------------------------------------------------------------------ */

export interface AddonContext {
  /** Message in the status bar, or as a toast. */
  notify(message: string, kind?: 'info' | 'success' | 'warning' | 'error'): void;
  /** A persistent key-value store, one per add-on. */
  storage: {
    get<T>(key: string, fallback: T): T;
    set(key: string, value: unknown): void;
  };
  /** Register later, at runtime — languages generated on the fly, say. */
  registerLanguage(spec: LanguageSpec): void;
  registerTheme(theme: Theme): void;
  registerCommand(command: Command): void;
  registerProjectKind(kind: ProjectKind): void;
  registerProjectTemplate(template: ProjectTemplate): void;
  registerFormatter(formatter: RendererFormatter): void;
  registerChecker(checker: RendererChecker): void;
}

/* ------------------------------------------------------------------ *
 * Formatting and checking
 * ------------------------------------------------------------------ */

/**
 * Formats a document inside the window. The same contract as the main-process
 * `FormatterProvider` extensions register with `ctx.formatters`, minus the
 * filesystem and process access the window does not have.
 *
 * `replace` formatters take over a file and the first that claims it wins
 * (higher `priority` first); the language server formats only when none does.
 * `after` formatters polish whatever came out of that — blank lines between
 * the blocks of a POM, say — and all of them run, in order.
 */
export interface RendererFormatter {
  id: string;
  phase?: 'replace' | 'after';
  priority?: number;
  supports(file: FileRef): boolean;
  /** `null` leaves the document as it is. */
  format(request: FormatRequest): FormatResult | null | Promise<FormatResult | null>;
}

/** Checks a document inside the window; its diagnostics are shown like a language server's. */
export interface RendererChecker {
  id: string;
  supports(file: FileRef): boolean;
  check(request: CheckRequest): CheckDiagnostic[] | Promise<CheckDiagnostic[]>;
}

/** What an add-on is the default for: the first of the active ones to name an existing theme or pack wins. */
export interface AddonDefaults {
  /** Theme id used on a first start and whenever the chosen theme disappears. */
  theme?: string;
  /** Icon pack id, likewise. */
  iconPack?: string;
  /** On from the first start although it is not built in. */
  enabled?: boolean;
}

/**
 * A panel an add-on puts into one of the window's docks — a cheat sheet, a
 * guide, a status page. Markdown or HTML, shown in a sealed frame (no scripts).
 * The user can drag it to any dock; `location` is only where it starts.
 */
export interface AddonPanel {
  id: string;
  title: string;
  /** An icon-pack shape or action icon name (`book-open`, `rocket` …). */
  icon?: string;
  location?: 'left' | 'right' | 'bottom';
  format?: 'markdown' | 'html';
  content: string;
}

export interface Addon {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  /** An emoji, or one to two characters. */
  icon?: string;
  /** Built-in add-ons cannot be switched off. */
  builtin?: boolean;
  /** Made in the Add-on Studio (a file under userData/addons). */
  user?: boolean;
  /** Not listed on its own — the window code of an extension, which belongs to that extension's entry. */
  hidden?: boolean;
  /** Category in the add-on manager. */
  category?: 'language' | 'theme' | 'tool';

  languages?: LanguageSpec[];
  themes?: Theme[];
  /** Icon packs for the explorer, tabs and search lists. */
  iconPacks?: IconPack[];
  /** Snippets for other add-ons' languages — Minecraft snippets for `java`, say. */
  snippets?: AddonSnippet[];
  /** Panels for the docks (left, right, bottom). */
  panels?: AddonPanel[];
  commands?: Command[];
  /** Project kinds the add-on recognises (Maven, CMake, npm …). */
  projectKinds?: ProjectKind[];
  /** Templates for “New project”. */
  projectTemplates?: ProjectTemplate[];
  /** Formatters that run inside the window (see `RendererFormatter`). */
  formatters?: RendererFormatter[];
  /** Checkers that run inside the window; their findings appear as diagnostics. */
  checkers?: RendererChecker[];
  /** Which theme and icon pack the app falls back on — the add-on that ships them says so. */
  defaults?: AddonDefaults;

  /** Runs on activation. Its return value is called on deactivation. */
  activate?(ctx: AddonContext): void | (() => void);
}

