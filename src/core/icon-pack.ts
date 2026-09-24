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
 * Icon packs: finding the icon for a file or folder, and checking loaded and
 * imported packs. No React — the drawing is done by
 * `components/icons/FileIcon.tsx`, and the shapes live in
 * `components/icons/shapes.tsx`.
 */

import { t } from '@/i18n';
import { matchLanguage } from './language';
import type { IconDef, IconPack, LanguageSpec } from './types';

/** Built-in shapes (Lucide) that a pack can select through `shape`. */
export const ICON_SHAPE_NAMES = [
  // Files
  'file', 'file-code', 'file-text', 'file-json', 'file-cog', 'file-lock', 'file-type', 'file-image',
  'file-archive', 'file-audio', 'file-video', 'file-spreadsheet', 'file-terminal', 'file-key', 'file-badge',
  'file-check', 'file-diff', 'file-box', 'files',
  // Folders
  'folder', 'folder-open', 'folder-git', 'folder-cog', 'folder-code', 'folder-kanban', 'folder-tree',
  'folder-archive', 'folder-lock', 'folder-key', 'folder-search', 'folder-dot', 'folder-root',
  'folder-sync', 'folder-clock', 'folder-symlink', 'folder-heart', 'folder-check',
  // Folders with a role (drawn for Lumen)
  'folder-test', 'folder-docs', 'folder-image', 'folder-script', 'folder-component', 'folder-library',
  'folder-api', 'folder-route', 'folder-style', 'folder-public', 'folder-dist', 'folder-package',
  'folder-i18n', 'folder-database', 'folder-model', 'folder-service', 'folder-plugin', 'folder-util',
  'folder-ci', 'folder-docker', 'folder-github', 'folder-editor', 'folder-secure', 'folder-font',
  'folder-media', 'folder-cloud', 'folder-mobile', 'folder-view', 'folder-examples', 'folder-types',
  'folder-temp', 'folder-content', 'folder-mock', 'folder-game', 'folder-android', 'folder-apple',
  'folder-java', 'folder-src',
  // Marks of tools and formats (drawn for Lumen)
  'github', 'gitlab', 'git', 'markdown', 'vue', 'angular', 'svelte', 'graphql', 'tailwind', 'kotlin', 'bun',
  'prisma', 'python', 'rust', 'docker', 'npm', 'yaml', 'toml', 'ruby', 'cmake', 'shell', 'certificate',
  'lumen',
  // Everything else
  'braces', 'code', 'terminal', 'hash', 'type', 'binary', 'component', 'lock', 'key', 'shield-check',
  'fingerprint', 'package', 'boxes', 'box', 'blocks', 'archive', 'container', 'ship', 'anchor', 'settings',
  'cog', 'wrench', 'hammer', 'pickaxe', 'workflow', 'webhook', 'layers', 'git-branch', 'git-merge',
  'book-open', 'book-marked', 'scale', 'receipt', 'languages', 'database', 'table', 'sheet', 'server',
  'cloud', 'globe', 'image', 'palette', 'music', 'video', 'flask', 'test-tube', 'bug', 'eye', 'coffee',
  'leaf', 'gem', 'feather', 'atom', 'zap', 'flame', 'rocket', 'sparkles', 'cpu', 'smartphone', 'gamepad',
  'puzzle', 'link', 'list-tree', 'diamond', 'hexagon', 'triangle', 'circle', 'square', 'star', 'heart',
  'book', 'book-text', 'library', 'notebook', 'notebook-pen', 'scroll', 'newspaper', 'presentation',
  'quote', 'sticky-note', 'notepad', 'brackets', 'regex', 'variable', 'function', 'code-xml',
  'square-terminal', 'command', 'keyboard', 'at-sign', 'asterisk', 'sigma', 'calculator', 'key-round',
  'lock-keyhole', 'shield', 'badge-check', 'user-cog', 'users', 'package-open', 'package-check', 'cylinder',
  'shapes', 'truck', 'factory', 'construction', 'hard-hat', 'ship-wheel', 'settings-2', 'sliders', 'drill',
  'axe', 'shovel', 'wand', 'magnet', 'scissors', 'paperclip', 'pin', 'git-commit', 'git-pull-request',
  'git-fork', 'git-compare', 'git-graph', 'list', 'list-checks', 'list-todo', 'clipboard-list',
  'clipboard-check', 'tag', 'tags', 'bookmark', 'flag', 'server-cog', 'database-zap', 'kanban', 'layout-dashboard',
  'layout-template', 'app-window', 'network', 'plug', 'plug-zap', 'cable', 'route', 'signpost', 'share',
  'rss', 'send', 'mail', 'bell', 'download', 'upload', 'cloud-cog', 'earth', 'map', 'map-pin', 'satellite',
  'radio', 'radar', 'antenna', 'wifi', 'images', 'camera', 'film', 'brush', 'pen-tool', 'qr-code',
  'printer', 'drama', 'monitor', 'laptop', 'hard-drive', 'save', 'circuit-board', 'microchip', 'power',
  'battery-charging', 'test-tubes', 'microscope', 'dna', 'pill', 'heart-pulse', 'bug-play', 'activity',
  'gauge', 'target', 'lightbulb', 'thermometer', 'calendar', 'clock', 'history', 'hourglass', 'timer',
  'bot', 'brain', 'infinity', 'orbit', 'recycle', 'trash', 'message', 'sun', 'moon', 'snowflake', 'droplet',
  'wind', 'waves', 'umbrella', 'rainbow', 'mountain', 'tree-pine', 'trees', 'sprout', 'flower', 'clover',
  'compass', 'bird', 'dog', 'cat', 'fish', 'rabbit', 'turtle', 'bone', 'egg', 'apple', 'cherry', 'citrus',
  'grape', 'carrot', 'candy', 'cake', 'cookie', 'pizza', 'beer', 'chef-hat', 'crown', 'trophy', 'sparkle',
  'plane', 'sailboat', 'dices', 'joystick', 'swords', 'house', 'building', 'landmark', 'castle', 'wallet',
  'coins',
] as const;

export type IconShapeName = (typeof ICON_SHAPE_NAMES)[number];

const SHAPES = new Set<string>(ICON_SHAPE_NAMES);

export function isIconShape(name: string | undefined): name is IconShapeName {
  return Boolean(name && SHAPES.has(name));
}

/** A file's resolved icon: always with text and colour, plus the language. */
export interface ResolvedIcon extends IconDef {
  glyph: string;
  color: string;
  languageName: string | null;
}

const SUBTLE = 'var(--c-text-subtle)';
const MUTED = 'var(--c-text-muted)';

/** `app.d.ts` → `d.ts`, `ts` — every extension, longest first. */
function extensionsOf(name: string): string[] {
  const parts = name.toLowerCase().split('.');
  const out: string[] = [];
  // A leading dot (`.env`) does not separate an extension.
  const start = parts[0] === '' ? 2 : 1;
  for (let i = start; i < parts.length; i++) {
    out.push(parts.slice(i).join('.'));
  }
  return out;
}

function fallbackGlyph(name: string): string {
  const ext = extensionsOf(name).pop();
  if (!ext) {
    return '·';
  }
  return ext.slice(0, 2).toUpperCase();
}

/** Fill the gaps of a found icon from the fallback. */
function complete(def: IconDef, fallback: { glyph: string; color: string; }, languageName: string | null): ResolvedIcon {
  return {
    ...def,
    glyph: def.glyph ?? fallback.glyph,
    color: def.color ?? fallback.color,
    languageName,
  };
}

export function resolveFileIcon(pack: IconPack | null, name: string, languages: LanguageSpec[]): ResolvedIcon {
  const lower = name.toLowerCase();
  const language = matchLanguage(name, languages) ?? null;
  const languageName = language?.name ?? null;
  const fromLanguage = {
    glyph: language?.icon ?? fallbackGlyph(name),
    color: language?.color ?? SUBTLE,
  };

  const byName = pack?.fileNames?.[lower];
  if (byName) {
    return complete(byName, fromLanguage, languageName);
  }

  for (const ext of extensionsOf(name)) {
    const byExt = pack?.extensions?.[ext];
    if (byExt) {
      return complete(byExt, fromLanguage, languageName);
    }
  }

  const byLanguage = language ? pack?.languages?.[language.id] : undefined;
  if (byLanguage) {
    return complete(byLanguage, fromLanguage, languageName);
  }

  if (language) {
    return complete({}, fromLanguage, languageName);
  }
  return complete(pack?.file ?? {}, { glyph: fallbackGlyph(name), color: SUBTLE }, null);
}

/** Which rule of a pack applies to a file name — for the Icon Studio. */
export function explainFileIcon(
  pack: IconPack, name: string, languages: LanguageSpec[],
): { rule: 'fileNames' | 'extensions' | 'languages' | 'language' | 'file'; key: string; } {
  const lower = name.toLowerCase();
  if (pack.fileNames?.[lower]) {
    return { rule: 'fileNames', key: lower };
  }
  const ext = extensionsOf(name).find((candidate) => pack.extensions?.[candidate]);
  if (ext) {
    return { rule: 'extensions', key: ext };
  }
  const language = matchLanguage(name, languages);
  if (language && pack.languages?.[language.id]) {
    return { rule: 'languages', key: language.id };
  }
  if (language) {
    return { rule: 'language', key: language.id };
  }
  return { rule: 'file', key: '' };
}

/** Folders: always a colour, a shape only when the pack supplies one. */
export function resolveFolderIcon(pack: IconPack | null, name: string): IconDef & { color: string; } {
  const def = pack?.folderNames?.[name.toLowerCase()] ?? pack?.folder ?? {};
  return { ...def, color: def.color ?? pack?.folder?.color ?? MUTED };
}

/** Number of mappings — for the cards and the statistics. */
export function iconPackSize(pack: IconPack): number {
  return [pack.fileNames, pack.extensions, pack.languages, pack.folderNames]
    .reduce((sum, map) => sum + Object.keys(map ?? {}).length, 0);
}

/* ------------------------------------------------------------------ *
 * Checking
 * ------------------------------------------------------------------ */

const COLOR = /^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|var\(--[\w-]+\))$/;
/** Path commands and numbers only — no markup that could do something else while drawing. */
const PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]+$/;

export const ICON_MAP_KEYS = ['fileNames', 'extensions', 'languages', 'folderNames'] as const;

/** An icon's problems as readable text; empty means it is fine. */
export function iconDefProblems(def: IconDef, where: string): string[] {
  const out: string[] = [];
  if (!def || typeof def !== 'object') {
    return [t('iconPacks.check.notObject', { where })];
  }
  if (def.glyph !== undefined && (typeof def.glyph !== 'string' || def.glyph.length > 3)) {
    out.push(t('iconPacks.check.glyph', { where }));
  }
  if (def.shape !== undefined && !isIconShape(def.shape)) {
    out.push(t('iconPacks.check.shape', { where, shape: def.shape }));
  }
  if (def.path !== undefined && (typeof def.path !== 'string' || !PATH.test(def.path) || def.path.length > 2000)) {
    out.push(t('iconPacks.check.path', { where }));
  }
  if (def.color !== undefined && (typeof def.color !== 'string' || !COLOR.test(def.color))) {
    out.push(t('iconPacks.check.color', { where, color: def.color }));
  }
  return out;
}

export function iconPackProblems(pack: IconPack): string[] {
  const out: string[] = [];
  if (!pack || typeof pack !== 'object') {
    return [t('iconPacks.check.notObject', { where: '' }).replace(/^: /, '')];
  }
  if (typeof pack.id !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(pack.id)) {
    out.push(t('iconPacks.check.id'));
  }
  if (typeof pack.name !== 'string' || !pack.name.trim()) {
    out.push(t('iconPacks.check.nameMissing'));
  }
  for (const key of ICON_MAP_KEYS) {
    const map = pack[key];
    if (map === undefined) {
      continue;
    }
    if (!map || typeof map !== 'object') {
      out.push(t('iconPacks.check.notObject', { where: key }));
      continue;
    }
    for (const [entry, def] of Object.entries(map)) {
      if (entry !== entry.toLowerCase()) {
        out.push(t('iconPacks.check.lowerKey', { where: `${key}.${entry}` }));
      }
      if (key === 'extensions' && entry.startsWith('.')) {
        out.push(t('iconPacks.check.dotExt', { where: `${key}.${entry}` }));
      }
      out.push(...iconDefProblems(def, `${key}.${entry}`));
    }
  }
  if (pack.file) {
    out.push(...iconDefProblems(pack.file, 'file'));
  }
  if (pack.folder) {
    out.push(...iconDefProblems(pack.folder, 'folder'));
  }
  return out;
}

export function isIconPack(value: unknown): value is IconPack {
  return iconPackProblems(value as IconPack).length === 0;
}

/** A unique id for copies and imports (`name-copy`, `name-copy-2` …). */
export function uniqueIconPackId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const clean = base.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-kopie(-\d+)?$/, '') || 'icons';
  if (!used.has(clean)) {
    return clean;
  }
  let candidate = `${clean}-kopie`;
  let counter = 2;
  while (used.has(candidate)) {
    candidate = `${clean}-kopie-${counter++}`;
  }
  return candidate;
}
