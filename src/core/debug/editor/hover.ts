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
import { hoverTooltip, type Tooltip } from '@codemirror/view';
import { debug } from '../manager';

/* ------------------------------------------------------------------ *
 * Hover
 * ------------------------------------------------------------------ */

const WORD = /[\w$]/;

/** The expression under the pointer: the identifier plus any `a.b`/`a->b` chain to its left. */
function expressionAt(state: EditorState, pos: number): { from: number; to: number; text: string; } | null {
  const line = state.doc.lineAt(pos);
  const text = line.text;
  let start = pos - line.from;
  let end = start;
  while (end < text.length && WORD.test(text[end])) {
    end++;
  }
  while (start > 0 && WORD.test(text[start - 1])) {
    start--;
  }
  if (start === end || /^\d/.test(text.slice(start, end))) {
    return null;
  }
  for (;;) {
    if (start > 0 && text[start - 1] === '.') {
      let before = start - 1;
      while (before > 0 && WORD.test(text[before - 1])) {
        before--;
      }
      if (before === start - 1) {
        break;
      }
      start = before;
      continue;
    }
    if (start > 1 && text.slice(start - 2, start) === '->') {
      let before = start - 2;
      while (before > 0 && WORD.test(text[before - 1])) {
        before--;
      }
      if (before === start - 2) {
        break;
      }
      start = before;
      continue;
    }
    break;
  }
  return { from: line.from + start, to: line.from + end, text: text.slice(start, end) };
}

function renderValueTree(sessionId: string, label: string, value: string, reference: number, depth = 0): HTMLElement {
  const row = document.createElement('div');
  row.className = 'lm-debug-hover-row';
  const head = document.createElement('div');
  head.className = 'lm-debug-hover-head';
  head.style.paddingLeft = `${depth * 12}px`;
  const twisty = document.createElement('span');
  twisty.className = 'lm-debug-hover-twisty';
  twisty.textContent = reference ? '›' : '';
  const name = document.createElement('span');
  name.className = 'lm-debug-hover-name';
  name.textContent = label;
  const val = document.createElement('span');
  val.className = 'lm-debug-hover-value';
  val.textContent = value;
  head.append(twisty, name, document.createTextNode(' = '), val);
  row.append(head);
  if (!reference) {
    return row;
  }
  head.style.cursor = 'pointer';
  let children: HTMLElement | null = null;
  head.addEventListener('click', async () => {
    if (children) {
      children.remove();
      children = null;
      twisty.textContent = '›';
      return;
    }
    twisty.textContent = '⌄';
    const session = debug.sessionById(sessionId);
    const variables = await session?.variables(reference).catch(() => []) ?? [];
    children = document.createElement('div');
    for (const variable of variables.slice(0, 200)) {
      children.append(renderValueTree(sessionId, variable.name, variable.value, variable.variablesReference, depth + 1));
    }
    row.append(children);
  });
  return row;
}

export const debugHover = hoverTooltip(async (view, pos): Promise<Tooltip | null> => {
  if (!debug.isStopped) {
    return null;
  }
  const expression = expressionAt(view.state, pos);
  if (!expression) {
    return null;
  }
  const result = await debug.evaluateHover(expression.text);
  if (!result || !result.result) {
    return null;
  }
  return {
    pos: expression.from,
    end: expression.to,
    above: true,
    create: () => {
      const dom = document.createElement('div');
      dom.className = 'lm-debug-hover';
      dom.append(renderValueTree(result.sessionId, expression.text, result.result, result.variablesReference));
      return { dom };
    },
  };
}, { hoverTime: 350 });
