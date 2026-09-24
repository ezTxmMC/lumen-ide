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
 * Tokenizers that ship with Lumen, each under a name.
 *
 * Most languages describe their syntax as data — keywords, a few regexes — and
 * the generic tokenizer in `core/tokenizer.ts` turns that into highlighting.
 * A handful cannot: Markdown switches between block and inline, HTML hands
 * `<style>` and `<script>` to another tokenizer, JSX has to tell a comparison
 * from a tag. Those are programs, and a manifest carries data.
 *
 * Hence the same detour the debug adapters take: an extension writes
 * `"tokenizer": "markdown"` and gets the tokenizer Lumen already ships. The
 * names are part of the extension format and stay stable.
 *
 * The implementations sit in `src/addons/lib/` because they build on the
 * built-in language specs, and core must not reach into the add-ons. They
 * register themselves from there; an unknown name is reported by
 * `validateAddon`, so a missing registration fails loudly rather than quietly
 * costing a language its colours.
 */

import type { CustomTokenizer, LanguageSpec } from '@/core/types';

/** The spec is the language's own, already compiled — `jsx` wraps it. */
export type TokenizerFactory = (spec: LanguageSpec) => CustomTokenizer<never>;

const factories = new Map<string, TokenizerFactory>();

export function registerTokenizers(entries: Record<string, TokenizerFactory>) {
  for (const [name, factory] of Object.entries(entries)) {
    factories.set(name, factory);
  }
}

/** The names an extension may use, sorted — for validation and the studio. */
export function tokenizerNames(): string[] {
  return [...factories.keys()].sort();
}

export function isTokenizerName(name: string): boolean {
  return factories.has(name);
}

/** `undefined` for an unknown name; the caller keeps the data-driven syntax. */
export function resolveTokenizer(name: string | undefined, spec: LanguageSpec) {
  if (!name) {
    return undefined;
  }
  return factories.get(name)?.(spec);
}
