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
 * The node editor of the visual scripting — our own implementation, HTML for
 * the nodes and SVG for the connections.
 *
 * Controls: dragging on empty space selects with a rectangle, middle-click or
 * space plus drag pans, Ctrl plus the wheel zooms. Right-click or space opens
 * the node palette; so does a connection dragged into empty space, filtered by
 * the pin type. Del deletes, Ctrl+C/X/V/D copies, cuts, pastes and duplicates,
 * Ctrl+Z/Y undoes and redoes.
 */

import { type NodeDef } from '@/core/user-addons/catalog';
import { useT } from '@/i18n';
import type { Graph } from '@/core/user-addons/schema';
import { NodePalette } from './NodePalette';
import { EditorToolbar, EditorWorld, Minimap } from './NodeEditorParts';
import { GRID, type PaletteState, type View } from './node-editor-core';
import { useEditorController } from './useNodeEditor';

export { connectPins, nodeRect } from './node-editor-core';

/** The empty-graph hint, the minimap and the node palette on top of the canvas. */
function EditorOverlays({ graph, view, size, minimap, palette, allow, onCenter, onPick, onClosePalette }: {
  graph: Graph;
  view: View;
  size: { w: number; h: number; };
  minimap: boolean;
  palette: PaletteState | null;
  allow?: (def: NodeDef) => boolean;
  onCenter: (x: number, y: number) => void;
  onPick: (def: NodeDef, wx: number, wy: number, from: PaletteState['from']) => void;
  onClosePalette: () => void;
}) {
  const t = useT();
  return (
    <>
      {graph.nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="max-w-[340px] text-center text-[12px] leading-relaxed text-subtle">{t('addonStudio.graph.emptyHint')}</p>
        </div>
      )}

      {minimap && graph.nodes.length > 0 && (
        <Minimap graph={graph} view={view} size={size} onCenter={onCenter} />
      )}

      {palette && (
        <NodePalette
          x={Math.min(palette.x, size.w - 270)}
          y={Math.min(palette.y, size.h - 370)}
          from={palette.from}
          allow={allow}
          onPick={(def) => onPick(def, palette.wx, palette.wy, palette.from)}
          onClose={onClosePalette}
        />
      )}
    </>
  );
}

export function NodeEditor({
  graph, onChange, allow, resetKey, highlight, pinValues, errorNode, focusNode,
}: {
  graph: Graph;
  onChange: (graph: Graph) => void;
  /** The nodes the palette offers. */
  allow?: (def: NodeDef) => boolean;
  /** When the key changes, the history restarts and the view adjusts. */
  resetKey: string;
  /** Node id → when it was last visited in a test run. */
  highlight?: Record<string, number>;
  /** `node:pin` → the value as text, for the tooltip. */
  pinValues?: Record<string, string>;
  errorNode?: string | null;
  focusNode?: { id: string; token: number; } | null;
}) {
  const {
    containerRef, selection, band, pending, palette, setPalette, editingComment, setEditingComment, minimap, setMinimap,
    spaceRef, mouseRef, defs, connected, history, view, setView, size, fit, editing, keys, drag, focusContainer,
  } = useEditorController({ graph, onChange, resetKey, highlight, focusNode });

  const now = Date.now();
  const gridSize = GRID * view.zoom;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="relative h-full w-full overflow-hidden bg-bg outline-none select-none"
      style={{
        backgroundImage: 'radial-gradient(circle, var(--c-border-strong) 1px, transparent 1.2px)',
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
        cursor: spaceRef.current.down ? 'grab' : undefined,
      }}
      onMouseDown={drag.onBackgroundDown}
      onMouseMove={(e) => { mouseRef.current = { x: e.clientX, y: e.clientY, inside: true }; }}
      onMouseLeave={() => { mouseRef.current.inside = false; }}
      onContextMenu={editing.onContextMenu}
      onKeyDown={keys.onKeyDown}
      onKeyUp={keys.onKeyUp}
      onBlur={() => { spaceRef.current = { down: false, used: false }; }}
    >
      <EditorWorld
        view={view}
        graph={graph}
        defs={defs}
        selection={selection}
        editingComment={editingComment}
        highlight={highlight}
        now={now}
        errorNode={errorNode}
        connected={connected}
        pinValues={pinValues}
        pending={pending}
        band={band}
        onEditing={setEditingComment}
        onFocus={focusContainer}
        onMoveStart={drag.startMove}
        onText={editing.setCommentText}
        onResizeStart={drag.startResize}
        onEdgeDown={editing.onEdgeDown}
        onPinDown={drag.startConnect}
        onValue={editing.setValue}
      />

      {/* Werkzeugleiste */}
      <EditorToolbar
        zoom={view.zoom}
        minimap={minimap}
        canUndo={history.undoRef.current.length > 0}
        canRedo={history.redoRef.current.length > 0}
        historyVersion={history.historyVersion}
        onAddNode={editing.openPaletteAtMouse}
        onAddComment={editing.addComment}
        onUndo={history.undo}
        onRedo={history.redo}
        onFit={() => fit(false)}
        onToggleMinimap={() => setMinimap((m) => !m)}
        onResetZoom={() => setView((v) => ({ ...v, zoom: 1 }))}
      />

      <EditorOverlays
        graph={graph}
        view={view}
        size={size}
        minimap={minimap}
        palette={palette}
        allow={allow}
        onCenter={(x, y) => setView((v: View) => ({ ...v, x: size.w / 2 - x * v.zoom, y: size.h / 2 - y * v.zoom }))}
        onPick={editing.addNode}
        onClosePalette={() => {
          setPalette(null);
          focusContainer();
        }}
      />
    </div>
  );
}
