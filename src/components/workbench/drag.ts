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
 * The view being dragged between docks, if any.
 *
 * HTML drag and drop hides the dragged data from `dragover` handlers (only the
 * types are readable until the drop), yet the docks need to know a view is on
 * the move to show their drop targets. This tiny store says which one.
 */

import { useSyncExternalStore } from 'react';
import { VIEW_DRAG_TYPE } from '@/state/layout';

let dragging: string | null = null;
const listeners = new Set<() => void>();

function setDragging(id: string | null) {
  if (dragging === id) {
    return;
  }
  dragging = id;
  for (const fn of listeners) {
    fn();
  }
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

/** The id of the view on the move, or `null`. */
export function useDraggedView(): string | null {
  return useSyncExternalStore(subscribe, () => dragging);
}

/** Props for anything that can be picked up as a view (a strip icon, a tab). */
export function viewDragSource(id: string) {
  return {
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      event.dataTransfer.setData(VIEW_DRAG_TYPE, id);
      event.dataTransfer.effectAllowed = 'move';
      // Let the drag image be taken before the drop targets appear under the pointer.
      window.setTimeout(() => setDragging(id), 0);
    },
    onDragEnd: () => setDragging(null),
  };
}

/** Does this drag carry a view? */
export const carriesView = (event: React.DragEvent) => event.dataTransfer.types.includes(VIEW_DRAG_TYPE);

/** The view id of a drop, and the end of the drag. */
export function takeDroppedView(event: React.DragEvent): string | null {
  const id = event.dataTransfer.getData(VIEW_DRAG_TYPE) || dragging;
  setDragging(null);
  return id || null;
}

/** Where among `elements` along an axis the pointer falls — the insertion index. */
export function dropIndex(elements: HTMLElement[], pointer: number, axis: 'x' | 'y'): number {
  for (let i = 0; i < elements.length; i++) {
    const rect = elements[i].getBoundingClientRect();
    const middle = axis === 'x' ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
    if (pointer < middle) {
      return i;
    }
  }
  return elements.length;
}
