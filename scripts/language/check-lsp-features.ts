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
 * The client side of what novus-lsp advertises (read from lsp/server/protocol/
 * capabilities.nv of v0.1.0-pre.alpha.8): semantic tokens (full + range, no
 * delta), folding ranges, document links, diagnostics with code, source, tags
 * and related information. Pure functions with fakes — no server needed.
 */

type Expect = (cond: boolean, label: string) => void;

/** novus-lsp's legend, copied from lsp/features/semtok/legend.nv. */
const NOVUS_LEGEND = {
  tokenTypes: ['namespace', 'type', 'class', 'enum', 'interface', 'parameter', 'variable', 'property', 'enumMember',
    'function', 'method', 'decorator', 'keyword', 'comment', 'string', 'number', 'operator', 'modifier'],
  tokenModifiers: ['declaration', 'readonly', 'abstract', 'deprecated', 'defaultLibrary', 'modification', 'async', 'documentation'],
};

export async function checkLspFeatures(expect: Expect) {
  const tokens = await import('@/core/lsp/semantic-tokens');
  const folding = await import('@/core/lsp/folding');
  const text = await import('@/core/lsp/diagnostic-text');
  const { CLIENT_CAPABILITIES } = await import('@/core/lsp/client/capabilities');

  // The capabilities the client declares
  const doc = CLIENT_CAPABILITIES.textDocument;
  expect(Boolean(doc.semanticTokens.requests.range) && Boolean(doc.semanticTokens.requests.full), 'client declares semantic tokens: full and range');
  expect(doc.semanticTokens.formats.includes('relative') && CLIENT_CAPABILITIES.workspace.semanticTokens.refreshSupport, 'relative format, refresh supported');
  expect(Boolean(doc.foldingRange) && Boolean(doc.documentLink), 'client declares folding ranges and document links');
  expect(doc.publishDiagnostics.relatedInformation && doc.publishDiagnostics.codeDescriptionSupport && doc.publishDiagnostics.tagSupport.valueSet.length === 2, 'diagnostics: related information, code description, both tags');

  // The provider novus-lsp sends
  const provider = { legend: NOVUS_LEGEND, full: true, range: true };
  const support = tokens.semanticSupport(provider);
  expect(support !== null && support.full && support.range && !support.delta, 'novus-lsp: full and range, no delta');
  expect(tokens.semanticSupport({ legend: NOVUS_LEGEND, full: { delta: true } })?.delta === true, 'a server with delta is read as such');
  expect(tokens.semanticSupport(undefined) === null && tokens.semanticSupport({ legend: NOVUS_LEGEND }) === null, 'no provider, or none of full/range: no semantic tokens');

  // Decoding: line 0 "class Foo {" → class keyword is lexical, Foo is a declared class; line 2 a parameter after a gap
  const data = [
    0, 6, 3, 2, 1,    // Foo: class, declaration
    2, 4, 1, 5, 0,    // line 2: parameter at 4
    0, 3, 2, 6, 2,    // same line +3: variable readonly
    1, 0, 4, 9, 8,    // next line: function, documentation... bit 3 = deprecated is 8
  ];
  const spans = tokens.decodeTokens(data, NOVUS_LEGEND);
  expect(spans.length === 4, `four tokens decoded (${spans.length})`);
  expect(spans[0].line === 0 && spans[0].start === 6 && spans[0].type === 'class' && spans[0].modifiers.join() === 'declaration', 'first token: absolute position, type and modifier');
  expect(spans[1].line === 2 && spans[1].start === 4, 'a new line resets the column to the delta');
  expect(spans[2].line === 2 && spans[2].start === 7 && spans[2].modifiers.join() === 'readonly', 'the same line adds the column delta');
  expect(spans[3].line === 3 && spans[3].start === 0 && spans[3].modifiers.join() === 'deprecated', 'modifier bits read through the legend');
  expect(tokens.decodeTokens([0, 1, 2], NOVUS_LEGEND).length === 0, 'a truncated tail is dropped');
  expect(tokens.decodeTokens([0, 0, 3, 99, 0], NOVUS_LEGEND).length === 0, 'a type the legend lacks is dropped');

  // Delta
  const base = [0, 0, 3, 1, 0, 1, 0, 3, 6, 0];
  const edited = tokens.applyDelta(base, [{ start: 5, deleteCount: 5, data: [2, 0, 4, 9, 0] }]);
  expect(JSON.stringify(edited) === JSON.stringify([0, 0, 3, 1, 0, 2, 0, 4, 9, 0]), 'delta replaces a stretch');
  const inserted = tokens.applyDelta(base, [{ start: 10, deleteCount: 0, data: [1, 0, 1, 1, 0] }, { start: 0, deleteCount: 5 }]);
  expect(JSON.stringify(inserted) === JSON.stringify([1, 0, 3, 6, 0, 1, 0, 1, 1, 0]), 'edits in old coordinates: delete at the start, append at the end');

  // Styles
  const style = (type: string, modifiers: string[] = []) => tokens.styleOf({ type, modifiers });
  expect(style('class')?.kind === 'type' && style('interface')?.kind === 'type' && style('enum')?.kind === 'type', 'classes, interfaces, enums take the type colour');
  expect(style('parameter')?.kind === 'variable' && style('variable')?.kind === 'variable', 'parameters and variables take the variable colour');
  expect(style('method')?.kind === 'function' && style('function')?.kind === 'function', 'methods and functions');
  expect(style('enumMember')?.kind === 'constant' && style('property')?.kind === 'property', 'enum members as constants, properties');
  expect(style('decorator')?.kind === 'meta', 'decorators (@Annotation) as meta');
  expect(style('keyword') === null && style('comment') === null && style('string') === null && style('operator') === null && style('number') === null, 'lexical types stay with the tokenizer');
  expect(style('somethingNew') === null, 'an unknown type leaves the tokenizer colour alone');
  expect(style('function', ['defaultLibrary'])?.kind === 'builtin', 'defaultLibrary reads as builtin');
  expect(style('variable', ['readonly'])?.kind === 'constant', 'a readonly variable as constant');
  const deprecated = style('method', ['deprecated']);
  expect(Boolean(deprecated) && tokens.classOf(deprecated!) === 'lm-sem-function lm-sem-deprecated', 'deprecated adds the strike-through class');

  // Offsets
  const lines = [{ from: 0, to: 11 }, { from: 12, to: 12 }, { from: 13, to: 20 }];
  const fake = { lines: lines.length, line: (n: number) => lines[n - 1] };
  const range = tokens.spanRange(fake, { line: 0, start: 6, length: 3 });
  expect(range?.from === 6 && range.to === 9, 'span → offsets');
  expect(tokens.spanRange(fake, { line: 0, start: 9, length: 10 })?.to === 11, 'a span is cut at the end of its line');
  expect(tokens.spanRange(fake, { line: 5, start: 0, length: 1 }) === null && tokens.spanRange(fake, { line: 1, start: 0, length: 2 }) === null, 'lines the document lacks, or an empty line: no mark');

  // Folding (the server ends a brace block before its closing line)
  const folds = { stale: false, ranges: [
    { startLine: 2, endLine: 4 }, { startLine: 2, endLine: 9, kind: 'comment' }, { startLine: 5, endLine: 5 }, { startLine: 8, endLine: 40 }, { startLine: 0, endLine: 1, kind: 'imports' },
  ] };
  expect(folding.foldFor(folds, 2, 20)?.endLine === 9, 'the widest range of a line wins');
  expect(folding.foldFor(folds, 5, 20) === null, 'a one-line range is no fold');
  expect(folding.foldFor(folds, 8, 20) === null, 'a range past the end of the document is ignored');
  expect(folding.foldFor(folds, 0, 20)?.kind === 'imports', 'import groups fold');
  expect(folding.foldFor({ ...folds, stale: true }, 2, 20) === null, 'after an edit the ranges are stale until the server answers again');

  // Diagnostics
  const parts = text.diagnosticParts({
    range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
    severity: 2, code: 'P101', source: 'pureline', message: 'else is not allowed',
    codeDescription: { href: 'https://example.org/rules/P101' }, tags: [2],
    relatedInformation: [{ location: { uri: 'file:///p/src/a.nv', range: { start: { line: 6, character: 2 }, end: { line: 6, character: 3 } } }, message: 'first declared here' }],
  });
  expect(parts.code === 'P101' && parts.source === 'pureline' && parts.href === 'https://example.org/rules/P101', 'code, source and the code description link');
  expect(parts.deprecated && !parts.unnecessary, 'tags');
  expect(parts.related.length === 1 && parts.related[0].name === 'a.nv' && parts.related[0].line === 6 && parts.related[0].message === 'first declared here', 'related information with file and line');
  expect(text.diagnosticParts({ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, message: 'x', code: 7, codeDescription: { href: 'javascript:alert(1)' } }).href === undefined, 'only web addresses become links');
  expect(text.diagnosticParts({ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, message: 'x', code: 0 }).code === '0', 'a numeric code 0 is a code');
  expect(text.diagnosticText({ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, message: 'm', code: 'C1', relatedInformation: parts.related.length ? [{ location: { uri: 'file:///p/b.nv', range: { start: { line: 2, character: 0 }, end: { line: 2, character: 1 } } }, message: 'see' }] : [] }) === 'm  [C1]\n↳ b.nv:3: see', 'plain text form');
}
