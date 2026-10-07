/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { Map as MapIcon, Maximize2, MessageSquarePlus, Plus, Redo2, Undo2 } from 'lucide-react';
import { useT } from '@/i18n';
import { NODE_CATALOG, PIN_COLORS, categoryColor, type NodeDef, type PinDef } from '@/core/user-addons/catalog';
import type { Graph, GraphComment, GraphEdge, GraphNode } from '@/core/user-addons/schema';
import { edgePath, pinPosition, type Rect } from './state/geometry';
import { HOT_MS, nodeRect, type PendingLink, type View } from './state/node-editor-core';
import { EdgeView, CommentFrame, ToolButton } from './NodeEditorParts';
import { NodeView } from './NodeView';

export function Minimap({
  graph, view, size, onCenter,
}: {
  graph: Graph;
  view: View;
  size: { w: number; h: number; };
  onCenter: (x: number, y: number) => void;
}) {
  const t = useT();
  const W = 180;
  const H = 116;
  const rects = graph.nodes.map(nodeRect);
  const viewport: Rect = { x: -view.x / view.zoom, y: -view.y / view.zoom, w: size.w / view.zoom, h: size.h / view.zoom };
  const all = [...rects, viewport];
  const minX = Math.min(...all.map((r) => r.x)) - 20;
  const minY = Math.min(...all.map((r) => r.y)) - 20;
  const maxX = Math.max(...all.map((r) => r.x + r.w)) + 20;
  const maxY = Math.max(...all.map((r) => r.y + r.h)) + 20;
  const scale = Math.min(W / (maxX - minX), H / (maxY - minY));

  const center = (box: DOMRect, clientX: number, clientY: number) =>
    onCenter((clientX - box.left) / scale + minX, (clientY - box.top) / scale + minY);

  return (
    <div
      data-no-wheel
      title={t('addonStudio.graph.minimap')}
      className="lm-glass absolute right-2 bottom-2 z-10 overflow-hidden rounded-lumen-sm border border-edge"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <svg
        width={W}
        height={H}
        className="block cursor-pointer"
        onMouseDown={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          center(box, e.clientX, e.clientY);
          const move = (m: MouseEvent) => center(box, m.clientX, m.clientY);
          const up = () => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
          };
          window.addEventListener('mousemove', move);
          window.addEventListener('mouseup', up);
        }}
      >
        {(graph.comments ?? []).map((c) => (
          <rect key={c.id} x={(c.x - minX) * scale} y={(c.y - minY) * scale} width={c.w * scale} height={c.h * scale} fill="#8b939f22" />
        ))}
        {graph.nodes.map((node, i) => {
          const def = NODE_CATALOG.get(node.type);
          const r = rects[i];
          return (
            <rect
              key={node.id}
              x={(r.x - minX) * scale}
              y={(r.y - minY) * scale}
              width={Math.max(2, r.w * scale)}
              height={Math.max(2, r.h * scale)}
              rx={1.5}
              fill={def ? categoryColor(def.category) : '#e2554f'}
              fillOpacity={0.75}
            />
          );
        })}
        <rect
          x={(viewport.x - minX) * scale}
          y={(viewport.y - minY) * scale}
          width={viewport.w * scale}
          height={viewport.h * scale}
          fill="none"
          stroke="var(--c-accent)"
          strokeWidth={1.2}
        />
      </svg>
    </div>
  );
}

/** The connections layer: every edge plus the one still being dragged. */
export function EdgeLayer({
  graph, defs, selection, highlight, now, pending, onEdgeDown,
}: {
  graph: Graph;
  defs: Map<string, NodeDef | undefined>;
  selection: Set<string>;
  highlight?: Record<string, number>;
  now: number;
  pending: PendingLink | null;
  onEdgeDown: (edge: GraphEdge, event: React.MouseEvent) => void;
}) {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  const edgeElements = graph.edges.map((edge) => {
    const fromNode = nodeById.get(edge.from.node);
    const toNode = nodeById.get(edge.to.node);
    if (!fromNode || !toNode) {
      return null;
    }
    const fromDef = defs.get(fromNode.id);
    const pinType = fromDef?.outputs.find((p) => p.id === edge.from.pin)?.type ?? 'any';
    const a = pinPosition(fromNode, fromDef, 'out', edge.from.pin);
    const b = pinPosition(toNode, defs.get(toNode.id), 'in', edge.to.pin);
    const hot = highlight && now - (highlight[toNode.id] ?? 0) < HOT_MS && pinType === 'exec';
    return (
      <EdgeView
        key={edge.id}
        d={edgePath(a.x, a.y, b.x, b.y)}
        pinType={pinType}
        selected={selection.has(edge.id)}
        hot={Boolean(hot)}
        onDown={(e) => onEdgeDown(edge, e)}
      />
    );
  });

  let pendingPath: string | null = null;
  if (pending) {
    const node = nodeById.get(pending.from.node);
    if (node) {
      const p = pinPosition(node, defs.get(node.id), pending.from.side, pending.from.pin);
      pendingPath = pending.from.side === 'out' ? edgePath(p.x, p.y, pending.x, pending.y) : edgePath(pending.x, pending.y, p.x, p.y);
    }
  }

  return (
    <svg className="absolute top-0 left-0 overflow-visible" width={1} height={1} style={{ pointerEvents: 'none' }}>
      {edgeElements}
      {pendingPath && (
        <path
          d={pendingPath}
          fill="none"
          stroke={PIN_COLORS[pending?.from.type ?? 'any']}
          strokeWidth={2}
          strokeDasharray="6 4"
        />
      )}
    </svg>
  );
}

/** The floating toolbar in the editor's top-left corner. */
export function EditorToolbar({
  zoom, minimap, canUndo, canRedo, historyVersion,
  onAddNode, onAddComment, onUndo, onRedo, onFit, onToggleMinimap, onResetZoom,
}: {
  zoom: number;
  minimap: boolean;
  canUndo: boolean;
  canRedo: boolean;
  historyVersion: number;
  onAddNode: () => void;
  onAddComment: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onFit: () => void;
  onToggleMinimap: () => void;
  onResetZoom: () => void;
}) {
  const t = useT();
  return (
    <div
      className="lm-glass absolute top-2 left-2 z-10 flex items-center gap-0.5 rounded-lumen-sm border border-edge p-0.5"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <ToolButton title={t('addonStudio.graph.addNode')} onClick={onAddNode}><Plus size={13} /></ToolButton>
      <ToolButton title={t('addonStudio.graph.addComment')} onClick={onAddComment}><MessageSquarePlus size={13} /></ToolButton>
      <span className="mx-0.5 h-4 w-px bg-edge" />
      <ToolButton title={t('addonStudio.graph.undo')} disabled={!canUndo} onClick={onUndo} version={historyVersion}><Undo2 size={13} /></ToolButton>
      <ToolButton title={t('addonStudio.graph.redo')} disabled={!canRedo} onClick={onRedo} version={historyVersion}><Redo2 size={13} /></ToolButton>
      <span className="mx-0.5 h-4 w-px bg-edge" />
      <ToolButton title={t('addonStudio.graph.fit')} onClick={onFit}><Maximize2 size={13} /></ToolButton>
      <ToolButton title={t('addonStudio.graph.minimap')} active={minimap} onClick={onToggleMinimap}><MapIcon size={13} /></ToolButton>
      <button
        title={t('addonStudio.graph.resetZoom')}
        onClick={onResetZoom}
        className="lm-transition h-6 rounded-[4px] px-1.5 font-mono text-[10.5px] text-muted hover:bg-hover"
      >
        {Math.round(zoom * 100)}%
      </button>
    </div>
  );
}

/** The comment frames behind the nodes. */
export function CommentLayer({
  comments, selection, editingComment, onEditing, onFocus, onMoveStart, onText, onResizeStart,
}: {
  comments: GraphComment[];
  selection: Set<string>;
  editingComment: string | null;
  onEditing: (id: string | null) => void;
  onFocus: () => void;
  onMoveStart: (event: React.MouseEvent, id: string) => void;
  onText: (id: string, text: string) => void;
  onResizeStart: (event: React.MouseEvent, comment: GraphComment) => void;
}) {
  return (
    <>
      {comments.map((comment) => (
        <CommentFrame
          key={comment.id}
          comment={comment}
          selected={selection.has(comment.id)}
          editing={editingComment === comment.id}
          onMoveStart={(e) => onMoveStart(e, comment.id)}
          onEditStart={() => onEditing(comment.id)}
          onEditEnd={() => onEditing(null)}
          onEditFinish={() => {
            onEditing(null);
            onFocus();
          }}
          onText={(text) => onText(comment.id, text)}
          onResizeStart={(e) => onResizeStart(e, comment)}
        />
      ))}
    </>
  );
}

/** The nodes of the graph. */
export function NodeLayer({
  graph, defs, selection, highlight, now, errorNode, connected, pinValues, pending,
  onMoveStart, onPinDown, onValue,
}: {
  graph: Graph;
  defs: Map<string, NodeDef | undefined>;
  selection: Set<string>;
  highlight?: Record<string, number>;
  now: number;
  errorNode?: string | null;
  connected: Set<string>;
  pinValues?: Record<string, string>;
  pending: PendingLink | null;
  onMoveStart: (event: React.MouseEvent, id: string) => void;
  onPinDown: (event: React.MouseEvent, node: GraphNode, pin: PinDef, side: 'in' | 'out') => void;
  onValue: (nodeId: string, key: string, value: string | number | boolean) => void;
}) {
  return (
    <>
      {graph.nodes.map((node) => (
        <NodeView
          key={node.id}
          node={node}
          def={defs.get(node.id)}
          selected={selection.has(node.id)}
          hot={Boolean(highlight && now - (highlight[node.id] ?? 0) < HOT_MS)}
          error={errorNode === node.id}
          connected={connected}
          pinValues={pinValues}
          pending={pending?.from ?? null}
          onHeaderDown={(e) => onMoveStart(e, node.id)}
          onPinDown={(e, pin, side) => onPinDown(e, node, pin, side)}
          onValue={(key, value) => onValue(node.id, key, value)}
        />
      ))}
    </>
  );
}

/** The zoomed and panned plane: comment frames, connections, nodes and the selection band. */
export function EditorWorld({
  view, graph, defs, selection, editingComment, highlight, now, errorNode, connected, pinValues, pending, band,
  onEditing, onFocus, onMoveStart, onText, onResizeStart, onEdgeDown, onPinDown, onValue,
}: {
  view: View;
  graph: Graph;
  defs: Map<string, NodeDef | undefined>;
  selection: Set<string>;
  editingComment: string | null;
  highlight?: Record<string, number>;
  now: number;
  errorNode?: string | null;
  connected: Set<string>;
  pinValues?: Record<string, string>;
  pending: PendingLink | null;
  band: Rect | null;
  onEditing: (id: string | null) => void;
  onFocus: () => void;
  onMoveStart: (event: React.MouseEvent, id: string) => void;
  onText: (id: string, text: string) => void;
  onResizeStart: (event: React.MouseEvent, comment: GraphComment) => void;
  onEdgeDown: (edge: GraphEdge, event: React.MouseEvent) => void;
  onPinDown: (event: React.MouseEvent, node: GraphNode, pin: PinDef, side: 'in' | 'out') => void;
  onValue: (nodeId: string, key: string, value: string | number | boolean) => void;
}) {
  return (
    <div
      className="absolute top-0 left-0 origin-top-left"
      style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
    >
      {/* Kommentarrahmen */}
      <CommentLayer
        comments={graph.comments ?? []}
        selection={selection}
        editingComment={editingComment}
        onEditing={onEditing}
        onFocus={onFocus}
        onMoveStart={onMoveStart}
        onText={onText}
        onResizeStart={onResizeStart}
      />

      {/* Verbindungen */}
      <EdgeLayer
        graph={graph}
        defs={defs}
        selection={selection}
        highlight={highlight}
        now={now}
        pending={pending}
        onEdgeDown={onEdgeDown}
      />

      {/* Knoten */}
      <NodeLayer
        graph={graph}
        defs={defs}
        selection={selection}
        highlight={highlight}
        now={now}
        errorNode={errorNode}
        connected={connected}
        pinValues={pinValues}
        pending={pending}
        onMoveStart={onMoveStart}
        onPinDown={onPinDown}
        onValue={onValue}
      />

      {band && (
        <div
          className="absolute rounded-sm border border-accent bg-accent/10"
          style={{ left: band.x, top: band.y, width: band.w, height: band.h }}
        />
      )}
    </div>
  );
}
