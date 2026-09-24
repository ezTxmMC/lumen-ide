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
 * Plans the acceptance of a completion item as ONE set of changes.
 *
 * The main edit (`textEdit`, `insertText` or the label), the snippet and the
 * `additionalTextEdits` (auto-imports) are all expressed in the coordinates of
 * the document as it is before the insertion, are checked for overlaps and
 * sorted — so a single `view.dispatch({ changes })` applies them together, as
 * one undo step, without any after-the-fact offset arithmetic.
 *
 * Pure and DOM-free (only `@codemirror/state`'s `Text`/`ChangeSet`).
 */

import { ChangeSet, Text } from '@codemirror/state';
import type { CompletionItem, Position, TextEdit } from '@/core/lsp/protocol';
import {
  parseSnippet, snippetVariables, type SnippetStop, type VariableContext,
} from './snippet';

/* ------------------------------------------------------------------ *
 * Positions
 * ------------------------------------------------------------------ */

/** LSP position → offset; lines and characters beyond the document are clamped. */
export function posToOffset(doc: Text, pos: Position): number {
  // A line past the end means the end of the document (LSP spec).
  if (pos.line + 1 > doc.lines) {
    return doc.length;
  }
  const lineNumber = Math.min(Math.max(pos.line + 1, 1), doc.lines);
  const line = doc.line(lineNumber);
  return Math.min(line.from + Math.max(pos.character, 0), line.to);
}

export function offsetToPos(doc: Text, offset: number): Position {
  const clamped = Math.min(Math.max(offset, 0), doc.length);
  const line = doc.lineAt(clamped);
  return { line: line.number - 1, character: clamped - line.from };
}

/** The document changes as one contiguous change (common prefix/suffix) — good enough to map positions. */
export function diffChanges(before: Text, after: Text): ChangeSet {
  const a = before.toString();
  const b = after.toString();
  const max = Math.min(a.length, b.length);
  let start = 0;
  while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) {
    start++;
  }
  let end = 0;
  while (end < max - start && a.charCodeAt(a.length - 1 - end) === b.charCodeAt(b.length - 1 - end)) {
    end++;
  }
  return ChangeSet.of(
    { from: start, to: a.length - end, insert: b.slice(start, b.length - end) },
    a.length,
  );
}

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type InsertMode = 'insert' | 'replace';

export interface PlannedChange { from: number; to: number; insert: string; }

export interface DroppedEdit { edit: TextEdit; reason: string; }

export interface PlanInput {
  /** The document to change. */
  doc: Text;
  /** The cursor. */
  head: number;
  /** The default word range (CodeMirror's `apply` arguments). */
  from: number;
  to: number;
  item: CompletionItem;
  /** The `completionItem/resolve` answer, if there was one. */
  resolved?: CompletionItem;
  /** Insert or replace part of an `InsertReplaceEdit`; default `replace`. */
  mode?: InsertMode;
  /**
   * The document the server's positions refer to when it differs from `doc`
   * (the text changed while resolving), plus the changes from it to `doc`.
   */
  baseDoc?: Text;
  changes?: ChangeSet;
  filePath?: string;
  /** Text of the current selection, for `$TM_SELECTED_TEXT`. */
  selected?: string;
}

export interface CompletionPlan {
  /** Sorted, non-overlapping, in the coordinates of `doc` before the change. */
  changes: PlannedChange[];
  /** The main edit within `changes`, in the original coordinates. */
  main: PlannedChange;
  /** Where the main edit starts once all changes are applied. */
  start: number;
  /** The selection afterwards (new coordinates): the first stop with its mirrors, or the cursor. */
  selection: { anchor: number; head: number; }[];
  /** Tab stops in the new coordinates, in tab order (final stop last); null without interactive stops. */
  stops: SnippetStop[] | null;
  dropped: DroppedEdit[];
  warnings: string[];
}

type ItemWithMode = CompletionItem & { insertTextMode?: 1 | 2; };

const normalize = (text: string) => text.replace(/\r\n?/g, '\n');

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

type Bounds = { start: { line: number; character: number; }; end: { line: number; character: number; }; };

const before = (a: Bounds['start'], b: Bounds['start']) => a.line < b.line || (a.line === b.line && a.character <= b.character);

/** The range a main edit replaces — for an InsertReplaceEdit the wider `replace` one. */
function editBounds(edit: NonNullable<CompletionItem['textEdit']>): Bounds | null {
  return edit.range ?? edit.replace ?? null;
}

/**
 * Whether a resolved main edit may stand in for the one from the list: it
 * has to cover what the list edit covered (jdtls' list carries the bare name,
 * the resolve answer the call with its arguments — or a postfix template
 * reaching back over the typed expression).
 */
function coversListEdit(listEdit: CompletionItem['textEdit'], resolvedEdit: CompletionItem['textEdit']): boolean {
  if (!listEdit || !resolvedEdit) {
    return false;
  }
  const was = editBounds(listEdit);
  const now = editBounds(resolvedEdit);
  if (!was || !now) {
    return false;
  }
  return before(now.start, was.start) && before(was.end, now.end);
}

/** Fields the resolve answer may add; the main edit when the item had none or the resolved one covers it. */
export function mergeResolved(item: CompletionItem, resolved?: CompletionItem): ItemWithMode {
  if (!resolved || resolved === item) {
    return item;
  }
  const merged: ItemWithMode = { ...item };
  if (resolved.additionalTextEdits) {
    merged.additionalTextEdits = resolved.additionalTextEdits;
  }
  if (resolved.command) {
    merged.command = resolved.command;
  }
  const replaces = !item.textEdit || coversListEdit(item.textEdit, resolved.textEdit);
  if (resolved.textEdit && replaces) {
    merged.textEdit = resolved.textEdit;
    // The format and mode belong to the edit they came with.
    if (resolved.insertTextFormat) {
      merged.insertTextFormat = resolved.insertTextFormat;
    }
    if ((resolved as ItemWithMode).insertTextMode) {
      merged.insertTextMode = (resolved as ItemWithMode).insertTextMode;
    }
  }
  if (item.insertText === undefined && resolved.insertText !== undefined) {
    merged.insertText = resolved.insertText;
  }
  if (!item.insertTextFormat && resolved.insertTextFormat) {
    merged.insertTextFormat = resolved.insertTextFormat;
  }
  return merged;
}

/** True when the item still lacks its auto-import edits and a resolve may deliver them. */
export function needsResolve(item: CompletionItem): boolean {
  return item.additionalTextEdits === undefined;
}

function wordEnd(doc: Text, at: number): number {
  const line = doc.lineAt(at);
  const rest = doc.sliceString(at, line.to);
  return at + (/^[\w$]*/.exec(rest)?.[0].length ?? 0);
}

function lineIndent(doc: Text, at: number): string {
  const line = doc.lineAt(at);
  const lead = /^[ \t]*/.exec(line.text)?.[0] ?? '';
  return lead.slice(0, at - line.from);
}

/** Whether a `(` already follows, or the word is a reference (`Foo::bar`, `&bar`). */
function callIsUnsafe(doc: Text, from: number, to: number): boolean {
  if (doc.sliceString(to, to + 1) === '(') {
    return true;
  }
  const before = doc.sliceString(Math.max(0, from - 2), from);
  return before === '::' || before.endsWith('&');
}

/** A method-like item with nothing but a name gets `()` — only where it is safe. */
function wantsCall(item: CompletionItem, raw: string, doc: Text, from: number, to: number): boolean {
  if (!item.kind || ![2, 3, 4].includes(item.kind)) {
    return false;
  }
  if (item.textEdit || item.insertTextFormat === 2 || raw.includes('(')) {
    return false;
  }
  return !callIsUnsafe(doc, from, to);
}

/* ------------------------------------------------------------------ *
 * Planning
 * ------------------------------------------------------------------ */

type ToOffset = (pos: Position, assoc: -1 | 1) => number;

/** The range to replace: the item's edit when it is valid at the cursor, otherwise the word. */
function replaceRange(
  input: PlanInput, item: ItemWithMode, mode: 'insert' | 'replace', toOffset: ToOffset, warnings: string[],
): { from: number; to: number; } {
  const { doc, head } = input;
  let from = Math.min(Math.max(input.from, 0), doc.length);
  let to = Math.min(Math.max(input.to, from), doc.length);
  const edit = item.textEdit;
  const range = edit?.range ?? (mode === 'insert' ? edit?.insert ?? edit?.replace : edit?.replace ?? edit?.insert);
  let usedRange = false;
  if (range) {
    const start = toOffset(range.start, -1);
    const end = Math.max(start, toOffset(range.end, 1));
    // A valid range starts at or before the cursor; the end grows to the cursor
    // when the user has typed on since the list was requested.
    if (start <= head) { from = start; to = Math.max(end, head); usedRange = true; }
    if (start > head) {
      warnings.push('textEdit range starts after the cursor — using the word range');
    }
  }
  if (!usedRange && mode === 'replace') {
    to = Math.max(to, wordEnd(doc, Math.max(to, head)));
  }
  return { from: Math.min(from, head), to: Math.max(to, head) };
}

/** The text to insert, with snippet stops and the cursor offset inside it. */
function insertionText(
  input: PlanInput, item: ItemWithMode, from: number, to: number,
): { insert: string; stops: SnippetStop[] | null; cursor: number; } {
  const { doc, head } = input;
  const edit = item.textEdit;
  const label = item.label.trim();
  const raw = normalize(edit?.newText ?? item.insertText ?? label);
  const isSnippet = item.insertTextFormat === 2;
  const adjust = isSnippet || item.insertTextMode === 2;
  const indent = adjust ? lineIndent(doc, from) : '';

  let insert = raw;
  let stops: SnippetStop[] | null = null;
  let cursor = raw.length;
  if (isSnippet) {
    const vars = snippetVariables({
      filePath: input.filePath,
      selected: input.selected,
      lineText: doc.lineAt(head).text,
      lineNumber: doc.lineAt(head).number,
      word: doc.sliceString(from, head),
    } satisfies VariableContext);
    const parsed = parseSnippet(raw, { vars, indent });
    insert = parsed.text;
    stops = parsed.stops;
    cursor = parsed.stops[parsed.stops.length - 1].ranges[0].from;
  }
  if (!isSnippet && indent) {
    insert = raw.replace(/\n/g, `\n${indent}`);
  }
  if (!isSnippet) {
    cursor = insert.length;
  }
  if (!isSnippet && wantsCall(item, raw, doc, from, to)) {
    insert = `${raw}()`;
    cursor = raw.length + 1;
  }
  return { insert, stops, cursor };
}

/** Additional edits, on the original document; those that clash with what changed since are dropped. */
function planExtras(
  input: PlanInput, item: ItemWithMode, main: PlannedChange, toOffset: ToOffset, dropped: DroppedEdit[],
): PlannedChange[] {
  const baseDoc = input.baseDoc ?? input.doc;
  const extras: PlannedChange[] = [];
  const interim = input.changes && changedSpan(input.changes);
  for (const e of item.additionalTextEdits ?? []) {
    const start = posToOffset(baseDoc, e.range.start);
    const end = Math.max(start, posToOffset(baseDoc, e.range.end));
    if (interim && touches(start, end, interim)) {
      dropped.push({ edit: e, reason: 'the document changed there while the item was resolved' });
      continue;
    }
    const mapped = { from: toOffset(e.range.start, 1), to: toOffset(e.range.end, -1), insert: normalize(e.newText) };
    mapped.to = Math.max(mapped.from, mapped.to);
    const clash = [main, ...extras].find((other) => overlaps(mapped, other));
    if (clash) {
      dropped.push({ edit: e, reason: clash === main ? 'overlaps the main edit' : 'overlaps another edit' });
      continue;
    }
    extras.push(mapped);
  }
  return extras;
}

/** Order: by position; at the same spot insertions come first, in server order. */
function orderChanges(all: PlannedChange[]): PlannedChange[] {
  const tagged = all.map((change, order) => ({ change, order }));
  tagged.sort((a, b) => {
    if (a.change.from !== b.change.from) {
      return a.change.from - b.change.from;
    }
    const aEmpty = a.change.to === a.change.from;
    const bEmpty = b.change.to === b.change.from;
    if (aEmpty !== bEmpty) {
      return aEmpty ? -1 : 1;
    }
    return a.order - b.order;
  });
  return tagged.map((t) => t.change);
}

/** Where the main edit lands once the edits before it have been applied. */
function shiftedStart(changes: PlannedChange[], main: PlannedChange): number {
  let shift = 0;
  for (const change of changes) {
    if (change === main) {
      break;
    }
    shift += change.insert.length - (change.to - change.from);
  }
  return main.from + shift;
}

export function planCompletion(input: PlanInput): CompletionPlan {
  const { doc } = input;
  const item = mergeResolved(input.item, input.resolved);
  const mode = input.mode ?? 'replace';
  const baseDoc = input.baseDoc ?? doc;
  const warnings: string[] = [];
  const dropped: DroppedEdit[] = [];

  // LSP position → offset in `doc`, through the changes made since `baseDoc`.
  const toOffset: ToOffset = (pos, assoc) => {
    const base = posToOffset(baseDoc, pos);
    return input.changes ? input.changes.mapPos(base, assoc) : base;
  };

  const { from, to } = replaceRange(input, item, mode, toOffset, warnings);
  const { insert, stops, cursor } = insertionText(input, item, from, to);

  const main: PlannedChange = { from, to, insert };
  const extras = planExtras(input, item, main, toOffset, dropped);
  const changes = orderChanges([main, ...extras]);
  const start = shiftedStart(changes, main);

  const placed = stops?.map((stop) => ({
    ...stop,
    ranges: stop.ranges.map((r) => ({ from: r.from + start, to: r.to + start })),
  })) ?? null;
  const interactive = placed && placed.length > 1 ? placed : null;
  const first = interactive ? interactive[0].ranges : [{ from: start + cursor, to: start + cursor }];
  return {
    changes, main, start,
    selection: first.map((r) => ({ anchor: r.from, head: r.to })),
    stops: interactive,
    dropped, warnings,
  };
}

/** Two changes overlap when they share more than a border; equal empty inserts at one spot do not. */
function overlaps(a: PlannedChange, b: PlannedChange): boolean {
  const aEmpty = a.from === a.to;
  const bEmpty = b.from === b.to;
  if (aEmpty && bEmpty) {
    return false;
  }
  if (aEmpty) {
    return a.from > b.from && a.from < b.to;
  }
  if (bEmpty) {
    return b.from > a.from && b.from < a.to;
  }
  return a.from < b.to && b.from < a.to;
}

function changedSpan(changes: ChangeSet): { from: number; to: number; } | null {
  let span: { from: number; to: number; } | null = null;
  changes.iterChangedRanges((fromA, toA) => {
    span = span ? { from: Math.min(span.from, fromA), to: Math.max(span.to, toA) } : { from: fromA, to: toA };
  });
  return span;
}

/** An edit is unsafe to map when the interim change lies inside it or replaced part of it. */
function touches(from: number, to: number, span: { from: number; to: number; }): boolean {
  if (span.from === span.to) {
    return span.from > from && span.from < to;
  }
  return span.from < to && from < span.to;
}
