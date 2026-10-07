/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { DirEntry } from '../../../../electron/preload';
import type { Creating } from './explorer-tree-ops';

export interface MenuState {
  x: number;
  y: number;
  entry: DirEntry | null;
}

export interface TreeApi {
  root: string;
  expanded: Set<string>;
  /** The row with the focus: F2, Enter and "new file in the selected folder" act on it. */
  selected: DirEntry | null;
  /** Every selected row (Ctrl/Shift-click). */
  selection: Set<string>;
  /** Rows cut to the explorer clipboard — drawn faded. */
  cut: Set<string>;
  /** The folder a drag would drop into. */
  dropTarget: string | null;
  renaming: string | null;
  creating: Creating | null;
  refreshToken: number;
  toggle(path: string): void;
  expand(path: string): void;
  select(entry: DirEntry | null): void;
  /** A click on a row; `true` for a plain click, which also opens or toggles. */
  click(event: React.MouseEvent, entry: DirEntry): boolean;
  dragStart(event: React.DragEvent, entry: DirEntry): void;
  /** Dragging over `dir`; `folder` is the hovered folder row, opened after a moment. */
  dragOver(event: React.DragEvent, dir: string, folder?: string): void;
  drop(event: React.DragEvent, dir: string): void;
  dragEnd(): void;
  /** Trash the selection (after one question). */
  removeSelection(): Promise<void>;
  paste(dir: string): Promise<void>;
  /** The selected paths in the order the tree shows them. */
  selectedPaths(): string[];
  startRename(path: string | null): void;
  startCreate(isDir: boolean, dir?: string): void;
  cancelCreate(): void;
  commitCreate(name: string): Promise<void>;
  commitRename(entry: DirEntry, name: string): Promise<void>;
  remove(entry: DirEntry): Promise<void>;
  openMenu(event: React.MouseEvent, entry: DirEntry | null): void;
}
