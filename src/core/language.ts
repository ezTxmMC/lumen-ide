/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** Builds everything CodeMirror needs out of a `LanguageSpec`. */

import {
  StreamLanguage, LanguageSupport, indentUnit, indentService, getIndentUnit,
} from '@codemirror/language';
import {
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import {
  buildStreamParser, DEFAULT_INDENT_CLOSE, DEFAULT_INDENT_OPEN,
} from './tokenizer';
import { languageCandidates, scanWords, wordRulesFor } from './completion/words';
import { syntaxCatchUp } from './syntax-catch-up';
import type { LanguageSpec } from './types';

/** Per spec object — a newly registered add-on from the Studio gets fresh highlighting. */
const cache = new WeakMap<LanguageSpec, LanguageSupport>();

/**
 * Plain completion from the language data plus words of the document, filtered
 * by CodeMirror. The error-tolerant, merged source — server, snippets, tabs,
 * recency — lives in `core/completion` (`completionExtension`); this one stays
 * for simpler callers.
 */
export function staticCompletionSource(spec: LanguageSpec) {
  const rules = wordRulesFor(spec.id);
  const validFor = new RegExp(`^(?:${rules.before.source})?$`, rules.before.flags);
  const statics: Completion[] = [
    ...languageCandidates(spec).map((c) => c.data),
    ...(spec.snippets ?? []).map((s) =>
      snippetCompletion(s.body.replaceAll('$0', '${}'), {
        label: s.label,
        detail: s.detail ?? 'Snippet',
        type: 'snippet',
        boost: 20,
      })),
  ];
  return (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(rules.before);
    if (!word && !context.explicit) {
      return null;
    }
    if (word && word.from === word.to && !context.explicit) {
      return null;
    }
    const from = word?.from ?? context.pos;
    const words = scanWords(context.state.doc.toString(), { origin: 'document', rules, exclude: from });
    return {
      from,
      options: [...statics, ...words.pool.map((c) => c.data)],
      validFor,
    };
  };
}

/**
 * Automatic indentation from the language's rules.
 *
 * It runs as an `indentService` rather than inside the StreamParser, because
 * there the line's position is available and with it the previous line.
 */
function indentRules(spec: LanguageSpec) {
  const open = spec.indentOpen ?? DEFAULT_INDENT_OPEN;
  const close = spec.indentClose ?? DEFAULT_INDENT_CLOSE;

  return indentService.of((context, pos) => {
    const doc = context.state.doc;
    const line = doc.lineAt(pos);
    if (line.number === 1) {
      return 0;
    }

    const unit = getIndentUnit(context.state);
    const tabSize = context.state.tabSize;

    // Skip blank lines — otherwise the indentation slides back to 0.
    let previous = doc.line(line.number - 1);
    while (previous.text.trim() === '' && previous.number > 1) {
      previous = doc.line(previous.number - 1);
    }

    const leading = /^[ \t]*/.exec(previous.text)![0];
    let indent = leading.replace(/\t/g, ' '.repeat(tabSize)).length;

    if (open.test(previous.text)) {
      indent += unit;
    }
    if (close.test(line.text)) {
      indent -= unit;
    }
    return Math.max(0, indent);
  });
}

export function languageSupport(spec: LanguageSpec): LanguageSupport {
  const hit = cache.get(spec);
  if (hit) {
    return hit;
  }

  const language = StreamLanguage.define(buildStreamParser(spec));
  const support = new LanguageSupport(language, [
    indentUnit.of(' '.repeat(spec.indentUnit ?? 2)),
    indentRules(spec),
    syntaxCatchUp,
  ]);
  cache.set(spec, support);
  return support;
}

export function editorExtensionFor(spec: LanguageSpec | null): Extension {
  return spec ? languageSupport(spec) : [];
}

/** File name → the matching language out of a list. */
export function matchLanguage(
  filePath: string,
  specs: LanguageSpec[],
): LanguageSpec | null {
  const name = filePath.split(/[\\/]/).pop() ?? '';
  const lower = name.toLowerCase();

  for (const spec of specs) {
    if (spec.filenames?.some((f) => f.toLowerCase() === lower)) {
      return spec;
    }
  }
  // The longest extension wins so `.d.ts` beats `.ts`; on a tie, `priority`
  // decides (Tailwind ahead of CSS).
  let best: LanguageSpec | null = null;
  let bestLength = 0;
  for (const spec of specs) {
    for (const ext of spec.extensions) {
      if (!lower.endsWith(ext.toLowerCase())) {
        continue;
      }
      const better =
        ext.length > bestLength ||
        (ext.length === bestLength &&
          (spec.priority ?? 0) > (best?.priority ?? 0));
      if (better) {
        best = spec;
        bestLength = ext.length;
      }
    }
  }
  return best;
}
