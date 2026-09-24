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
 * File and folder icons as the default “Lumen” icon pack draws them
 * (src/addons/builtin/icons.ts, drawn by components/icons/FileIcon.tsx) —
 * the part of it the shots need.
 */

import {
  Atom, BookOpen, Boxes, Braces, Cog, Component, Container, File, Folder, FolderCode, FolderCog, FolderOpen, GitBranch,
  Hammer, Image, Languages, Lock, Package, Palette, Puzzle, Scale, Settings, Terminal, Zap, type LucideIcon,
} from 'lucide-react';

export interface IconDef {
  glyph?: string;
  shape?: LucideIcon;
  color?: string;
}

const SUBTLE = 'var(--c-text-subtle)';
const MUTED = 'var(--c-text-muted)';

const FILE_NAMES: Record<string, IconDef> = {
  'package.json': { shape: Package, color: '#cb3837' },
  'package-lock.json': { shape: Lock, color: '#cb3837' },
  'bun.lock': { shape: Lock, color: '#d9a86c' },
  'tsconfig.json': { shape: Settings, color: '#3178c6' },
  'vite.config.ts': { shape: Zap, color: '#bd34fe' },
  'readme.md': { shape: BookOpen, color: '#519aba' },
  license: { shape: Scale, color: '#d4b106' },
  '.gitignore': { shape: GitBranch, color: '#f05032' },
  'cargo.toml': { shape: Package, color: '#dea584' },
  'cargo.lock': { shape: Lock, color: '#dea584' },
  dockerfile: { shape: Container, color: '#2496ed' },
  makefile: { shape: Hammer, color: '#e37933' },
};

const EXTENSIONS: Record<string, IconDef> = {
  ts: { glyph: 'TS', color: '#3178c6' },
  mts: { glyph: 'TS', color: '#3178c6' },
  tsx: { shape: Atom, color: '#61dafb' },
  js: { glyph: 'JS', color: '#f7df1e' },
  mjs: { glyph: 'JS', color: '#f7df1e' },
  json: { shape: Braces, color: '#f5c518' },
  md: { glyph: 'M↓', color: '#519aba' },
  css: { glyph: '#', color: '#2965f1' },
  html: { glyph: '<>', color: '#e34c26' },
  yml: { glyph: 'YM', color: '#cb171e' },
  yaml: { glyph: 'YM', color: '#cb171e' },
  rs: { shape: Cog, color: '#dea584' },
  go: { glyph: 'Go', color: '#00add8' },
  py: { glyph: 'Py', color: '#4b8bbe' },
  sh: { shape: Terminal, color: '#89e051' },
  svg: { shape: Image, color: '#ffb13b' },
  png: { shape: Image, color: '#a78bfa' },
};

const FOLDER_NAMES: Record<string, IconDef> = {
  src: { shape: FolderCode, color: '#7c8cff' },
  lib: { shape: FolderCode, color: '#7c8cff' },
  components: { shape: Component, color: '#61dafb' },
  i18n: { shape: Languages, color: '#38bdf8' },
  themes: { shape: Palette, color: '#2965f1' },
  scripts: { shape: Terminal, color: '#f472b6' },
  public: { shape: Image, color: '#fbbf24' },
  config: { shape: FolderCog, color: '#f472b6' },
  extensions: { shape: Puzzle, color: '#f0b429' },
  addons: { shape: Puzzle, color: '#f0b429' },
  node_modules: { shape: Package, color: '#8b5a5a' },
  packages: { shape: Boxes, color: '#b48ead' },
};

/** `app.d.ts` → `d.ts`, `ts` — longest first, as core/icon-pack.ts does. */
function extensionsOf(name: string) {
  const parts = name.toLowerCase().split('.');
  const start = parts[0] === '' ? 2 : 1;
  const out: string[] = [];
  for (let i = start; i < parts.length; i++) {
    out.push(parts.slice(i).join('.'));
  }
  return out;
}

export function fileIcon(name: string): IconDef {
  const byName = FILE_NAMES[name.toLowerCase()];
  if (byName) {
    return byName;
  }
  for (const ext of extensionsOf(name)) {
    const byExt = EXTENSIONS[ext];
    if (byExt) {
      return byExt;
    }
  }
  return { shape: File, color: SUBTLE };
}

export function folderIcon(name: string, open: boolean): IconDef {
  const def = FOLDER_NAMES[name.toLowerCase()] ?? { shape: Folder, color: MUTED };
  if (open && def.shape === Folder) {
    return { ...def, shape: FolderOpen };
  }
  return def;
}

/** Longer glyphs shrink, so they fit the column. */
function glyphSize(glyph: string, size: number) {
  if (glyph.length >= 3) {
    return size * 0.58;
  }
  return size * 0.73;
}

/** One icon, as `IconGlyph` in the app draws it. */
export function IconGlyph({ icon, size = 13 }: { icon: IconDef; size?: number; }) {
  const color = icon.color ?? 'currentColor';
  if (icon.shape) {
    const Shape = icon.shape;
    return <Shape size={size} color={color} strokeWidth={2} className="shrink-0" aria-hidden />;
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center font-mono font-bold leading-none"
      style={{ color, width: size + 2, fontSize: glyphSize(icon.glyph ?? '', size) }}
    >
      {icon.glyph || '·'}
    </span>
  );
}
