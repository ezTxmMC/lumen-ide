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
 * The bundled icon packs.
 *
 * “Lumen” (the default): every language, format and tool gets a shape or a
 * short mark in a coherent palette — brand colours where a tool is known by
 * its colour, the palette for everything that has a role rather than a
 * brand. Folders with a role (sources, tests, docs, assets, config …) carry an
 * emblem inside the folder outline.
 * “Lumen Monochrome”: the same coverage and the same shapes, drawn in one
 * neutral tone that follows the theme.
 * “Lumen Classic”: the abbreviations and colours of the language add-ons alone,
 * folders as tinted arrows.
 */

import type { Addon, IconDef, IconPack } from '@/core/types';
import { t } from '@/i18n';
import { MUTED, SUBTLE, same } from './palette';
import { LANGUAGES } from './languages';
import { EXTENSIONS } from './extensions';
import { FILE_NAMES } from './file-names';
import { FOLDER_NAMES } from './folder-names';

/* ------------------------------------------------------------------ *
 * The packs
 * ------------------------------------------------------------------ */

export const lumenIconPack: IconPack = {
  id: 'lumen-icons',
  name: 'Lumen',
  author: 'Lumen',
  description: 'iconPacks.packs.lumen',
  languages: LANGUAGES,
  extensions: EXTENSIONS,
  fileNames: FILE_NAMES,
  folderNames: FOLDER_NAMES,
  file: { shape: 'file', color: SUBTLE },
  folder: { shape: 'folder', color: MUTED },
};

/** Every colour of a map replaced by one tone. */
function tone(map: Record<string, IconDef>, color: string): Record<string, IconDef> {
  return Object.fromEntries(Object.entries(map).map(([key, def]) => [key, { ...def, color }]));
}

/**
 * The Lumen pack in one colour. Files take the muted text tone, folders the
 * subtler one, so the tree still reads as files within folders.
 */
export const monoIconPack: IconPack = {
  id: 'lumen-mono',
  name: 'Lumen Monochrome',
  author: 'Lumen',
  description: 'iconPacks.packs.mono',
  languages: tone(LANGUAGES, MUTED),
  extensions: tone(EXTENSIONS, MUTED),
  fileNames: tone(FILE_NAMES, MUTED),
  folderNames: tone(FOLDER_NAMES, SUBTLE),
  file: { shape: 'file', color: SUBTLE },
  folder: { shape: 'folder', color: SUBTLE },
};

export const classicIconPack: IconPack = {
  id: 'lumen-classic',
  name: 'Lumen Classic',
  author: 'Lumen',
  description: 'iconPacks.packs.classic',
  folderNames: {
    ...same(['src', 'lib', 'app'], { color: '#7c8cff' }),
    ...same(['test', 'tests', 'spec'], { color: '#4ade80' }),
    ...same(['docs', 'doc'], { color: '#38bdf8' }),
    ...same(['assets', 'public', 'static', 'images'], { color: '#fbbf24' }),
    ...same(['config', 'scripts'], { color: '#f472b6' }),
  },
};

export const iconsAddon: Addon = {
  id: 'icons.lumen',
  name: 'Lumen Icons',
  version: '2.0.0',
  get description() {
    return t('addons.icons');
  },
  icon: '◈',
  builtin: true,
  category: 'theme',
  iconPacks: [lumenIconPack, monoIconPack, classicIconPack],
  defaults: { iconPack: lumenIconPack.id },
};
