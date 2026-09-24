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
 * The `grid` node of an extension view: a table of rows — query results,
 * table data, the keys of a store.
 *
 * Only the rows in sight are drawn (fixed row height), so a result of tens of
 * thousands of rows scrolls as smoothly as one of ten. Columns can be resized
 * and sorted, cells edited in place; selection, edits, sorting and paging go
 * back to the extension as actions.
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { ArrowDown, ArrowUp, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Clipboard, KeyRound, Eraser } from 'lucide-react';
import { useT } from '@/i18n';
import type { GridColumn, GridRow, GridValue, ViewAction, ViewGridNode } from '../../../electron/features/extension-host/contract';
import { namedIcon } from '../ui/named-icons';
import { Button } from '../ui';
import { ContextMenu, type MenuItem } from '../ui/ContextMenu';
import { TONE_TEXT } from './tones';
import { windowOf } from '@/hooks/useOwner';

const ROW_HEIGHT = 24;
const HEADER_HEIGHT = 34;
const GUTTER_WIDTH = 48;
const DEFAULT_WIDTH = 160;
const MIN_WIDTH = 48;
/** Rows drawn above and below the visible ones, so fast scrolling does not flash. */
const OVERSCAN = 12;

interface Props {
  node: ViewGridNode;
  selected: string[];
  onSelect: (ids: string[]) => void;
  run: (action: ViewAction) => void;
}

interface Editing {
  row: string;
  column: number;
  text: string;
}

/** Carry the action's own payload along as `data`. */
function withPayload(action: ViewAction, payload: Record<string, unknown>): ViewAction {
  return { ...action, payload: { ...payload, data: action.payload } };
}

export function displayValue(value: GridValue, nullText: string): string {
  if (value === null || value === undefined) {
    return nullText;
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
}

/** The next sort after a click on a header: ascending, descending, unsorted. */
export function nextSort(current: ViewGridNode['sort'], column: string): { column: string; direction: 'asc' | 'desc' | null; } {
  if (current?.column !== column) {
    return { column, direction: 'asc' };
  }
  if (current.direction === 'asc') {
    return { column, direction: 'desc' };
  }
  return { column, direction: null };
}

/** Tab-separated text of rows, the way spreadsheets paste it. */
function rowsAsText(rows: GridRow[], nullText: string): string {
  return rows.map((row) => row.cells.map((cell) => displayValue(cell, nullText).replace(/[\t\n]/g, ' ')).join('\t')).join('\n');
}

type GridMenu = { x: number; y: number; items: MenuItem[]; };

/** The height of the scroller, kept current for the windowing of rows. */
function useViewportHeight(scroller: RefObject<HTMLDivElement | null>) {
  const [viewport, setViewport] = useState(400);
  useEffect(() => {
    const element = scroller.current;
    if (!element) {
      return;
    }
    const observer = new (windowOf(element).ResizeObserver)(() => setViewport(element.clientHeight));
    observer.observe(element);
    setViewport(element.clientHeight);
    return () => observer.disconnect();
  }, [scroller]);
  return viewport;
}

/** Column widths the user dragged, on top of the widths the node asks for. */
function useColumnWidths() {
  const [widths, setWidths] = useState<Record<string, number>>({});
  const columnWidth = (column: GridColumn) => widths[column.id] ?? column.width ?? DEFAULT_WIDTH;

  const startResize = (event: React.PointerEvent, column: GridColumn) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidth(column);
    // The window the grid is in — a popped-out view's pointer moves in its own window.
    const win = windowOf(event.currentTarget as Element);
    win.document.body.classList.add('lm-resizing');
    const move = (e: PointerEvent) => setWidths((current) => ({ ...current, [column.id]: Math.max(MIN_WIDTH, startWidth + e.clientX - startX) }));
    const up = () => {
      win.document.body.classList.remove('lm-resizing');
      win.removeEventListener('pointermove', move);
      win.removeEventListener('pointerup', up);
    };
    win.addEventListener('pointermove', move);
    win.addEventListener('pointerup', up);
  };

  return { columnWidth, startResize };
}

/** In-place cell editing. */
function useGridEditing(node: ViewGridNode, rowIndex: Map<string, number>, run: (action: ViewAction) => void) {
  const [editing, setEditingState] = useState<Editing | null>(null);
  // Blur and Enter can both end an edit; the ref makes sure only the first counts.
  const editRef = useRef<Editing | null>(null);
  const setEditing = (next: Editing | null | ((current: Editing | null) => Editing | null)) => {
    const value = typeof next === 'function' ? next(editRef.current) : next;
    editRef.current = value;
    setEditingState(value);
  };

  const startEdit = (row: GridRow, column: number) => {
    const spec = node.columns[column];
    if (!spec?.editable || !node.onEdit) {
      return false;
    }
    const value = row.cells[column];
    setEditing({ row: row.id, column, text: value === null || value === undefined ? '' : displayValue(value, '') });
    return true;
  };

  /** `undefined` cancels. */
  const commitEdit = (value: string | null | undefined) => {
    const current = editRef.current;
    setEditing(null);
    if (!current || value === undefined || !node.onEdit) {
      return;
    }
    const row = node.rows[rowIndex.get(current.row) ?? -1];
    const before = row?.cells[current.column];
    const unchanged = value === null ? before === null : before !== null && displayValue(before ?? null, '') === value;
    if (unchanged) {
      return;
    }
    run(withPayload(node.onEdit, { row: current.row, column: node.columns[current.column].id, value }));
  };

  return { editing, setEditing, startEdit, commitEdit };
}

interface SelectionEnv {
  node: ViewGridNode;
  selected: string[];
  selectedSet: Set<string>;
  rowIndex: Map<string, number>;
  onSelect: (ids: string[]) => void;
  run: (action: ViewAction) => void;
  scroller: RefObject<HTMLDivElement | null>;
  nullText: string;
}

/** Row selection, keyboard navigation and opening of rows. */
function useGridSelection(env: SelectionEnv) {
  const { node, selected, selectedSet, rowIndex, onSelect, run, scroller, nullText } = env;
  const anchor = useRef<string | null>(null);

  const select = (id: string, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; }) => {
    if (!node.select) {
      return;
    }
    const additive = node.select === 'multi' && (event.ctrlKey || event.metaKey);
    const range = node.select === 'multi' && event.shiftKey && anchor.current !== null;
    if (range) {
      const from = rowIndex.get(anchor.current!) ?? 0;
      const to = rowIndex.get(id) ?? 0;
      const [low, high] = from < to ? [from, to] : [to, from];
      onSelect(node.rows.slice(low, high + 1).map((row) => row.id));
      return;
    }
    anchor.current = id;
    if (!additive) {
      onSelect([id]);
      return;
    }
    onSelect(selectedSet.has(id) ? selected.filter((entry) => entry !== id) : [...selected, id]);
  };

  const open = (id: string) => {
    if (node.onOpen) {
      run(withPayload(node.onOpen, { row: id }));
    }
  };

  const moveSelection = (delta: number) => {
    const current = selected.length ? rowIndex.get(selected[selected.length - 1]) ?? -1 : -1;
    const next = Math.min(node.rows.length - 1, Math.max(0, current + delta));
    const row = node.rows[next];
    if (!row) {
      return;
    }
    anchor.current = row.id;
    onSelect([row.id]);
    const element = scroller.current;
    if (!element) {
      return;
    }
    const top = next * ROW_HEIGHT;
    if (top < element.scrollTop) {
      element.scrollTop = top;
    }
    if (top + ROW_HEIGHT > element.scrollTop + element.clientHeight - HEADER_HEIGHT) {
      element.scrollTop = top + ROW_HEIGHT - element.clientHeight + HEADER_HEIGHT;
    }
  };

  const onKeyDown = (event: React.KeyboardEvent, editing: Editing | null) => {
    if (editing) {
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Enter' && selected.length === 1) {
      event.preventDefault();
      open(selected[0]);
      return;
    }
    if (event.key === 'a' && (event.ctrlKey || event.metaKey) && node.select === 'multi') {
      event.preventDefault();
      onSelect(node.rows.map((row) => row.id));
      return;
    }
    if (event.key === 'c' && (event.ctrlKey || event.metaKey) && selected.length) {
      event.preventDefault();
      void navigator.clipboard.writeText(rowsAsText(node.rows.filter((row) => selectedSet.has(row.id)), nullText)).catch(() => {});
    }
  };

  return { anchor, select, open, onKeyDown };
}

interface MenuEnv {
  node: ViewGridNode;
  row: GridRow;
  column: number;
  selectedSet: Set<string>;
  nullText: string;
  t: ReturnType<typeof useT>;
  run: (action: ViewAction) => void;
  startEdit: (row: GridRow, column: number) => boolean;
}

/** The context menu of a cell: edit, copy, and the node's own row actions. */
function rowMenuItems({ node, row, column, selectedSet, nullText, t, run, startEdit }: MenuEnv): MenuItem[] {
  const spec = node.columns[column];
  const items: MenuItem[] = [];
  if (spec?.editable && node.onEdit) {
    items.push({ label: t('extensionView.grid.edit'), run: () => startEdit(row, column) });
    if (spec.nullable) {
      items.push({
        label: t('extensionView.grid.setNull'), icon: Eraser,
        run: () => run(withPayload(node.onEdit!, { row: row.id, column: spec.id, value: null })),
      });
    }
  }
  if (spec) {
    items.push({
      label: t('extensionView.grid.copyValue'), icon: Clipboard,
      run: () => void navigator.clipboard.writeText(displayValue(row.cells[column] ?? null, '')).catch(() => {}),
    });
  }
  items.push({
    label: t('extensionView.grid.copyRows'), icon: Clipboard,
    run: () => {
      const rows = selectedSet.has(row.id) ? node.rows.filter((entry) => selectedSet.has(entry.id)) : [row];
      void navigator.clipboard.writeText(rowsAsText(rows, nullText)).catch(() => {});
    },
  });
  if (node.menu?.length) {
    items.push('sep');
  }
  for (const action of node.menu ?? []) {
    items.push({
      label: action.title, icon: action.icon ? namedIcon(action.icon) : undefined, danger: action.danger,
      disabled: action.disabled, run: () => run(withPayload(action, { row: row.id })),
    });
  }
  return items;
}

export function GridView({ node, selected, onSelect, run }: Props) {
  const t = useT();
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const viewport = useViewportHeight(scroller);
  const { columnWidth, startResize } = useColumnWidths();
  const [menu, setMenu] = useState<GridMenu | null>(null);
  const nullText = t('extensionView.grid.null');
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const rowIndex = useMemo(() => new Map(node.rows.map((row, index) => [row.id, index])), [node.rows]);
  const { editing, setEditing, startEdit, commitEdit } = useGridEditing(node, rowIndex, run);
  const { anchor, select, open, onKeyDown } = useGridSelection({
    node, selected, selectedSet, rowIndex, onSelect, run, scroller, nullText,
  });

  const totalWidth = GUTTER_WIDTH + node.columns.reduce((sum, column) => sum + columnWidth(column), 0);
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(node.rows.length, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + OVERSCAN);
  const offset = node.paging?.offset ?? 0;

  const openMenu = (event: React.MouseEvent, row: GridRow, column: number) => {
    event.preventDefault();
    if (!selectedSet.has(row.id)) {
      anchor.current = row.id;
      if (node.select) {
        onSelect([row.id]);
      }
    }
    const items = rowMenuItems({ node, row, column, selectedSet, nullText, t, run, startEdit });
    setMenu({ x: event.clientX, y: event.clientY, items });
  };

  const sortBy = (column: GridColumn) => {
    if (!column.sortable || !node.onSort) {
      return;
    }
    run(withPayload(node.onSort, nextSort(node.sort, column.id)));
  };

  const height = node.grow ? undefined : node.height ?? 320;

  return (
    <div className={node.grow ? 'flex min-h-0 flex-1 flex-col px-3 py-1' : 'flex flex-col px-3 py-1'}>
      <div
        ref={scroller}
        tabIndex={0}
        onKeyDown={(event) => onKeyDown(event, editing)}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="lm-grid relative min-h-0 flex-1 overflow-auto rounded-lumen-sm border border-edge bg-bg text-[12px] outline-none focus-visible:border-accent"
        style={height ? { height } : undefined}
      >
        <div style={{ width: totalWidth, minWidth: '100%', height: HEADER_HEIGHT + node.rows.length * ROW_HEIGHT }} className="relative">
          <Header node={node} columnWidth={columnWidth} onSort={sortBy} onResize={startResize} />
          {node.rows.slice(first, last).map((row, index) => (
            <Row
              key={row.id}
              row={row}
              index={first + index}
              number={offset + first + index + 1}
              node={node}
              columnWidth={columnWidth}
              selected={selectedSet.has(row.id)}
              editing={editing?.row === row.id ? editing : null}
              nullText={nullText}
              onClick={(event) => {
                select(row.id, event);
                if (node.activate === 'click') {
                  open(row.id);
                }
              }}
              onDoubleClick={(column) => {
                if (startEdit(row, column)) {
                  return;
                }
                open(row.id);
              }}
              onMenu={(event, column) => openMenu(event, row, column)}
              onEditChange={(text) => setEditing((current) => (current ? { ...current, text } : current))}
              onEditDone={commitEdit}
            />
          ))}
        </div>
        {!node.rows.length && (
          <div className="pointer-events-none absolute inset-x-0 top-10 text-center text-[12px] text-subtle">
            {node.empty ?? t('extensionView.grid.empty')}
          </div>
        )}
      </div>
      {node.paging && <Paging paging={node.paging} count={node.rows.length} run={run} />}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}

function Header({ node, columnWidth, onSort, onResize }: {
  node: ViewGridNode;
  columnWidth: (column: GridColumn) => number;
  onSort: (column: GridColumn) => void;
  onResize: (event: React.PointerEvent, column: GridColumn) => void;
}) {
  return (
    <div className="sticky top-0 z-10 flex border-b border-edge bg-surface" style={{ height: HEADER_HEIGHT }}>
      <div className="sticky left-0 z-10 shrink-0 border-r border-edge bg-surface" style={{ width: GUTTER_WIDTH }} />
      {node.columns.map((column) => {
        const sorted = node.sort?.column === column.id ? node.sort.direction : null;
        return (
          <div
            key={column.id}
            onClick={() => onSort(column)}
            title={[column.title, column.detail].filter(Boolean).join(' · ')}
            className={`group/head relative flex shrink-0 flex-col justify-center border-r border-edge px-2 ${column.sortable && node.onSort ? 'cursor-pointer hover:bg-hover' : ''}`}
            style={{ width: columnWidth(column) }}
          >
            <span className="flex min-w-0 items-center gap-1 font-medium text-fg">
              {column.key && <KeyRound size={10} className="shrink-0 text-warn" />}
              <span className="truncate">{column.title}</span>
              {sorted === 'asc' && <ArrowUp size={11} className="shrink-0 text-accent" />}
              {sorted === 'desc' && <ArrowDown size={11} className="shrink-0 text-accent" />}
            </span>
            {column.detail && <span className="truncate text-[10.5px] text-subtle">{column.detail}</span>}
            <span
              onPointerDown={(e) => onResize(e, column)}
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-y-0 -right-[3px] z-10 w-[6px] cursor-col-resize hover:bg-accent/60"
            />
          </div>
        );
      })}
    </div>
  );
}

function Row({
  row, index, number, node, columnWidth, selected, editing, nullText, onClick, onDoubleClick, onMenu, onEditChange, onEditDone,
}: {
  row: GridRow;
  index: number;
  number: number;
  node: ViewGridNode;
  columnWidth: (column: GridColumn) => number;
  selected: boolean;
  editing: Editing | null;
  nullText: string;
  onClick: (event: React.MouseEvent) => void;
  onDoubleClick: (column: number) => void;
  onMenu: (event: React.MouseEvent, column: number) => void;
  onEditChange: (text: string) => void;
  onEditDone: (value: string | null | undefined) => void;
}) {
  const changed = new Set(row.changed ?? []);
  const tone = row.tone ? TONE_TEXT[row.tone] : 'text-muted';
  return (
    <div
      onClick={onClick}
      className={`absolute left-0 flex ${selected ? 'bg-accent/15' : 'hover:bg-hover'} ${row.strike ? 'line-through' : ''} ${tone}`}
      style={{ top: HEADER_HEIGHT + index * ROW_HEIGHT, height: ROW_HEIGHT, minWidth: '100%' }}
    >
      <div
        className={`sticky left-0 shrink-0 border-r border-b border-edge px-1.5 text-right font-mono text-[10.5px] leading-[23px] text-subtle ${selected ? 'bg-active' : 'bg-surface'}`}
        style={{ width: GUTTER_WIDTH }}
        onContextMenu={(e) => onMenu(e, -1)}
      >
        {number}
      </div>
      {node.columns.map((column, columnIndex) => {
        const value = row.cells[columnIndex] ?? null;
        const isEditing = editing?.column === columnIndex;
        const numeric = column.numeric || typeof value === 'number';
        return (
          <div
            key={column.id}
            onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(columnIndex); }}
            onContextMenu={(e) => onMenu(e, columnIndex)}
            className={[
              'shrink-0 truncate border-r border-b border-edge px-2 leading-[23px]',
              numeric ? 'text-right tabular-nums' : '',
              changed.has(columnIndex) ? 'bg-warn/15' : '',
              value === null ? 'italic text-subtle' : '',
            ].join(' ')}
            style={{ width: columnWidth(column) }}
            title={value === null ? undefined : displayValue(value, nullText).slice(0, 2000)}
          >
            {isEditing && (
              <input
                autoFocus
                value={editing.text}
                spellCheck={false}
                onChange={(e) => onEditChange(e.target.value)}
                onBlur={() => onEditDone(editing.text)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    onEditDone(editing.text);
                  }
                  if (e.key === 'Escape') {
                    onEditDone(undefined);
                  }
                }}
                className="h-[22px] w-full rounded-sm border border-accent bg-input px-1 text-fg not-italic outline-none"
              />
            )}
            {!isEditing && displayValue(value, nullText)}
          </div>
        );
      })}
    </div>
  );
}

function Paging({ paging, count, run }: { paging: NonNullable<ViewGridNode['paging']>; count: number; run: (action: ViewAction) => void; }) {
  const t = useT();
  const { offset, limit, total } = paging;
  const from = count ? offset + 1 : 0;
  const to = offset + count;
  const hasNext = total !== undefined ? to < total : Boolean(paging.more);
  const lastOffset = total !== undefined && total > 0 ? Math.floor((total - 1) / limit) * limit : offset;
  const go = (next: number) => run(withPayload(paging.action, { offset: Math.max(0, next) }));
  const label = total !== undefined
    ? t('extensionView.grid.rangeOf', { from, to, total })
    : t('extensionView.grid.range', { from, to });
  return (
    <div className="flex shrink-0 items-center justify-end gap-0.5 pt-1 text-[11.5px] text-subtle">
      <span className="mr-2 tabular-nums">{label}</span>
      <Button size="sm" title={t('extensionView.grid.first')} disabled={offset === 0} onClick={() => go(0)}><ChevronFirst size={13} /></Button>
      <Button size="sm" title={t('extensionView.grid.previous')} disabled={offset === 0} onClick={() => go(offset - limit)}><ChevronLeft size={13} /></Button>
      <Button size="sm" title={t('extensionView.grid.next')} disabled={!hasNext} onClick={() => go(offset + limit)}><ChevronRight size={13} /></Button>
      {total !== undefined && (
        <Button size="sm" title={t('extensionView.grid.last')} disabled={!hasNext} onClick={() => go(lastOffset)}><ChevronLast size={13} /></Button>
      )}
    </div>
  );
}
