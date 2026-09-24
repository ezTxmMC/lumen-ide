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
 * The debugger inside the editor: a gutter with breakpoints (click, and a
 * right-click menu), the current execution line, inline values and hover
 * evaluation.
 *
 * Breakpoints live as positions in the editor state and so travel with every
 * text change; the resulting lines then go back to the breakpoint store.
 */

import {
  Facet, Prec, RangeSetBuilder, StateEffect, StateField, type EditorState, type Extension,
} from '@codemirror/state';
import {
  Decoration, EditorView, GutterMarker, ViewPlugin, WidgetType, gutter, hoverTooltip, showTooltip,
  type DecorationSet, type Tooltip, type ViewUpdate,
} from '@codemirror/view';
import { useStore } from '@/state/store';
import { t } from '@/i18n';
import type { EditorContext } from '@/lib/editor-extensions';
import { breakpoints, type BreakpointEntry } from './breakpoints';
import { debug } from './manager';
import { samePath } from './paths';
import { editBreakpoint } from './actions';

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

interface ViewInfo {
  path: string | null;
  tabId: string;
}

const infoFacet = Facet.define<ViewInfo, ViewInfo>({
  combine: (values) => values[0] ?? { path: null, tabId: '' },
});

interface Mark {
  id: string;
  /** Start of the line. */
  pos: number;
  classes: string;
  title: string;
}

const setMarks = StateEffect.define<Mark[]>();

function lineStart(state: EditorState, line: number) {
  const number = Math.min(Math.max(line + 1, 1), state.doc.lines);
  return state.doc.line(number).from;
}

function markClasses(bp: BreakpointEntry) {
  const status = breakpoints.statusOf(bp.id);
  const classes = ['lm-bp'];
  if (!bp.enabled) {
    classes.push('lm-bp-disabled');
  }
  if (bp.logMessage) {
    classes.push('lm-bp-log');
  }
  if (bp.condition || bp.hitCondition) {
    classes.push('lm-bp-conditional');
  }
  if (bp.enabled && debug.hasSessions && status && !status.verified) {
    classes.push('lm-bp-unverified');
  }
  return classes.join(' ');
}

function markTitle(bp: BreakpointEntry) {
  const status = breakpoints.statusOf(bp.id);
  const parts = [bp.logMessage ? t('debug.bp.logpoint', { message: bp.logMessage }) : t('debug.bp.breakpoint')];
  if (bp.condition) {
    parts.push(t('debug.bp.conditionIs', { condition: bp.condition }));
  }
  if (bp.hitCondition) {
    parts.push(t('debug.bp.hitIs', { hits: bp.hitCondition }));
  }
  if (!bp.enabled) {
    parts.push(t('debug.bp.disabled'));
  }
  if (status && !status.verified) {
    parts.push(status.message ?? t('debug.bp.unverified'));
  }
  return parts.join('\n');
}

function marksFor(state: EditorState, path: string | null): Mark[] {
  return breakpoints.forPath(path).map((bp) => ({
    id: bp.id,
    pos: lineStart(state, bp.line),
    classes: markClasses(bp),
    title: markTitle(bp),
  }));
}

const marksField = StateField.define<Mark[]>({
  create: (state) => marksFor(state, state.facet(infoFacet).path),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setMarks)) {
        return effect.value;
      }
    }
    if (!tr.docChanged) {
      return value;
    }
    return value.map((mark) => ({ ...mark, pos: tr.state.doc.lineAt(tr.changes.mapPos(mark.pos, 1)).from }));
  },
});

interface ExecMark {
  pos: number;
  top: boolean;
}

const setExec = StateEffect.define<ExecMark | null>();

function execFor(state: EditorState, path: string | null): ExecMark | null {
  const exec = debug.exec;
  if (!exec || !samePath(exec.path, path)) {
    return null;
  }
  return { pos: lineStart(state, exec.line), top: exec.top };
}

const execField = StateField.define<ExecMark | null>({
  create: (state) => execFor(state, state.facet(infoFacet).path),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setExec)) {
        return effect.value;
      }
    }
    if (!value || !tr.docChanged) {
      return value;
    }
    return { ...value, pos: tr.state.doc.lineAt(tr.changes.mapPos(value.pos, 1)).from };
  },
  provide: (field) => EditorView.decorations.from(field, (exec) => {
    if (!exec) {
      return Decoration.none;
    }
    const cls = exec.top ? 'lm-debug-exec-line' : 'lm-debug-frame-line';
    return Decoration.set([Decoration.line({ class: cls }).range(exec.pos)]);
  }),
});

interface InlineInfo {
  line: number;
  values: Map<string, string>;
}

const setInline = StateEffect.define<InlineInfo | null>();

function inlineFor(path: string | null): InlineInfo | null {
  const inline = debug.inline;
  if (!inline || !debug.showInline || !samePath(inline.path, path)) {
    return null;
  }
  return { line: inline.line, values: inline.values };
}

const inlineField = StateField.define<InlineInfo | null>({
  create: (state) => inlineFor(state.facet(infoFacet).path),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setInline)) {
        return effect.value;
      }
    }
    // After a change the values no longer line up with the text.
    if (tr.docChanged) {
      return null;
    }
    return value;
  },
});

class InlineWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  eq(other: InlineWidget) {
    return other.text === this.text;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'lm-debug-inline';
    span.textContent = this.text;
    return span;
  }

  ignoreEvent() {
    return true;
  }
}

const IDENTIFIER = /[A-Za-z_$][\w$]*/g;
const MAX_INLINE = 60;

function shorten(value: string, max = 40) {
  const flat = value.replace(/\s+/g, ' ');
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Every variable at its last occurrence above the execution line. */
function inlineDecorations(state: EditorState): DecorationSet {
  const info = state.field(inlineField);
  if (!info || !info.values.size) {
    return Decoration.none;
  }
  const last = Math.min(info.line + 1, state.doc.lines);
  const first = Math.max(1, last - MAX_INLINE);
  const seen = new Set<string>();
  const perLine = new Map<number, string[]>();
  for (let number = last; number >= first; number--) {
    for (const match of state.doc.line(number).text.matchAll(IDENTIFIER)) {
      const name = match[0];
      if (seen.has(name) || !info.values.has(name)) {
        continue;
      }
      seen.add(name);
      const list = perLine.get(number) ?? [];
      list.push(`${name} = ${shorten(info.values.get(name) ?? '')}`);
      perLine.set(number, list);
    }
  }
  const builder = new RangeSetBuilder<Decoration>();
  for (const number of [...perLine.keys()].sort((a, b) => a - b)) {
    const text = perLine.get(number)!.slice(0, 5).join(', ');
    builder.add(state.doc.line(number).to, state.doc.line(number).to, Decoration.widget({ widget: new InlineWidget(text), side: 1 }));
  }
  return builder.finish();
}

const inlineDecorationsExt = EditorView.decorations.compute([inlineField], inlineDecorations);

/* ------------------------------------------------------------------ *
 * Gutter
 * ------------------------------------------------------------------ */

class BreakpointMarker extends GutterMarker {
  constructor(readonly classes: string, readonly title: string, readonly exec: 'top' | 'frame' | null) {
    super();
  }

  eq(other: BreakpointMarker) {
    return other.classes === this.classes && other.title === this.title && other.exec === this.exec;
  }

  toDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'lm-debug-mark';
    if (this.title) {
      wrap.title = this.title;
    }
    if (this.classes) {
      const dot = document.createElement('div');
      dot.className = this.classes;
      wrap.append(dot);
    }
    if (this.exec) {
      const arrow = document.createElement('div');
      arrow.className = this.exec === 'top' ? 'lm-exec-arrow' : 'lm-exec-arrow lm-exec-arrow-frame';
      wrap.append(arrow);
    }
    return wrap;
  }
}

function gutterMarkers(view: EditorView) {
  const state = view.state;
  const marks = state.field(marksField);
  const exec = state.field(execField);
  const byPos = new Map<number, { classes: string; title: string; exec: 'top' | 'frame' | null; }>();
  for (const mark of marks) {
    byPos.set(mark.pos, { classes: mark.classes, title: mark.title, exec: null });
  }
  if (exec) {
    const existing = byPos.get(exec.pos);
    byPos.set(exec.pos, { classes: existing?.classes ?? '', title: existing?.title ?? '', exec: exec.top ? 'top' : 'frame' });
  }
  const builder = new RangeSetBuilder<GutterMarker>();
  for (const pos of [...byPos.keys()].sort((a, b) => a - b)) {
    const entry = byPos.get(pos)!;
    builder.add(pos, pos, new BreakpointMarker(entry.classes, entry.title, entry.exec));
  }
  return builder.finish();
}

const spacer = new BreakpointMarker('lm-bp', '', null);

/* ------------------------------------------------------------------ *
 * Right-click menu
 * ------------------------------------------------------------------ */

interface MenuState {
  pos: number;
  line: number;
}

const setMenu = StateEffect.define<MenuState | null>();

interface MenuItem {
  label: string;
  run: () => void;
  danger?: boolean;
}

function menuItems(path: string, line: number): MenuItem[] {
  const bp = breakpoints.at(path, line);
  const running = debug.hasSessions;
  const debugItem: MenuItem = running
    ? { label: t('debug.menu.runToLine'), run: () => void debug.runToCursor(path, line) }
    : { label: t('debug.menu.debugFromHere'), run: () => void debug.debugFrom(path, line) };
  if (!bp) {
    return [
      { label: t('debug.menu.add'), run: () => breakpoints.add(path, line) },
      { label: t('debug.menu.addConditional'), run: () => editBreakpoint(path, line, 'condition') },
      { label: t('debug.menu.addLogpoint'), run: () => editBreakpoint(path, line, 'logMessage') },
      debugItem,
    ];
  }
  return [
    { label: t('debug.menu.editCondition'), run: () => editBreakpoint(path, line, 'condition') },
    { label: t('debug.menu.editHitCount'), run: () => editBreakpoint(path, line, 'hitCondition') },
    { label: t('debug.menu.editLogpoint'), run: () => editBreakpoint(path, line, 'logMessage') },
    { label: bp.enabled ? t('debug.menu.disable') : t('debug.menu.enable'), run: () => breakpoints.update(bp.id, { enabled: !bp.enabled }) },
    debugItem,
    { label: t('debug.menu.remove'), run: () => breakpoints.remove(bp.id), danger: true },
  ];
}

function renderMenu(view: EditorView, menu: MenuState): HTMLElement {
  const dom = document.createElement('div');
  dom.className = 'lm-menu lm-debug-menu';
  const path = view.state.facet(infoFacet).path;
  const title = document.createElement('div');
  title.className = 'lm-menu-title';
  title.textContent = t('debug.menu.title', { line: menu.line + 1 });
  dom.append(title);
  const close = () => view.dispatch({ effects: setMenu.of(null) });
  for (const item of path ? menuItems(path, menu.line) : []) {
    const row = document.createElement('div');
    row.className = item.danger ? 'lm-menu-item lm-debug-menu-danger' : 'lm-menu-item';
    row.setAttribute('role', 'menuitem');
    row.textContent = item.label;
    row.addEventListener('mousedown', (event) => event.preventDefault());
    row.addEventListener('click', () => {
      close();
      item.run();
    });
    dom.append(row);
  }
  return dom;
}

const menuField = StateField.define<MenuState | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setMenu)) {
        return effect.value;
      }
    }
    if (value && tr.docChanged) {
      return null;
    }
    return value;
  },
  provide: (field) => showTooltip.compute([field], (state): Tooltip | null => {
    const menu = state.field(field);
    if (!menu) {
      return null;
    }
    return {
      pos: menu.pos,
      above: false,
      strictSide: false,
      arrow: false,
      create: (view) => {
        const dom = renderMenu(view, menu);
        const outside = (event: MouseEvent) => {
          if (dom.contains(event.target as Node)) {
            return;
          }
          view.dispatch({ effects: setMenu.of(null) });
        };
        const escape = (event: KeyboardEvent) => {
          if (event.key !== 'Escape') {
            return;
          }
          event.stopPropagation();
          view.dispatch({ effects: setMenu.of(null) });
        };
        return {
          dom,
          mount: () => {
            document.addEventListener('mousedown', outside, true);
            document.addEventListener('keydown', escape, true);
          },
          destroy: () => {
            document.removeEventListener('mousedown', outside, true);
            document.removeEventListener('keydown', escape, true);
          },
        };
      },
    };
  }),
});

/* ------------------------------------------------------------------ *
 * Hover
 * ------------------------------------------------------------------ */

const WORD = /[\w$]/;

/** The expression under the pointer: the identifier plus any `a.b`/`a->b` chain to its left. */
function expressionAt(state: EditorState, pos: number): { from: number; to: number; text: string; } | null {
  const line = state.doc.lineAt(pos);
  const text = line.text;
  let start = pos - line.from;
  let end = start;
  while (end < text.length && WORD.test(text[end])) {
    end++;
  }
  while (start > 0 && WORD.test(text[start - 1])) {
    start--;
  }
  if (start === end || /^\d/.test(text.slice(start, end))) {
    return null;
  }
  for (;;) {
    if (start > 0 && text[start - 1] === '.') {
      let before = start - 1;
      while (before > 0 && WORD.test(text[before - 1])) {
        before--;
      }
      if (before === start - 1) {
        break;
      }
      start = before;
      continue;
    }
    if (start > 1 && text.slice(start - 2, start) === '->') {
      let before = start - 2;
      while (before > 0 && WORD.test(text[before - 1])) {
        before--;
      }
      if (before === start - 2) {
        break;
      }
      start = before;
      continue;
    }
    break;
  }
  return { from: line.from + start, to: line.from + end, text: text.slice(start, end) };
}

function renderValueTree(sessionId: string, label: string, value: string, reference: number, depth = 0): HTMLElement {
  const row = document.createElement('div');
  row.className = 'lm-debug-hover-row';
  const head = document.createElement('div');
  head.className = 'lm-debug-hover-head';
  head.style.paddingLeft = `${depth * 12}px`;
  const twisty = document.createElement('span');
  twisty.className = 'lm-debug-hover-twisty';
  twisty.textContent = reference ? '›' : '';
  const name = document.createElement('span');
  name.className = 'lm-debug-hover-name';
  name.textContent = label;
  const val = document.createElement('span');
  val.className = 'lm-debug-hover-value';
  val.textContent = value;
  head.append(twisty, name, document.createTextNode(' = '), val);
  row.append(head);
  if (!reference) {
    return row;
  }
  head.style.cursor = 'pointer';
  let children: HTMLElement | null = null;
  head.addEventListener('click', async () => {
    if (children) {
      children.remove();
      children = null;
      twisty.textContent = '›';
      return;
    }
    twisty.textContent = '⌄';
    const session = debug.sessionById(sessionId);
    const variables = await session?.variables(reference).catch(() => []) ?? [];
    children = document.createElement('div');
    for (const variable of variables.slice(0, 200)) {
      children.append(renderValueTree(sessionId, variable.name, variable.value, variable.variablesReference, depth + 1));
    }
    row.append(children);
  });
  return row;
}

const debugHover = hoverTooltip(async (view, pos): Promise<Tooltip | null> => {
  if (!debug.isStopped) {
    return null;
  }
  const expression = expressionAt(view.state, pos);
  if (!expression) {
    return null;
  }
  const result = await debug.evaluateHover(expression.text);
  if (!result || !result.result) {
    return null;
  }
  return {
    pos: expression.from,
    end: expression.to,
    above: true,
    create: () => {
      const dom = document.createElement('div');
      dom.className = 'lm-debug-hover';
      dom.append(renderValueTree(result.sessionId, expression.text, result.result, result.variablesReference));
      return { dom };
    },
  };
}, { hoverTime: 350 });

/* ------------------------------------------------------------------ *
 * Keeping store and debugger in step
 * ------------------------------------------------------------------ */

const liveViews = new Set<EditorView>();

function sameMarks(a: Mark[], b: Mark[]) {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((mark, i) => mark.id === b[i].id && mark.pos === b[i].pos && mark.classes === b[i].classes && mark.title === b[i].title);
}

/** Does the editor text match the tab? If not, a change is still pending. */
function inSync(view: EditorView) {
  const { tabId } = view.state.facet(infoFacet);
  const tab = useStore.getState().tabs.find((candidate) => candidate.id === tabId);
  if (!tab) {
    return true;
  }
  return tab.content === view.state.doc.toString();
}

function syncView(view: EditorView) {
  const { path } = view.state.facet(infoFacet);
  const effects: StateEffect<unknown>[] = [];
  const currentMarks = view.state.field(marksField, false);
  const marks = currentMarks ? marksFor(view.state, path) : [];
  if (currentMarks && !pendingPush.has(view) && !sameMarks(marks, currentMarks) && inSync(view)) {
    effects.push(setMarks.of(marks));
  }
  const exec = execFor(view.state, path);
  const current = view.state.field(execField);
  if (exec?.pos !== current?.pos || exec?.top !== current?.top) {
    effects.push(setExec.of(exec));
  }
  const inline = inlineFor(path);
  const currentInline = view.state.field(inlineField);
  if (inline?.values !== currentInline?.values || inline?.line !== currentInline?.line) {
    effects.push(setInline.of(inline));
  }
  if (!effects.length) {
    return;
  }
  view.dispatch({ effects });
}

let syncQueued = false;

function syncAll() {
  if (syncQueued) {
    return;
  }
  syncQueued = true;
  queueMicrotask(() => {
    syncQueued = false;
    for (const view of liveViews) {
      syncView(view);
    }
  });
}

/** Views with mapped but not yet reported lines — the store must not overwrite them. */
const pendingPush = new WeakSet<EditorView>();

/**
 * After text changes: hand the mapped lines to the store. In a microtask, so
 * the tab contents are already up to date — other views of the same file that
 * have not seen the change count as out of step and wait.
 */
function pushLines(view: EditorView) {
  if (pendingPush.has(view)) {
    return;
  }
  pendingPush.add(view);
  queueMicrotask(() => {
    pendingPush.delete(view);
    if (!liveViews.has(view)) {
      return;
    }
    const { path } = view.state.facet(infoFacet);
    if (!path) {
      return;
    }
    const lines = new Map<string, number>();
    for (const mark of view.state.field(marksField)) {
      lines.set(mark.id, view.state.doc.lineAt(mark.pos).number - 1);
    }
    breakpoints.moveLines(path, lines);
  });
}

const syncPlugin = ViewPlugin.fromClass(class {
  constructor(readonly view: EditorView) {
    liveViews.add(view);
    // Cached states, from switching tabs, may be stale.
    queueMicrotask(() => {
      if (liveViews.has(view)) {
        syncView(view);
      }
    });
  }

  update(update: ViewUpdate) {
    if (update.docChanged && update.state.field(marksField, false)?.length) {
      pushLines(update.view);
    }
  }

  destroy() {
    liveViews.delete(this.view);
  }
});

let wired = false;

function wire() {
  if (wired) {
    return;
  }
  wired = true;
  breakpoints.subscribe(syncAll);
  debug.subscribe(syncAll);
}

/* ------------------------------------------------------------------ *
 * Presentation
 * ------------------------------------------------------------------ */

const theme = EditorView.baseTheme({
  '.lm-debug-gutter': { cursor: 'pointer', minWidth: '14px' },
  '.lm-debug-gutter .cm-gutterElement': { padding: '0 2px', position: 'relative' },
  '.lm-debug-mark': {
    position: 'relative', height: '100%', minHeight: '1em', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  '.lm-debug-gutter .cm-gutterElement:empty:hover::before': {
    content: '""', position: 'absolute', left: '50%', top: '50%', width: '9px', height: '9px', borderRadius: '50%',
    backgroundColor: 'var(--c-danger)', opacity: '0.3', transform: 'translate(-50%, -50%)',
  },
  '.lm-bp': {
    width: '9px', height: '9px', borderRadius: '50%', backgroundColor: 'var(--c-danger)', boxSizing: 'border-box', position: 'relative',
  },
  '.lm-bp-disabled': { backgroundColor: 'transparent', border: '1.5px solid var(--c-text-subtle)' },
  '.lm-bp-unverified': { opacity: '0.45' },
  '.lm-bp-conditional::after': {
    content: '""', position: 'absolute', left: '2px', right: '2px', top: '3px', height: '1.5px', backgroundColor: 'var(--c-bg)',
  },
  '.lm-bp-disabled.lm-bp-conditional::after': { backgroundColor: 'var(--c-text-subtle)', left: '1px', right: '1px', top: '2px' },
  '.lm-bp-log': { borderRadius: '1px', transform: 'rotate(45deg) scale(0.9)' },
  '.lm-exec-arrow': {
    position: 'absolute', left: '50%', top: '50%', transform: 'translate(-40%, -50%)', width: '0', height: '0',
    borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: '8px solid var(--c-warning)',
    filter: 'drop-shadow(0 0 1px var(--c-bg))',
  },
  '.lm-exec-arrow-frame': { borderLeftColor: 'var(--c-success)' },
  '.lm-debug-exec-line': { backgroundColor: 'color-mix(in srgb, var(--c-warning) 15%, transparent)' },
  '.lm-debug-frame-line': { backgroundColor: 'color-mix(in srgb, var(--c-success) 12%, transparent)' },
  '.lm-debug-inline': {
    color: 'var(--c-text-subtle)', fontStyle: 'italic', marginLeft: '2.5em', fontSize: '0.9em', whiteSpace: 'pre', pointerEvents: 'none',
  },
  '.lm-debug-hover': { padding: '6px 10px', maxWidth: '560px', maxHeight: '320px', overflow: 'auto', fontSize: '12px' },
  '.lm-debug-hover-head': { display: 'flex', gap: '2px', whiteSpace: 'pre', lineHeight: '1.6' },
  '.lm-debug-hover-twisty': { width: '10px', display: 'inline-block', color: 'var(--c-text-subtle)' },
  '.lm-debug-hover-name': { color: 'var(--c-accent)' },
  '.lm-debug-hover-value': { color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis' },
  '.lm-debug-menu-danger': { color: 'var(--c-danger)' },
});

/* ------------------------------------------------------------------ *
 * The extension, per tab
 * ------------------------------------------------------------------ */

const debugGutter = Prec.highest(gutter({
  class: 'lm-debug-gutter',
  markers: gutterMarkers,
  initialSpacer: () => spacer,
  domEventHandlers: {
    mousedown(view, line, event) {
      const mouse = event as MouseEvent;
      if (mouse.button !== 0) {
        return false;
      }
      const { path } = view.state.facet(infoFacet);
      if (!path) {
        return false;
      }
      breakpoints.toggle(path, view.state.doc.lineAt(line.from).number - 1);
      return true;
    },
    contextmenu(view, line, event) {
      const { path } = view.state.facet(infoFacet);
      if (!path) {
        return false;
      }
      event.preventDefault();
      view.dispatch({ effects: setMenu.of({ pos: line.from, line: view.state.doc.lineAt(line.from).number - 1 }) });
      return true;
    },
  },
}));

/** Called by the editor for each tab (`registerEditorExtension`). */
export function debugEditorExtension(ctx: EditorContext): Extension {
  wire();
  // Virtual documents (dap-source://, jdt://) get only the execution line.
  const info = infoFacet.of({ path: ctx.path, tabId: ctx.tabId });
  const base: Extension[] = [info, execField, inlineField, inlineDecorationsExt, syncPlugin, theme, debugHover];
  if (!ctx.path || /^[a-z][\w+.-]*:\/\//i.test(ctx.path)) {
    return base;
  }
  return [...base, marksField, menuField, debugGutter];
}

/** Cursor line of the active editor, 0-based — for the commands. */
export function cursorLine(): { path: string; line: number; } | null {
  const state = useStore.getState();
  const tab = state.activeTab();
  if (!tab?.path || tab.virtual) {
    return null;
  }
  return { path: tab.path, line: state.cursor.line };
}
