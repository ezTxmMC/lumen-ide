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
 * Folding for languages built on the generic tokenizer.
 *
 * StreamParsers know no syntax nodes such as “class” or “method”, so folding
 * goes by the structure every language has:
 *   1. brackets: `{`/`[`/`(` at the end of a line up to their counterpart
 *      (classes, methods, loops, objects, argument lists; Allman style too)
 *   2. block comments spanning several lines
 *   3. regions: `#region` … `#endregion`, also `// region`, `<!-- #region -->`
 *   4. Markdown headings, up to the next one of the same level
 *   5. indentation (Python, YAML, HTML, Crystal, Novus …) when none of the
 *      above fits
 */

import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  codeFolding, foldGutter, foldService, matchBrackets, syntaxTree,
} from '@codemirror/language';
import type { LanguageSpec } from './types';

const OPENERS = new Set(['{', '[', '(']);
const MAX_SCAN = 400_000;

/** Does the position sit inside a comment or a string, as far as the tokenizer knows? */
function inTextToken(state: EditorState, pos: number) {
  const name = syntaxTree(state).resolveInner(pos, 1).name;
  return name.includes('string') || name.includes('comment') || name.includes('regexp');
}

function bracketFold(state: EditorState, lineFrom: number, lineTo: number) {
  const doc = state.doc;
  const text = doc.sliceString(lineFrom, lineTo);
  // The last open bracket of the line whose counterpart lies further down.
  for (let i = text.length - 1; i >= 0; i--) {
    if (!OPENERS.has(text[i])) {
      continue;
    }
    const pos = lineFrom + i;
    if (inTextToken(state, pos)) {
      continue;
    }
    const match = matchBrackets(state, pos, 1, { maxScanDistance: MAX_SCAN });
    if (!match?.matched || !match.end) {
      continue;
    }
    const closeLine = doc.lineAt(match.end.from);
    if (closeLine.from <= lineTo) {
      continue;
    }
    return { from: pos + 1, to: match.end.from };
  }
  return null;
}

function commentFold(state: EditorState, spec: LanguageSpec | null, lineFrom: number, lineTo: number) {
  const block = spec?.comments?.block;
  if (!block) {
    return null;
  }
  const text = state.doc.sliceString(lineFrom, lineTo);
  const start = text.indexOf(block[0]);
  if (start === -1) {
    return null;
  }
  const after = lineFrom + start + block[0].length;
  if (text.indexOf(block[1], start + block[0].length) !== -1) {
    return null;
  }
  const rest = state.doc.sliceString(after, Math.min(state.doc.length, after + MAX_SCAN));
  const end = rest.indexOf(block[1]);
  if (end === -1) {
    return null;
  }
  const endPos = after + end;
  if (state.doc.lineAt(endPos).number === state.doc.lineAt(lineFrom).number) {
    return null;
  }
  return { from: lineTo, to: endPos };
}

const REGION_START = /^\s*(?:\/\/|#|--|;|<!--|\/\*)?\s*#?region\b/i;
const REGION_END = /^\s*(?:\/\/|#|--|;|<!--|\/\*)?\s*#?endregion\b/i;

function regionFold(state: EditorState, lineFrom: number, lineTo: number) {
  const doc = state.doc;
  if (!REGION_START.test(doc.sliceString(lineFrom, lineTo))) {
    return null;
  }
  let depth = 0;
  for (let n = doc.lineAt(lineFrom).number + 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    if (REGION_START.test(line.text)) {
      depth++;
      continue;
    }
    if (!REGION_END.test(line.text)) {
      continue;
    }
    if (depth > 0) {
      depth--;
      continue;
    }
    return { from: lineTo, to: line.to };
  }
  return null;
}

function headingFold(state: EditorState, lineFrom: number, lineTo: number) {
  const doc = state.doc;
  const heading = /^(#{1,6})\s/.exec(doc.sliceString(lineFrom, lineTo));
  if (!heading) {
    return null;
  }
  const level = heading[1].length;
  let end = lineTo;
  for (let n = doc.lineAt(lineFrom).number + 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const next = /^(#{1,6})\s/.exec(line.text);
    if (next && next[1].length <= level) {
      break;
    }
    end = line.to;
  }
  return end > lineTo ? { from: lineTo, to: end } : null;
}

function indentOf(text: string, tabSize: number) {
  const leading = /^[ \t]*/.exec(text)![0];
  return leading.replace(/\t/g, ' '.repeat(tabSize)).length;
}

function indentFold(state: EditorState, lineFrom: number, lineTo: number) {
  const doc = state.doc;
  const line = doc.lineAt(lineFrom);
  if (!line.text.trim()) {
    return null;
  }
  const base = indentOf(line.text, state.tabSize);
  let end = -1;
  for (let n = line.number + 1; n <= doc.lines; n++) {
    const next = doc.line(n);
    if (!next.text.trim()) {
      continue;
    }
    if (indentOf(next.text, state.tabSize) <= base) {
      break;
    }
    end = next.to;
  }
  return end > lineTo ? { from: lineTo, to: end } : null;
}

const MARKDOWN = new Set(['markdown', 'mdx']);

/** Fold ranges for a language, or for plain text. */
export function foldingFor(spec: LanguageSpec | null): Extension {
  const service = foldService.of((state, lineFrom, lineTo) => {
    if (MARKDOWN.has(spec?.id ?? '')) {
      return headingFold(state, lineFrom, lineTo) ?? regionFold(state, lineFrom, lineTo);
    }
    return regionFold(state, lineFrom, lineTo)
      ?? commentFold(state, spec, lineFrom, lineTo)
      ?? bracketFold(state, lineFrom, lineTo)
      ?? indentFold(state, lineFrom, lineTo);
  });
  return service;
}

/** The gutter with fold markers and the placeholder “⋯ 12 lines”. */
export function foldingUi(linesLabel: (count: number) => string): Extension {
  return [
    codeFolding({
      preparePlaceholder: (state, range) => state.doc.lineAt(range.to).number - state.doc.lineAt(range.from).number,
      placeholderDOM: (_view, onclick, lines: number) => {
        const span = document.createElement('span');
        span.className = 'cm-foldPlaceholder lm-fold-placeholder';
        span.textContent = `⋯ ${linesLabel(lines)}`;
        span.title = linesLabel(lines);
        span.onclick = onclick;
        return span;
      },
    }),
    foldGutter({
      markerDOM: (open) => {
        const span = document.createElement('span');
        span.className = `lm-fold-marker${open ? ' lm-fold-open' : ''}`;
        span.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 2 L7 5 L3.5 8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        return span;
      },
    }),
    EditorView.baseTheme({
      '.lm-fold-marker': {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '14px',
        height: '100%',
        cursor: 'pointer',
        opacity: '0.55',
        transition: 'transform var(--duration) ease, opacity var(--duration) ease',
      },
      '.lm-fold-marker:hover': { opacity: '1' },
      '.lm-fold-open': { transform: 'rotate(90deg)' },
    }),
  ];
}
