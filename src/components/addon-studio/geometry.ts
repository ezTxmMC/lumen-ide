/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** Fixed node geometry — pin positions can be computed without measuring the DOM. */

import type { NodeDef } from '@/core/user-addons/catalog';
import type { GraphNode } from '@/core/user-addons/schema';

export const NODE_WIDTH = 224;
export const HEADER_HEIGHT = 28;
export const SETTING_HEIGHT = 28;
export const ROW_HEIGHT = 26;
export const BODY_PADDING = 4;

export function nodeHeight(def: NodeDef | undefined) {
  if (!def) {
    return HEADER_HEIGHT + ROW_HEIGHT + BODY_PADDING * 2;
  }
  const rows = Math.max(def.inputs.length, def.outputs.length, 1);
  return HEADER_HEIGHT + (def.settings?.length ?? 0) * SETTING_HEIGHT + rows * ROW_HEIGHT + BODY_PADDING * 2;
}

/** World coordinates of a pin. */
export function pinPosition(node: GraphNode, def: NodeDef | undefined, side: 'in' | 'out', pinId: string) {
  const pins = side === 'in' ? def?.inputs : def?.outputs;
  const index = Math.max(0, pins?.findIndex((p) => p.id === pinId) ?? 0);
  const y = node.y + HEADER_HEIGHT + BODY_PADDING + (def?.settings?.length ?? 0) * SETTING_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2;
  return { x: side === 'in' ? node.x : node.x + NODE_WIDTH, y };
}

/** A Bézier curve between two pins. */
export function edgePath(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(40, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

export function normalizeRect(x0: number, y0: number, x1: number, y1: number): Rect {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}
