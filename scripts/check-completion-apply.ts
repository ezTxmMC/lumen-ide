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
 * Tests accepting a completion: the snippet parser and the single-transaction
 * plan (main edit, InsertReplaceEdit, additional edits, races, CRLF, Unicode).
 */

import { ChangeSet, Text } from '@codemirror/state';
import { parseSnippet, snippetToCm, snippetVariables } from '@/core/completion/snippet';
import {
  diffChanges, mergeResolved, needsResolve, offsetToPos, planCompletion, posToOffset,
  type CompletionPlan, type PlanInput,
} from '@/core/completion/apply';
import type { CompletionItem } from '@/core/lsp/protocol';

let failures = 0;
function ok(condition: boolean, message: string) {
  if (condition) {
    console.log(`✓ ${message}`);
    return;
  }
  failures++;
  console.log(`✗ ${message}`);
}
function eq(actual: unknown, expected: unknown, message: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  ok(a === b, a === b ? message : `${message}\n    got      ${a}\n    expected ${b}`);
}

const doc = (text: string) => Text.of(text.split(/\r\n?|\n/));
const run = (d: Text, plan: CompletionPlan) => ChangeSet.of(plan.changes, d.length).apply(d).toString();
const r = (sl: number, sc: number, el: number, ec: number) => ({
  start: { line: sl, character: sc }, end: { line: el, character: ec },
});

/** Plans on `text` with `|` marking the cursor; the word range is the identifier before it. */
function plan(marked: string, item: CompletionItem, extra: Partial<PlanInput> = {}) {
  const head = marked.indexOf('|');
  const text = marked.replace(/\|/, '');
  const d = doc(text);
  let from = head;
  while (from > 0 && /[\w$]/.test(text[from - 1])) {
    from--;
  }
  const p = planCompletion({ doc: d, head, from, to: head, item, ...extra });
  return { d, p, out: run(d, p) };
}
/** The result with `|` where the cursor ends up. */
function cursored(x: { p: CompletionPlan; out: string; }) {
  const at = x.p.selection[0].head;
  return x.out.slice(0, at) + '|' + x.out.slice(at);
}

/* ------------------------------------------------------------------ *
 * Snippet grammar
 * ------------------------------------------------------------------ */

{
  const s = parseSnippet('foo($1, $2)$0');
  eq(s.text, 'foo(, )', 'tab stops without placeholders');
  eq(s.stops.map((x) => x.index), [1, 2, 0], 'tab order ends with $0');
  eq(s.stops[0].ranges, [{ from: 4, to: 4 }], 'stop 1 position');
  eq(s.stops[2].ranges, [{ from: 7, to: 7 }], '$0 position');
}
{
  const s = parseSnippet('for (${1:i} = 0; $1 < ${2:n}; $1++) {\n\t$0\n}');
  eq(s.text, 'for (i = 0; i < n; i++) {\n\t\n}', 'mirrors copy the placeholder');
  eq(s.stops[0].ranges.length, 3, 'mirror ranges recorded');
  eq(s.stops[0].ranges[0], { from: 5, to: 6 }, 'primary is the first in document order');
}
{
  const s = parseSnippet('$1 and ${1:later}');
  eq(s.text, 'later and later', 'a mirror before its placeholder still gets the text');
}
{
  const s = parseSnippet('${1:a ${2:b} c}$0');
  eq(s.text, 'a b c', 'nested placeholder text');
  eq(s.stops[0].ranges, [{ from: 0, to: 5 }], 'outer range covers inner');
  eq(s.stops[1].ranges, [{ from: 2, to: 3 }], 'inner range');
}
{
  const s = parseSnippet('${1|one,two,three|} $1');
  eq(s.text, 'one one', 'choices use the first, mirrors follow');
  eq(s.stops[0].choices, ['one', 'two', 'three'], 'choices are kept');
  eq(parseSnippet('${1|a\\,b,c\\|d|}').stops[0].choices, ['a,b', 'c|d'], 'escapes inside choices');
}
{
  eq(parseSnippet('\\$1 \\} \\\\ \\n').text, '$1 } \\ \\n', 'escapes; unknown backslash stays');
  eq(parseSnippet('${1:a\\}b}').text, 'a}b', 'escaped brace inside placeholder');
  eq(parseSnippet('cost: $5 and $').text, 'cost:  and $', 'digits after $ are stops; a lone $ stays');
  eq(parseSnippet('a}b').text, 'a}b', 'a stray } at top level is text');
  eq(parseSnippet('${1:abc').text, '${1:abc', 'unclosed placeholder stays literal');
  eq(parseSnippet('${1|a,b}').text, '${1|a,b}', 'unclosed choice stays literal');
  eq(parseSnippet('${}').text, '${}', 'empty braces stay literal');
  eq(parseSnippet('').stops, [{ index: 0, ranges: [{ from: 0, to: 0 }] }], 'empty snippet has only $0');
  eq(parseSnippet('x').stops[0].ranges, [{ from: 1, to: 1 }], 'implicit $0 at the end');
  eq(parseSnippet('$0a$0').stops.length, 1, 'duplicate $0 collapses to one final stop');
}
{
  const vars = snippetVariables({ filePath: '/p/src/My.Class.ts', selected: 'SEL' });
  eq(parseSnippet('${TM_FILENAME_BASE}|$TM_FILENAME|$TM_SELECTED_TEXT', { vars }).text, 'My.Class|My.Class.ts|SEL', 'file variables');
  eq(parseSnippet('${UNKNOWN}[${UNKNOWN:dflt}][$UNKNOWN2]').text, '[dflt][]', 'unknown variables: default or empty');
  eq(parseSnippet('$TM_SELECTED_TEXT|${TM_SELECTED_TEXT:none}', { vars: { TM_SELECTED_TEXT: '' } }).text, '|none', 'empty value falls back to the default');
  eq(parseSnippet('${TM_FILENAME:${1:x}}', { vars: {} }).stops[0].ranges, [{ from: 0, to: 1 }], 'placeholder inside a variable default');
  eq(parseSnippet('${1/(.*)/${1:/upcase}/}z').text, 'z', 'transform is parsed, not applied');
  eq(parseSnippet('${1/\\d{2}/x/g}$0').text, '', 'braces inside a transform regex');
  eq(snippetVariables({ filePath: 'C:\\a\\b.txt' }).TM_FILENAME_BASE, 'b', 'Windows path');
  eq(snippetVariables({ filePath: '/a/.env' }).TM_FILENAME_BASE, '.env', 'dot file keeps its name');
}
{
  eq(parseSnippet('${1:${1}}').text, '', 'self-referencing placeholder does not loop');
  eq(parseSnippet('a\r\nb\rc').text, 'a\nb\nc', 'CRLF normalised');
  const s = parseSnippet('if ($1) {\n\t$0\n}', { indent: '  ' });
  eq(s.text, 'if () {\n  \t\n  }', 'indent after each newline');
  eq(s.stops[1].ranges, [{ from: 11, to: 11 }], 'stops move with the indent');
  const emoji = parseSnippet('😀${1:x}');
  eq(emoji.stops[0].ranges, [{ from: 2, to: 3 }], 'UTF-16 offsets');
}
{
  eq(snippetToCm('foo(${1:a}, $2)$0'), 'foo(${1:a}, ${2})${}', 'CodeMirror template');
  eq(snippetToCm('a {b} ${1:c}'), 'a \\{b\\} ${1:c}${}', 'braces escaped for CodeMirror');
  eq(snippetToCm('${1:a ${2:b}}'), '${1:a b}${}', 'nested fields flattened');
}

/* ------------------------------------------------------------------ *
 * Main edit
 * ------------------------------------------------------------------ */

{
  const x = plan('let a = fo|', { label: 'foo' });
  eq(x.out, 'let a = foo', 'label fallback replaces the word');
  ok(cursored(x) === 'let a = foo|', 'cursor after the label');
}
{
  const x = plan('x = ar|ray', { label: 'array' });
  eq(x.out, 'x = array', 'replace mode swallows the rest of the word');
  const y = plan('x = ar|ray', { label: 'array' }, { mode: 'insert' });
  eq(y.out, 'x = arrayray', 'insert mode keeps the rest');
}
{
  const item: CompletionItem = {
    label: 'println',
    textEdit: { insert: r(0, 4, 0, 6), replace: r(0, 4, 0, 11), newText: 'println' },
  };
  eq(plan('out.pr|intln', item).out, 'out.println', 'InsertReplaceEdit, replace mode');
  eq(plan('out.pr|intln', item, { mode: 'insert' }).out, 'out.printlnintln', 'InsertReplaceEdit, insert mode');
  eq(plan('out.pr|intln', { label: 'p', textEdit: { range: r(0, 4, 0, 6), newText: 'println' } }, { mode: 'insert' }).out, 'out.printlnintln', 'plain range ignores the mode');
}
{
  const x = plan('a fo|', { label: 'foo', textEdit: { range: r(0, 2, 0, 3), newText: 'foo' } });
  eq(x.out, 'a foo', 'range end grows to the cursor after further typing');
  const bad = plan('ab|', { label: 'x', textEdit: { range: r(0, 5, 0, 9), newText: 'X' } });
  eq(bad.out, 'abX', 'a range beyond the line is clamped to its end');
  const after = plan('a|bc', { label: 'x', textEdit: { range: r(0, 2, 0, 3), newText: 'X' } });
  ok(after.p.warnings.length > 0, 'range after the cursor warns and falls back');
  eq(after.out, 'X', 'fallback replaces the word range');
  const rev = plan('ab|', { label: 'x', textEdit: { range: r(0, 2, 0, 0), newText: 'Q' } });
  eq(rev.out, 'abQ', 'reversed range collapses to an insertion');
  const far = plan('ab|', { label: 'x', textEdit: { range: r(7, 0, 9, 9), newText: 'Z' } });
  eq(far.out, 'abZ', 'lines beyond the document clamp');
  eq(plan('|', { label: 'e', textEdit: { range: r(0, 0, 0, 0), newText: 'e' } }).out, 'e', 'empty range at empty document');
}
{
  const crlf = doc('a\r\nb fo');
  const cp = planCompletion({ doc: crlf, head: 6, from: 4, to: 6, item: { label: 'foo', insertText: 'foo\r\nbar' } });
  eq(run(crlf, cp), 'a\nb foo\nbar', 'CRLF document and insert text are normalised');
  const d = doc('a\r\nb');
  eq(d.length, 3, 'CodeMirror counts CRLF as one character');
  eq(posToOffset(d, { line: 1, character: 1 }), 3, 'position on the line after CRLF');
  eq(offsetToPos(d, 2), { line: 1, character: 0 }, 'offset to position after CRLF');
  eq(posToOffset(d, { line: 0, character: 99 }), 1, 'character beyond the line clamps to the line end');
}
{
  const x = plan('😀 fo| 😀', { label: 'foo' }, { mode: 'insert' });
  eq(x.out, '😀 foo 😀', 'emoji before the cursor (UTF-16 offsets)');
  const y = plan('x😀y = na|', { label: 'name', textEdit: { range: r(0, 7, 0, 9), newText: 'name' } });
  eq(y.out, 'x😀y = name', 'a textEdit range past an emoji uses UTF-16 units');
}

/* ------------------------------------------------------------------ *
 * Snippets and indentation
 * ------------------------------------------------------------------ */

{
  const x = plan('  fo|', { label: 'for', insertTextFormat: 2, insertText: 'for ($1) {\n\t$0\n}' });
  eq(x.out, '  for () {\n  \t\n  }', 'multi-line snippet is indented like the line');
  eq(x.p.selection, [{ anchor: 7, head: 7 }], 'first stop selected');
  eq(x.p.stops?.length, 2, 'session stops present');
  const y = plan('fo|', { label: 'fn', insertTextFormat: 2, insertText: 'fn()$0' });
  eq(y.p.stops, null, 'only $0: no interactive session');
  eq(cursored(y), 'fn()|', 'cursor at $0');
}
{
  const x = plan('fo|', { label: 'f', insertTextFormat: 2, insertText: 'f(${1:a}, ${2:b})', additionalTextEdits: [{ range: r(0, 0, 0, 0), newText: 'import x\n' }] });
  eq(x.out, 'import x\nf(a, b)', 'snippet with an import above');
  eq(x.p.selection, [{ anchor: 11, head: 12 }], 'stop shifted by the import');
  eq(x.p.stops?.[1].ranges, [{ from: 14, to: 15 }], 'later stops shifted too');
  eq(x.out.slice(11, 12), 'a', 'the placeholder really is at the range');
}
{
  const x = plan('fo|', { label: 'f', insertTextFormat: 2, insertText: '${TM_SELECTED_TEXT:sel}' }, { selected: 'S' });
  eq(x.out, 'S', 'TM_SELECTED_TEXT from the input');
  const y = plan('fo|', { label: 'f', insertTextFormat: 2, insertText: '$TM_FILENAME' }, { filePath: '/a/b.ts' });
  eq(y.out, 'b.ts', 'TM_FILENAME from the path');
}
{
  const x = plan('  fo|', { label: 'f', insertText: 'a\nb', insertTextMode: 2 } as CompletionItem);
  eq(x.out, '  a\n  b', 'insertTextMode adjustIndentation on plain text');
  const y = plan('  fo|', { label: 'f', insertText: 'a\nb' });
  eq(y.out, '  a\nb', 'plain multi-line text is left alone by default');
}

/* ------------------------------------------------------------------ *
 * Synthetic "()"
 * ------------------------------------------------------------------ */

{
  const m = { label: 'run', kind: 2 };
  eq(cursored(plan('x.ru|', m)), 'x.run(|)', 'method without call gets ()');
  eq(plan('x.ru|(1)', m).out, 'x.run(1)', 'no () when ( follows');
  eq(plan('&Foo::ru|', m).out, '&Foo::run', 'no () for :: references');
  eq(plan('&ru|', m).out, '&run', 'no () for & references');
  eq(plan('x.ru|', { ...m, insertText: 'run(a)' }).out, 'x.run(a)', 'no () when the text has one');
  eq(plan('x.ru|', { ...m, textEdit: { range: r(0, 2, 0, 4), newText: 'run' } }).out, 'x.run', 'no () with a textEdit');
  eq(plan('x.ru|', { ...m, insertTextFormat: 2, insertText: 'run' }).out, 'x.run', 'no () with a snippet');
  eq(plan('x.ru|', { label: 'run', kind: 6 }).out, 'x.run', 'no () for variables');
  eq(plan('new Fo|', { label: 'Foo', kind: 4 }).out, 'new Foo()', 'constructor gets ()');
}

/* ------------------------------------------------------------------ *
 * Additional edits
 * ------------------------------------------------------------------ */

const IMPORT = { range: r(0, 0, 0, 0), newText: 'import { A } from "a"\n' };
{
  const x = plan('class B {}\nnew Ar|', { label: 'Array', additionalTextEdits: [IMPORT] });
  eq(x.out, 'import { A } from "a"\nclass B {}\nnew Array', 'import at line 0, main edit at EOF');
  eq(cursored(x).endsWith('Array|'), true, 'cursor after the insertion');
  eq(x.p.changes.length, 2, 'two changes in one set');
  eq(x.p.changes[0].from, 0, 'sorted: import first');
}
{
  const x = plan('a\nb Ar|\nc', { label: 'Array', additionalTextEdits: [{ range: r(2, 0, 2, 1), newText: 'C' }] });
  eq(x.out, 'a\nb Array\nC', 'edit below the main edit');
}
{
  const x = plan('import a\nx Ar| // y', { label: 'Array', additionalTextEdits: [{ range: r(1, 4, 1, 9), newText: '' }] });
  ok(x.p.dropped.length === 0, 'edit after the cursor on the same line is kept');
  eq(x.out, 'import a\nx Array', 'same-line edit after the main edit');
  const y = plan('x Ar| y', { label: 'Array', additionalTextEdits: [{ range: r(0, 0, 0, 1), newText: 'X' }] });
  eq(y.out, 'X Array y', 'same-line edit before the main edit');
}
{
  const x = plan('a\nb Ar|', { label: 'Array', additionalTextEdits: [{ range: r(0, 0, 0, 0), newText: 'one\n' }, { range: r(0, 0, 0, 0), newText: 'two\n' }] });
  eq(x.out, 'one\ntwo\na\nb Array', 'inserts at one position keep server order');
}
{
  const x = plan('a Ar|', { label: 'Array', additionalTextEdits: [{ range: r(0, 2, 0, 2), newText: '<' }] });
  eq(x.out, '<a Array'.replace('<a ', 'a <'), 'an insertion at the start of the word goes before the main text');
  const y = plan('ab Ar|', { label: 'Array', additionalTextEdits: [{ range: r(0, 0, 0, 3), newText: 'Q' }] });
  eq(y.out, 'QAr'.replace('QAr', 'QArray'), 'edit touching the main edit border is not an overlap');
  ok(y.p.dropped.length === 0, 'adjacent edits are both kept');
}
{
  const x = plan('a Ar|', { label: 'Array', additionalTextEdits: [{ range: r(0, 1, 0, 4), newText: 'Z' }] });
  eq(x.out, 'a Array', 'overlapping edit is dropped');
  eq(x.p.dropped[0].reason, 'overlaps the main edit', 'reason is reported');
  const y = plan('abcdef\nx Ar|', { label: 'Array', additionalTextEdits: [{ range: r(0, 0, 0, 4), newText: '1' }, { range: r(0, 2, 0, 5), newText: '2' }] });
  eq(y.out, '1ef\nx Array', 'overlap between additional edits drops the later one');
  eq(y.p.dropped.length, 1, 'one dropped');
}
{
  const x = plan('a Ar|', { label: 'Array', additionalTextEdits: [{ range: r(9, 0, 9, 0), newText: '\nend' }] });
  eq(x.out, 'a Array\nend', 'out-of-range edit clamps to the end of the document');
  const y = plan('a Ar|', { label: 'Array', additionalTextEdits: [] });
  eq(y.p.changes.length, 1, 'empty additionalTextEdits');
  const z = plan('a Ar|', { label: 'Array', additionalTextEdits: [{ range: r(0, 0, 0, 0), newText: 'a\r\nb\r\n' }] });
  eq(z.out, 'a\nb\na Array', 'CRLF in an additional edit is normalised');
}
{
  // Multi-line snippet at the end with an import at the top and one below.
  const text = 'top\nmid\nfn|\nbottom';
  const x = plan(text, {
    label: 'fn', insertTextFormat: 2, insertText: 'fn() {\n\t$1\n}$0',
    additionalTextEdits: [IMPORT, { range: r(3, 0, 3, 6), newText: 'BOTTOM' }],
  });
  eq(x.out, 'import { A } from "a"\ntop\nmid\nfn() {\n\t\n}\nBOTTOM', 'imports above and edits below a multi-line snippet');
  eq(x.out[x.p.selection[0].anchor - 1], '\t', 'stop sits after the tab');
}
{
  const item: CompletionItem = { label: 'x' };
  ok(needsResolve(item), 'undefined additionalTextEdits needs resolve');
  ok(!needsResolve({ label: 'x', additionalTextEdits: [] }), 'empty list does not');
  const m = mergeResolved(item, { label: 'x', additionalTextEdits: [IMPORT], command: { title: 't', command: 'c' }, textEdit: { range: r(0, 0, 0, 0), newText: 'ZZ' } });
  ok(m.additionalTextEdits?.length === 1 && m.command?.command === 'c' && m.textEdit?.newText === 'ZZ', 'resolve fills missing fields');
  const m2 = mergeResolved({ label: 'x', textEdit: { range: r(0, 2, 0, 4), newText: 'keep' } }, { label: 'x', textEdit: { range: r(5, 0, 5, 1), newText: 'other' } });
  eq(m2.textEdit?.newText, 'keep', 'resolve does not replace an existing textEdit it does not cover');
  const bare = { label: 'max', textEdit: { range: r(1, 2, 1, 4), newText: 'max' } };
  const call = mergeResolved(bare, { label: 'max', insertTextFormat: 2, textEdit: { range: r(1, 2, 1, 4), newText: 'max(${1:a}, ${2:b})' } });
  eq(call.textEdit?.newText, 'max(${1:a}, ${2:b})', 'the resolved edit that covers the list edit wins (jdtls: bare name in the list, call on resolve)');
  eq(call.insertTextFormat, 2, 'and brings its insert text format');
  const post = mergeResolved(bare, { label: 'for', insertTextFormat: 2, textEdit: { range: r(1, 0, 1, 4), newText: 'for (X x : list) {}' } });
  eq(post.textEdit?.newText, 'for (X x : list) {}', 'a postfix edit reaching back over the expression wins');
  const narrower = mergeResolved(bare, { label: 'max', textEdit: { range: r(1, 3, 1, 4), newText: 'ax' } });
  eq(narrower.textEdit?.newText, 'max', 'a resolved edit that covers less than the list edit is ignored');
}

/* ------------------------------------------------------------------ *
 * Resolve race and failure (fake client)
 * ------------------------------------------------------------------ */

/** What `acceptCompletion` does around the await, on a bare document. */
async function accept(
  before: string, item: CompletionItem, resolve: (i: CompletionItem) => Promise<CompletionItem>,
  interim?: (text: string) => string,
) {
  const head = before.indexOf('|');
  const text = before.replace(/\|/, '');
  const baseDoc = doc(text);
  let from = head;
  while (from > 0 && /[\w$]/.test(text[from - 1])) {
    from--;
  }
  let resolved: CompletionItem | undefined;
  let failure: string | undefined;
  if (needsResolve(item)) {
    try { resolved = await resolve(item); } catch (err) { failure = (err as Error).message; }
  }
  const current = interim ? doc(interim(text)) : baseDoc;
  const changes = current === baseDoc ? undefined : diffChanges(baseDoc, current);
  const newHead = changes ? changes.mapPos(head, 1) : head;
  const p = planCompletion({
    doc: current, head: newHead,
    from: changes ? changes.mapPos(from, -1) : from, to: newHead,
    item, resolved, baseDoc: changes ? baseDoc : undefined, changes,
  });
  return { out: run(current, p), p, failure };
}

{
  const item: CompletionItem = { label: 'Array', data: 1 };
  const good = async (i: CompletionItem) => ({ ...i, additionalTextEdits: [IMPORT] });
  const a = await accept('x\nnew Ar|', item, good);
  eq(a.out, 'import { A } from "a"\nx\nnew Array', 'resolve delivers the import in the same change set');

  const bad = await accept('x\nnew Ar|', item, async () => { throw new Error('boom'); });
  eq(bad.out, 'x\nnew Array', 'resolve failure still inserts the item');
  eq(bad.failure, 'boom', 'failure is visible to the caller');

  const same = await accept('x\nnew Ar|', item, async (i) => i);
  eq(same.out, 'x\nnew Array', 'resolve returning the item unchanged');

  // A character typed while resolving, right after the word.
  const typed = await accept('x\nnew Ar|', item, good, (t) => t + 'r');
  eq(typed.out, 'import { A } from "a"\nx\nnew Array', 'typed-on character is replaced along with the word');

  // Text inserted at the top while resolving: the import is mapped, not mis-placed.
  const above = await accept('x\nnew Ar|', item, good, (t) => '// hdr\n' + t);
  eq(above.out, '// hdr\nimport { A } from "a"\nx\nnew Array', 'edit above: import lands after the header inserted at the same spot');

  // Interim change inside the region the import replaces: it is dropped, not applied blindly.
  const clash = await accept('abc\nnew Ar|', item, async (i) => ({ ...i, additionalTextEdits: [{ range: r(0, 0, 0, 3), newText: 'ABC' }] }), (t) => t.replace('b', 'BB'));
  eq(clash.out, 'aBBc\nnew Array', 'conflicting interim edit drops the additional edit');
  eq(clash.p.dropped.length, 1, 'and reports it');

  // The edit is on a line the interim change shifted.
  const shifted = await accept('a\nb\nnew Ar|', item, async (i) => ({ ...i, additionalTextEdits: [{ range: r(1, 0, 1, 1), newText: 'B' }] }), (t) => 'new line\n' + t);
  eq(shifted.out, 'new line\na\nb\nnew Array'.replace('b\n', 'B\n'), 'positions after an inserted line are mapped');
}
{
  const d1 = doc('abc def');
  const d2 = doc('abXc def');
  const c = diffChanges(d1, d2);
  eq([c.mapPos(1, 1), c.mapPos(3, 1), c.mapPos(7, 1)], [1, 4, 8], 'diffChanges maps positions');
  eq(diffChanges(d1, d1).empty, true, 'no change, empty set');
  eq(diffChanges(doc(''), doc('x')).length, 0, 'diff from an empty document');
}

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
