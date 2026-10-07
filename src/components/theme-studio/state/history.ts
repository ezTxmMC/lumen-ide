/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** Undo and redo for the theme draft in the Studio. */

import { useCallback, useRef, useState } from 'react';
import type { Theme } from '@/core/types';

/** Changes carrying the same mark within this window are merged (sliders, colour picker). */
const MERGE_MS = 600;
const LIMIT = 200;

interface Entry {
  theme: Theme;
  mark: string;
  at: number;
}

export interface ThemeHistory {
  draft: Theme | null;
  /** Sets the draft; `mark` merges rapid follow-up changes. */
  change: (next: Theme, mark?: string) => void;
  /** Starts a fresh history, when the Studio opens. */
  reset: (theme: Theme | null) => void;
  undo: () => Theme | null;
  redo: () => Theme | null;
  canUndo: boolean;
  canRedo: boolean;
}

export function useThemeHistory(onApply: (theme: Theme) => void): ThemeHistory {
  const past = useRef<Entry[]>([]);
  const future = useRef<Theme[]>([]);
  const [draft, setDraft] = useState<Theme | null>(null);
  const current = useRef<Theme | null>(null);
  const [, bump] = useState(0);

  const commit = (theme: Theme | null) => {
    current.current = theme;
    setDraft(theme);
    bump((n) => n + 1);
  };

  const change = useCallback((next: Theme, mark = '') => {
    const previous = current.current;
    if (!previous) {
      return;
    }
    const now = Date.now();
    const last = past.current[past.current.length - 1];
    const merge = Boolean(mark) && last?.mark === mark && now - last.at < MERGE_MS;
    if (merge) {
      last.at = now;
    }
    if (!merge) {
      past.current = [...past.current, { theme: previous, mark, at: now }].slice(-LIMIT);
    }
    future.current = [];
    commit(next);
    onApply(next);
  }, [onApply]);

  const reset = useCallback((theme: Theme | null) => {
    past.current = [];
    future.current = [];
    commit(theme);
  }, []);

  const undo = useCallback(() => {
    const entry = past.current.pop();
    if (!entry || !current.current) {
      return null;
    }
    future.current.push(current.current);
    commit(entry.theme);
    onApply(entry.theme);
    return entry.theme;
  }, [onApply]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next || !current.current) {
      return null;
    }
    past.current.push({ theme: current.current, mark: '', at: 0 });
    commit(next);
    onApply(next);
    return next;
  }, [onApply]);

  return {
    draft,
    change,
    reset,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
