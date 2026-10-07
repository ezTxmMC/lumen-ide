/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The fallback icons by language. */

import type { IconDef } from '@/core/types';
import { P, B, CONFIG, DATA, LOG, SHELL } from './palette';

/* ------------------------------------------------------------------ *
 * Languages — the fallback when neither the name nor the extension match
 * ------------------------------------------------------------------ */

export const LANGUAGES: Record<string, IconDef> = {
  java: { shape: 'coffee', color: B.java },
  kotlin: { shape: 'kotlin', color: B.kotlin },
  groovy: { glyph: 'Gy', color: '#4298b8' },
  python: { shape: 'python', color: B.python },
  javascript: { glyph: 'JS', color: B.javascript },
  typescript: { glyph: 'TS', color: B.typescript },
  'react-tsx': { shape: 'atom', color: B.react },
  'react-jsx': { shape: 'atom', color: '#a3e3f5' },
  vue: { shape: 'vue', color: B.vue },
  astro: { shape: 'rocket', color: B.astro },
  'angular-html': { shape: 'angular', color: B.angular },
  'angular-ts': { shape: 'angular', color: B.angular },
  html: { shape: 'code-xml', color: B.html },
  css: { shape: 'hash', color: B.css },
  tailwind: { shape: 'tailwind', color: B.tailwind },
  c: { glyph: 'C', color: '#6a7bd1' },
  cpp: { glyph: 'C++', color: '#4f8fd1' },
  csharp: { glyph: 'C#', color: B.csharp },
  go: { glyph: 'Go', color: B.go },
  rust: { shape: 'rust', color: B.rust },
  php: { glyph: 'php', color: B.php },
  crystal: { shape: 'gem', color: '#c8c8c8' },
  novus: { shape: 'lumen', color: '#7c5cff' },
  nvh: { shape: 'lumen', color: '#7c5cff' },
  shell: SHELL,
  sql: DATA,
  json: { shape: 'braces', color: P.yellow },
  yaml: { shape: 'yaml', color: P.rose },
  toml: { shape: 'toml', color: P.brown },
  xml: { shape: 'code-xml', color: P.orange },
  markdown: { shape: 'markdown', color: B.markdown },
  mdx: { shape: 'markdown', color: P.amber },
  properties: CONFIG,
  dockerfile: { shape: 'docker', color: B.docker },
  cmake: { shape: 'cmake', color: B.cmake },
  makefile: { shape: 'hammer', color: P.orange },
  lumenlog: LOG,
};
