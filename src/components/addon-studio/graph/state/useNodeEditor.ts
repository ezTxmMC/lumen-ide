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

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useT } from '@/i18n';
import { NODE_CATALOG } from '@/core/user-addons/catalog';
import { type Graph } from '@/core/user-addons/schema';
import { type Rect } from './geometry';
import { HOT_MS, connectedPins, type PaletteState, type PendingLink } from './node-editor-core';
import { useGraphHistory } from './useGraphHistory';
import { useViewport } from './useViewport';
import { useNodeDrag } from './useNodeDrag';
import { useGraphEditing, useEditorKeys } from './useGraphEditing';

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
