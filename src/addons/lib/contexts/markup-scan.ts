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
 * The pieces of an nvh template that hold Novus: `<?nv ?>` and `<?= ?>`
 * blocks, `{expr}`, an event handler `@click="…"`, and the attribute list of a
 * tag. Shared by the `.nvh` and `.nvmd` detectors. Each reader gets the text
 * and the index after its opening mark and answers either where the construct
 * ended (`next`) or, when the text ends inside it, the context there.
 */

import type { SyntaxContext } from '@/core/types';
import { scanCode } from './novus-scan';

export interface Reading {
  /** Index after the construct; the end of the text when the cursor is inside. */
  next: number;
  /** Set when the text ended inside the construct. */
  inside?: SyntaxContext;
}

export const BLOCK: SyntaxContext = { scope: 'nvh_block', code: true };
export const EXPRESSION: SyntaxContext = { scope: 'nvh_expr', code: true };
export const TAG: SyntaxContext = { scope: 'nvh_tag', code: false };
export const TEMPLATE: SyntaxContext = { scope: 'nvh_template', code: false };

/** After `<?nv`: statements up to `?>`. */
export function readBlock(text: string, from: number): Reading {
  const scan = scanCode(text, from, { token: '?>' }, 'toplevel');
  if (!scan.closed) {
    return { next: text.length, inside: BLOCK };
  }
  return { next: scan.end + 2 };
}

/** After `<?=`: one expression up to `?>`. */
export function readOutput(text: string, from: number): Reading {
  const scan = scanCode(text, from, { token: '?>' }, 'expression');
  if (!scan.closed) {
    return { next: text.length, inside: EXPRESSION };
  }
  return { next: scan.end + 2 };
}

/** After `{`: an expression or template head up to the matching `}`. */
export function readExpression(text: string, from: number): Reading {
  const scan = scanCode(text, from, { unmatchedBrace: true }, 'expression');
  if (!scan.closed) {
    return { next: text.length, inside: EXPRESSION };
  }
  return { next: scan.end + 1 };
}

/** After the opening quote of `@click="`: Novus up to the closing quote. */
function readHandler(text: string, from: number): Reading {
  const scan = scanCode(text, from, { token: '"' }, 'expression');
  if (!scan.closed) {
    return { next: text.length, inside: EXPRESSION };
  }
  return { next: scan.end + 1 };
}

const EVENT_NAME = /@[A-Za-z]+(?:\.[A-Za-z]+)*/y;
const EVENT_VALUE_OPEN = /\s*=\s*"/y;
const BLOCK_OPEN = /<\?nv\b|<\?=/y;

/**
 * After a tag's name: attributes up to the `>` that ends the tag. Quoted
 * values are literal; `{expr}`, `<?nv ?>` and the value of an `@event="…"`
 * are Novus.
 */
export function readAttributes(text: string, from: number): Reading {
  let i = from;
  while (i < text.length) {
    const c = text[i];
    if (c === '>') {
      return { next: i + 1 };
    }
    BLOCK_OPEN.lastIndex = i;
    const open = BLOCK_OPEN.exec(text);
    if (open) {
      const read = open[0] === '<?=' ? readOutput(text, i + 3) : readBlock(text, i + 4);
      if (read.inside) {
        return read;
      }
      i = read.next;
      continue;
    }
    if (c === '{') {
      const read = readExpression(text, i + 1);
      if (read.inside) {
        return read;
      }
      i = read.next;
      continue;
    }
    if (c === '"' || c === "'") {
      const close = text.indexOf(c, i + 1);
      if (close < 0) {
        return { next: text.length, inside: TAG };
      }
      i = close + 1;
      continue;
    }
    EVENT_NAME.lastIndex = i;
    const event = EVENT_NAME.exec(text);
    if (!event) {
      i++;
      continue;
    }
    i += event[0].length;
    EVENT_VALUE_OPEN.lastIndex = i;
    const value = EVENT_VALUE_OPEN.exec(text);
    if (!value) {
      continue;
    }
    const read = readHandler(text, i + value[0].length);
    if (read.inside) {
      return read;
    }
    i = read.next;
  }
  return { next: text.length, inside: TAG };
}
