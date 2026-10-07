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
 * Closing tags: typing `>` of `<div class="a"` adds `</div>` behind the
 * cursor. Only for markup (HTML, Vue, Svelte, JSX/TSX); switched on and off
 * by the "close brackets and tags automatically" setting.
 */

import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** An opening tag that ends at the cursor: name, then attributes without `<` or `>`. */
const OPEN_TAG = /(^|[^\w$)\]])<([A-Za-z][\w:.-]*)((?:\s[^<>]*)?)$/;

/** `{` and `}` balance — otherwise the `>` is an arrow function or comparison inside an attribute expression. */
function balanced(text: string): boolean {
  let depth = 0;
  for (const char of text) {
    if (char === '{') {
      depth++;
    }
    if (char === '}') {
      depth--;
    }
  }
  return depth === 0;
}

/** The name of the tag to close for the text before the cursor, or null. */
export function tagToClose(lineBefore: string): string | null {
  const match = OPEN_TAG.exec(lineBefore);
  if (!match) {
    return null;
  }
  const [, , name, attributes] = match;
  if (VOID_TAGS.has(name.toLowerCase()) || attributes.trimEnd().endsWith('/') || attributes.trimEnd().endsWith('=')) {
    return null;
  }
  return balanced(attributes) ? name : null;
}

export const autoCloseTags: Extension = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== '>' || from !== to || view.state.readOnly) {
    return false;
  }
  const line = view.state.doc.lineAt(from);
  const name = tagToClose(line.text.slice(0, from - line.from));
  if (!name) {
    return false;
  }
  const closing = `</${name}>`;
  if (view.state.sliceDoc(from, from + closing.length) === closing) {
    return false;
  }
  view.dispatch({
    changes: { from, insert: `>${closing}` },
    selection: { anchor: from + 1 },
    userEvent: 'input.type',
  });
  return true;
});

/** Languages (and file endings) where a tag is closed automatically. */
const MARKUP_IDS = new Set(['html', 'vue', 'svelte', 'astro', 'xml', 'mdx']);

export function closesTags(languageId: string | null, filePath: string | null): boolean {
  if (languageId && MARKUP_IDS.has(languageId)) {
    return true;
  }
  return Boolean(filePath && /\.[jt]sx$/i.test(filePath));
}
