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
 * What the shots show: Lumen open on its own source, at src/core/icon-pack.ts.
 * The file is a verbatim copy, so the code and the minimap are the real thing.
 */

import source from './samples/icon-pack.ts.txt?raw';
import { tokenize, type Line } from './tokenize';

export interface TreeRow {
  name: string;
  depth: number;
  folder?: boolean;
  open?: boolean;
  selected?: boolean;
}

export interface TabSpec {
  name: string;
  active?: boolean;
  dirty?: boolean;
}

export interface Scene {
  workspace: string;
  kind: { name: string; color: string; };
  tree: TreeRow[];
  tabs: TabSpec[];
  lines: Line[];
  /** The first line in view (1-based) — the editor is scrolled down to it. */
  firstLine: number;
  cursor: { line: number; column: number; };
  language: { name: string; color: string; indent: number; };
  server: string;
  /** The symbol path at the cursor, as the status bar shows it. */
  breadcrumb: { glyph: string; tone: 'type' | 'function' | 'keyword' | 'variable'; name: string; }[];
  addons: number;
}

const folder = (name: string, depth: number, open = false): TreeRow => ({ name, depth, folder: true, open });
const file = (name: string, depth: number, selected = false): TreeRow => ({ name, depth, selected });

export const lumenScene: Scene = {
  workspace: 'lumen-ide',
  kind: { name: 'Node.js', color: '#cb3837' },
  tree: [
    folder('electron', 0),
    folder('extensions', 0),
    folder('scripts', 0),
    folder('src', 0, true),
    folder('addons', 1),
    folder('components', 1),
    folder('core', 1, true),
    folder('extensions', 2),
    folder('lsp', 2),
    folder('project', 2),
    file('commands.ts', 2),
    file('icon-pack.ts', 2, true),
    file('keybindings.ts', 2),
    file('language.ts', 2),
    file('registry.ts', 2),
    file('theme.ts', 2),
    file('types.ts', 2),
    folder('i18n', 1),
    folder('lib', 1),
    folder('state', 1),
    file('App.tsx', 1),
    file('main.tsx', 1),
    file('.gitignore', 0),
    file('index.html', 0),
    file('LICENSE', 0),
    file('package.json', 0),
    file('README.md', 0),
    file('tsconfig.json', 0),
    file('vite.config.ts', 0),
  ],
  tabs: [
    { name: 'icon-pack.ts', active: true },
    { name: 'FileIcon.tsx' },
    { name: 'store.ts', dirty: true },
    { name: 'package.json' },
  ],
  lines: tokenize(source.replace(/\n$/, '')),
  firstLine: 46,
  cursor: { line: 75, column: 38 },
  language: { name: 'TypeScript', color: '#3178c6', indent: 2 },
  server: 'typescript-language-server',
  breadcrumb: [{ glyph: 'ƒ', tone: 'function', name: 'resolveFileIcon' }],
  addons: 24,
};
