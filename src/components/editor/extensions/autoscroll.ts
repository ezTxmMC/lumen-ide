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
 * Middle-click autoscroll, as in browsers: the middle button sets an anchor,
 * moving the pointer away from it scrolls — horizontally and vertically, the
 * faster the farther away. A click (or Escape, a key, the wheel, a blur) ends
 * it; so does letting go of the button after dragging (hold mode).
 */

import { EditorView } from '@codemirror/view';

/** Pointer travel (px) without any scrolling around the anchor. */
const DEAD_ZONE = 8;
/** Pointer travel (px) past which a released button ends the scroll (hold mode). */
const HOLD_DISTANCE = 12;
/** Scroll speed (px per frame) per pixel of distance beyond the dead zone. */
const SPEED = 0.18;

function speed(distance: number): number {
  const beyond = Math.abs(distance) - DEAD_ZONE;
  if (beyond <= 0) {
    return 0;
  }
  return Math.sign(distance) * beyond * SPEED;
}

function createAnchor(view: EditorView, x: number, y: number): HTMLElement {
  const anchor = view.dom.ownerDocument.createElement('div');
  anchor.style.cssText = [
    'position:fixed', 'z-index:2147483000', 'width:22px', 'height:22px', 'margin:-11px 0 0 -11px',
    'border-radius:50%', 'border:2px solid currentColor', 'opacity:.7', 'pointer-events:none',
    'background:radial-gradient(circle, currentColor 0 2px, transparent 3px)',
    `left:${x}px`, `top:${y}px`,
  ].join(';');
  anchor.style.color = getComputedStyle(view.dom).color;
  view.dom.ownerDocument.body.append(anchor);
  return anchor;
}

function startAutoscroll(view: EditorView, originX: number, originY: number) {
  const doc = view.dom.ownerDocument;
  const win = doc.defaultView ?? window;
  const anchor = createAnchor(view, originX, originY);
  const previousCursor = view.scrollDOM.style.cursor;
  view.scrollDOM.style.cursor = 'all-scroll';
  let x = originX;
  let y = originY;
  let moved = false;
  let frame = 0;

  const tick = () => {
    view.scrollDOM.scrollLeft += speed(x - originX);
    view.scrollDOM.scrollTop += speed(y - originY);
    frame = win.requestAnimationFrame(tick);
  };

  const stop = () => {
    win.cancelAnimationFrame(frame);
    anchor.remove();
    view.scrollDOM.style.cursor = previousCursor;
    doc.removeEventListener('mousemove', onMove, true);
    doc.removeEventListener('mousedown', onDown, true);
    doc.removeEventListener('mouseup', onUp, true);
    doc.removeEventListener('keydown', stop, true);
    doc.removeEventListener('wheel', stop, true);
    win.removeEventListener('blur', stop);
  };

  const onMove = (event: MouseEvent) => {
    x = event.clientX;
    y = event.clientY;
    if (Math.hypot(x - originX, y - originY) > HOLD_DISTANCE) {
      moved = true;
    }
  };
  const onDown = (event: MouseEvent) => {
    // The click that ends it must not also place the cursor.
    event.preventDefault();
    event.stopPropagation();
    stop();
  };
  const onUp = (event: MouseEvent) => {
    if (event.button === 1 && moved) {
      stop();
    }
  };

  doc.addEventListener('mousemove', onMove, true);
  doc.addEventListener('mousedown', onDown, true);
  doc.addEventListener('mouseup', onUp, true);
  doc.addEventListener('keydown', stop, true);
  doc.addEventListener('wheel', stop, true);
  win.addEventListener('blur', stop);
  frame = win.requestAnimationFrame(tick);
}

export const middleClickAutoscroll = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 1) {
      return false;
    }
    // Without this the platform pastes the selection (Linux) or starts its own scroll.
    event.preventDefault();
    startAutoscroll(view, event.clientX, event.clientY);
    return true;
  },
  // Linux pastes the primary selection on the middle button's mouseup/auxclick.
  auxclick(event) {
    if (event.button !== 1) {
      return false;
    }
    event.preventDefault();
    return true;
  },
});
