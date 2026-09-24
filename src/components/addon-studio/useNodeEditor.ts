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
 * The state machines behind the node editor: history, viewport, dragging,
 * editing and keyboard handling. Each hook gets the shared refs and setters
 * as one typed environment object.
 */

import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type Dispatch, type MutableRefObject, type RefObject, type SetStateAction,
} from 'react';
import { useT } from '@/i18n';
import { NODE_CATALOG } from '@/core/user-addons/catalog';
import type { NodeDef, PinDef } from '@/core/user-addons/catalog';
import { newId, type Graph, type GraphComment, type GraphEdge, type GraphNode } from '@/core/user-addons/schema';
import {
  HEADER_HEIGHT, NODE_WIDTH, contains, intersects, normalizeRect, type Rect,
} from './geometry';
import { matchingPin, type PendingPin } from './NodePalette';
import {
  HISTORY_LIMIT, HOT_MS, clampZoom, clipboardStore, connectPins, connectedPins, isField, nodeRect, snap,
  type Clipboard, type Drag, type DragOf, type PaletteState, type PendingLink, type Point, type View,
} from './node-editor-core';

type Setter<T> = Dispatch<SetStateAction<T>>;

/** The refs and setters every hook of the editor shares. */
export interface EditorEnv {
  containerRef: RefObject<HTMLDivElement | null>;
  graphRef: MutableRefObject<Graph>;
  viewRef: MutableRefObject<View>;
  selectionRef: MutableRefObject<Set<string>>;
  spaceRef: MutableRefObject<{ down: boolean; used: boolean; }>;
  mouseRef: MutableRefObject<{ x: number; y: number; inside: boolean; }>;
  toWorld: (clientX: number, clientY: number) => Point;
  commit: (next: Graph, mergeKey?: string) => void;
  setSelection: Setter<Set<string>>;
  setPalette: Setter<PaletteState | null>;
  setEditingComment: Setter<string | null>;
}

/* ------------------------------------------------------------------ *
 * History
 * ------------------------------------------------------------------ */

export function useGraphHistory(graphRef: MutableRefObject<Graph>, onChange: (graph: Graph) => void) {
  const undoRef = useRef<Graph[]>([]);
  const redoRef = useRef<Graph[]>([]);
  const mergeRef = useRef<{ key: string; at: number; } | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);

  const record = useCallback((before: Graph) => {
    undoRef.current = [...undoRef.current, before].slice(-HISTORY_LIMIT);
    redoRef.current = [];
    mergeRef.current = null;
    setHistoryVersion((v) => v + 1);
  }, []);

  /** Apply a change; the same `mergeKey` in quick succession makes one step. */
  const commit = useCallback((next: Graph, mergeKey?: string) => {
    const now = Date.now();
    const last = mergeRef.current;
    const merge = Boolean(mergeKey && last && last.key === mergeKey && now - last.at < 1200);
    if (!merge) {
      undoRef.current = [...undoRef.current, graphRef.current].slice(-HISTORY_LIMIT);
      setHistoryVersion((v) => v + 1);
    }
    redoRef.current = [];
    mergeRef.current = mergeKey ? { key: mergeKey, at: now } : null;
    onChange(next);
  }, [graphRef, onChange]);

  const undo = useCallback(() => {
    const previous = undoRef.current.at(-1);
    if (!previous) {
      return;
    }
    undoRef.current = undoRef.current.slice(0, -1);
    redoRef.current = [...redoRef.current, graphRef.current];
    mergeRef.current = null;
    setHistoryVersion((v) => v + 1);
    onChange(previous);
  }, [graphRef, onChange]);

  const redo = useCallback(() => {
    const next = redoRef.current.at(-1);
    if (!next) {
      return;
    }
    redoRef.current = redoRef.current.slice(0, -1);
    undoRef.current = [...undoRef.current, graphRef.current];
    mergeRef.current = null;
    setHistoryVersion((v) => v + 1);
    onChange(next);
  }, [graphRef, onChange]);

  /** Starts a fresh history, e.g. when another graph is opened. */
  const reset = useCallback(() => {
    undoRef.current = [];
    redoRef.current = [];
    mergeRef.current = null;
    setHistoryVersion((v) => v + 1);
  }, []);

  return {
    undoRef, redoRef, historyVersion, record, commit, undo, redo, reset,
  };
}

/* ------------------------------------------------------------------ *
 * The viewport
 * ------------------------------------------------------------------ */

interface ViewportEnv {
  containerRef: RefObject<HTMLDivElement | null>;
  graphRef: MutableRefObject<Graph>;
  selectionRef: MutableRefObject<Set<string>>;
  focusNode?: { id: string; token: number; } | null;
  setSelection: Setter<Set<string>>;
}

/** The framing that shows the given node rectangles centred in a viewport. */
function framing(rects: Rect[], w: number, h: number): View {
  if (!rects.length) {
    return { x: 40, y: 40, zoom: 1 };
  }
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  const zoom = clampZoom(Math.min(1, (w - 80) / (maxX - minX || 1), (h - 80) / (maxY - minY || 1)));
  return {
    zoom,
    x: (w - (maxX - minX) * zoom) / 2 - minX * zoom,
    y: (h - (maxY - minY) * zoom) / 2 - minY * zoom,
  };
}

/** The wheel: Ctrl zooms around the pointer, otherwise it pans. */
function wheelView(event: WheelEvent, v: View, el: HTMLElement): View {
  if (event.ctrlKey || event.metaKey) {
    const rect = el.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const zoom = clampZoom(v.zoom * Math.exp(-event.deltaY * 0.0015));
    return { zoom, x: px - ((px - v.x) / v.zoom) * zoom, y: py - ((py - v.y) / v.zoom) * zoom };
  }
  const dx = event.shiftKey ? event.deltaY : event.deltaX;
  const dy = event.shiftKey ? 0 : event.deltaY;
  return { ...v, x: v.x - dx, y: v.y - dy };
}

export function useViewport(env: ViewportEnv) {
  const {
    containerRef, graphRef, selectionRef, focusNode, setSelection,
  } = env;
  const [view, setView] = useState<View>({ x: 40, y: 40, zoom: 1 });
  const [size, setSize] = useState({ w: 800, h: 500 });
  const viewRef = useRef(view);
  viewRef.current = view;

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: (clientX - (rect?.left ?? 0) - v.x) / v.zoom,
      y: (clientY - (rect?.top ?? 0) - v.y) / v.zoom,
    };
  }, [containerRef]);

  const fit = useCallback((onlySelection = false) => {
    const current = graphRef.current;
    const chosen = onlySelection ? current.nodes.filter((n) => selectionRef.current.has(n.id)) : current.nodes;
    const el = containerRef.current;
    if (!el) {
      return;
    }
    setView(framing(chosen.map(nodeRect), el.clientWidth, el.clientHeight));
  }, [containerRef, graphRef, selectionRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef, setSize]);

  useEffect(() => {
    if (!focusNode) {
      return;
    }
    const node = graphRef.current.nodes.find((n) => n.id === focusNode.id);
    const el = containerRef.current;
    if (!node || !el) {
      return;
    }
    const zoom = viewRef.current.zoom;
    setView({ zoom, x: el.clientWidth / 2 - (node.x + NODE_WIDTH / 2) * zoom, y: el.clientHeight / 2 - (node.y + 40) * zoom });
    setSelection(new Set([node.id]));
  }, [focusNode, containerRef, graphRef, setSelection, setView, viewRef]);

  // Non-passive, so the wheel can preventDefault.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement | null)?.closest?.('[data-no-wheel]')) {
        return;
      }
      event.preventDefault();
      setView(wheelView(event, viewRef.current, el));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [containerRef, setView, viewRef]);

  return {
    view, setView, viewRef, size, toWorld, fit,
  };
}

/* ------------------------------------------------------------------ *
 * Dragging
 * ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ *
 * Editing
 * ------------------------------------------------------------------ */

interface EditingEnv extends EditorEnv {
  t: (key: string) => string;
}

/** Copies of a clipboard's contents with fresh ids, shifted by the given offset. */
function remapClipboard(source: Clipboard, dx: number, dy: number) {
  const ids = new Map<string, string>();
  const nodes = source.nodes.map((n) => {
    const id = newId('n');
    ids.set(n.id, id);
    return { ...structuredClone(n), id, x: n.x + dx, y: n.y + dy };
  });
  const edges = source.edges.map((e) => ({
    id: newId('e'),
    from: { node: ids.get(e.from.node) ?? e.from.node, pin: e.from.pin },
    to: { node: ids.get(e.to.node) ?? e.to.node, pin: e.to.pin },
  }));
  const comments = source.comments.map((c) => ({ ...c, id: newId('c'), x: c.x + dx, y: c.y + dy }));
  return { nodes, edges, comments };
}

/** A frame around the selected nodes, or a default one at the view's centre. */
function commentBox(chosen: Rect[], center: Point): Rect {
  if (!chosen.length) {
    return { x: center.x - 160, y: center.y - 90, w: 320, h: 180 };
  }
  const minX = Math.min(...chosen.map((r) => r.x));
  const minY = Math.min(...chosen.map((r) => r.y));
  return {
    x: minX - 24,
    y: minY - 44,
    w: Math.max(...chosen.map((r) => r.x + r.w)) - minX + 48,
    h: Math.max(...chosen.map((r) => r.y + r.h)) - minY + 68,
  };
}

export function useGraphEditing(env: EditingEnv) {
  const {
    containerRef, graphRef, viewRef, selectionRef, mouseRef, toWorld, commit,
    setSelection, setPalette, setEditingComment, t,
  } = env;

  const addNode = (def: NodeDef, wx: number, wy: number, from: PendingPin | null) => {
    const node: GraphNode = { id: newId('n'), type: def.type, x: snap(wx, false), y: snap(wy - HEADER_HEIGHT / 2, false) };
    let next: Graph = { ...graphRef.current, nodes: [...graphRef.current.nodes, node] };
    const target = matchingPin(def, from);
    if (from && target) {
      const side = from.side === 'out' ? 'in' : 'out';
      if (side === 'out') {
        next = { ...next, nodes: next.nodes.map((n) => (n.id === node.id ? { ...n, x: n.x - NODE_WIDTH } : n)) };
      }
      next = connectPins(next, from, { node: node.id, pin: target.id, type: target.type, side }) ?? next;
    }
    commit(next);
    setSelection(new Set([node.id]));
    setPalette(null);
    containerRef.current?.focus();
  };

  const setValue = (nodeId: string, key: string, value: string | number | boolean) => {
    const current = graphRef.current;
    commit({
      ...current,
      nodes: current.nodes.map((n) => (n.id === nodeId ? { ...n, values: { ...(n.values ?? {}), [key]: value } } : n)),
    }, `value:${nodeId}:${key}`);
  };

  const deleteSelection = () => {
    const chosen = selectionRef.current;
    if (!chosen.size) {
      return;
    }
    const current = graphRef.current;
    commit({
      nodes: current.nodes.filter((n) => !chosen.has(n.id)),
      edges: current.edges.filter((e) => !chosen.has(e.id) && !chosen.has(e.from.node) && !chosen.has(e.to.node)),
      comments: (current.comments ?? []).filter((c) => !chosen.has(c.id)),
    });
    setSelection(new Set());
  };

  const copySelection = () => {
    const chosen = selectionRef.current;
    const current = graphRef.current;
    const nodes = current.nodes.filter((n) => chosen.has(n.id));
    if (!nodes.length && !(current.comments ?? []).some((c) => chosen.has(c.id))) {
      return;
    }
    clipboardStore.current = structuredClone({
      nodes,
      edges: current.edges.filter((e) => chosen.has(e.from.node) && chosen.has(e.to.node)),
      comments: (current.comments ?? []).filter((c) => chosen.has(c.id)),
    });
  };

  const paste = (source: Clipboard | null, at?: Point) => {
    if (!source) {
      return;
    }
    const items = [...source.nodes, ...source.comments];
    if (!items.length) {
      return;
    }
    const minX = Math.min(...items.map((i) => i.x));
    const minY = Math.min(...items.map((i) => i.y));
    const target = at ?? { x: minX + 32, y: minY + 32 };
    const { nodes, edges, comments } = remapClipboard(source, snap(target.x - minX, false), snap(target.y - minY, false));
    const current = graphRef.current;
    commit({
      nodes: [...current.nodes, ...nodes],
      edges: [...current.edges, ...edges],
      comments: [...(current.comments ?? []), ...comments],
    });
    setSelection(new Set([...nodes.map((n) => n.id), ...comments.map((c) => c.id)]));
  };

  const addComment = () => {
    const current = graphRef.current;
    const chosen = current.nodes.filter((n) => selectionRef.current.has(n.id)).map(nodeRect);
    const el = containerRef.current;
    const v = viewRef.current;
    const center = { x: ((el?.clientWidth ?? 600) / 2 - v.x) / v.zoom, y: ((el?.clientHeight ?? 400) / 2 - v.y) / v.zoom };
    const comment: GraphComment = { id: newId('c'), ...commentBox(chosen, center), text: t('addonStudio.graph.commentDefault') };
    commit({ ...current, comments: [...(current.comments ?? []), comment] });
    setSelection(new Set([comment.id]));
    setEditingComment(comment.id);
  };

  const openPaletteAtMouse = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const inside = mouseRef.current.inside;
    const x = inside ? mouseRef.current.x - rect.left : rect.width / 2 - 130;
    const y = inside ? mouseRef.current.y - rect.top : rect.height / 3;
    const world = toWorld(x + rect.left, y + rect.top);
    setPalette({ x, y, wx: world.x, wy: world.y, from: null });
  };

  const setCommentText = (id: string, text: string) => commit({
    ...graphRef.current,
    comments: (graphRef.current.comments ?? []).map((c) => (c.id === id ? { ...c, text } : c)),
  }, `comment:${id}`);

  /** A click on a connection selects it; with Alt it cuts it. */
  const onEdgeDown = (edge: GraphEdge, event: React.MouseEvent) => {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    containerRef.current?.focus();
    if (event.altKey) {
      commit({ ...graphRef.current, edges: graphRef.current.edges.filter((x) => x.id !== edge.id) });
      return;
    }
    setSelection(new Set([edge.id]));
  };

  /** Right-click opens the palette at the pointer, except inside a text field. */
  const onContextMenu = (e: React.MouseEvent) => {
    if (isField(e.target)) {
      return;
    }
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const world = toWorld(e.clientX, e.clientY);
    setPalette({ x: e.clientX - rect.left, y: e.clientY - rect.top, wx: world.x, wy: world.y, from: null });
  };

  return {
    addNode, setValue, deleteSelection, copySelection, paste, addComment, openPaletteAtMouse,
    setCommentText, onEdgeDown, onContextMenu,
  };
}

/* ------------------------------------------------------------------ *
 * Keyboard
 * ------------------------------------------------------------------ */

interface KeysEnv extends EditorEnv {
  fit: (onlySelection?: boolean) => void;
  undo: () => void;
  redo: () => void;
  actions: Pick<ReturnType<typeof useGraphEditing>, 'deleteSelection' | 'copySelection' | 'paste' | 'openPaletteAtMouse'>;
}

export function useEditorKeys(env: KeysEnv) {
  const {
    graphRef, selectionRef, spaceRef, mouseRef, toWorld, setSelection, fit, undo, redo, actions,
  } = env;
  const {
    deleteSelection, copySelection, paste, openPaletteAtMouse,
  } = actions;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (isField(event.target)) {
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    const k = event.key.toLowerCase();
    const handlers: Record<string, () => void> = {
      delete: deleteSelection,
      backspace: deleteSelection,
      'mod+c': copySelection,
      'mod+x': () => { copySelection(); deleteSelection(); },
      'mod+v': () => paste(clipboardStore.current, mouseRef.current.inside ? toWorld(mouseRef.current.x, mouseRef.current.y) : undefined),
      'mod+d': () => {
        copySelection();
        paste(clipboardStore.current);
      },
      'mod+z': undo,
      'mod+shift+z': redo,
      'mod+y': redo,
      'mod+a': () => setSelection(new Set([...graphRef.current.nodes.map((n) => n.id), ...(graphRef.current.comments ?? []).map((c) => c.id)])),
      f: () => fit(selectionRef.current.size > 0),
      escape: () => {
        if (!selectionRef.current.size) {
          return;
        }
        setSelection(new Set());
      },
    };
    const combo = `${mod ? 'mod+' : ''}${mod && event.shiftKey ? 'shift+' : ''}${k}`;
    if (k === ' ') {
      event.preventDefault();
      if (!event.repeat) {
        spaceRef.current = { down: true, used: false };
      }
      return;
    }
    const handler = handlers[combo];
    if (!handler) {
      return;
    }
    // Esc with nothing selected belongs to the Studio, which closes.
    if (combo === 'escape' && !selectionRef.current.size) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    handler();
  };

  const onKeyUp = (event: React.KeyboardEvent) => {
    if (event.key !== ' ' || isField(event.target)) {
      return;
    }
    const { used } = spaceRef.current;
    spaceRef.current = { down: false, used: false };
    if (!used) {
      openPaletteAtMouse();
    }
  };

  return { onKeyDown, onKeyUp };
}

/* ------------------------------------------------------------------ *
 * The controller
 * ------------------------------------------------------------------ */

/** Fades the test-run glow out again after a moment. */
function useHotFade(highlight: Record<string, number> | undefined, setTick: Dispatch<SetStateAction<number>>) {
  useEffect(() => {
    if (!highlight) {
      return;
    }
    const now = Date.now();
    const recent = Object.values(highlight).some((ts) => now - ts < HOT_MS);
    if (!recent) {
      return;
    }
    const timer = setTimeout(() => setTick((n) => n + 1), HOT_MS);
    return () => clearTimeout(timer);
  }, [highlight, setTick]);
}

interface ControllerProps {
  graph: Graph;
  onChange: (graph: Graph) => void;
  resetKey: string;
  highlight?: Record<string, number>;
  focusNode?: { id: string; token: number; } | null;
}

/** All state and behaviour of the node editor; the component only renders what this returns. */
export function useEditorController({ graph, onChange, resetKey, highlight, focusNode }: ControllerProps) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [band, setBand] = useState<Rect | null>(null);
  const [pending, setPending] = useState<PendingLink | null>(null);
  const [palette, setPalette] = useState<PaletteState | null>(null);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [minimap, setMinimap] = useState(true);
  const [, setTick] = useState(0);
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const spaceRef = useRef({ down: false, used: false });
  const mouseRef = useRef({ x: 0, y: 0, inside: false });

  const defs = useMemo(() => new Map(graph.nodes.map((n) => [n.id, NODE_CATALOG.get(n.type)])), [graph.nodes]);
  const connected = useMemo(() => connectedPins(graph), [graph.edges]);

  const history = useGraphHistory(graphRef, onChange);
  const { commit } = history;
  const {
    view, setView, viewRef, size, toWorld, fit,
  } = useViewport({
    containerRef, graphRef, selectionRef, focusNode, setSelection,
  });

  useLayoutEffect(() => {
    history.reset();
    setSelection(new Set());
    setPalette(null);
    fit();
  }, [resetKey, fit, history.reset]);

  useHotFade(highlight, setTick);

  const env = {
    containerRef, graphRef, viewRef, selectionRef, spaceRef, mouseRef, toWorld, commit,
    setSelection, setPalette, setEditingComment,
  };
  const drag = useNodeDrag({
    ...env, onChange, record: history.record, setView, setBand, setPending,
  });
  const editing = useGraphEditing({ ...env, t });
  const keys = useEditorKeys({
    ...env, fit, undo: history.undo, redo: history.redo, actions: editing,
  });

  const focusContainer = () => containerRef.current?.focus();

  return {
    t, containerRef, selection, band, pending, palette, setPalette, editingComment, setEditingComment, minimap, setMinimap,
    spaceRef, mouseRef, defs, connected, history, view, setView, size, fit, editing, keys, drag, focusContainer,
  };
}
