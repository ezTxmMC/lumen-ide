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
 * Where each Novus snippet is offered — the scopes of the Novus language
 * server's snippet catalogue (`lsp/services/snippets/catalogue_*.nv`), read
 * against the syntax contexts of `lib/contexts/novus-context.ts`:
 *
 *   toplevel   declarations and entry points
 *   class      members of a `define class|interface|enum` body
 *   statement  everything inside a method or control block (the default)
 *   expression a map or object literal, a `${ }` interpolation
 *
 * A prefix that is not listed is a statement snippet, as in the catalogue.
 */

const TOP = [
  'main', 'psvm', 'mainargs', 'maine', 'psvmi', 'pkg', 'package',
  'import', 'importf', 'importfile', 'importn', 'importnested', 'importm', 'importmod',
  'psf', 'const', 'final', 'gvar', 'methoda', 'async', 'tryrun', 'guarded', 'testmain', 'tmain', 'maincli', 'cli',
  'class', 'cls', 'classb', 'extends', 'abstract', 'abstractclass', 'interface', 'iface', 'impl', 'implements',
  'enum', 'enumv', 'enumc', 'annotation', 'anno',
];
const TOP_OR_CLASS = ['method', 'meth', 'methodv', 'methodn', 'doc', '@Deprecated', 'deprecated'];
const CLASS = ['construct', 'ctor', 'field', 'fld', 'fieldg', 'getter', 'fieldgs', 'accessors', 'abstractm', 'absm', 'ctord', 'constructall'];
const STATEMENT_OR_EXPRESSION = ['struct', 'obj', 'new'];
const EVERYWHERE_IN_CODE = ['todo'];

const SCOPES = new Map<string, string[]>();
const enter = (prefixes: string[], scope: string[]) => prefixes.forEach((prefix) => SCOPES.set(prefix, scope));

enter(TOP, ['toplevel']);
enter(TOP_OR_CLASS, ['toplevel', 'class']);
enter(CLASS, ['class']);
enter(STATEMENT_OR_EXPRESSION, ['statement', 'expression']);
enter(EVERYWHERE_IN_CODE, ['statement', 'toplevel', 'class']);

/** The scope of the snippet with this prefix; a fresh list each time. */
export function scopeOfPrefix(prefix: string): string[] {
  return [...(SCOPES.get(prefix) ?? ['statement'])];
}
