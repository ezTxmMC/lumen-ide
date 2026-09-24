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
 * Variable name suggestions: after a type in a declaration (`UserService |`)
 * the names that fit it — `userService` first (the type in lowerCamelCase),
 * then the last word (`service`) and, for collections, the plural of what they
 * hold (`users`). No DOM — tested in `check-completion`.
 */

/** Languages that write the type before the name. */
const TYPE_FIRST = new Set(['java', 'csharp', 'c', 'cpp', 'dart', 'groovy']);

const MODIFIERS = new Set([
  'public', 'private', 'protected', 'static', 'final', 'volatile', 'transient', 'abstract', 'synchronized',
  'readonly', 'const', 'internal', 'sealed', 'extern', 'unsafe', 'ref', 'out', 'in', 'params', 'late', 'var',
]);

/** Words that cannot be a name — the suggestion gets `Value` appended (`Class` → `clazz`). */
const RESERVED = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue', 'default', 'do',
  'double', 'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements', 'import', 'instanceof',
  'int', 'interface', 'long', 'native', 'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static',
  'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while', 'var',
  'object', 'string', 'namespace', 'params', 'event', 'delegate', 'operator', 'base', 'lock', 'checked', 'is', 'as', 'in', 'out', 'ref',
]);
const SPECIAL: Record<string, string> = { Class: 'clazz', Enum: 'enumValue', Interface: 'interfaceType', Object: 'object', String: 'string' };

const COLLECTIONS = new Set([
  'List', 'ArrayList', 'LinkedList', 'Set', 'HashSet', 'LinkedHashSet', 'TreeSet', 'SortedSet', 'Collection', 'Iterable',
  'Queue', 'Deque', 'ArrayDeque', 'Stream', 'IEnumerable', 'IList', 'ICollection', 'HashSet', 'Vector', 'Flux',
]);
const SINGLE_HOLDERS = new Set(['Optional', 'Supplier', 'Consumer', 'Future', 'CompletableFuture', 'Mono', 'AtomicReference', 'Nullable']);

/** Split at word borders: `HTTPClientFactory` → HTTP, Client, Factory. */
export function splitWords(name: string): string[] {
  return name.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/g) ?? [name];
}

/** The lowerCamelCase form of a type name: `UserService` → `userService`, `URLConnection` → `urlConnection`. */
export function toLowerCamel(name: string): string {
  const words = splitWords(name);
  return words.map((word, index) => (index === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase())).join('');
}

/** A rough English plural: `user` → `users`, `entry` → `entries`, `box` → `boxes`. */
export function pluralize(name: string): string {
  if (/(s|x|z|ch|sh)$/.test(name)) {
    return `${name}es`;
  }
  if (/[^aeiou]y$/.test(name)) {
    return `${name.slice(0, -1)}ies`;
  }
  return `${name}s`;
}

function safe(name: string): string | null {
  if (!name || !/^[a-z_$]/.test(name)) {
    return null;
  }
  return RESERVED.has(name) ? null : name;
}

interface ParsedType {
  base: string;
  args: string[];
  array: boolean;
}

/** `java.util.List<Map<String, User>>[]` → base `List`, args `Map<String, User>`, array. */
function parseType(text: string): ParsedType | null {
  const array = /\[\]\s*$/.test(text);
  const stripped = text.replace(/(\[\]\s*)+$/, '');
  const open = stripped.indexOf('<');
  const head = (open === -1 ? stripped : stripped.slice(0, open)).trim();
  const base = head.split('.').pop() ?? head;
  if (!/^[A-Za-z_$][\w$]*$/.test(base)) {
    return null;
  }
  const args: string[] = [];
  if (open !== -1 && stripped.endsWith('>')) {
    const inner = stripped.slice(open + 1, -1);
    let depth = 0;
    let current = '';
    for (const ch of inner) {
      if (ch === '<') {
        depth++;
      }
      if (ch === '>') {
        depth--;
      }
      if (ch === ',' && depth === 0) {
        args.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    if (current.trim()) {
      args.push(current.trim());
    }
  }
  return { base, args, array };
}

const simple = (type: string) => (parseType(type)?.base ?? type).replace(/^\?\s*(extends|super)\s+/, '');

/** Names for a declared type, best first; `[]` when the text is no usable type. */
export function nameSuggestions(typeText: string): string[] {
  const parsed = parseType(typeText.trim());
  if (!parsed) {
    return [];
  }
  const { base, args, array } = parsed;
  if (!/^[A-Z]/.test(base)) {
    return [];
  }

  const out: string[] = [];
  const add = (name: string | null | undefined) => {
    const ok = name ? safe(name) : null;
    if (ok && !out.includes(ok)) {
      out.push(ok);
    }
  };

  const words = splitWords(base);
  const own = SPECIAL[base] ?? toLowerCamel(base);
  const element = args.length ? simple(args[0]) : null;
  const elementName = element && /^[A-Z]/.test(element) ? toLowerCamel(element) : null;

  if (array && !args.length) {
    add(pluralize(toLowerCamel(base)));
    add(own);
    return out;
  }
  add(own);
  if (words.length > 1) {
    add(words[words.length - 1].toLowerCase());
  }
  if (elementName && COLLECTIONS.has(base)) {
    add(pluralize(elementName));
    add(`${elementName}${words[words.length - 1]}`);
  }
  if (elementName && SINGLE_HOLDERS.has(base)) {
    add(elementName);
  }
  if (elementName && base === 'Map' && args[1]) {
    const value = simple(args[1]);
    if (/^[A-Z]/.test(value)) {
      add(`${elementName}To${value}`.replace(/^./, (c) => c.toLowerCase()));
    }
  }
  if (elementName && !COLLECTIONS.has(base) && !SINGLE_HOLDERS.has(base)) {
    add(`${elementName}${base}`);
  }
  return out;
}

/** The type written right before the cursor, when a declaration's name is due: `private final List<User> |`. */
export function declaredTypeBefore(lineBefore: string, languageId: string | null | undefined): string | null {
  if (!languageId || !TYPE_FIRST.has(languageId)) {
    return null;
  }
  if (!/\s$/.test(lineBefore)) {
    return null;
  }
  const code = lineBefore.replace(/\s+$/, '');
  // Not inside a comment or a string.
  if (/\/\/|^\s*\*|\/\*/.test(lineBefore)) {
    return null;
  }
  if (((lineBefore.match(/"/g) ?? []).length) % 2 === 1) {
    return null;
  }

  // The type: qualified name, generics (nested), array brackets.
  const match = /((?:[A-Za-z_$][\w$]*\.)*[A-Z][\w$]*(?:\s*<(?:[^<>]|<(?:[^<>]|<[^<>]*>)*>)*>)?(?:\s*\[\s*\])*)$/.exec(code);
  if (!match) {
    return null;
  }
  const start = code.length - match[1].length;
  const head = code.slice(0, start).replace(/\s+$/, '');
  // What stands in front must open a declaration: a line start, `( , ; { }`, a modifier or an annotation.
  if (head === '') {
    return match[1];
  }
  const last = head.slice(-1);
  if ('(,;{}'.includes(last)) {
    return match[1];
  }
  const word = /([A-Za-z_$][\w$]*)$/.exec(head)?.[1];
  if (word && MODIFIERS.has(word)) {
    return match[1];
  }
  if (/@[\w$.]+(?:\([^)]*\))?$/.test(head)) {
    return match[1];
  }
  return null;
}
