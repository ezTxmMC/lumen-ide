/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { type Position } from '../protocol';
import type { ContentChange } from './types';

/** `settings` → the subtree for `section` ("java.format" → settings.java.format). */
export function sectionOf(settings: unknown, section: string | undefined): unknown {
  if (!section) {
    return settings ?? {};
  }
  let node: unknown = settings;
  for (const key of section.split('.')) {
    if (!node || typeof node !== 'object') {
      return null;
    }
    node = (node as Record<string, unknown>)[key];
  }
  return node ?? null;
}

/** Offset of an LSP position (UTF-16, as CodeMirror and JavaScript count) in a text. */
function offsetOf(text: string, position: Position): number {
  let offset = 0;
  for (let line = 0; line < position.line; line++) {
    const next = text.indexOf('\n', offset);
    if (next === -1) {
      return text.length;
    }
    offset = next + 1;
  }
  return Math.min(text.length, offset + position.character);
}

/** Apply content changes in order, each in the coordinates of the text before it. */
export function applyContentChanges(text: string, changes: ContentChange[]): string {
  let out = text;
  for (const change of changes) {
    const start = offsetOf(out, change.range.start);
    const end = offsetOf(out, change.range.end);
    out = out.slice(0, start) + change.text + out.slice(end);
  }
  return out;
}
