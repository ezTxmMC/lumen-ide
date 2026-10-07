/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The palette, the brand colours and the icons shared by the maps of the bundled packs. */

import type { IconDef } from '@/core/types';

/** Several keys sharing one icon. */
export function same(keys: string[], def: IconDef): Record<string, IconDef> {
  return Object.fromEntries(keys.map((key) => [key, def]));
}

/** `name.config.js`, `name.config.ts` … — every script flavour of a config file. */
export function configFiles(base: string, def: IconDef, extensions = ['js', 'mjs', 'cjs', 'ts', 'mts', 'cts', 'json']): Record<string, IconDef> {
  return same(extensions.map((ext) => `${base}.${ext}`), def);
}

export const MUTED = 'var(--c-text-muted)';
export const SUBTLE = 'var(--c-text-subtle)';

/**
 * The palette for roles — tuned to read on dark and light backgrounds alike,
 * with similar lightness so no role shouts over another.
 */
export const P = {
  red: '#ef6b73',
  orange: '#f59a5c',
  amber: '#f2b544',
  yellow: '#e3c94c',
  lime: '#a3cf5f',
  green: '#4fc98a',
  teal: '#33bfae',
  cyan: '#45c1de',
  sky: '#5aaaf0',
  blue: '#5b8def',
  indigo: '#7c8cff',
  violet: '#a48bf5',
  purple: '#c67ae0',
  pink: '#ef7fbd',
  rose: '#f2708f',
  brown: '#c69568',
  gray: '#9aa3b0',
  slate: '#7f8a99',
} as const;

/** Brand colours, for tools recognised by them. */
export const B = {
  java: '#e76f00',
  kotlin: '#a97bff',
  typescript: '#3178c6',
  javascript: '#f0db4f',
  python: '#4b8bbe',
  rust: '#dea584',
  go: '#00add8',
  npm: '#cb3837',
  pnpm: '#f69220',
  yarn: '#2c8ebb',
  bun: '#e8c8a0',
  deno: '#70ffaf',
  gradle: '#4fb4c8',
  maven: '#c71a36',
  docker: '#2496ed',
  git: '#f05032',
  react: '#61dafb',
  vue: '#42b883',
  angular: '#dd0031',
  svelte: '#ff3e00',
  astro: '#ff5d01',
  tailwind: '#38bdf8',
  vite: '#bd34fe',
  node: '#5fa04e',
  dotnet: '#8c6cf0',
  csharp: '#9b4f96',
  php: '#8892bf',
  ruby: '#cc342d',
  cmake: '#3e8ed0',
  html: '#e34c26',
  css: '#3d8fe6',
  sass: '#cd6799',
  markdown: '#519aba',
  github: MUTED,
  gitlab: '#fc6d26',
} as const;

/* ------------------------------------------------------------------ *
 * Shared icons
 * ------------------------------------------------------------------ */

export const TEST: IconDef = { shape: 'flask', color: P.green };
export const SPEC: IconDef = { shape: 'test-tube', color: P.teal };
export const IMAGE: IconDef = { shape: 'file-image', color: P.violet };
export const VECTOR: IconDef = { shape: 'pen-tool', color: P.amber };
export const AUDIO: IconDef = { shape: 'file-audio', color: P.pink };
export const VIDEO: IconDef = { shape: 'file-video', color: P.rose };
export const FONT: IconDef = { shape: 'type', color: P.red };
export const ARCHIVE: IconDef = { shape: 'file-archive', color: P.brown };
export const LOCK: IconDef = { shape: 'lock', color: P.gray };
export const SHEET: IconDef = { shape: 'file-spreadsheet', color: P.green };
export const BINARY: IconDef = { shape: 'binary', color: P.slate };
export const CONFIG: IconDef = { shape: 'settings', color: P.gray };
export const KEY: IconDef = { shape: 'key-round', color: P.amber };
export const ENV: IconDef = { shape: 'file-key', color: P.yellow };
export const CERT: IconDef = { shape: 'certificate', color: P.amber };
export const DATA: IconDef = { shape: 'database', color: P.amber };
export const LOG: IconDef = { shape: 'scroll', color: P.slate };
export const TEXT: IconDef = { shape: 'file-text', color: MUTED };
export const SHELL: IconDef = { shape: 'shell', color: P.lime };
export const DIFF: IconDef = { shape: 'file-diff', color: P.orange };
export const NOTEBOOK: IconDef = { shape: 'notebook-pen', color: '#f37726' };
export const DOCUMENT: IconDef = { shape: 'file-text', color: P.blue };
export const SLIDES: IconDef = { shape: 'presentation', color: P.orange };
export const MODEL3D: IconDef = { shape: 'box', color: P.teal };
export const TEMPLATE: IconDef = { shape: 'layout-template', color: P.teal };
export const LINT: IconDef = { shape: 'shield-check', color: P.violet };
export const FORMAT: IconDef = { shape: 'sparkles', color: P.amber };
export const CI: IconDef = { shape: 'workflow', color: P.orange };
export const DEPLOY: IconDef = { shape: 'rocket', color: P.sky };
