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
 * Semantic tokens (`textDocument/semanticTokens`): the server's own
 * classification of identifiers, laid over the tokenizer's highlighting.
 *
 * Pure: decoding of the relative integer stream, the `delta` edits and the
 * mapping of the server's legend onto the editor's token kinds. The editor
 * extension (`components/editor/lsp/lsp-semantic`) only draws the result.
 */

import type { TokenKind } from '@/core/types';

export interface SemanticLegend {
  tokenTypes: string[];
  tokenModifiers: string[];
}

export interface SemanticTokens {
  resultId?: string;
  data: number[];
}

export interface SemanticTokensEdit {
  start: number;
  deleteCount: number;
  data?: number[];
}

export interface SemanticTokensDelta {
  resultId?: string;
  edits: SemanticTokensEdit[];
}

/** What the server offers, read from its `semanticTokensProvider`. */
export interface SemanticSupport {
  legend: SemanticLegend;
  full: boolean;
  range: boolean;
  delta: boolean;
}

/** One decoded token: zero-based line, UTF-16 start and length on that line. */
export interface SemanticSpan {
  line: number;
  start: number;
  length: number;
  type: string;
  modifiers: string[];
}

/** Reads the provider; null when the server offers no semantic tokens (or none we can use). */
export function semanticSupport(provider: unknown): SemanticSupport | null {
  const p = provider as {
    legend?: Partial<SemanticLegend>;
    full?: boolean | { delta?: boolean; };
    range?: boolean | object;
  } | null | undefined;
  if (!p || !Array.isArray(p.legend?.tokenTypes)) {
    return null;
  }
  const full = Boolean(p.full);
  const range = Boolean(p.range);
  if (!full && !range) {
    return null;
  }
  return {
    legend: { tokenTypes: p.legend.tokenTypes, tokenModifiers: Array.isArray(p.legend.tokenModifiers) ? p.legend.tokenModifiers : [] },
    full,
    range,
    delta: typeof p.full === 'object' && p.full !== null && p.full.delta === true,
  };
}

/** Applies a `delta` answer to the previous data: edits are given in the old coordinates. */
export function applyDelta(previous: number[], edits: SemanticTokensEdit[]): number[] {
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  const out: number[] = [];
  let at = 0;
  for (const edit of sorted) {
    out.push(...previous.slice(at, edit.start), ...(edit.data ?? []));
    at = edit.start + edit.deleteCount;
  }
  out.push(...previous.slice(at));
  return out;
}

/** The integer stream (five numbers per token, relative to the one before) as spans. Malformed tails are dropped. */
export function decodeTokens(data: number[], legend: SemanticLegend): SemanticSpan[] {
  const spans: SemanticSpan[] = [];
  let line = 0;
  let start = 0;
  for (let i = 0; i + 4 < data.length; i += 5) {
    const deltaLine = data[i];
    line += deltaLine;
    start = deltaLine === 0 ? start + data[i + 1] : data[i + 1];
    const length = data[i + 2];
    const type = legend.tokenTypes[data[i + 3]];
    if (type === undefined || length <= 0) {
      continue;
    }
    const bits = data[i + 4];
    const modifiers = legend.tokenModifiers.filter((_name, bit) => (bits & (1 << bit)) !== 0);
    spans.push({ line, start, length, type, modifiers });
  }
  return spans;
}

/** Standard types (LSP 3.17) and the usual extras, onto the editor's token kinds. */
const KIND_OF_TYPE: Record<string, TokenKind> = {
  namespace: 'type', type: 'type', class: 'type', enum: 'type', interface: 'type', struct: 'type',
  typeParameter: 'type', parameter: 'variable', variable: 'variable', property: 'property',
  enumMember: 'constant', event: 'property', function: 'function', method: 'function', macro: 'meta',
  keyword: 'keyword', modifier: 'keyword', comment: 'comment', string: 'string', number: 'number',
  regexp: 'regexp', operator: 'operator', decorator: 'meta', label: 'meta',
  // Extras of individual servers (rust-analyzer, clangd, jdtls …).
  selfKeyword: 'keyword', selfTypeKeyword: 'keyword', boolean: 'constant', builtinType: 'type',
  typeAlias: 'type', union: 'type', lifetime: 'meta', attribute: 'meta', derive: 'meta',
  constParameter: 'constant', unresolvedReference: 'variable', concept: 'type', record: 'type',
  annotation: 'meta', annotationMember: 'property',
};

/**
 * What the tokenizer already colours — and finer than the server does
 * (`control` against `keyword`, `escape` and `${}` inside strings, constants).
 * Semantic tokens refine identifiers; these types stay with the tokenizer.
 */
const LEXICAL = new Set(['keyword', 'modifier', 'comment', 'string', 'number', 'regexp', 'operator', 'selfKeyword', 'selfTypeKeyword', 'boolean']);

export interface SemanticStyle {
  /** The kind whose colour (`--s-<kind>`) the token takes. */
  kind: TokenKind;
  /** Extra look: struck through for deprecated names. */
  deprecated: boolean;
}

/**
 * How one token is drawn, or null to leave the tokenizer's colour alone — a
 * lexical type, or one the editor has no kind for. `defaultLibrary` names read as builtins,
 * constants (`readonly` variables) as constants.
 */
export function styleOf(span: Pick<SemanticSpan, 'type' | 'modifiers'>): SemanticStyle | null {
  const base = LEXICAL.has(span.type) ? undefined : KIND_OF_TYPE[span.type];
  if (!base) {
    return null;
  }
  const library = span.modifiers.includes('defaultLibrary');
  const readonly = span.modifiers.includes('readonly');
  const deprecated = span.modifiers.includes('deprecated');
  if (library && (base === 'function' || base === 'variable' || base === 'type')) {
    return { kind: 'builtin', deprecated };
  }
  if (readonly && (base === 'variable' || base === 'property')) {
    return { kind: 'constant', deprecated };
  }
  return { kind: base, deprecated };
}

/** The class names of a token: `lm-sem-<kind>`, plus `lm-sem-deprecated`. */
export function classOf(style: SemanticStyle): string {
  return style.deprecated ? `lm-sem-${style.kind} lm-sem-deprecated` : `lm-sem-${style.kind}`;
}

/** Line access as `Text` of CodeMirror offers it: one-based lines. */
export interface LineAccess {
  lines: number;
  line(number: number): { from: number; to: number; };
}

/** The offsets of a span, cut at the end of its line; null for a line the document does not have or an empty span. */
export function spanRange(doc: LineAccess, span: Pick<SemanticSpan, 'line' | 'start' | 'length'>): { from: number; to: number; } | null {
  if (span.line >= doc.lines) {
    return null;
  }
  const line = doc.line(span.line + 1);
  const from = line.from + span.start;
  const to = Math.min(line.to, from + span.length);
  return from < to ? { from, to } : null;
}
