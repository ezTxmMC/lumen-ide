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
 * Types, constants and pure helpers of the node editor, kept apart from the
 * component so the hooks and the view parts can share them.
 */

import { NODE_CATALOG, canConnect } from '@/core/user-addons/catalog';
import { newId, type Graph, type GraphComment, type GraphEdge, type GraphNode } from '@/core/user-addons/schema';
import { NODE_WIDTH, nodeHeight, type Rect } from './geometry';
import type { PendingPin } from './NodePalette';

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;
export const GRID = 20;
export const SNAP = 8;
export const HISTORY_LIMIT = 200;
export const HOT_MS = 700;

export interface View {
  x: number;
  y: number;
  zoom: number;
}

export type Drag =
  | { kind: 'pan'; startX: number; startY: number; view: View; }
  | {
    kind: 'move';
    startX: number;
    startY: number;
    before: Graph;
    nodes: Map<string, { x: number; y: number; }>;
    comments: Map<string, { x: number; y: number; }>;
    moved: boolean;
  }
  | { kind: 'band'; x0: number; y0: number; additive: boolean; base: Set<string>; }
  | { kind: 'resize'; id: string; startX: number; startY: number; w: number; h: number; before: Graph; }
  | { kind: 'connect'; from: PendingPin; };

export interface Clipboard {
  nodes: GraphNode[];
  edges: GraphEdge[];
  comments: GraphComment[];
}

/** A clipboard for nodes — shared across every graph in the Studio. */
export const clipboardStore: { current: Clipboard | null; } = { current: null };

export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
export const snap = (value: number, free: boolean) => (free ? value : Math.round(value / SNAP) * SNAP);
export const isField = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable));
};

export function nodeRect(node: GraphNode): Rect {
  return { x: node.x, y: node.y, w: NODE_WIDTH, h: nodeHeight(NODE_CATALOG.get(node.type)) };
}

/** Connects two pins, replacing an occupied single-input connection. */
export function connectPins(graph: Graph, a: PendingPin, b: PendingPin): Graph | null {
  if (a.side === b.side || a.node === b.node) {
    return null;
  }
  const out = a.side === 'out' ? a : b;
  const input = a.side === 'out' ? b : a;
  if (!canConnect(out.type, input.type)) {
    return null;
  }
  const edges = graph.edges.filter((edge) => {
    const sameInput = edge.to.node === input.node && edge.to.pin === input.pin;
    const sameOutput = edge.from.node === out.node && edge.from.pin === out.pin;
    if (input.type !== 'exec' && sameInput) {
      return false;
    }
    if (out.type === 'exec' && sameOutput) {
      return false;
    }
    return !(sameInput && sameOutput);
  });
  edges.push({ id: newId('e'), from: { node: out.node, pin: out.pin }, to: { node: input.node, pin: input.pin } });
  return { ...graph, edges };
}


/** A connection being dragged, with the pointer's world position. */
export interface PendingLink {
  from: PendingPin;
  x: number;
  y: number;
}

/** The node palette's anchor: screen position, world position and the pin it was opened from. */
export interface PaletteState {
  x: number;
  y: number;
  wx: number;
  wy: number;
  from: PendingPin | null;
}

export type DragOf<K extends Drag['kind']> = Extract<Drag, { kind: K; }>;

export interface Point {
  x: number;
  y: number;
}

/** The `node:side:pin` keys of every pin that has a connection. */
export function connectedPins(graph: Graph): Set<string> {
  const set = new Set<string>();
  for (const e of graph.edges) {
    set.add(`${e.from.node}:out:${e.from.pin}`);
    set.add(`${e.to.node}:in:${e.to.pin}`);
  }
  return set;
}
