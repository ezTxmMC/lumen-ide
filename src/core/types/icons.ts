/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/* ------------------------------------------------------------------ *
 * Icon packs
 * ------------------------------------------------------------------ */

/**
 * An icon for a file or folder. Drawing order: `path`, then `shape`, then
 * `glyph`. With none of them only the colour counts, as for folder arrows.
 */
export interface IconDef {
  /** Short text, one to three characters, such as `TS`. */
  glyph?: string;
  /** Name from the built-in icon set (`ICON_SHAPE_NAMES`), such as `lock`. */
  shape?: string;
  /** An SVG path (`d`) of your own on a 24×24 grid, stroked as an outline. */
  path?: string;
  /** Hex colour or CSS variable. */
  color?: string;
}

/**
 * An icon pack: which icon a file or folder gets. Lookup runs in this order:
 * exact file name → extension (longest first, `d.ts` before `ts`) → the
 * file's language → that language's icon from its add-on → `file`.
 *
 * All keys are lower case, extensions carry no dot.
 */
export interface IconPack {
  id: string;
  name: string;
  author?: string;
  description?: string;
  fileNames?: Record<string, IconDef>;
  extensions?: Record<string, IconDef>;
  /** Language ids of the add-ons (`java`, `typescript` …). */
  languages?: Record<string, IconDef>;
  folderNames?: Record<string, IconDef>;
  /** Fallback for unknown files. */
  file?: IconDef;
  /** Fallback for folders. */
  folder?: IconDef;
}

