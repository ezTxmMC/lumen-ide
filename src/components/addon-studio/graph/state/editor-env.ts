/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import { type Graph } from '@/core/user-addons/schema';
import { type PaletteState, type Point, type View } from './node-editor-core';

export type Setter<T> = Dispatch<SetStateAction<T>>;

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
