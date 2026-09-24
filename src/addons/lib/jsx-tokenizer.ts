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
 * The JSX layer for JavaScript and TypeScript.
 *
 * Without a real parser `<` is ambiguous (a comparison or a tag). The
 * heuristic: a `<` counts as the start of a tag when an identifier, `>` or `/`
 * follows directly *and* the last character carrying meaning before it began an
 * expression (`( { , = => return && || ? : ; [` or the start of a line).
 */

import type { StringStream } from '@codemirror/language';
import type { CustomTokenizer, LanguageSpec, TokenKind } from '@/core/types';
import { createTokenizer } from '@/core/tokenizer';

interface JsxState {
  js: unknown;
  /** We stand within `<… >`. */
  inTag: boolean;
  tagNamed: boolean;
  attrValue: string | null;
}

const TAG_START = /^<\/?[A-Za-z][\w.:-]*|^<\/?>/;
const TAG_NAME = /^[A-Za-z][\w.:-]*/;
const ATTR_NAME = /^[^\s/>="'<{]+/;
const EXPR_BEFORE = /[([{,;=<>&|?:!+\-*/%]$|\breturn$|\bcase$|\bdefault$|^$/;

export function createJsxTokenizer(spec: LanguageSpec): CustomTokenizer<JsxState> {
  const base = createTokenizer({ ...spec, tokenizer: undefined });

  return {
    startState: (): JsxState => ({
      js: base.startState(),
      inTag: false,
      tagNamed: false,
      attrValue: null,
    }),

    copyState: (s) => ({
      ...s,
      js: base.copyState?.(s.js) ?? { ...(s.js as object) },
    }),

    token(stream: StringStream, state: JsxState): TokenKind | null {
      if (state.inTag) {
        if (stream.eatSpace()) {
          return null;
        }

        if (state.attrValue) {
          const quote = state.attrValue;
          while (!stream.eol()) {
            if (stream.match(quote)) { state.attrValue = null; break; }
            stream.next();
          }
          if (state.attrValue) {
            stream.skipToEnd();
          }
          return 'string';
        }

        if (stream.match('/>') || stream.match('>')) {
          state.inTag = false;
          state.tagNamed = false;
          return 'punctuation';
        }

        if (!state.tagNamed) {
          const name = stream.match(TAG_NAME) as RegExpMatchArray | null;
          if (name) {
            state.tagNamed = true;
            // Capitalised = a component, lower case = an HTML element.
            return /^[A-Z]/.test(name[0]) ? 'type' : 'tag';
          }
          state.tagNamed = true;
        }

        if (stream.eat('=')) {
          return 'operator';
        }

        const quote = stream.peek();
        if (quote === '"' || quote === "'") {
          stream.next();
          state.attrValue = quote;
          return 'string';
        }

        // `{…}` in a tag: ordinary JavaScript tokenising.
        if (stream.peek() === '{' || stream.peek() === '}') {
          stream.next();
          return 'punctuation';
        }

        if (stream.match(ATTR_NAME)) {
          return 'attribute';
        }

        stream.next();
        return null;
      }

      // Recognise the start of a tag
      if (stream.peek() === '<' && stream.match(TAG_START, false)) {
        const before = stream.string.slice(0, stream.pos).trimEnd();
        if (EXPR_BEFORE.test(before)) {
          stream.eat('<');
          stream.eat('/');
          state.inTag = true;
          state.tagNamed = false;
          return 'punctuation';
        }
      }

      // A closing fragment or tag `</…>` straight after child elements
      if (stream.match(/^<\/[A-Za-z]*>/, false)) {
        stream.eat('<');
        stream.eat('/');
        state.inTag = true;
        state.tagNamed = false;
        return 'punctuation';
      }

      return base.token(stream, state.js);
    },
  };
}
