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
 * Relative imports of JavaScript and TypeScript files, retargeted when files
 * are renamed or moved. Pure text and path work — reading and writing files is
 * `lib/import-refactor.ts`.
 *
 * All paths are compared with `/` separators. Imports through aliases
 * (`@/…`) or packages are left alone: only `./` and `../` specifiers follow.
 */

export interface PathMove {
  from: string;
  to: string;
}

/** A specifier in a text: where its characters (without quotes) start and end. */
export interface Specifier {
  start: number;
  end: number;
  value: string;
}

export interface SpecifierEdit {
  start: number;
  end: number;
  text: string;
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.d.ts'];
const JS_TO_TS: Record<string, string[]> = {
  '.js': ['.ts', '.tsx'], '.jsx': ['.tsx'], '.mjs': ['.mts'], '.cjs': ['.cts'],
};

/** Does the file take part in the scan — a file that can hold such imports? */
export const isScriptFile = (path: string) => /\.(?:[cm]?[jt]s|[jt]sx)$/i.test(path);

export const slashed = (path: string) => path.replace(/\\/g, '/');

const dirname = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')));

/** `a/b/../c` → `a/c`. */
export function normalizePath(path: string): string {
  const absolute = path.startsWith('/');
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') {
      continue;
    }
    if (part === '..' && parts.length && parts[parts.length - 1] !== '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return (absolute ? '/' : '') + parts.join('/');
}

/** The path `to` as seen from the folder `fromDir`. */
export function relativePath(fromDir: string, to: string): string {
  const a = normalizePath(fromDir).split('/').filter(Boolean);
  const b = normalizePath(to).split('/').filter(Boolean);
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared] === b[shared]) {
    shared++;
  }
  const up = a.slice(shared).map(() => '..');
  return [...up, ...b.slice(shared)].join('/');
}

/** Where a path ends up after the moves (a folder moves everything inside it). */
export function mapPath(path: string, moves: PathMove[]): string {
  for (const move of moves) {
    if (path === move.from) {
      return move.to;
    }
    if (path.startsWith(`${move.from}/`)) {
      return `${move.to}${path.slice(move.from.length)}`;
    }
  }
  return path;
}

/** The inverse of `mapPath`: where a path was before the moves. */
export function unmapPath(path: string, moves: PathMove[]): string {
  return mapPath(path, moves.map((move) => ({ from: move.to, to: move.from })));
}

const SPECIFIER = /\b(?:from|import|require)\s*\(?\s*(['"])(\.\.?(?:\/[^'"\n]*)?)\1/g;

/** The relative specifiers in a source text: `from './a'`, `import './a'`, `import('./a')`, `require('./a')`. */
export function findSpecifiers(text: string): Specifier[] {
  const found: Specifier[] = [];
  for (const match of text.matchAll(SPECIFIER)) {
    const value = match[2];
    const end = match.index + match[0].length - 1;
    found.push({ start: end - value.length, end, value });
  }
  return found;
}

type Resolution = 'exact' | 'extension' | 'index' | 'js-to-ts';

interface Resolved {
  file: string;
  how: Resolution;
}

/** The file a specifier names, trying what a bundler tries; `exists` is asked about candidates. */
function resolveSpecifier(base: string, exists: (path: string) => boolean): Resolved | null {
  if (exists(base)) {
    return { file: base, how: 'exact' };
  }
  const ext = /\.[cm]?jsx?$/.exec(base)?.[0];
  for (const replacement of ext ? JS_TO_TS[ext] ?? [] : []) {
    const candidate = base.slice(0, -ext!.length) + replacement;
    if (exists(candidate)) {
      return { file: candidate, how: 'js-to-ts' };
    }
  }
  for (const extension of SOURCE_EXTENSIONS) {
    if (exists(base + extension)) {
      return { file: base + extension, how: 'extension' };
    }
  }
  for (const extension of SOURCE_EXTENSIONS) {
    if (exists(`${base}/index${extension}`)) {
      return { file: `${base}/index${extension}`, how: 'index' };
    }
  }
  return null;
}

const stripExtension = (path: string) => path.replace(/\.d\.ts$|\.[^./]+$/, '');

/** The specifier for `target` as seen from `fromDir`, written the way the old one was. */
function writeSpecifier(fromDir: string, target: string, how: Resolution, old: string): string {
  let relative = relativePath(fromDir, target);
  if (how === 'extension') {
    relative = stripExtension(relative);
  }
  if (how === 'index') {
    relative = stripExtension(relative).replace(/\/?index$/, '') || '.';
  }
  if (how === 'js-to-ts') {
    relative = stripExtension(relative) + (/\.[^./]+$/.exec(old)?.[0] ?? '.js');
  }
  const trailing = old.endsWith('/') && !relative.endsWith('/') ? '/' : '';
  if (relative === '.' || relative.startsWith('../') || relative === '..') {
    return relative + trailing;
  }
  return `./${relative}${trailing}`;
}

/**
 * The edits a file needs after the moves: its relative imports that point at
 * a moved file, and — when the file itself moved — all of its relative
 * imports. `file` is where it is now, `exists` answers for the files as they
 * are now (after the moves).
 */
export function retargetImports(text: string, file: string, moves: PathMove[], exists: (path: string) => boolean): SpecifierEdit[] {
  const oldFile = unmapPath(file, moves);
  const oldDir = dirname(oldFile);
  const newDir = dirname(file);
  const edits: SpecifierEdit[] = [];
  for (const specifier of findSpecifiers(text)) {
    const base = normalizePath(`${oldDir}/${specifier.value}`);
    const resolved = resolveSpecifier(base, (candidate) => exists(mapPath(candidate, moves)));
    if (!resolved) {
      continue;
    }
    const target = mapPath(resolved.file, moves);
    const next = writeSpecifier(newDir, target, resolved.how, specifier.value);
    if (next === specifier.value) {
      continue;
    }
    edits.push({ start: specifier.start, end: specifier.end, text: next });
  }
  return edits;
}
