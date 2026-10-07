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
 * Samples for the syntax-context detectors (`LanguageSpec.syntaxContext`):
 * the text with `§` where the cursor is, and the expected scope and whether
 * that is code. Tricky on purpose — braces and tags inside strings and
 * comments, nested blocks, the cursor right at a boundary.
 */

export interface ContextCase {
  language: 'novus' | 'nvh' | 'nvmd';
  /** `§` marks the cursor. */
  text: string;
  scope: string;
  code: boolean;
}

/** The text before the cursor and the cursor's position. */
export function splitCursor(text: string): { before: string; doc: string; pos: number; } {
  const pos = text.indexOf('§');
  return { before: text.slice(0, pos), doc: text.replace('§', ''), pos };
}

const nv = (text: string, scope: string): ContextCase => ({ language: 'novus', text, scope, code: true });
const nh = (text: string, scope: string, code = false): ContextCase => ({ language: 'nvh', text, scope, code });
const nm = (text: string, scope: string, code = false): ContextCase => ({ language: 'nvmd', text, scope, code });

export const CONTEXT_CASES: ContextCase[] = [
  // Novus: the innermost block
  nv('§', 'toplevel'),
  nv('package main\n\n§', 'toplevel'),
  nv('define class A {\n  string x\n  §', 'class'),
  nv('define class A {\n  method f() {\n    §', 'statement'),
  nv('define class A {\n  method f() {\n  }\n  §', 'class'),
  nv('define class A based B {\n  name(): string {\n    §', 'statement'),
  nv('define interface I {\n  name(): string\n  §', 'class'),
  nv('define enum E {\n  A(1),\n  B(2);\n  §', 'class'),
  nv('define class P {\n  construct(integer x) {\n    this.x = x\n  }\n  §', 'class'),
  nv('method main {\n  if (x) {\n    §', 'statement'),
  nv('method main {\n  if (x) {\n  } else {\n    §', 'statement'),
  nv('method main {\n  while (true) {\n    for (i in xs) {\n      §', 'statement'),
  nv('method main {\n}\n§', 'toplevel'),
  nv('method main {\n  sync {\n  }\n  §', 'statement'),
  // Novus: braces that are no blocks
  nv('method main {\n  var m = {"a": "}", "b": §', 'expression'),
  nv('method main {\n  var m = {"a": {\n    §', 'expression'),
  nv('method f() {\n  var p = Point{\n    x=§', 'expression'),
  nv('method f() {\n  foo({\n  §', 'expression'),
  nv('method main {\n  var s = "{"\n  §', 'statement'),
  nv('method main {\n  var s = "}}}"\n  §', 'statement'),
  nv('method main {\n  // { {\n  §', 'statement'),
  nv('method main {\n  /* } } */ §', 'statement'),
  nv('method main {\n  println "a ${x + §', 'expression'),
  nv('method main {\n  println "a ${f("}", {"k": 1})} b §', 'statement'),
  nv('method main {\n  println "line one\n  { still the string §', 'statement'),
  { ...nv('method main {\n  c {\n    printf("}");\n    §', 'c'), code: false },
  nv('method main {\n  c {\n    if (x) { y(); }\n  }\n  §', 'statement'),
  { ...nv('method main {\n  c {\n    §', 'c'), code: false },
  // nvh: text, tag, expression, block
  nh('§', 'nvh_template'),
  nh('<div>§', 'nvh_template'),
  nh('<div§', 'nvh_template'),
  nh('<div §', 'nvh_tag'),
  nh('<div class="a" §', 'nvh_tag'),
  nh('<div class="a > §', 'nvh_tag'),
  nh('<a href={x}>§', 'nvh_template'),
  nh('<a class:on={b} §', 'nvh_tag'),
  nh('<a class:on={b§', 'nvh_expr', true),
  nh('<br/> §', 'nvh_template'),
  nh('<input value="{x" > §', 'nvh_template'),
  nh('a < b §', 'nvh_template'),
  nh('<p>{a}§', 'nvh_template'),
  nh('<p>{a}</p> §', 'nvh_template'),
  nh('<p>{count-c§', 'nvh_expr', true),
  nh('<p>{"}" + c§', 'nvh_expr', true),
  nh('<p>{f({"a": 1}) + §', 'nvh_expr', true),
  nh('<p>{#if a}\n§', 'nvh_template'),
  nh('<p>{#if a}x{/if}§', 'nvh_template'),
  nh('<p>{#if a > 1§', 'nvh_expr', true),
  nh('\\{ §', 'nvh_template'),
  nh('\\{x} §', 'nvh_template'),
  nh('<?nv§', 'nvh_block', true),
  nh('<?n§', 'nvh_template'),
  nh('<?nv\nprop string x = "?>"\n§', 'nvh_block', true),
  nh('<?nv\nmethod f() {\n  var s = "?>"\n  // ?>\n  §', 'nvh_block', true),
  nh('<?nv\nprop x\n?>§', 'nvh_template'),
  nh('<?nv\nprop x\n?>\n<p>§', 'nvh_template'),
  nh('<?nv\nprop x\n?§', 'nvh_block', true),
  nh('<?= x + §', 'nvh_expr', true),
  nh('<?= x ?> §', 'nvh_template'),
  nh('<button @click="add(§', 'nvh_expr', true),
  nh('<button @click="add(1)" §', 'nvh_tag'),
  nh('<button @click="add(1)">§', 'nvh_template'),
  nh('<!-- {a} §', 'nvh_comment'),
  nh('<!-- x --> §', 'nvh_template'),
  nh('<style>\n a { color: red; }\n §', 'nvh_raw'),
  nh('<style>a{}</style>§', 'nvh_template'),
  nh('<script>\nlet x = {\n§', 'nvh_raw'),
  // nvmd: Markdown with Novus in it
  nm('§', 'nvmd_text'),
  nm('---\ntitle: x\n§', 'nvmd_front'),
  nm('---§', 'nvmd_front'),
  nm('---\ntitle: x\n---\n§', 'nvmd_text'),
  nm('---\na: b\n---\n<?nv\nimport strings\n§', 'nvh_block', true),
  nm('---\na: b\n---\n<?nv\nimport strings\n?>\n\n# {ti§', 'nvh_expr', true),
  nm('# T\n\n```nv\nprintln "{ }"\n§', 'nvmd_fence'),
  nm('# T\n\n```nv\nx\n```\n§', 'nvmd_text'),
  nm('~~~js\n{\n§', 'nvmd_fence'),
  nm('````\n```\n§', 'nvmd_fence'),
  nm('text `{a}` {b§', 'nvh_expr', true),
  nm('text `{a}` §', 'nvmd_text'),
  nm('text \\{ §', 'nvmd_text'),
  nm(':::note Ti§', 'nvmd_container'),
  nm(':::note Title\n§', 'nvmd_text'),
  nm(':::note\nbody\n:::\n§', 'nvmd_text'),
  nm('<Callout type="tip" §', 'nvh_tag'),
  nm('<Callout type="tip">\n§', 'nvmd_text'),
  nm('<Callout§', 'nvmd_text'),
  nm('{#if a}\n§', 'nvmd_text'),
  nm('{#for x in [1, "}"]}\n- {x§', 'nvh_expr', true),
  nm('  <?nv\n  x\n§', 'nvh_block', true),
];
