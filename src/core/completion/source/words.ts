/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { type EditorState } from '@codemirror/state';
import { inClassAttribute, isMarkupLanguage } from '../css-data';
import { wordLengthBefore } from '@/core/editor/word-pattern';
import { wordPatternAt } from '@/core/editor/syntax-context';
import type { ContextDetector } from '@/core/types';
import { wordRulesFor, type WordRules } from '../words';

/* ------------------------------------------------------------------ *
 * Context before the cursor
 * ------------------------------------------------------------------ */

export interface CursorWord {
  from: number;
  pos: number;
  lineBefore: string;
  key: string;
}

function anchored(rules: WordRules): RegExp {
  return new RegExp(`(?:${rules.before.source})$`, rules.before.flags);
}

/** How the word before the cursor is found: the language's rules, and dashed ones inside a class attribute. */
export interface WordMatcher {
  plain: RegExp;
  /** Tailwind classes contain dashes — inside `class="…"` of markup the word runs over them. */
  classAttribute: RegExp | null;
  /** The language's own `wordPattern`: the word must match it whole. */
  pattern: RegExp | null;
  /** The word inside code (`LanguageSpec.codeWordPattern`), where the syntax context says so. */
  codePattern: RegExp | null;
  detector: ContextDetector | null;
}

/** The language's word settings, as `wordMatcherFor` takes them. */
export interface WordSettings {
  wordPattern?: RegExp;
  codeWordPattern?: RegExp;
  syntaxContext?: ContextDetector;
}

export function wordMatcherFor(rules: WordRules, languageId: string | undefined, given: RegExp | WordSettings = {}): WordMatcher {
  const settings: WordSettings = given instanceof RegExp ? { wordPattern: given } : given;
  const alreadyDashed = rules === wordRulesFor('css');
  const dashedInClass = !alreadyDashed && isMarkupLanguage(languageId);
  return {
    plain: anchored(rules),
    classAttribute: dashedInClass ? anchored(wordRulesFor('css')) : null,
    pattern: settings.wordPattern ?? null,
    codePattern: settings.codeWordPattern ?? null,
    detector: settings.syntaxContext ?? null,
  };
}

/** Word start, the text before it, and the key for the server cache. */
export function cursorWord(state: EditorState, pos: number, matcher: WordMatcher): CursorWord {
  const line = state.doc.lineAt(pos);
  const text = line.text.slice(0, pos - line.from);
  const match = (matcher.classAttribute && inClassAttribute(text) ? matcher.classAttribute : matcher.plain).exec(text);
  const pattern = wordPatternAt(matcher.pattern, matcher.codePattern, matcher.detector ?? undefined, state, pos);
  const length = pattern ? wordLengthBefore(pattern, text) : (match?.[0].length ?? 0);
  const from = pos - length;
  const lineBefore = text.slice(0, from - line.from);
  return { from, pos, lineBefore, key: `${line.number}:${lineBefore}` };
}
