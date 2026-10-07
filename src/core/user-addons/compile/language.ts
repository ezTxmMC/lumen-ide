/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { LanguageSpec } from '@/core/types';
import { resolveDebugAdapters } from '@/core/debug/adapters/builtin-adapters';
import { resolveTokenizer } from '../tokenizers';
import { resolveContextDetector } from '@/core/editor/syntax-context';
import type { UserLanguage } from '../schema';

/** Regex source → RegExp; invalid ones fall away, and validation reports them. */
export function regex(source: string | undefined, anchored: boolean): RegExp | undefined {
  if (!source) {
    return undefined;
  }
  const pattern = anchored && !source.startsWith('^') ? `^(?:${source})` : source;
  try {
    return new RegExp(pattern);
  } catch {
    return undefined;
  }
}

const nonEmpty = <T,>(list: T[] | undefined): T[] | undefined => (list?.length ? list : undefined);

export function compileLanguage(lang: UserLanguage): LanguageSpec {
  const spec: LanguageSpec = {
    id: lang.id,
    name: lang.name,
    extensions: lang.extensions.map((e) => e.toLowerCase()),
    filenames: nonEmpty(lang.filenames),
    icon: lang.icon || undefined,
    color: lang.color || undefined,
    comments: lang.comments?.line || lang.comments?.block ? lang.comments : undefined,
    autoClose: nonEmpty(lang.autoClose),
    closeBrackets: nonEmpty(lang.closeBrackets),
    wordPattern: regex(lang.wordPattern, false),
    codeWordPattern: regex(lang.codeWordPattern, false),
    syntaxContext: resolveContextDetector(lang.syntaxContext),
    keywords: nonEmpty(lang.keywords),
    controls: nonEmpty(lang.controls),
    types: nonEmpty(lang.types),
    builtins: nonEmpty(lang.builtins),
    constants: nonEmpty(lang.constants),
    strings: nonEmpty(lang.strings),
    numbers: regex(lang.numbers, true),
    identifier: regex(lang.identifier, true),
    operators: regex(lang.operators, true),
    meta: regex(lang.meta, true),
    caseInsensitive: lang.caseInsensitive || undefined,
    capitalizedAsType: lang.capitalizedAsType || undefined,
    indentOpen: regex(lang.indentOpen, false),
    indentClose: regex(lang.indentClose, false),
    indentUnit: lang.indentUnit,
    format: lang.indentTabs ? { useTabs: true } : undefined,
    completions: nonEmpty(lang.completions),
    snippets: nonEmpty(lang.snippets),
    run: nonEmpty(lang.run),
    lsp: nonEmpty(lang.lsp),
    debug: nonEmpty(resolveDebugAdapters(lang.debug)),
    priority: lang.priority,
  };
  // After the spec is whole: `jsx` wraps the language's own highlighting.
  const tokenizer = resolveTokenizer(lang.tokenizer, spec);
  if (tokenizer) {
    spec.tokenizer = tokenizer;
  }
  // Drop undefined fields: parts of the tokenizer test with `in` and `??`.
  for (const key of Object.keys(spec) as (keyof LanguageSpec)[]) {
    if (spec[key] === undefined) {
      delete spec[key];
    }
  }
  return spec;
}
