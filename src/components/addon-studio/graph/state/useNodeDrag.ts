/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useCallback, useRef } from 'react';
import { NODE_CATALOG } from '@/core/user-addons/catalog';
import type { PinDef } from '@/core/user-addons/catalog';
import { type Graph, type GraphComment, type GraphNode } from '@/core/user-addons/schema';
import { contains, intersects, normalizeRect, type Rect } from './geometry';
import { type PendingPin } from '../NodePalette';
import { connectPins, nodeRect, snap, type Drag, type DragOf, type PendingLink, type Point, type View } from './node-editor-core';
import { type Setter, type EditorEnv } from './editor-env';

interface DragEnv extends EditorEnv {
  onChange: (graph: Graph) => void;
  record: (before: Graph) => void;
  setView: Setter<View>;
  setBand: Setter<Rect | null>;
  setPending: Setter<PendingLink | null>;
}

function moveDrag(drag: DragOf<'move'>, world: Point, free: boolean, onChange: (graph: Graph) => void) {
  const dx = world.x - drag.startX;
  const dy = world.y - drag.startY;
  if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 2) {
    return;
  }
  drag.moved = true;
  onChange({
    ...drag.before,
    nodes: drag.before.nodes.map((n) => {
      const start = drag.nodes.get(n.id);
      return start ? { ...n, x: snap(start.x + dx, free), y: snap(start.y + dy, free) } : n;
    }),
    comments: (drag.before.comments ?? []).map((c) => {
      const start = drag.comments.get(c.id);
      return start ? { ...c, x: snap(start.x + dx, free), y: snap(start.y + dy, free) } : c;
    }),
  });
}

function resizeDrag(drag: DragOf<'resize'>, world: Point, onChange: (graph: Graph) => void) {
  onChange({
    ...drag.before,
    comments: (drag.before.comments ?? []).map((c) => (c.id === drag.id
      ? { ...c, w: Math.max(160, snap(drag.w + world.x - drag.startX, false)), h: Math.max(80, snap(drag.h + world.y - drag.startY, false)) }
      : c)),
  });
}

function bandSelection(drag: DragOf<'band'>, world: Point, graph: Graph) {
  const rect = normalizeRect(drag.x0, drag.y0, world.x, world.y);
  const next = new Set(drag.base);
  for (const node of graph.nodes) {
    if (intersects(rect, nodeRect(node))) {
      next.add(node.id);
    }
  }
  for (const comment of graph.comments ?? []) {
    if (contains(rect, comment)) {
      next.add(comment.id);
    }
  }
  return { rect, next };
}

/** Reads the pin a drag was released on, if any. */
function pinAt(x: number, y: number): PendingPin | null {
  const target = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-pin]');
  if (!target) {
    return null;
  }
  return {
    node: target.dataset.node ?? '',
    pin: target.dataset.pinId ?? '',
    type: target.dataset.type as PendingPin['type'],
    side: target.dataset.side as PendingPin['side'],
  };
}

/** Which nodes and frames a move drag carries; frames take the nodes inside them along. */
function moveTargets(graph: Graph, chosen: Set<string>) {
  const nodes = new Map<string, Point>();
  const comments = new Map<string, Point>();
  for (const node of graph.nodes) {
    if (chosen.has(node.id)) {
      nodes.set(node.id, { x: node.x, y: node.y });
    }
  }
  for (const comment of graph.comments ?? []) {
    if (!chosen.has(comment.id)) {
      continue;
    }
    comments.set(comment.id, { x: comment.x, y: comment.y });
    for (const node of graph.nodes) {
      if (contains(comment, nodeRect(node))) {
        nodes.set(node.id, { x: node.x, y: node.y });
      }
    }
  }
  return { nodes, comments };
}

export function useNodeDrag(env: DragEnv) {
  const {
    containerRef, graphRef, viewRef, selectionRef, spaceRef, toWorld, commit, onChange, record,
    setView, setBand, setSelection, setPending, setPalette, setEditingComment,
  } = env;
  const dragRef = useRef<Drag | null>(null);

  const onDragMove = useCallback((event: MouseEvent) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    if (drag.kind === 'pan') {
      setView({ ...drag.view, x: drag.view.x + event.clientX - drag.startX, y: drag.view.y + event.clientY - drag.startY });
      spaceRef.current.used = true;
      return;
    }
    const world = toWorld(event.clientX, event.clientY);
    if (drag.kind === 'move') {
      moveDrag(drag, world, event.altKey, onChange);
      return;
    }
    if (drag.kind === 'resize') {
      resizeDrag(drag, world, onChange);
      return;
    }
    if (drag.kind === 'band') {
      const { rect, next } = bandSelection(drag, world, graphRef.current);
      setBand(rect);
      setSelection(next);
      return;
    }
    setPending({ from: drag.from, x: world.x, y: world.y });
  }, [onChange, toWorld, graphRef, spaceRef, setView, setBand, setSelection, setPending]);

  const finishConnect = useCallback((from: PendingPin, event: MouseEvent) => {
    const to = pinAt(event.clientX, event.clientY);
    if (to) {
      const next = connectPins(graphRef.current, from, to);
      if (next) {
        commit(next);
      }
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) {
      return;
    }
    const world = toWorld(event.clientX, event.clientY);
    setPalette({ x: event.clientX - rect.left, y: event.clientY - rect.top, wx: world.x, wy: world.y, from });
  }, [commit, containerRef, graphRef, setPalette, toWorld]);

  const onDragEnd = useCallback((event: MouseEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) {
      return;
    }
    if (drag.kind === 'move' && drag.moved) {
      record(drag.before);
    }
    if (drag.kind === 'resize') {
      record(drag.before);
    }
    if (drag.kind === 'band') {
      setBand(null);
    }
    if (drag.kind !== 'connect') {
      return;
    }
    setPending(null);
    finishConnect(drag.from, event);
  }, [finishConnect, record, setBand, setPending]);

  const beginDrag = useCallback((drag: Drag) => {
    dragRef.current = drag;
    const move = (e: MouseEvent) => onDragMove(e);
    const up = (e: MouseEvent) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      onDragEnd(e);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, [onDragEnd, onDragMove]);

  const startPan = (event: React.MouseEvent) => {
    event.preventDefault();
    beginDrag({ kind: 'pan', startX: event.clientX, startY: event.clientY, view: viewRef.current });
  };

  const isPanGesture = (event: React.MouseEvent) => event.button === 1 || (event.button === 0 && spaceRef.current.down);

  const onBackgroundDown = (event: React.MouseEvent) => {
    setPalette(null);
    containerRef.current?.focus();
    if (isPanGesture(event)) {
      startPan(event);
      return;
    }
    if (event.button !== 0) {
      return;
    }
    const world = toWorld(event.clientX, event.clientY);
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const base = additive ? new Set(selectionRef.current) : new Set<string>();
    if (!additive) {
      setSelection(base);
    }
    setEditingComment(null);
    beginDrag({ kind: 'band', x0: world.x, y0: world.y, additive, base });
  };

  const startMove = (event: React.MouseEvent, id: string) => {
    if (isPanGesture(event)) {
      startPan(event);
      return;
    }
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    containerRef.current?.focus();
    setPalette(null);
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    let chosen = selectionRef.current;
    if (additive) {
      chosen = new Set(chosen);
      if (chosen.has(id)) {
        chosen.delete(id);
      }
      if (!selectionRef.current.has(id)) {
        chosen.add(id);
      }
      setSelection(chosen);
    }
    if (!chosen.has(id) && !additive) {
      chosen = new Set([id]);
      setSelection(chosen);
    }
    const current = graphRef.current;
    const { nodes, comments } = moveTargets(current, chosen);
    const world = toWorld(event.clientX, event.clientY);
    beginDrag({ kind: 'move', startX: world.x, startY: world.y, before: current, nodes, comments, moved: false });
  };

  const startConnect = (event: React.MouseEvent, node: GraphNode, pin: PinDef, side: 'in' | 'out') => {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    const current = graphRef.current;
    // Detach an occupied data input and keep dragging from its origin.
    const existing = side === 'in' && pin.type !== 'exec'
      ? current.edges.find((e) => e.to.node === node.id && e.to.pin === pin.id)
      : undefined;
    const world = toWorld(event.clientX, event.clientY);
    if (existing) {
      const source = current.nodes.find((n) => n.id === existing.from.node);
      const sourcePin = source ? NODE_CATALOG.get(source.type)?.outputs.find((p) => p.id === existing.from.pin) : undefined;
      commit({ ...current, edges: current.edges.filter((e) => e.id !== existing.id) });
      if (source && sourcePin) {
        const from: PendingPin = { node: source.id, pin: sourcePin.id, type: sourcePin.type, side: 'out' };
        setPending({ from, x: world.x, y: world.y });
        beginDrag({ kind: 'connect', from });
        return;
      }
    }
    const from: PendingPin = { node: node.id, pin: pin.id, type: pin.type, side };
    setPending({ from, x: world.x, y: world.y });
    beginDrag({ kind: 'connect', from });
  };

  const startResize = (e: React.MouseEvent, comment: GraphComment) => {
    if (e.button !== 0) {
      return;
    }
    e.stopPropagation();
    const world = toWorld(e.clientX, e.clientY);
    beginDrag({ kind: 'resize', id: comment.id, startX: world.x, startY: world.y, w: comment.w, h: comment.h, before: graphRef.current });
  };

  return {
    onBackgroundDown, startMove, startConnect, startResize,
  };
}
