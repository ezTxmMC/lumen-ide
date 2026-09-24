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
 * Reports source comments that are still written in German.
 *
 * The documentation is English throughout; this check fails as soon as German
 * reappears anywhere. A file may be parked in `scripts/docs-pending.txt` while
 * it is being rewritten — that file no longer exists, and a new one should not
 * be needed.
 *
 * Comment lines are inspected everywhere. Developer text — thrown errors and
 * script output — is inspected outside `EXEMPT`. Translated user-facing strings
 * are content, not documentation, and German there is the point.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOTS = ['src', 'electron', 'scripts', 'extension-server', 'extensions'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'data', '.cache']);
const EXTENSIONS = new Set(['.ts', '.tsx', '.mjs', '.js']);

/**
 * Words that mark a line as German without appearing in ordinary English.
 *
 * Deliberately excludes words the two languages share (`in`, `war`, `also`,
 * `man`, `die` inside identifiers) — a false positive would send someone
 * rewriting a line that is already fine.
 */
const GERMAN_WORDS = [
  'aber', 'alle', 'allein', 'als', 'andere', 'auch', 'auf', 'aus', 'außer', 'beim', 'bereits',
  'bis', 'dabei', 'damit', 'dann', 'darin', 'das', 'dass', 'dem', 'denn', 'der', 'des',
  'deshalb', 'dieser', 'diese', 'dieses', 'doch', 'dort', 'durch', 'eigene', 'eigenen', 'ein',
  'eine', 'einen', 'einer', 'eines', 'erst', 'erste', 'etwa', 'für', 'ganz', 'gar',
  'gegen', 'geht', 'gibt', 'hier', 'ihre', 'immer', 'ist', 'jede', 'jeden', 'jeder', 'kann',
  'kein', 'keine', 'lässt', 'macht', 'mehr', 'mit', 'muss', 'nach', 'nicht', 'nichts', 'noch',
  'nur', 'ober', 'oder', 'ohne', 'schon', 'sein', 'seine', 'sich', 'sind', 'soll', 'sonst',
  'statt', 'steht', 'über', 'und', 'uns', 'unter', 'vom', 'von', 'vor', 'weil', 'weiter',
  'welche', 'wenn', 'werden', 'wird', 'wie', 'wieder', 'wird', 'wo', 'zum', 'zur', 'zwei',
  'zwischen',
];

const GERMAN = new RegExp(`(?:^|[^\\p{L}])(?:${GERMAN_WORDS.join('|')})(?:[^\\p{L}]|$)`, 'iu');
/**
 * An umlaut counts as German only inside a word of at least three letters.
 *
 * Key names and single characters get documented too — `Ö` on a German
 * keyboard, `ß` in a list of characters — and those are not German prose.
 */
const UMLAUT = /\p{L}*[äöüßÄÖÜ]\p{L}*/u;

/** Files parked while they are rewritten; the list is normally absent. */
const PENDING = new Set<string>(
  fs.existsSync('scripts/docs-pending.txt')
    ? fs.readFileSync('scripts/docs-pending.txt', 'utf8').split('\n').map((line) => line.trim()).filter(Boolean)
    : [],
);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Lines that speak to a developer rather than to a user.
 *
 * Thrown errors and console output are not documentation, but they are read by
 * the same people, so they follow the same rule. Translated interface strings
 * are exempt: German under `src/i18n/messages/` is the whole point, and so is
 * the German text that project templates write into new projects.
 */
const DEVELOPER_TEXT = /(?:throw new Error|console\.(?:log|warn|error)|process\.std(?:out|err)\.write)\(/;

const EXEMPT = [
  // Interface translations — German there is content, not documentation.
  'src/i18n/',
  // Snippets and project templates generate text for the user's own project.
  'src/addons/',
];

/** Comment lines of a file, with their line numbers. */
function commentLines(source: string): { line: number; text: string; }[] {
  const out: { line: number; text: string; }[] = [];
  source.split('\n').forEach((raw, index) => {
    const text = raw.trim();
    if (!/^(\/\/|\/\*|\*)/.test(text)) {
      return;
    }
    out.push({ line: index + 1, text });
  });
  return out;
}

function isGerman(text: string): boolean {
  // A German word, or an umlaut inside a real word; both are rare in English.
  const umlautWord = UMLAUT.exec(text)?.[0] ?? '';
  return umlautWord.length >= 3 || GERMAN.test(text);
}

function main() {
  const files = ROOTS.filter((root) => fs.existsSync(root)).flatMap((root) => walk(root));
  const offenders: { file: string; hits: { line: number; text: string; }[]; }[] = [];

  for (const file of files.sort()) {
    const source = fs.readFileSync(file, 'utf8');
    const hits = commentLines(source).filter((entry) => isGerman(entry.text));
    if (!EXEMPT.some((prefix) => file.startsWith(prefix))) {
      source.split('\n').forEach((raw, index) => {
        if (!DEVELOPER_TEXT.test(raw) || !isGerman(raw)) {
          return;
        }
        hits.push({ line: index + 1, text: raw.trim() });
      });
    }
    if (hits.length) {
      offenders.push({ file, hits: hits.sort((a, b) => a.line - b.line) });
    }
  }

  const done = offenders.filter((entry) => !PENDING.has(entry.file));
  const waiting = offenders.filter((entry) => PENDING.has(entry.file));
  const converted = files.length - offenders.length;

  for (const entry of done) {
    process.stdout.write(`✗ ${entry.file} — ${entry.hits.length} German comment line(s)\n`);
    for (const hit of entry.hits.slice(0, 3)) {
      process.stdout.write(`    ${hit.line}: ${hit.text.slice(0, 96)}\n`);
    }
  }

  // A file listed as pending but already clean means the list is stale.
  const stale = [...PENDING].filter((file) => !offenders.some((entry) => entry.file === file));
  for (const file of stale) {
    process.stdout.write(`! ${file} is clean — remove it from scripts/docs-pending.txt\n`);
  }

  const remaining = waiting.reduce((sum, entry) => sum + entry.hits.length, 0);
  process.stdout.write(
    `\n${files.length} files — ${converted} English, ${waiting.length} pending (${remaining} lines), `
    + `${done.length} regressed\n`,
  );
  if (done.length || stale.length) {
    process.exit(1);
  }
}

main();
