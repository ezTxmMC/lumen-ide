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
 * LSP / TextMate snippet parser.
 *
 * Turns a snippet body into plain text plus the ranges of its tab stops.
 * Supported grammar: `$1`, `${1}`, `${1:placeholder}` (nested), `${1|a,b|}`
 * (choices), mirrors (the same index several times), the final stop `$0`,
 * variables `$NAME`, `${NAME}`, `${NAME:default}`, transforms
 * (`${1/re/fmt/opts}` — parsed, not applied) and the escapes `\$`, `\}`, `\\`.
 * Unknown variables collapse to their default, or to nothing. Anything that
 * does not parse (`${1:abc` without a closing brace, a lone `$`) stays literal.
 *
 * Pure and DOM-free — offsets are UTF-16 code units, like the document's.
 */

export interface SnippetRange { from: number; to: number; }

export interface SnippetStop {
  index: number;
  /** In document order; the first one is the primary field, the rest are mirrors. */
  ranges: SnippetRange[];
  choices?: string[];
}

export interface ParsedSnippet {
  text: string;
  /** In tab order: 1, 2, 3 … and the final stop (`$0`, implicit at the end when absent) last. */
  stops: SnippetStop[];
}

export type SnippetVariables = Record<string, string | undefined>;

export interface SnippetOptions {
  vars?: SnippetVariables;
  /** Prepended to every line after the first; the stop ranges move along. */
  indent?: string;
}

type SnippetNode =
  | { t: 'text'; v: string; }
  | { t: 'stop'; n: number; kids: SnippetNode[]; choices?: string[]; }
  | { t: 'var'; name: string; kids: SnippetNode[]; };

const NAME = /[_a-zA-Z][_a-zA-Z0-9]*/y;
const DIGITS = /\d+/y;

function matchAt(re: RegExp, s: string, at: number): string | null {
  re.lastIndex = at;
  return re.exec(s)?.[0] ?? null;
}

class SnippetReader {
  i = 0;
  constructor(readonly s: string) {}

  /** Text and `$` constructs up to (not including) the closing `}` when `inBraces`. */
  nodes(inBraces: boolean): SnippetNode[] {
    const out: SnippetNode[] = [];
    const push = (v: string) => {
      const last = out[out.length - 1];
      if (last?.t === 'text') { last.v += v; return; }
      out.push({ t: 'text', v });
    };
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (c === '}' && inBraces) {
        break;
      }
      if (c === '\\') {
        const next = this.s[this.i + 1];
        if (next === '$' || next === '}' || next === '\\') { push(next); this.i += 2; continue; }
        push(c);
        this.i++;
        continue;
      }
      if (c === '$') {
        const start = this.i;
        const node = this.dollar();
        if (node) { out.push(node); continue; }
        this.i = start;
        push('$');
        this.i++;
        continue;
      }
      push(c);
      this.i++;
    }
    return out;
  }

  /** Reads a `$…` construct at `i`; null (with `i` undefined) when malformed. */
  private dollar(): SnippetNode | null {
    const s = this.s;
    this.i++;
    const bare = matchAt(DIGITS, s, this.i);
    if (bare) { this.i += bare.length; return { t: 'stop', n: Number(bare), kids: [] }; }
    if (s[this.i] !== '{') {
      const name = matchAt(NAME, s, this.i);
      if (!name) {
        return null;
      }
      this.i += name.length;
      return { t: 'var', name, kids: [] };
    }
    this.i++;
    const digits = matchAt(DIGITS, s, this.i);
    if (digits) {
      this.i += digits.length;
      return this.braced({ t: 'stop', n: Number(digits), kids: [] });
    }
    const name = matchAt(NAME, s, this.i);
    if (!name) {
      return null;
    }
    this.i += name.length;
    return this.braced({ t: 'var', name, kids: [] });
  }

  /** The rest of `${id…}`: `}`, `:default}`, `|choices|}` or `/transform}`. */
  private braced(node: SnippetNode): SnippetNode | null {
    const c = this.s[this.i];
    if (c === '}') { this.i++; return node; }
    if (c === ':' && node.t !== 'text') {
      this.i++;
      node.kids = this.nodes(true);
      if (this.s[this.i] !== '}') {
        return null;
      }
      this.i++;
      return node;
    }
    if (c === '|' && node.t === 'stop') {
      const choices = this.choices();
      if (!choices) {
        return null;
      }
      node.choices = choices;
      return node;
    }
    if (c === '/') {
      return this.transform() ? node : null;
    }
    return null;
  }

  private choices(): string[] | null {
    const s = this.s;
    this.i++;
    const list: string[] = [];
    let cur = '';
    while (this.i < s.length) {
      const c = s[this.i];
      if (c === '\\' && ',|\\'.includes(s[this.i + 1] ?? '')) { cur += s[this.i + 1]; this.i += 2; continue; }
      if (c === ',') { list.push(cur); cur = ''; this.i++; continue; }
      if (c === '|') {
        if (s[this.i + 1] !== '}') {
          return null;
        }
        list.push(cur);
        this.i += 2;
        return list;
      }
      cur += c;
      this.i++;
    }
    return null;
  }

  /** Skips `/regex/format/options}` — the transform is not evaluated. */
  private transform(): boolean {
    const s = this.s;
    let slashes = 0;
    let depth = 0;
    while (this.i < s.length) {
      const c = s[this.i];
      if (c === '\\') { this.i += 2; continue; }
      if (c === '/') {
        slashes++;
      }
      if (c === '$' && s[this.i + 1] === '{') { depth++; this.i += 2; continue; }
      this.i++;
      if (c !== '}') {
        continue;
      }
      if (depth > 0) { depth--; continue; }
      if (slashes >= 3) {
        return true;
      }
    }
    return false;
  }
}

interface RenderContext {
  out: string;
  indent: string;
  vars: SnippetVariables;
  ranges: Map<number, SnippetRange[]>;
  choices: Map<number, string[]>;
  /** The first stop of each index that carries a default — the mirrors copy it. */
  defs: Map<number, SnippetNode & { t: 'stop'; }>;
  /** Stops being expanded — a placeholder that contains itself renders empty. */
  active: Set<number>;
}

function emit(ctx: RenderContext, text: string) {
  ctx.out += text.replace(/\r\n?|\n/g, '\n' + ctx.indent);
}

function hasDefault(node: SnippetNode & { t: 'stop'; }): boolean {
  return node.kids.length > 0 || Boolean(node.choices?.length);
}

function findDefs(nodes: SnippetNode[], defs: RenderContext['defs']) {
  for (const node of nodes) {
    if (node.t === 'text') {
      continue;
    }
    if (node.t === 'stop' && hasDefault(node) && !defs.has(node.n)) {
      defs.set(node.n, node);
    }
    findDefs(node.kids, defs);
  }
}

function render(nodes: SnippetNode[], ctx: RenderContext, record: boolean) {
  for (const node of nodes) {
    if (node.t === 'text') { emit(ctx, node.v); continue; }
    if (node.t === 'var') {
      const value = ctx.vars[node.name];
      if (value) { emit(ctx, value); continue; }
      render(node.kids, ctx, record);
      continue;
    }
    renderStop(node, ctx, record);
  }
}

function renderStop(node: SnippetNode & { t: 'stop'; }, ctx: RenderContext, record: boolean) {
  const from = ctx.out.length;
  const def = ctx.defs.get(node.n);
  const source = def;
  if (source && !ctx.active.has(node.n)) {
    ctx.active.add(node.n);
    // Only the defining field records nested stops; a mirror copies plain text.
    const primary = source === node;
    if (source.choices?.length) {
      emit(ctx, source.choices[0]);
    }
    if (!source.choices?.length) {
      render(source.kids, ctx, record && primary);
    }
    ctx.active.delete(node.n);
  }
  if (!record) {
    return;
  }
  const list = ctx.ranges.get(node.n) ?? [];
  list.push({ from, to: ctx.out.length });
  ctx.ranges.set(node.n, list);
  if (node.choices?.length && !ctx.choices.has(node.n)) {
    ctx.choices.set(node.n, node.choices);
  }
}

/** Parses a snippet body — see the file header for the grammar. */
export function parseSnippet(body: string, options: SnippetOptions = {}): ParsedSnippet {
  const source = body.replace(/\r\n?/g, '\n');
  const nodes = new SnippetReader(source).nodes(false);
  const ctx: RenderContext = {
    out: '', indent: options.indent ?? '', vars: options.vars ?? {},
    ranges: new Map(), choices: new Map(), defs: new Map(), active: new Set(),
  };
  findDefs(nodes, ctx.defs);
  render(nodes, ctx, true);

  const stops: SnippetStop[] = [...ctx.ranges.entries()]
    .filter(([index]) => index !== 0)
    .sort((a, b) => a[0] - b[0])
    .map(([index, ranges]) => ({
      index,
      ranges: ranges.sort((a, b) => a.from - b.from || a.to - b.to),
      choices: ctx.choices.get(index),
    }));
  const last = ctx.ranges.get(0)?.[0] ?? { from: ctx.out.length, to: ctx.out.length };
  stops.push({ index: 0, ranges: [last] });
  return { text: ctx.out, stops };
}

/** Escapes text for CodeMirror's `snippet()` templates, which know only `${…}` and `#{…}`. */
function escapeTemplate(text: string): string {
  return text.replace(/[{}]/g, (m) => `\\${m}`);
}

/**
 * The snippet as a CodeMirror template: `${N:label}` fields, `${}` for the
 * final stop. CodeMirror cannot nest fields, so the inner ones are flattened.
 */
export function snippetToCm(body: string, options: SnippetOptions = {}): string {
  const { text, stops } = parseSnippet(body, options);
  const fields = stops
    .flatMap((stop) => stop.ranges.map((range) => ({ ...range, index: stop.index })))
    .sort((a, b) => a.from - b.from || b.to - a.to);
  let out = '';
  let at = 0;
  for (const field of fields) {
    if (field.from < at) {
      continue;
    }
    out += escapeTemplate(text.slice(at, field.from));
    const label = escapeTemplate(text.slice(field.from, field.to));
    if (field.index === 0) {
      out += '${}';
    }
    if (field.index !== 0) {
      out += `\${${field.index}${label ? `:${label}` : ''}}`;
    }
    at = field.to;
  }
  return out + escapeTemplate(text.slice(at));
}

export interface VariableContext {
  filePath?: string;
  /** The selected text at the time of insertion. */
  selected?: string;
  /** The full text of the line and its 1-based number. */
  lineText?: string;
  lineNumber?: number;
  word?: string;
  clipboard?: string;
  now?: Date;
}

/** The standard TextMate / VS Code variables that can be known without a workspace. */
export function snippetVariables(ctx: VariableContext = {}): SnippetVariables {
  const now = ctx.now ?? new Date();
  const two = (n: number) => String(n).padStart(2, '0');
  const path = ctx.filePath?.replace(/\\/g, '/');
  const file = path?.split('/').pop();
  const dot = file?.lastIndexOf('.') ?? -1;
  return {
    TM_FILENAME: file,
    TM_FILENAME_BASE: file && dot > 0 ? file.slice(0, dot) : file,
    TM_DIRECTORY: path?.includes('/') ? path.slice(0, path.lastIndexOf('/')) : undefined,
    TM_FILEPATH: ctx.filePath,
    TM_SELECTED_TEXT: ctx.selected,
    TM_CURRENT_LINE: ctx.lineText,
    TM_CURRENT_WORD: ctx.word,
    TM_LINE_INDEX: ctx.lineNumber === undefined ? undefined : String(ctx.lineNumber - 1),
    TM_LINE_NUMBER: ctx.lineNumber === undefined ? undefined : String(ctx.lineNumber),
    CLIPBOARD: ctx.clipboard,
    CURRENT_YEAR: String(now.getFullYear()),
    CURRENT_YEAR_SHORT: String(now.getFullYear()).slice(2),
    CURRENT_MONTH: two(now.getMonth() + 1),
    CURRENT_DATE: two(now.getDate()),
    CURRENT_HOUR: two(now.getHours()),
    CURRENT_MINUTE: two(now.getMinutes()),
    CURRENT_SECOND: two(now.getSeconds()),
  };
}
