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
 * The context before the cursor: does a character open the list, and does the
 * word sit behind a member access? No DOM — tested in `check-completion`.
 */

/** Never count as a trigger — do not pop up after whitespace or operators. */
const NEVER_TRIGGER = new Set([' ', '\t', '(', ')', ',', ';', '=', '{', '}', '[', ']', '+', '*', '&', '|', '!', '?', '%', '^', '~']);

/** Ambiguous triggers need the right lead-in. */
const TRIGGER_RULES: Record<string, (before: string) => boolean> = {
  ':': (s) => s.endsWith('::'),
  '>': (s) => s.endsWith('->'),
  '-': () => false,
  '<': (s) => /(^\s*#\s*include\s*|^\s*|[\p{L}\p{N}_$>])<$/u.test(s),
  '/': (s) => !s.endsWith('//') && /["'<`][^"'<>`]*\/$/.test(s),
  '.': (s) => !/(^|[^\p{L}\p{N}_$])\d+\.$/u.test(s) && !s.endsWith('..'),
};

export function triggerBefore(before: string, triggers: readonly string[]): string | null {
  const ch = before.slice(-1);
  if (!ch || NEVER_TRIGGER.has(ch) || !triggers.includes(ch)) {
    return null;
  }
  const rule = TRIGGER_RULES[ch];
  if (rule && !rule(before)) {
    return null;
  }
  return ch;
}

export function isMemberAccess(before: string): boolean {
  if (before.endsWith('..')) {
    return false;
  }
  if (/(^|[^\p{L}\p{N}_$])\d+\.$/u.test(before)) {
    return false;
  }
  return /(\.|->|::)$/.test(before);
}

/** Kind of place a suggestion is chosen at — keys recency and decides which lead-ins pop the list up. */
export type ContextKind = 'member' | 'new' | 'import' | 'annotation' | 'extends' | 'throws' | 'statement' | 'expression';

/** Lead-ins after which the list opens by itself, even with nothing typed yet. */
const LEAD_INS: [RegExp, ContextKind][] = [
  [/(^|[^\p{L}\p{N}_$])new\s+$/u, 'new'],
  [/(^|[^\p{L}\p{N}_$])import\s+(static\s+)?$/u, 'import'],
  [/(^|[^\p{L}\p{N}_$.])@$/u, 'annotation'],
  [/(^|[^\p{L}\p{N}_$])(extends|implements)\s+$/u, 'extends'],
  [/(^|[^\p{L}\p{N}_$])throws\s+$/u, 'throws'],
];

/** The lead-in right before the cursor (`new `, `import static `, `@` …), if any. */
export function leadInBefore(before: string): ContextKind | null {
  for (const [pattern, kind] of LEAD_INS) {
    if (pattern.test(before)) {
      return kind;
    }
  }
  return null;
}

/** The kind of context for a word starting after `lineBefore`. */
export function contextKind(lineBefore: string): ContextKind {
  if (isMemberAccess(lineBefore)) {
    return 'member';
  }
  const leadIn = leadInBefore(lineBefore);
  if (leadIn) {
    return leadIn;
  }
  return lineBefore.trim() === '' ? 'statement' : 'expression';
}

/** Contexts where a type name is expected: the server's list is trusted, plain words are not. */
export function isTypedContext(kind: ContextKind): boolean {
  return kind === 'member' || kind === 'new' || kind === 'import' || kind === 'annotation'
    || kind === 'extends' || kind === 'throws';
}

/** The imports and package of a file — to tell imported from not-yet-imported suggestions. */
export interface ImportScope {
  readonly packageName: string | null;
  readonly imports: ReadonlySet<string>;
}

const PACKAGE_LIKE = /^[\p{L}_$][\p{L}\p{N}_$]*(\.[\p{L}_$][\p{L}\p{N}_$]*)+$/u;

/** Reads `package a.b;` and `import [static] a.b.C;` / `a.b.*` lines (Java, Kotlin, Scala, Groovy). */
export function importScope(text: string): ImportScope {
  const imports = new Set<string>();
  let packageName: string | null = null;
  const lines = /^[ \t]*(package|import)[ \t]+(?:static[ \t]+)?([\p{L}\p{N}_$.*]+)/gmu;
  for (const match of text.matchAll(lines)) {
    if (match[1] === 'package') {
      packageName = match[2];
      continue;
    }
    imports.add(match[2]);
  }
  return { packageName, imports };
}

/**
 * 1 when the qualifier (a package, or package plus name) is imported, the
 * file's own package or `java.lang`; -1 when it is a package that is not;
 * 0 when the qualifier says nothing about packages.
 */
export function localityOf(scope: ImportScope, label: string, qualifier: string | undefined): number {
  if (!qualifier) {
    return 0;
  }
  const suffix = `.${label}`;
  const pkg = qualifier.endsWith(suffix) ? qualifier.slice(0, -suffix.length) : qualifier;
  if (!PACKAGE_LIKE.test(pkg)) {
    return 0;
  }
  if (pkg === 'java.lang' || pkg === scope.packageName) {
    return 1;
  }
  if (scope.imports.has(`${pkg}.${label}`) || scope.imports.has(`${pkg}.*`)) {
    return 1;
  }
  return -1;
}

/** Whether a list stays valid for `pattern`: complete, and the word extends the one it was asked for. */
export function listReusable(list: { isIncomplete: boolean; pattern: string; }, pattern: string): boolean {
  if (list.isIncomplete) {
    return false;
  }
  return pattern.toLowerCase().startsWith(list.pattern.toLowerCase());
}

