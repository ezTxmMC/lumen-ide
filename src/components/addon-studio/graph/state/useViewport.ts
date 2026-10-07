/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { type Graph } from '@/core/user-addons/schema';
import { NODE_WIDTH, type Rect } from './geometry';
import { clampZoom, nodeRect, type View } from './node-editor-core';
import { type Setter } from './editor-env';

interface ViewportEnv {
  containerRef: RefObject<HTMLDivElement | null>;
  graphRef: MutableRefObject<Graph>;
  selectionRef: MutableRefObject<Set<string>>;
  focusNode?: { id: string; token: number; } | null;
  setSelection: Setter<Set<string>>;
}

/** The framing that shows the given node rectangles centred in a viewport. */
function framing(rects: Rect[], w: number, h: number): View {
  if (!rects.length) {
    return { x: 40, y: 40, zoom: 1 };
  }
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  const zoom = clampZoom(Math.min(1, (w - 80) / (maxX - minX || 1), (h - 80) / (maxY - minY || 1)));
  return {
    zoom,
    x: (w - (maxX - minX) * zoom) / 2 - minX * zoom,
    y: (h - (maxY - minY) * zoom) / 2 - minY * zoom,
  };
}

/** The wheel: Ctrl zooms around the pointer, otherwise it pans. */
function wheelView(event: WheelEvent, v: View, el: HTMLElement): View {
  if (event.ctrlKey || event.metaKey) {
    const rect = el.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const zoom = clampZoom(v.zoom * Math.exp(-event.deltaY * 0.0015));
    return { zoom, x: px - ((px - v.x) / v.zoom) * zoom, y: py - ((py - v.y) / v.zoom) * zoom };
  }
  const dx = event.shiftKey ? event.deltaY : event.deltaX;
  const dy = event.shiftKey ? 0 : event.deltaY;
  return { ...v, x: v.x - dx, y: v.y - dy };
}

export function useViewport(env: ViewportEnv) {
  const {
    containerRef, graphRef, selectionRef, focusNode, setSelection,
  } = env;
  const [view, setView] = useState<View>({ x: 40, y: 40, zoom: 1 });
  const [size, setSize] = useState({ w: 800, h: 500 });
  const viewRef = useRef(view);
  viewRef.current = view;

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: (clientX - (rect?.left ?? 0) - v.x) / v.zoom,
      y: (clientY - (rect?.top ?? 0) - v.y) / v.zoom,
    };
  }, [containerRef]);

  const fit = useCallback((onlySelection = false) => {
    const current = graphRef.current;
    const chosen = onlySelection ? current.nodes.filter((n) => selectionRef.current.has(n.id)) : current.nodes;
    const el = containerRef.current;
    if (!el) {
      return;
    }
    setView(framing(chosen.map(nodeRect), el.clientWidth, el.clientHeight));
  }, [containerRef, graphRef, selectionRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef, setSize]);

  useEffect(() => {
    if (!focusNode) {
      return;
    }
    const node = graphRef.current.nodes.find((n) => n.id === focusNode.id);
    const el = containerRef.current;
    if (!node || !el) {
      return;
    }
    const zoom = viewRef.current.zoom;
    setView({ zoom, x: el.clientWidth / 2 - (node.x + NODE_WIDTH / 2) * zoom, y: el.clientHeight / 2 - (node.y + 40) * zoom });
    setSelection(new Set([node.id]));
  }, [focusNode, containerRef, graphRef, setSelection, setView, viewRef]);

  // Non-passive, so the wheel can preventDefault.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement | null)?.closest?.('[data-no-wheel]')) {
        return;
      }
      event.preventDefault();
      setView(wheelView(event, viewRef.current, el));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [containerRef, setView, viewRef]);

  return {
    view, setView, viewRef, size, toWorld, fit,
  };
}
