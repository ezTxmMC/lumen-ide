/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import { type Graph } from '@/core/user-addons/schema';
import { HISTORY_LIMIT } from './node-editor-core';

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
