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
 * The scenarios of check-jdtls.ts. Every scenario drives the real jdtls, then
 * applies the chosen item with the product's planner on a string and asserts
 * on the RESULTING source text.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChangeSet, Text } from '@codemirror/state';
import { javaSpec } from '@/addons/builtin/java';
import { mergeResolved, planCompletion, posToOffset } from '@/core/completion/apply';
import { accepts, prepare, Query, rawScore } from '@/core/completion/matcher';
import type { CompletionItem, TextEdit } from '@/core/lsp/protocol';

type H = Record<string, any>;
/** Same rule as lspItemDeprecated() in lsp-extension.ts (not imported: that module pulls in the React store). */
const lspItemDeprecated = (item: CompletionItem) => Boolean(item.deprecated || item.tags?.includes(1));

const JAVA_SETTINGS = (javaSpec.lsp?.[0]?.settings as { java: Record<string, any>; }).java;

type Ctx = Record<string, any>;

/** 1. JDK auto-imports */
async function scenariosPart1(c: Ctx) {
  const { scenario, ok, eq, requestAt, accept, setText, findType, nameOf, summary, importsOf, checkImportPlacement, diagnosticsFor, mainFile, sleep, body, typeAt, clean } = c;
  const jdk: [string, string, string][] = [
    ['List', 'java.util', 'Lis'], ['Map', 'java.util', 'Ma'], ['ArrayList', 'java.util', 'ArrayLi'],
    ['Path', 'java.nio.file', 'Pat'], ['Stream', 'java.util.stream', 'Strea'], ['CompletableFuture', 'java.util.concurrent', 'CompletableF'],
  ];
  for (const [simple, pkg, typed] of jdk) {
    await scenario(`auto-import JDK type ${simple} (${pkg})`, async () => {
      const r = await typeAt(body(`${typed}|`), simple, pkg);
      if (!r) {
        return;
      }
      const { text, plan, cursor } = r.applied;
      const lines = text.split('\n');
      eq(importsOf(text), [`import ${pkg}.${simple};`], 'exactly the one import');
      ok(lines.includes(`        ${simple}`), 'identifier replaces the typed prefix', text);
      checkImportPlacement(text, simple);
      eq(text.slice(cursor - simple.length, cursor), simple, 'cursor ends right after the identifier');
      clean(r.applied, simple);
      ok(plan.changes.length === 2, 'import and identifier are ONE change set of two changes', plan.changes);
      ok(r.item.additionalTextEdits === undefined || r.item.additionalTextEdits.length === 0 || r.applied.resolvedCalled === false, 'auto-import arrives lazily (resolve) or eagerly, never lost');
    });
  }

  await scenario('auto-imported type compiles (no "cannot be resolved" for it afterwards)', async () => {
    const r = await typeAt(body('Lis|'), 'List', 'java.util');
    if (!r) {
      return;
    }
    const text = r.applied.text.replace('        List\n', '        List<String> xs = null;\n');
    setText(text);
    await sleep(500);
    const diags = await diagnosticsFor(mainFile);
    ok(!diags.some((d: any) => /List cannot be resolved/.test(d.message)), 'no unresolved List', diags.map((d: any) => d.message));
  });

  await scenario('ambiguity: List offers java.util AND java.awt, distinct; each imports its own', async () => {
    const req = await requestAt(body('List|'));
    const util = findType(req, 'List', 'java.util');
    const awt = findType(req, 'List', 'java.awt');
    ok(Boolean(util) && Boolean(awt), 'both java.util.List and java.awt.List offered', summary(req, 20));
    if (!util || !awt) {
      return;
    }
    ok(util !== awt && util.data?.pid !== awt.data?.pid, 'the two items are distinct entries');
    const a = await accept(req, awt);
    eq(importsOf(a.text), ['import java.awt.List;'], 'awt item imports java.awt.List only');
    const u = await accept(req, util);
    eq(importsOf(u.text), ['import java.util.List;'], 'util item imports java.util.List only');
    const dup = req.list.items.filter((i: any) => nameOf(i) === 'List' && i.kind === 7);
    ok(new Set(dup.map((i: any) => i.detail)).size === dup.length, 'no duplicate entries for one qualified name', dup.map((i: any) => i.detail));
  });

  await scenario('import order and placement with existing imports (importOrder java, javax, org, com, "")', async () => {
    const start = 'package app;\n\nimport java.io.File;\nimport java.util.Map;\n\npublic class Main {\n    public static void main(String[] args) {\n        ArrayLi|\n    }\n}\n';
    const r = await typeAt(start, 'ArrayList', 'java.util');
    if (!r) {
      return;
    }
    eq(importsOf(r.applied.text), ['import java.io.File;', 'import java.util.ArrayList;', 'import java.util.Map;'], 'sorted into the existing block');
    clean(r.applied, 'ArrayList');
    const next = r.applied.text.replace('        ArrayList\n', '        Pat|\n');
    const r2 = await typeAt(next, 'Path', 'java.nio.file');
    if (!r2) {
      return;
    }
    eq(importsOf(r2.applied.text), ['import java.io.File;', 'import java.nio.file.Path;', 'import java.util.ArrayList;', 'import java.util.Map;'], 'Path sorts between java.io and java.util');
    const third = r2.applied.text.replace('        Path\n', '        Gree|\n');
    const r3 = await typeAt(third, 'Greeter', 'lib');
    if (!r3) {
      return;
    }
    const imps = importsOf(r3.applied.text);
    eq(imps[imps.length - 1], 'import lib.Greeter;', 'lib.* (default group) sorts after java.*');
    const r4 = r3 ? await typeAt(r3.applied.text.replace('        Greeter\n', '        Mat|\n'), 'Math', 'java.lang') : null;
    ok(!r4 || importsOf(r4.applied.text).length === imps.length, 'java.lang.Math needs no import');
  });
}

/** 2. dependencies and other project files */
async function scenariosPart2(c: Ctx) {
  const { scenario, ok, eq, requestAt, accept, findType, summary, importsOf, checkImportPlacement, utilFile, lsp, body, typeAt, clean } = c;
  await scenario('jar dependency types: lib.Greeter and lib.util.Shouter import correctly', async () => {
    const g = await typeAt(body('Gree|'), 'Greeter', 'lib');
    if (g) {
      eq(importsOf(g.applied.text), ['import lib.Greeter;'], 'Greeter from the jar');
      checkImportPlacement(g.applied.text, 'Greeter');
      clean(g.applied, 'Greeter');
    }
    const s = await typeAt(body('Shout|'), 'Shouter', 'lib.util');
    if (s) {
      eq(importsOf(s.applied.text), ['import lib.util.Shouter;'], 'Shouter from a nested jar package');
    }
  });

  await scenario('resolve stability: the same type accepted twice in a row imports both times (fresh list each time)', async () => {
    for (let round = 1; round <= 4; round++) {
      const r = await typeAt(body('Gree|'), 'Greeter', 'lib');
      if (!r) {
        return;
      }
      eq(importsOf(r.applied.text), ['import lib.Greeter;'], `round ${round}: import lib.Greeter present`);
    }
    // now with an existing, different import block in the document, then back to none
    const withImport = 'package app;\n\nimport java.util.List;\n\npublic class Main {\n    public static void main(String[] args) {\n        Gree|\n    }\n}\n';
    const r = await typeAt(withImport, 'Greeter', 'lib');
    if (r) {
      eq(importsOf(r.applied.text), ['import java.util.List;', 'import lib.Greeter;'].sort(), 'import added next to an existing one');
    }
    const again = await typeAt(body('Gree|'), 'Greeter', 'lib');
    if (again) {
      eq(importsOf(again.applied.text), ['import lib.Greeter;'], 'and again on the plain document');
    }
  });

  await scenario('project type from ANOTHER package (other.Helper) imports; same-package Util does not', async () => {
    const h1 = await typeAt(body('Help|'), 'Helper', 'other');
    if (h1) {
      eq(importsOf(h1.applied.text), ['import other.Helper;'], 'Helper imported');
    }
    const req = await requestAt(body('Uti|'));
    const util = findType(req, 'Util', 'app');
    ok(Boolean(util), 'same-package Util offered', summary(req, 15));
    if (!util) {
      return;
    }
    const a = await accept(req, util);
    eq(importsOf(a.text), [], 'same package: no import');
    ok(a.text.includes('        Util\n'), 'identifier inserted', a.text);
  });

  await scenario('second file: completion in Util.java for a class of Main.java and other.Helper', async () => {
    const utilText = 'package app;\n\npublic class Util {\n    public static int twice(int x) { return x * 2; }\n    String f() {\n        Hel|\n    }\n}\n';
    await lsp.openDocument((await import('@/addons/builtin/java')).javaSpec, utilFile, utilText.replace(/\|/, ''));
    const req = await requestAt(utilText, { file: utilFile });
    const item = findType(req, 'Helper', 'other');
    ok(Boolean(item), 'Helper offered in the second file', summary(req, 15));
    if (item) {
      const a = await accept(req, item);
      eq(importsOf(a.text), ['import other.Helper;'], 'import lands in the second file');
      ok(a.text.startsWith('package app;\n'), 'package line kept first', a.text.slice(0, 60));
      ok(!a.text.includes('class Main'), 'edit did not leak the other file');
    }
    const req2 = await requestAt(utilText.replace('Hel|', 'Mai|'), { file: utilFile });
    const main = findType(req2, 'Main', 'app');
    ok(Boolean(main), 'sibling class Main of the first file is offered', summary(req2, 15));
    lsp.changeDocument(utilFile, 'package app;\n\npublic class Util {\n    public static int twice(int x) { return x * 2; }\n    public String describe() { return "util"; }\n}\n');
  });
}

/** 3. static */
async function scenariosPart3(c: Ctx) {
  const { scenario, ok, eq, requestAt, accept, nameOf, summary, importsOf, countOf, checkImportPlacement, body, typeAt, ev, clean } = c;
  await scenario('static member Math.max via qualified access (no import)', async () => {
    const req = await requestAt(body('int m = Math.ma|;'));
    const item = req.list.items.find((i: any) => nameOf(i) === 'max' && /int a, int b/.test(i.labelDetails?.detail ?? i.label));
    ok(Boolean(item), 'Math.max(int,int) offered', summary(req, 15));
    if (!item) {
      return;
    }
    const a = await accept(req, item);
    ok(a.text.includes('Math.max('), 'Math.max( inserted', ev(a));
    eq(importsOf(a.text), [], 'no import for java.lang.Math');
    ok(/Math\.max\(a, b\)|Math\.max\(\)/.test(a.text) || a.plan.stops !== null, 'arguments as guessed placeholders or empty parens', ev(a));
  });

  await scenario('static import favourite: requireNonNull -> import static java.util.Objects.requireNonNull', async () => {
    const req = await requestAt(body('Object o = requireNonNu|;'));
    const item = req.list.items.find((i: any) => nameOf(i) === 'requireNonNull');
    ok(Boolean(item), 'requireNonNull offered unqualified', summary(req, 10));
    if (!item) {
      return;
    }
    const a = await accept(req, item);
    ok(importsOf(a.text).includes('import static java.util.Objects.requireNonNull;'), 'static import added', a.text);
    ok(/= requireNonNull\(/.test(a.text), 'call inserted unqualified with parentheses', ev(a));
    checkImportPlacement(a.text, 'requireNonNull');
    clean(a, 'requireNonNull');
  });

  await scenario('Collectors.toList after the import (member of an imported class)', async () => {
    const text = 'package app;\n\nimport java.util.stream.Collectors;\n\npublic class Main {\n    public static void main(String[] args) {\n        Object c = Collectors.toLi|;\n    }\n}\n';
    const req = await requestAt(text);
    const item = req.list.items.find((i: any) => nameOf(i) === 'toList');
    ok(Boolean(item), 'Collectors.toList offered', summary(req, 10));
    if (!item) {
      return;
    }
    const a = await accept(req, item);
    ok(a.text.includes('Collectors.toList()'), 'Collectors.toList() inserted', ev(a));
    eq(countOf(a.text, 'import java.util.stream.Collectors;'), 1, 'existing import untouched, not duplicated');
  });

  await scenario('static member of a not-yet-imported type: Collectors.toList after typing the type', async () => {
    // typing the type first (auto-import), then `.toList` — the whole flow of a user
    const r = await typeAt(body('Collector|'), 'Collectors', 'java.util.stream');
    if (!r) {
      return;
    }
    const next = r.applied.text.replace('        Collectors\n', '        Object c = Collectors.toLi|;\n');
    const req = await requestAt(next);
    const item = req.list.items.find((i: any) => nameOf(i) === 'toList');
    ok(Boolean(item), 'toList offered after the auto-import', summary(req, 10));
    if (!item) {
      return;
    }
    const a = await accept(req, item);
    ok(a.text.includes('Collectors.toList()'), 'complete flow yields Collectors.toList()', ev(a));
    eq(importsOf(a.text), ['import java.util.stream.Collectors;'], 'one import');
  });
}

/** 4. member access */
async function scenariosPart4(c: Ctx) {
  const { scenario, ok, eq, requestAt, accept, nameOf, summary, importsOf, mainText, ev } = c;
  await scenario('member access on a List: `list.` offers add/size/stream; applying size gives list.size()', async () => {
    const text = mainText('        java.util.List<String> list = new java.util.ArrayList<>();\n        int n = list.|;');
    const req = await requestAt(text);
    eq(req.trigger, '.', 'request carries the trigger character');
    const names = new Set(req.list.items.map((i: any) => nameOf(i)));
    for (const n of ['add', 'size', 'stream', 'forEach', 'isEmpty']) {
      ok(names.has(n), `${n} offered`, [...names].slice(0, 20));
    }
    const item = req.list.items.find((i: any) => nameOf(i) === 'size');
    if (!item) {
      return;
    }
    const a = await accept(req, item);
    ok(a.text.includes('int n = list.size();'), 'list.size() inserted', ev(a));
    eq(importsOf(a.text), [], 'member items carry no import');
  });

  await scenario('member access on a String: `str.` offers length/substring/chars', async () => {
    const req = await requestAt(mainText('        String str = "";\n        String t = str.|;'));
    const names = new Set(req.list.items.map((i: any) => nameOf(i)));
    for (const n of ['length', 'substring', 'chars', 'trim']) {
      ok(names.has(n), `${n} offered`, [...names].slice(0, 20));
    }
    const sub = req.list.items.find((i: any) => nameOf(i) === 'substring');
    if (!sub) {
      return;
    }
    const a = await accept(req, sub);
    ok(/str\.substring\(/.test(a.text), 'substring( inserted', ev(a));
  });

  await scenario('member of a jar type: Greeter.create() / hello(...) with resolved documentation path', async () => {
    const text = 'package app;\n\nimport lib.Greeter;\n\npublic class Main {\n    public static void main(String[] args) {\n        Greeter g = Greeter.cr|;\n    }\n}\n';
    const req = await requestAt(text);
    const item = req.list.items.find((i: any) => nameOf(i) === 'create');
    ok(Boolean(item), 'Greeter.create offered', summary(req, 10));
    if (!item) {
      return;
    }
    const a = await accept(req, item);
    ok(a.text.includes('Greeter g = Greeter.create();'), 'create() inserted', ev(a));
    const req2 = await requestAt(text.replace('Greeter g = Greeter.cr|;', 'Greeter g = null;\n        String s = g.hel|;'));
    ok(req2.list.items.some((i: any) => nameOf(i) === 'hello'), 'instance member hello from the jar', summary(req2, 10));
  });
}

/** 5. prefix shrink / reuse */
async function scenariosPart5(c: Ctx) {
  const { scenario, ok, eq, requestAt, nameOf, h, body } = c;
  await scenario('prefix shrink: `Stri` -> backspace to `S` cannot reuse the list and re-query brings Set and String', async () => {
    const narrow = await requestAt(body('Stri|'));
    const wide = await requestAt(body('S|'));
    const names = new Set(wide.list.items.map((i: any) => nameOf(i)));
    ok(names.has('Set') && names.has('String'), 'S| offers Set and String', [...names].slice(0, 25));
    ok(!narrow.list.items.some((i: any) => nameOf(i) === 'Set'), 'Stri| itself does not offer Set (server filtered)');
    eq(h.listReusable({ isIncomplete: narrow.list.isIncomplete, pattern: 'Stri' }, 'S'), false, 'the narrow list is NOT reusable for the shorter pattern');
    eq(h.listReusable({ isIncomplete: wide.list.isIncomplete, pattern: 'S' }, 'Str'), !wide.list.isIncomplete, 'a complete list serves the longer pattern');
    ok(wide.list.items.length > narrow.list.items.length, 'shorter prefix gives a bigger list', [wide.list.items.length, narrow.list.items.length]);
  });
}

/** 6. camel hump */
async function scenariosPart6(c: Ctx) {
  const { scenario, ok, eq, requestAt, accept, findType, summary, importsOf, body } = c;
  const humps: [string, string, string][] = [['NPE', 'NullPointerException', 'java.lang'], ['ArLi', 'ArrayList', 'java.util'], ['HM', 'HashMap', 'java.util']];
  for (const [typed, full, pkg] of humps) {
    await scenario(`camel hump ${typed} -> ${full}`, async () => {
      const req = await requestAt(body(`${typed}|`));
      const item = findType(req, full, pkg);
      ok(Boolean(item), `${full} offered for ${typed}`, summary(req, 10));
      if (!item) {
        return;
      }
      const score = rawScore(new Query(typed), prepare(item.filterText ?? item.label));
      ok(accepts(new Query(typed), score), `the client-side matcher keeps it for "${typed}" (score ${score})`);
      const a = await accept(req, item);
      ok(a.text.includes(`        ${full}\n`), `${full} replaces ${typed}`, a.text);
      if (pkg !== 'java.lang') {
        eq(importsOf(a.text), [`import ${pkg}.${full};`], 'import added');
      }
    });
  }
}

/** 7. postfix */
async function scenariosPart7(c: Ctx) {
  const { scenario, ok, skipHere, requestAt, accept, nameOf, summary, mainText } = c;
  await scenario('postfix template: list.for (the resolved edit reaches back over the typed expression)', async () => {
    const text = mainText('        java.util.List<String> list = new java.util.ArrayList<>();\n        list.for|');
    const req = await requestAt(text);
    const item = req.list.items.find((i: any) => i.kind === 15 && nameOf(i) === 'for');
    if (!item) {
      return skipHere(`jdtls sent no postfix/template item for list.for (got: ${summary(req, 8)})`);
    }
    // jdtls names only `for` in the list; the range over `list.` arrives with the resolve answer.
    const a = await accept(req, item);
    ok(!/list\.for/.test(a.text), 'the typed "list.for" is consumed', a.text);
    ok(/for \(\w+ \w+ : list\)/.test(a.text), 'for-each over list', a.text);
  });
}

/** 8. deprecated */
async function scenariosPart8(c: Ctx) {
  const { scenario, ok, requestAt, nameOf, summary, body } = c;
  await scenario('deprecated items: Date.getYear (JDK) and Greeter.oldHello (jar) carry the deprecated tag', async () => {
    const d = await requestAt(body('new java.util.Date().getYea|'));
    const year = d.list.items.find((i: any) => nameOf(i) === 'getYear');
    ok(Boolean(year), 'getYear offered', summary(d, 8));
    if (year) {
      ok(lspItemDeprecated(year), 'getYear is deprecated', { tags: year.tags, deprecated: year.deprecated });
    }
    const g = await requestAt(body('new lib.Greeter().oldHel|'));
    const old = g.list.items.find((i: any) => nameOf(i) === 'oldHello');
    ok(Boolean(old), 'oldHello offered', summary(g, 8));
    if (old) {
      ok(lspItemDeprecated(old), 'oldHello is deprecated', { tags: old.tags, deprecated: old.deprecated });
    }
  });
}

/** 9. snippets */
async function scenariosPart9(c: Ctx) {
  const { scenario, ok, eq, skipHere, requestAt, accept, nameOf, summary, mainText, classText, body } = c;
  await scenario('server snippet items: main / sysout through the snippet parser', async () => {
    const m = await requestAt(classText('    mai|'));
    const mainItem = m.list.items.find((i: any) => nameOf(i) === 'main' && i.kind === 15);
    const s = await requestAt(body('sysou|'));
    const sysItem = s.list.items.find((i: any) => nameOf(i) === 'sysout' && i.kind === 15);
    if (!mainItem && !sysItem) {
      return skipHere(`jdtls sent no template items (main: ${summary(m, 6)} | sysout: ${summary(s, 6)})`);
    }
    if (mainItem) {
      const a = await accept(m, mainItem);
      ok(a.text.includes('public static void main(String[] args)'), 'main template expanded', a.text);
      ok(!/\$\{?\d/.test(a.text), 'no raw snippet syntax left', a.text);
    }
    if (sysItem) {
      const a = await accept(s, sysItem);
      ok(a.text.includes('System.out.println('), 'sysout template expanded', a.text);
      ok(!/\$\{?\d/.test(a.text), 'no raw snippet syntax left', a.text);
    }
  });

  await scenario('LSP snippet grammar as jdtls sends it: guessed args, nested placeholders, choice, mirrors', async () => {
    const doc = Text.of(['        ']);
    const run = (bodyText: string) => {
      const item: CompletionItem = { label: 'x', kind: 2, textEdit: { range: { start: { line: 0, character: 8 }, end: { line: 0, character: 8 } }, newText: bodyText }, insertTextFormat: 2 };
      const plan = planCompletion({ doc, head: 8, from: 8, to: 8, item });
      return { plan, text: ChangeSet.of(plan.changes, doc.length).apply(doc).toString().slice(8) };
    };
    const g = run('requireNonNull(${1:null}, ${2:message})');
    eq(g.text, 'requireNonNull(null, message)', 'guessed-argument snippet text');
    eq(g.plan.stops?.length, 3, 'two tab stops plus the final one');
    eq([g.plan.selection[0].anchor - 8, g.plan.selection[0].head - 8], [15, 19], 'first stop selects the first guessed argument');
    const n = run('valueOf(${1:${2:x}})');
    eq(n.text, 'valueOf(x)', 'nested placeholder text');
    const c = run('for (${1|int,long|} i : ${2:xs}) {\n\t$0\n}');
    ok(c.text.startsWith('for (int i : xs) {\n'), 'choice takes its first option', c.text);
    const m = run('${1:i} + ${1}');
    eq(m.text, 'i + i', 'mirror repeats the placeholder');
    eq(m.plan.selection.length, 2, 'both mirrors are selected together');
  });

  await scenario('server data suffices: applying the RESOLVED main edit gives call parens, guessed args, ctor and postfix text', async () => {
    // What mergeResolved SHOULD produce: jdtls' resolve answer carries the final textEdit (parentheses, snippet
    // placeholders, postfix expression range) — the list item only has the bare name.
    const viaResolved = async (marked: string, pick: (i: any) => boolean, opts: any = {}) => {
      const req = await requestAt(marked, opts);
      const item = req.list.items.find(pick);
      if (!item) { ok(false, `item for ${marked.trim().split('\n').pop()} offered`, summary(req, 8)); return null; }
      const first = await accept(req, item);
      const r = first.resolved ?? {};
      const merged = { ...item, ...r, additionalTextEdits: r.additionalTextEdits, textEdit: r.textEdit ?? item.textEdit };
      const plan = planCompletion({ doc: req.doc, head: req.head, from: req.from, to: req.to, item: merged, filePath: req.file });
      return { text: ChangeSet.of(plan.changes, req.doc.length).apply(req.doc).toString(), plan, first };
    };
    const max = await viaResolved(body('int m = Math.ma|;'), (i) => nameOf(i) === 'max' && /int a, int b/.test(i.labelDetails?.detail ?? ''));
    if (max) {
      ok(max.text.includes('int m = Math.max(a, b);'), 'Math.max(a, b)', max.text);
    }
    const size = await viaResolved(mainText('        java.util.List<String> list = new java.util.ArrayList<>();\n        int n = list.|;'), (i) => nameOf(i) === 'size');
    if (size) {
      ok(size.text.includes('int n = list.size();'), 'list.size()', size.text);
    }
    const ctor = await viaResolved(mainText('        String prefix = "a";\n        int times = 2;\n        var g = new Greet|;'), (i) => nameOf(i) === 'Greeter' && /String prefix, int times/.test(`${i.labelDetails?.detail ?? ''}${i.label}`));
    if (ctor) {
      ok(ctor.text.includes('var g = new Greeter(prefix, times);'), 'new Greeter(prefix, times)', ctor.text);
      ok(ctor.text.includes('import lib.Greeter;'), 'ctor item still imports lib.Greeter', ctor.text);
    }
    const post = await viaResolved(mainText('        java.util.List<String> list = new java.util.ArrayList<>();\n        list.for|'), (i) => i.kind === 15 && nameOf(i) === 'for');
    if (post) {
      ok(/for \(String \w+ : list\) \{/.test(post.text) && !post.text.includes('list.for'), 'postfix for over list, typed expression consumed', post.text);
      ok(post.plan.dropped.length <= 1, 'the redundant deletion overlapping the main edit is dropped, not applied twice', post.plan.dropped);
    }
  });
}

/** 10. constructors */
async function scenariosPart10(c: Ctx) {
  const { scenario, ok, requestAt, accept, nameOf, summary, importsOf, checkImportPlacement, mainText, body, ev, clean } = c;
  await scenario('constructor: new Greeter( offers both ctors with guessed arguments and imports lib.Greeter', async () => {
    const text = mainText('        String prefix = "a";\n        int times = 2;\n        var g = new Greet|;');
    const req = await requestAt(text);
    const ctors = req.list.items.filter((i: any) => nameOf(i) === 'Greeter');
    ok(ctors.length >= 1, 'Greeter constructors offered', summary(req, 15));
    const two = ctors.find((i: any) => /String prefix, int times/.test(`${i.labelDetails?.detail ?? ''} ${i.label} ${i.detail ?? ''}`));
    ok(Boolean(two), 'the (String, int) constructor is there', ctors.map((i: any) => `${i.label} ${i.labelDetails?.detail ?? ''} ${i.detail ?? ''}`));
    if (!two) {
      return;
    }
    const a = await accept(req, two);
    ok(/new Greeter\(prefix, times\)/.test(a.text), 'arguments guessed from the locals prefix, times', ev(a));
    ok(importsOf(a.text).includes('import lib.Greeter;'), 'lib.Greeter imported by the constructor item', a.text);
    ok(a.plan.stops !== null, 'placeholders are interactive stops');
    clean(a, 'ctor');
    const noArg = ctors.find((i: any) => !/,/.test(i.labelDetails?.detail ?? i.label) && /\(\)/.test(`${i.labelDetails?.detail ?? ''}${i.label}`));
    if (noArg) {
      const b = await accept(req, noArg);
      ok(/new Greeter\(\)/.test(b.text), 'no-arg ctor gives new Greeter()', b.text);
    }
  });

  await scenario('constructor of a JDK class: new ArrLi -> new ArrayList<>() with import', async () => {
    const req = await requestAt(body('java.util.List<String> xs = new ArrLi|;'));
    const item = req.list.items.find((i: any) => nameOf(i) === 'ArrayList' && /\(\)|<>/.test(`${i.label}${i.labelDetails?.detail ?? ''}${i.textEdit?.newText ?? ''}`))
      ?? req.list.items.find((i: any) => nameOf(i) === 'ArrayList');
    ok(Boolean(item), 'ArrayList ctor offered', summary(req, 10));
    if (!item) {
      return;
    }
    const a = await accept(req, item);
    ok(/new ArrayList<>\(\)|new ArrayList\(\)/.test(a.text), 'new ArrayList<>() inserted', ev(a));
    ok(importsOf(a.text).includes('import java.util.ArrayList;'), 'import added', a.text);
    checkImportPlacement(a.text, 'ArrayList ctor');
  });
}

/** 11. annotation */
async function scenariosPart11(c: Ctx) {
  const { scenario, ok, eq, requestAt, accept, nameOf, summary, importsOf, classText } = c;
  await scenario('annotation @Over -> @Override (range covers the @, no @@)', async () => {
    const text = classText('    @Over|\n    public String toString() { return ""; }');
    const req = await requestAt(text);
    const item = req.list.items.find((i: any) => nameOf(i).replace('@', '') === 'Override');
    ok(Boolean(item), 'Override offered', summary(req, 10));
    if (!item) {
      return;
    }
    const a = await accept(req, item);
    ok(/^ {4}@Override ?\n {4}public String toString/m.test(a.text), '@Override in place (server text "Override " keeps a trailing space)', JSON.stringify(a.text));
    ok(!a.text.includes('@@'), 'no doubled @');
    eq(importsOf(a.text), [], 'java.lang.Override needs no import');
  });

  await scenario('annotation of a non-java.lang package (@FunctionalInterface stays; @Nullable absent) and import inside annotation context', async () => {
    const text = 'package app;\n\n@Functional|\npublic interface Fn { void run(); }\n';
    const req = await requestAt(text);
    const item = req.list.items.find((i: any) => nameOf(i).replace('@', '') === 'FunctionalInterface');
    ok(Boolean(item), 'FunctionalInterface offered', summary(req, 10));
    if (!item) {
      return;
    }
    const a = await accept(req, item);
    ok(/@FunctionalInterface ?\npublic interface/.test(a.text), '@FunctionalInterface inserted', JSON.stringify(a.text));
  });
}

/** 12. import context */
async function scenariosPart12(c: Ctx) {
  const { scenario, ok, eq, requestAt, accept, nameOf, summary, countOf } = c;
  await scenario('inside an import statement: `import java.u` and `import java.util.Arr`', async () => {
    const a1 = 'package app;\n\nimport java.u|\n\npublic class Main {\n}\n';
    const req = await requestAt(a1);
    const pkgItem = req.list.items.find((i: any) => /^(java\.)?util$/.test(i.label) || i.label === 'util' || i.detail === 'java.util');
    ok(Boolean(pkgItem), 'java.util package offered', summary(req, 10));
    if (pkgItem) {
      const a = await accept(req, pkgItem);
      ok(/import java\.util\b/.test(a.text) && !/java\.java/.test(a.text), 'package completed without doubling', a.text);
    }
    const a2 = 'package app;\n\nimport java.util.Arr|\n\npublic class Main {\n}\n';
    const req2 = await requestAt(a2);
    const list = req2.list.items.find((i: any) => nameOf(i) === 'ArrayList');
    ok(Boolean(list), 'ArrayList offered inside the import', summary(req2, 10));
    if (list) {
      const a = await accept(req2, list);
      eq(countOf(a.text, 'import java.util.ArrayList'), 1, 'exactly one import, no second one added by the item');
      ok(/^import java\.util\.ArrayList;?$/m.test(a.text), 'statement completed', a.text);
      eq(a.plan.changes.length, 1, 'a single change (no additional edits inside an import)');
    }
  });
}

/** 13. organize imports */
async function scenariosPart13(c: Ctx) {
  const { scenario, ok, eq, skipHere, setText, cur, importsOf, mainFile, sleep, body, typeAt } = c;
  await scenario('organizeImports: unused imports go, used stay, order per importOrder; completion-added import survives', async () => {
    const text = 'package app;\n\nimport lib.Greeter;\nimport java.util.List;\nimport java.util.Map;\nimport java.util.ArrayList;\n\npublic class Main {\n    Map<String, String> m;\n    Greeter g;\n    public static void main(String[] args) {\n    }\n}\n';
    setText(text);
    await sleep(800);
    const client = cur().client;
    const doc = Text.of(text.split('\n'));
    const range = { start: { line: 0, character: 0 }, end: { line: doc.lines - 1, character: 0 } };
    const actions = await client.codeActions(mainFile, range, [], ['source.organizeImports']);
    const action = actions.find((a: any) => /organize/i.test(a.title) || a.kind === 'source.organizeImports');
    if (!action) {
      return skipHere(`no organizeImports code action (${actions.map((a: any) => a.title).join(', ') || 'none'})`);
    }
    let edits: TextEdit[] = [];
    const full = action.edit || action.command ? action : await client.resolveCodeAction(action);
    if (full.edit) {
      edits = Object.values(full.edit.changes ?? {}).flat() as TextEdit[];
      for (const dc of full.edit.documentChanges ?? []) {
        if ('edits' in dc) {
          edits.push(...dc.edits);
        }
      }
    }
    if (!full.edit && full.command) {
      const res: any = await client.executeCommand(full.command);
      edits = Object.values(res?.changes ?? {}).flat() as TextEdit[];
      for (const dc of res?.documentChanges ?? []) {
        if ('edits' in dc) {
          edits.push(...dc.edits);
        }
      }
    }
    ok(edits.length > 0, 'organizeImports returned edits', action);
    const out = ChangeSet.of(edits.map((e) => ({ from: posToOffset(doc, e.range.start), to: posToOffset(doc, e.range.end), insert: e.newText })), doc.length).apply(doc).toString();
    eq(importsOf(out), ['import java.util.Map;', 'import lib.Greeter;'], 'unused List/ArrayList removed, used Map/Greeter kept and ordered');
    // the import a completion adds is "used" once the identifier is typed: organize must keep it
    const r = await typeAt(body('Pat|'), 'Path', 'java.nio.file');
    if (!r) {
      return;
    }
    const used = r.applied.text.replace('        Path\n', '        Path p = null;\n');
    setText(used);
    await sleep(800);
    const doc2 = Text.of(used.split('\n'));
    const acts2 = await client.codeActions(mainFile, { start: { line: 0, character: 0 }, end: { line: doc2.lines - 1, character: 0 } }, [], ['source.organizeImports']);
    const act2raw = acts2.find((a: any) => a.kind === 'source.organizeImports' || /organize/i.test(a.title));
    const act2 = act2raw && !act2raw.edit && !act2raw.command ? await client.resolveCodeAction(act2raw) : act2raw;
    const ed2 = act2?.edit ? (Object.values(act2.edit.changes ?? {}).flat() as TextEdit[]) : [];
    const removed = ed2.some((e) => /java\.nio\.file\.Path/.test(doc2.sliceString(posToOffset(doc2, e.range.start), posToOffset(doc2, e.range.end))) && !/Path/.test(e.newText));
    ok(!removed, 'organizeImports keeps the import added by completion when the type is used');
  });
}

/** 14. lazy vs eager resolve */
async function scenariosPart14(c: Ctx) {
  const { scenario, ok, eq, skipHere, requestAt, accept, findType, importsOf, body } = c;
  await scenario('eager list edit + lazy import: item has textEdit, import edits come with completionItem/resolve', async () => {
    const req = await requestAt(body('ArrayLi|'));
    const item = findType(req, 'ArrayList', 'java.util');
    ok(Boolean(item), 'ArrayList offered');
    if (!item) {
      return;
    }
    ok(Boolean(item.textEdit), 'textEdit is in the list item (lazyResolveTextEdit=false)');
    const needs = item.additionalTextEdits === undefined;
    ok(needs || item.additionalTextEdits.length > 0, 'either resolvable later or already carrying the import');
    const a = await accept(req, item);
    eq(a.resolvedCalled, needs, 'the product resolves exactly when additionalTextEdits are missing');
    if (needs) {
      ok(Boolean(a.resolved?.additionalTextEdits?.length), 'resolve delivered the import edit', a.resolved);
    }
    eq(importsOf(a.text), ['import java.util.ArrayList;'], 'import present in the final text');
    // an already-resolved item must apply the same without a second resolve
    const again = await accept(req, mergeResolved(item, a.resolved));
    eq(again.text, a.text, 'applying the merged item gives the identical text');
    eq(again.resolvedCalled, false, 'a resolved item is not resolved again');
  });

  await scenario('resolve failure/timeout path: item applied WITHOUT import stays syntactically valid', async () => {
    const req = await requestAt(body('ArrayLi|'));
    const item = findType(req, 'ArrayList', 'java.util');
    if (!item) {
      return skipHere('ArrayList not offered');
    }
    const plan = planCompletion({ doc: req.doc, head: req.head, from: req.from, to: req.to, item, filePath: req.file });
    const text = ChangeSet.of(plan.changes, req.doc.length).apply(req.doc).toString();
    ok(text.includes('        ArrayList\n') && importsOf(text).length === 0, 'identifier replaced, no import, no crash', text);
  });
}

/** 15. race: document edited between accept and resolve */
async function scenariosPart15(c: Ctx) {
  const { scenario, ok, eq, skipHere, requestAt, accept, cur, findType, nameOf, summary, importsOf, lsp, body, clean } = c;
  await scenario('fast accept: import edit requested <= 30 ms after an edit of the import block is not stale (window is ~30-100 ms)', async () => {
    const withImports = 'package app;\n\nimport java.io.File;\nimport lib.Greeter;\n\npublic class Main {\n    public static void main(String[] args) {\n        Mat|\n    }\n}\n';
    let stale = 0;
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      await requestAt(withImports);
      const req = await requestAt(body('Gree|'), { settle: Number(process.env.LUMEN_JDTLS_FAST_MS ?? 0) });
      const item = findType(req, 'Greeter', 'lib');
      if (!item) { ok(false, 'Greeter offered', summary(req, 6)); return; }
      const a = await accept(req, item);
      if (!importsOf(a.text).includes('import lib.Greeter;')) { stale++; seen.push(JSON.stringify(a.text.slice(0, 80))); }
    }
    ok(stale === 0, `resolve answered from a stale import container ${stale}/4 times right after an edit (jdtls reconciles asynchronously; LUMEN_JDTLS_SETTLE_MS=0 shows it everywhere)`, seen[0]);
  });

  await scenario('race A: user appends text far below while resolving — import and word still land correctly', async () => {
    const req = await requestAt(body('ArrayLi|'));
    const item = findType(req, 'ArrayList', 'java.util');
    if (!item) {
      return skipHere('ArrayList not offered');
    }
    const a = await accept(req, item, { during: (t: string) => `${t}// tail\n` });
    eq(importsOf(a.text), ['import java.util.ArrayList;'], 'import present');
    ok(a.text.includes('        ArrayList\n') && a.text.endsWith('// tail\n'), 'word replaced, tail kept', a.text);
    clean(a, 'race A');
  });

  await scenario('race B: user types one more letter of the word while resolving — no leftover letter', async () => {
    const req = await requestAt(body('ArrayLi|'));
    const item = findType(req, 'ArrayList', 'java.util');
    if (!item) {
      return skipHere('ArrayList not offered');
    }
    const a = await accept(req, item, { during: (t: string) => t.replace('ArrayLi\n', 'ArrayLis\n') });
    ok(a.text.includes('        ArrayList\n'), 'the typed extra letter is part of the replaced word', a.text);
    ok(!/ArrayListt|ArrayLisArrayList/.test(a.text), 'no duplicated text');
    eq(importsOf(a.text), ['import java.util.ArrayList;'], 'import present');
  });

  await scenario('race C: user edits the import area while resolving — edit dropped with a reason, never corrupts', async () => {
    const req = await requestAt(body('ArrayLi|'));
    const item = findType(req, 'ArrayList', 'java.util');
    if (!item) {
      return skipHere('ArrayList not offered');
    }
    const a = await accept(req, item, { during: (t: string) => t.replace('package app;\n\n', 'package app;\n// note\n\n') });
    const imports = importsOf(a.text);
    ok(imports.length === 0 || imports.length === 1, 'zero or one import, never garbled', a.text);
    ok(a.plan.dropped.length > 0 || imports.length === 1, 'either applied or reported as dropped', a.plan);
    ok(a.text.includes('        ArrayList\n') && a.text.includes('// note'), 'word replaced and the user\'s edit is kept', a.text);
    ok(a.text.startsWith('package app;'), 'package line intact');
  });

  await scenario('race D: 20 quick didChange+completion pairs, the last answer matches the last text', async () => {
    const { client } = cur();
    const prefixes = ['S', 'St', 'Str', 'Stri', 'Strin', 'String', 'Strin', 'Stri', 'Str', 'St', 'S', 'Se', 'Set', 'Se', 'S', 'Li', 'Lis', 'List', 'Lis', 'Li'];
    const pending: Promise<any>[] = [];
    for (const p of prefixes) {
      const marked = body(`${p}|`);
      const text = marked.replace(/\|/, '');
      lsp.changeDocument(cur().file, text);
      const doc = Text.of(text.split('\n'));
      const head = marked.indexOf('|');
      pending.push(client.completion(cur().file, { line: doc.lineAt(head).number - 1, character: head - doc.lineAt(head).from }, undefined));
    }
    const all = await Promise.all(pending);
    const last = all[all.length - 1];
    ok(last.items.some((i: any) => nameOf(i) === 'List'), 'last answer (Li) offers List', last.items.slice(0, 5).map((i: any) => i.label));
    ok(!last.items.some((i: any) => nameOf(i) === 'String'), 'last answer is not a stale String answer');
    const settled = await requestAt(body('Str|'));
    ok(settled.list.items.some((i: any) => nameOf(i) === 'String'), 'server still healthy after the burst');
  });
}

/** 16. settings-dependent (last: they change the server config) */
async function scenariosPart16(c: Ctx) {
  const { scenario, ok, eq, skipHere, requestAt, accept, cur, findType, nameOf, summary, importsOf, sleep, h, body } = c;
  const setJava = (patch: (java: Record<string, any>) => void) => {
    const java = JSON.parse(JSON.stringify(JAVA_SETTINGS));
    patch(java);
    cur().client.notify('workspace/didChangeConfiguration', { settings: { java } });
  };

  await scenario('lazyResolveTextEdit=true: list items lack the edit, resolve supplies it, result identical', async () => {
    const eagerReq = await requestAt(body('ArrayLi|'));
    const eagerItem = findType(eagerReq, 'ArrayList', 'java.util');
    if (!eagerItem) {
      return skipHere('ArrayList not offered');
    }
    const eager = await accept(eagerReq, eagerItem);
    setJava((j) => { j.completion.lazyResolveTextEdit = { enabled: true }; });
    try {
      await sleep(1500);
      const req = await requestAt(body('ArrayLi|'));
      const item = findType(req, 'ArrayList', 'java.util') ?? req.list.items.find((i: any) => nameOf(i) === 'ArrayList');
      ok(Boolean(item), 'ArrayList offered in lazy mode', summary(req, 8));
      if (!item) {
        return;
      }
      const lazy = !item.textEdit || item.textEdit.newText === undefined;
      const a = await accept(req, item);
      ok(a.text === eager.text, 'lazy-mode result equals the eager result', { lazy: a.text, eager: eager.text });
      if (lazy) {
        ok(Boolean(a.resolved?.textEdit) || Boolean(a.text.includes('        ArrayList\n')), 'edit obtained through resolve or fallback');
      }
      eq(importsOf(a.text), ['import java.util.ArrayList;'], 'import present in lazy mode');
    } finally {
      setJava(() => {});
      await sleep(1000);
    }
  });

  await scenario('maxResults=10: isIncomplete=true, list not reusable for a longer pattern; unlimited list is complete', async () => {
    const full = await requestAt(body('S|'));
    setJava((j) => { j.completion.maxResults = 10; });
    try {
      await sleep(1500);
      const capped = await requestAt(body('S|'));
      ok(capped.list.items.length < full.list.items.length, `capped list is smaller than the uncapped one (${capped.list.items.length} < ${full.list.items.length})`);
      ok(capped.list.isIncomplete, 'server marks the capped list isIncomplete', { isIncomplete: capped.list.isIncomplete, n: capped.list.items.length });
      eq(h.listReusable({ isIncomplete: capped.list.isIncomplete, pattern: 'S' }, 'Str'), !capped.list.isIncomplete, 'an incomplete list is re-queried for the longer pattern');
      const narrowed = await requestAt(body('Str|'));
      ok(narrowed.list.items.some((i: any) => nameOf(i) === 'String'), 'the re-query finds String although the capped S| list may not hold it');
    } finally {
      setJava(() => {});
      await sleep(1000);
    }
    ok(!full.list.isIncomplete, 'with the real settings (maxResults 0) the list is complete');
  });
}

export async function registerScenarios(h: H) {
  const { scenario, ok, eq, skipHere, requestAt, accept, setText, cur, findType, nameOf, summary, importsOf, countOf, checkImportPlacement, diagnosticsFor, mainText, classText, mainFile, utilFile, helperFile, lsp, sleep } = h;
  const body = (line: string) => mainText(`        ${line}`);

  /** Bare identifier on its own line → apply → the result text. */
  async function typeAt(marked: string, simple: string, pkg: string, opts: any = {}) {
    const req = await requestAt(marked, opts);
    const item = findType(req, simple, pkg);
    ok(Boolean(item), `${simple} (${pkg}) is offered`, summary(req, 15));
    if (!item) {
      return null;
    }
    const applied = await accept(req, item);
    ok(!applied.resolvedCalled || Boolean(applied.resolved), `${simple}: completionItem/resolve answered in time`, applied.resolveNote);
    ok(!applied.resolvedCalled || pkg === 'java.lang' || Boolean(applied.resolved?.additionalTextEdits?.length), `${simple}: resolve delivered the import edit`, { note: applied.resolveNote, resolved: applied.resolved });
    return { req, item, applied };
  }
  /** Evidence for a text assertion: what was applied, and what list and resolve each said the main edit is. */
  const ev = (a: any) => ({ text: a.text, listNewText: a.item.textEdit?.newText, resolvedNewText: a.resolved?.textEdit?.newText });
  const clean = (a: any, label: string) => {
    eq(a.plan.dropped.length, 0, `${label}: nothing dropped`);
    eq(a.plan.warnings, [], `${label}: no warnings`);
  };

  const c: Ctx = { ...h, h, body, typeAt, ev, clean };
  await scenariosPart1(c);
  await scenariosPart2(c);
  await scenariosPart3(c);
  await scenariosPart4(c);
  await scenariosPart5(c);
  await scenariosPart6(c);
  await scenariosPart7(c);
  await scenariosPart8(c);
  await scenariosPart9(c);
  await scenariosPart10(c);
  await scenariosPart11(c);
  await scenariosPart12(c);
  await scenariosPart13(c);
  await scenariosPart14(c);
  await scenariosPart15(c);
  await scenariosPart16(c);
}


/** The reduced set for build-tool projects (Maven / Gradle): imports across packages of the project, JDK imports, members. */
export async function registerBuildScenarios(h: H) {
  const { scenario, ok, eq, requestAt, accept, findType, nameOf, summary, importsOf, checkImportPlacement, mainText, kind } = h;
  const body = (line: string) => mainText(`        ${line}`);
  const at = async (marked: string, simple: string, pkg: string) => {
    const req = await requestAt(marked);
    const item = findType(req, simple, pkg);
    ok(Boolean(item), `${simple} (${pkg}) is offered`, summary(req, 12));
    return item ? { req, item, a: await accept(req, item) } : null;
  };
  await scenario(`${kind}: auto-import JDK type List`, async () => {
    const r = await at(body('Lis|'), 'List', 'java.util');
    if (!r) {
      return;
    }
    eq(importsOf(r.a.text), ['import java.util.List;'], 'one import');
    checkImportPlacement(r.a.text, 'List');
  });
  await scenario(`${kind}: class of another package of the project (other.Helper) gets its import`, async () => {
    const r = await at(body('Help|'), 'Helper', 'other');
    if (r) {
      eq(importsOf(r.a.text), ['import other.Helper;'], 'import other.Helper');
    }
  });
  await scenario(`${kind}: same-package class Util needs no import`, async () => {
    const r = await at(body('Uti|'), 'Util', 'app');
    if (r) {
      eq(importsOf(r.a.text), [], 'no import inside the package');
    }
  });
  await scenario(`${kind}: member of a project class: Helper.help() with the import present`, async () => {
    const req = await requestAt('package app;\n\nimport other.Helper;\n\npublic class Main {\n    public static void main(String[] args) {\n        String s = Helper.he|;\n    }\n}\n');
    const item = req.list.items.find((i: any) => nameOf(i) === 'help');
    ok(Boolean(item), 'help offered', summary(req, 8));
    if (!item) {
      return;
    }
    const a = await accept(req, item);
    ok(a.text.includes('String s = Helper.help();'), 'Helper.help() inserted', { text: a.text, listNewText: item.textEdit?.newText, resolvedNewText: a.resolved?.textEdit?.newText });
  });
}
