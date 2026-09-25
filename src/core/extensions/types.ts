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
 * Data model of extensions fetched from a server.
 *
 * An extension is a user add-on (`UserAddonModel` — the same format the
 * Add-on Studio writes) plus what only a server adds: where it came from, its
 * settings and its own pages.
 *
 * Deliberately no program code. What a server delivers is read and
 * interpreted, never executed; the graph interpreter of user add-ons stays the
 * only place anything runs. A hostile extension can therefore ship a wrong
 * language definition or an ugly page, but it cannot reach files, the network
 * or a shell except through an interpreter node that already allows it.
 */

import type { UserAddonModel } from '@/core/user-addons/schema';
import type { AgentModel } from '../../../electron/features/extension-host/contract';

/** Version of the manifest format Lumen understands. */
export const EXTENSION_SCHEMA = 1;

/**
 * Ids of server add-ons: `addon.` from the official catalogue, `user.` from users who publish their Studio add-ons.
 * `ext.` is the old prefix of the catalogue — still accepted, but deprecated.
 */
export const EXTENSION_ID_PATTERN = /^(?:addon|ext|user)\.[a-z0-9][a-z0-9._-]{0,63}$/;

/** Whether an id still uses the deprecated `ext.` prefix. */
export const isDeprecatedId = (id: string) => id.startsWith('ext.');

/** The one server Lumen installs from without asking. */
export const OFFICIAL_HOST = 'lumen-extensions.eztxm.de';

export const OFFICIAL_SERVER_URL = `https://${OFFICIAL_HOST}`;

/**
 * The kinds of setting:
 *   text · number (min/max/step) · toggle · select (choices) · textarea (rows)
 *   path (a file or folder chooser, `pathKind`) · color · secret (a token or
 *   key — encrypted in the main process, never in the settings file)
 *   multiselect (several of the choices, stored comma-separated) · list (free
 *   entries such as paths or arguments, stored one per line)
 */
export type ExtensionSettingType = 'text' | 'number' | 'toggle' | 'select' | 'multiselect' | 'list' | 'textarea' | 'path' | 'color' | 'secret';

/** A setting that shows up under *Settings → Extensions*. */
export interface ExtensionSetting {
  key: string;
  label: string;
  type?: ExtensionSettingType;
  default?: string;
  hint?: string;
  placeholder?: string;
  choices?: { value: string; label: string; }[];
  /** Settings with the same section are grouped under that heading. */
  section?: string;
  min?: number;
  max?: number;
  step?: number;
  /** For `textarea`: the height in lines. */
  rows?: number;
  /** For `path`: what the chooser picks. Defaults to `file`. */
  pathKind?: 'file' | 'folder';
  /** Show the setting only while another toggle is on (`"key"`) or a setting has a value (`"key=value"`). */
  when?: string;
  /** Texts in other interface languages, by language (`en`, `fr` …); missing ones fall back to the fields above. */
  i18n?: Record<string, ExtensionSettingTexts>;
}

/** The translatable texts of a setting; `choices` maps a choice's value to its label. */
export interface ExtensionSettingTexts {
  label?: string;
  hint?: string;
  placeholder?: string;
  section?: string;
  choices?: Record<string, string>;
}

export type ExtensionPageFormat = 'markdown' | 'html';
/** `sidebar` is the old name of `left`. */
export type ExtensionPageLocation = 'sidebar' | 'left' | 'right' | 'bottom' | 'editor';

/** A dock of the window a view can go to. */
export type ExtensionViewLocation = 'left' | 'right' | 'bottom';

/**
 * A view whose content the extension's code provides (`ctx.views.register`) —
 * a Git panel, a list of pull requests. Where it appears is only its default:
 * the user can drag it to any dock. `editor` views are not docked: the code
 * opens them as tabs in the editor area (`ctx.views.open`), one per instance.
 */
export interface ExtensionView {
  id: string;
  title: string;
  /** A lucide icon name (`git-branch`) or an icon-pack shape (`github`). */
  icon?: string;
  location?: ExtensionViewLocation | 'editor';
  /** Order within the dock; lower comes first. */
  order?: number;
  /** `title` in other interface languages, by language. */
  i18n?: Record<string, { title?: string; }>;
}

/**
 * Files the extension can open (“Open with …”): a command of its own gets
 * `{ path }` when the user picks it for a file matching one of the patterns
 * (`*.db`, `*.mv.db` — a `*` prefix and a suffix; case does not matter).
 */
export interface ExtensionOpenWith {
  command: string;
  title: string;
  patterns: string[];
  /** `title` in other interface languages, by language. */
  i18n?: Record<string, { title?: string; }>;
}

/** A command the extension's code handles (`ctx.commands.register`). */
export interface ExtensionCommand {
  id: string;
  title: string;
  category?: string;
  keybinding?: string;
  icon?: string;
  /** `title` and `category` in other interface languages, by language. */
  i18n?: Record<string, { title?: string; category?: string; }>;
}

/** A page the extension contributes to Lumen. */
export interface ExtensionPage {
  id: string;
  title: string;
  icon?: string;
  location?: ExtensionPageLocation;
  format?: ExtensionPageFormat;
  content: string;
}

/** A way of talking to an agent: how the panel offers it and when it asks. */
export interface ExtensionAgentMode {
  id: string;
  label: string;
  description?: string;
}

/**
 * A chat agent the extension's code registers.
 *
 * This describes only how the panel looks. What the agent does is in the
 * extension's code, which Lumen runs once the user has approved it.
 */
export interface ExtensionAgent {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  placeholder?: string;
  /** The first one is the default. */
  modes?: ExtensionAgentMode[];
  /** Models the panel offers besides those the agent's code reports; `efforts` are the levels each understands. */
  models?: AgentModel[];
  /** The extension setting holding the default model (`model`). */
  modelSetting?: string;
  /** Where the chat goes by default. Defaults to `right`. */
  location?: ExtensionViewLocation;
  /** Ready-made prompts shown in an empty chat. */
  suggestions?: string[];
  /** Can the agent take images (pasted screenshots)? */
  images?: boolean;
}

/**
 * Program code — at least one of the two parts.
 *
 * `main` is a bundled ES module for Lumen's main process (`activate(ctx)`).
 * `renderer` is one for the window: it exports `addon(lumen)`, which returns
 * an add-on like the built-in ones — project templates and kinds whose files
 * are computed, snippets, commands (`src/core/extensions/renderer-code.ts`).
 */
export interface ExtensionCode {
  main?: string;
  renderer?: string;
}

/** The full manifest, as a server delivers it. */
/** An SDK an extension needs — Lumen offers to download it when it is missing. */
export interface ExtensionRequirement {
  /** `java`, `node`, `python` … the ids of the SDK settings. */
  sdk: string;
  /** The oldest version that works (`17`, `3.9`). */
  version?: string;
  /** Why — shown next to the SDK. */
  reason?: string;
}

export interface ExtensionManifest {
  schema: number;
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  icon?: string;
  color?: string;
  category?: 'language' | 'theme' | 'tool';
  keywords?: string[];
  license?: string;
  homepage?: string;
  repository?: string;
  minAppVersion?: string;
  readme?: string;
  settings?: ExtensionSetting[];
  pages?: ExtensionPage[];
  agents?: ExtensionAgent[];
  views?: ExtensionView[];
  commands?: ExtensionCommand[];
  openWith?: ExtensionOpenWith[];
  requires?: ExtensionRequirement[];
  /** Not kept in the installed record — the code lives in its own file. */
  code?: ExtensionCode;
  addon: UserAddonModel;
}

/** One entry in the catalogue — without the add-on itself. */
export interface ExtensionSummary {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  icon?: string;
  color?: string;
  category?: 'language' | 'theme' | 'tool';
  keywords?: string[];
  license?: string;
  homepage?: string;
  repository?: string;
  minAppVersion?: string;
  provides?: Record<string, number>;
  versions?: string[];
/** A newer prerelease, when there is one. */
  preview?: string;
  publishedAt?: string;
  updatedAt?: string;
}

/** A server someone has added. */
export interface ExtensionServer {
  /** Root address, with no trailing slash. */
  url: string;
  /** Display name, as reported by the server. */
  name?: string;
  /** Marked trusted by the user; the official one always is. */
  trusted?: boolean;
  /** Skip fetching without losing the entry. */
  disabled?: boolean;
}

/** What Lumen remembers about an installed extension. */
export interface InstalledExtension {
  manifest: ExtensionManifest;
  /** Server it came from. */
  server: string;
  installedAt: number;
  /** SHA-256 of the program code the user approved; without it nothing runs. */
  codeHash?: string;
}

/** A server's catalogue response. */
export interface ExtensionIndex {
  schema: number;
  server?: { name?: string; url?: string; };
  updatedAt?: string;
  extensions: ExtensionSummary[];
}
