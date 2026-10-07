/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { Snippet } from '@/core/types';
import { scopeOfPrefix } from './snippet-scopes';
import {
  SNIPPETS_CONCURRENCY, SNIPPETS_FLOW, SNIPPETS_LIBRARY, SNIPPETS_METHODS, SNIPPETS_OUTPUT,
  SNIPPETS_PROGRAM, SNIPPETS_TYPES, type SnippetRow,
} from './snippet-rows';

const ROWS: SnippetRow[] = [
  ...SNIPPETS_PROGRAM, ...SNIPPETS_METHODS, ...SNIPPETS_TYPES, ...SNIPPETS_OUTPUT,
  ...SNIPPETS_FLOW, ...SNIPPETS_CONCURRENCY, ...SNIPPETS_LIBRARY,
];

/** The manifest's snippets are offered there only, every other one everywhere but there. */
const MANIFEST_FILES = ['project.nv'];
const NOT_MANIFEST = ['!project.nv'];

/** Own snippets, manifest snippets and the catalogue's rest, each scoped by the file it belongs in. */
export function novusSnippets(own: Snippet[], manifest: Snippet[]): Snippet[] {
  const taken = new Set([...own, ...manifest].map((snippet) => snippet.label));
  return [
    ...[...own, ...catalogueSnippets(taken)].map((snippet) => ({ ...snippet, files: NOT_MANIFEST, scope: snippet.scope ?? scopeOfPrefix(snippet.label) })),
    ...manifest.map((snippet) => ({ ...snippet, files: MANIFEST_FILES })),
  ];
}

/**
 * One snippet per prefix of the language server's catalogue. A prefix the
 * add-on already has a (translated) snippet for is left to that one.
 */
export function catalogueSnippets(taken: ReadonlySet<string>): Snippet[] {
  const seen = new Set(taken);
  const out: Snippet[] = [];
  for (const [prefixes, description, body] of ROWS) {
    for (const prefix of prefixes) {
      if (seen.has(prefix)) {
        continue;
      }
      seen.add(prefix);
      out.push({ label: prefix, detail: description, body, scope: scopeOfPrefix(prefix) });
    }
  }
  return out;
}
