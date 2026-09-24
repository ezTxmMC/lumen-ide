/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import {
  Map as MapIcon, Maximize2, MessageSquarePlus, Plus, Redo2, Undo2,
} from 'lucide-react';
import { useT } from '@/i18n';
import {
  NODE_CATALOG, PIN_COLORS, canConnect, categoryColor, choiceLabel, nodeTitle, pinLabel, settingLabel,
  type NodeDef, type PinDef,
} from '@/core/user-addons/catalog';
import type { Graph, GraphComment, GraphEdge, GraphNode } from '@/core/user-addons/schema';
import {
  BODY_PADDING, HEADER_HEIGHT, NODE_WIDTH, ROW_HEIGHT, SETTING_HEIGHT, edgePath, pinPosition, type Rect,
} from './geometry';
import type { PendingPin } from './NodePalette';
import { HOT_MS, nodeRect, type PendingLink, type View } from './node-editor-core';

/** The presentational building blocks of the node editor. */

export function EdgeView({
  d, pinType, selected, hot, onDown,
}: {
  d: string;
  pinType: PinDef['type'];
  selected: boolean;
  hot: boolean;
  onDown: (event: React.MouseEvent) => void;
}) {
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
        onMouseDown={onDown}
      />
      <path
        d={d}
        fill="none"
        stroke={selected ? 'var(--c-accent)' : PIN_COLORS[pinType]}
        strokeOpacity={selected || hot ? 1 : 0.75}
        strokeWidth={(pinType === 'exec' ? 2.6 : 2) + (selected || hot ? 1 : 0)}
        style={{ pointerEvents: 'none', filter: hot ? 'drop-shadow(0 0 4px var(--c-accent))' : undefined }}
      />
    </g>
  );
}

export function CommentFrame({
  comment, selected, editing, onMoveStart, onEditStart, onEditEnd, onEditFinish, onText, onResizeStart,
}: {
  comment: NonNullable<Graph['comments']>[number];
  selected: boolean;
  editing: boolean;
  onMoveStart: (event: React.MouseEvent) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
  onEditFinish: () => void;
  onText: (text: string) => void;
  onResizeStart: (event: React.MouseEvent) => void;
}) {
  const t = useT();
  return (
    <div
      className="absolute rounded-lumen border-2"
      style={{
        left: comment.x,
        top: comment.y,
        width: comment.w,
        height: comment.h,
        borderColor: selected ? 'var(--c-accent)' : `${comment.color ?? '#8b939f'}66`,
        background: `${comment.color ?? '#8b939f'}14`,
        pointerEvents: 'none',
      }}
    >
      <div
        className="flex h-7 cursor-move items-center px-2 text-[12px] font-medium text-muted"
        style={{ pointerEvents: 'auto', background: `${comment.color ?? '#8b939f'}26` }}
        onMouseDown={onMoveStart}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onEditStart();
        }}
      >
        {editing && (
          <input
            autoFocus
            value={comment.text}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => onText(e.target.value)}
            onBlur={onEditEnd}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== 'Escape') {
                return;
              }
              e.stopPropagation();
              onEditFinish();
            }}
            className="w-full bg-transparent text-[12px] text-fg outline-none"
          />
        )}
        {!editing && <span className="truncate">{comment.text || t('addonStudio.graph.commentDefault')}</span>}
      </div>
      <div
        className="absolute right-0 bottom-0 size-3 cursor-nwse-resize"
        style={{ pointerEvents: 'auto', background: `linear-gradient(135deg, transparent 50%, ${selected ? 'var(--c-accent)' : '#8b939f88'} 50%)` }}
        onMouseDown={onResizeStart}
      />
    </div>
  );
}

export function ToolButton({
  title, onClick, children, disabled, active,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
/** Only for redrawing after history changes. */
  version?: number;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        'lm-transition flex size-6 items-center justify-center rounded-[4px] disabled:opacity-35',
        active ? 'bg-active text-fg' : 'text-muted hover:bg-hover hover:text-fg',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function nodeBorder(error: boolean, selected: boolean) {
  if (error) {
    return 'var(--c-danger)';
  }
  if (selected) {
    return 'var(--c-accent)';
  }
  return 'var(--c-border-strong)';
}

function nodeShadow(hot: boolean, selected: boolean) {
  if (hot) {
    return '0 0 0 2px var(--c-accent), 0 0 18px rgb(var(--c-accent-rgb) / 55%)';
  }
  if (selected) {
    return '0 0 0 1px var(--c-accent)';
  }
  return undefined;
}

const inlineClass = 'h-[18px] min-w-0 flex-1 rounded-[3px] border border-edge bg-input px-1 font-mono text-[10.5px] text-fg outline-none focus:border-accent';

interface PinHandleProps {
  node: GraphNode;
  pin: PinDef;
  side: 'in' | 'out';
  connected: Set<string>;
  pinValues?: Record<string, string>;
  pending: PendingPin | null;
  onPinDown: (event: React.MouseEvent, pin: PinDef, side: 'in' | 'out') => void;
}

function PinHandle({
  node, pin, side, connected, pinValues, pending, onPinDown,
}: PinHandleProps) {
  const t = useT();
  const isConnected = connected.has(`${node.id}:${side}:${pin.id}`);
  const value = pinValues?.[`${node.id}:${pin.id}`];
  const compatible = !pending || (pending.node !== node.id && pending.side !== side
    && (pending.side === 'out' ? canConnect(pending.type, pin.type) : canConnect(pin.type, pending.type)));
  const pinColor = PIN_COLORS[pin.type];
  return (
    <span
      data-pin
      data-node={node.id}
      data-pin-id={pin.id}
      data-type={pin.type}
      data-side={side}
      title={value === undefined ? `${pinLabel(pin)} · ${t(`addonStudio.pinType.${pin.type}`)}` : `${pinLabel(pin)} = ${value}`}
      onMouseDown={(e) => onPinDown(e, pin, side)}
      className="absolute top-1/2 z-10 flex size-4 -translate-y-1/2 cursor-crosshair items-center justify-center"
      style={{ [side === 'in' ? 'left' : 'right']: -8, opacity: compatible ? 1 : 0.25 }}
    >
      {pin.type === 'exec' && (
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M1 1 H5 L9 5 L5 9 H1 Z" fill={isConnected ? pinColor : 'var(--c-bg-overlay)'} stroke={pinColor} strokeWidth="1.4" />
        </svg>
      )}
      {pin.type !== 'exec' && (
        <span
          className="block size-[9px] rounded-full border-2"
          style={{ borderColor: pinColor, background: isConnected ? pinColor : 'var(--c-bg-overlay)' }}
        />
      )}
    </span>
  );
}

function InlineEditor({
  node, pin, connected, onValue,
}: {
  node: GraphNode;
  pin: PinDef;
  connected: Set<string>;
  onValue: (key: string, value: string | number | boolean) => void;
}) {
  if (pin.type === 'exec' || connected.has(`${node.id}:in:${pin.id}`)) {
    return null;
  }
  const raw = node.values?.[pin.id] ?? pin.default ?? '';
  if (pin.type === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={raw === true || raw === 'true'}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => onValue(pin.id, e.target.checked)}
        className="accent-[var(--c-accent)]"
      />
    );
  }
  return (
    <input
      value={String(raw)}
      spellCheck={false}
      placeholder={pin.type === 'list' ? 'a, b, c' : undefined}
      onMouseDown={(e) => e.stopPropagation()}
      onChange={(e) => onValue(pin.id, pin.type === 'number' && e.target.value.trim() !== '' && Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : e.target.value)}
      className={inlineClass}
    />
  );
}

type SettingDef = NonNullable<NodeDef['settings']>[number];

function SettingRow({
  node, setting, onValue,
}: {
  node: GraphNode;
  setting: SettingDef;
  onValue: (key: string, value: string | number | boolean) => void;
}) {
  const value = String(node.values?.[setting.id] ?? setting.default);
  return (
    <div className="flex items-center gap-1.5 px-2.5" style={{ height: SETTING_HEIGHT }}>
      <span className="w-[64px] shrink-0 truncate text-[10.5px] text-subtle">{settingLabel(setting)}</span>
      {setting.kind === 'select' && (
        <select
          value={value}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => onValue(setting.id, e.target.value)}
          className="h-[20px] min-w-0 flex-1 rounded-[3px] border border-edge bg-input px-1 text-[11px] outline-none focus:border-accent"
        >
          {setting.choices?.map((choice) => (
            <option key={choice.value} value={choice.value}>{choiceLabel(choice)}</option>
          ))}
        </select>
      )}
      {setting.kind === 'text' && (
        <input
          value={value}
          spellCheck={false}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => onValue(setting.id, e.target.value)}
          className={`${inlineClass} h-[20px]`}
        />
      )}
    </div>
  );
}

// The palette's middle pin: input pins go unlabelled when there is only one exec pin.
const showLabel = (pin: PinDef) => !(pin.type === 'exec' && (pin.id === 'in' || pin.id === 'then'));

export function NodeView({
  node, def, selected, hot, error, connected, pinValues, pending, onHeaderDown, onPinDown, onValue,
}: {
  node: GraphNode;
  def: NodeDef | undefined;
  selected: boolean;
  hot: boolean;
  error: boolean;
  connected: Set<string>;
  pinValues?: Record<string, string>;
  pending: PendingPin | null;
  onHeaderDown: (event: React.MouseEvent) => void;
  onPinDown: (event: React.MouseEvent, pin: PinDef, side: 'in' | 'out') => void;
  onValue: (key: string, value: string | number | boolean) => void;
}) {
  const t = useT();
  const color = def ? categoryColor(def.category) : '#e2554f';
  const rows = Math.max(def?.inputs.length ?? 0, def?.outputs.length ?? 0, 1);
  const pinProps = { node, connected, pinValues, pending, onPinDown };

  return (
    <div
      data-graph-node={node.id}
      className="lm-shadow absolute rounded-lumen border bg-overlay"
      style={{
        left: node.x,
        top: node.y,
        width: NODE_WIDTH,
        borderColor: nodeBorder(error, selected),
        boxShadow: nodeShadow(hot, selected),
        transition: 'box-shadow 200ms ease-out',
      }}
      onMouseDown={onHeaderDown}
    >
      <div
        className="flex cursor-move items-center gap-1.5 rounded-t-[inherit] border-b border-edge px-2"
        style={{ height: HEADER_HEIGHT, background: `linear-gradient(90deg, ${color}55, ${color}10)` }}
      >
        <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-fg">
          {def ? nodeTitle(def.type) : t('addonStudio.graph.unknownNode', { type: node.type })}
        </span>
      </div>

      <div style={{ paddingTop: BODY_PADDING, paddingBottom: BODY_PADDING }}>
        {def?.settings?.map((setting) => (
          <SettingRow key={setting.id} node={node} setting={setting} onValue={onValue} />
        ))}

        {Array.from({ length: rows }, (_, index) => {
          const input = def?.inputs[index];
          const output = def?.outputs[index];
          return (
            <div key={index} className="relative flex items-center gap-1" style={{ height: ROW_HEIGHT }}>
              <div className="relative flex h-full min-w-0 flex-1 items-center gap-1 pl-2.5">
                {input && <PinHandle {...pinProps} pin={input} side="in" />}
                {input && showLabel(input) && (
                  <span className="max-w-[72px] shrink-0 truncate text-[11px] text-muted">{pinLabel(input)}</span>
                )}
                {input && <InlineEditor node={node} pin={input} connected={connected} onValue={onValue} />}
              </div>
              {output && (
                <div className="relative flex h-full max-w-[50%] shrink-0 items-center justify-end pr-2.5">
                  {showLabel(output) && <span className="truncate text-[11px] text-muted">{pinLabel(output)}</span>}
                  <PinHandle {...pinProps} pin={output} side="out" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
