/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { NodeDef } from '@/core/user-addons/catalog';
import { newId, type Graph, type GraphComment, type GraphEdge, type GraphNode } from '@/core/user-addons/schema';
import { HEADER_HEIGHT, NODE_WIDTH, type Rect } from './geometry';
import { matchingPin, type PendingPin } from '../NodePalette';
import { clipboardStore, connectPins, isField, nodeRect, snap, type Clipboard, type Point } from './node-editor-core';
import { type EditorEnv } from './editor-env';

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
