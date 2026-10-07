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
 * Tests the user's own add-ons without an interface: the graph interpreter
 * (branching, loops, variables, text nodes, errors, the step limit, cancelling)
 * and `compile`/`validate` on an example add-on with a language and a command.
 */

import { StringStream } from '@codemirror/language';
import { buildStreamParser } from '@/core/editor/tokenizer';
import { runGraph, GraphError, type GraphHost } from '@/core/user-addons/interpreter';
import { NODE_CATALOG, canConnect, nodeDefs } from '@/core/user-addons/catalog';
import { compileAddon, compileProjectKind, compileTemplate, conditionHolds, extractChoices, fillPlaceholders } from '@/core/user-addons/compile';
import { createToolkitStarter } from '@/core/user-addons/starter';
import { blockingIssues, checkRegex, validateAddon } from '@/core/user-addons/validate';
import { createUserAddon, normalizeModel, type Graph, type GraphNode, type UserAddonModel } from '@/core/user-addons/schema';
import { MESSAGES } from '@/i18n/messages';
import { ALL_ADDONS } from '@/addons';
import { extensionAddons } from '../lib/extension-addons';
import { CONTEXT_CASES, splitCursor } from '../lib/context-cases';
import { contextDetectorNames } from '@/core/editor/syntax-context';
import fs from 'node:fs';
import path from 'node:path';
import { classicIconPack, lumenIconPack, monoIconPack } from '@/addons/builtin/icons';
import {
  explainFileIcon, ICON_MAP_KEYS, iconPackProblems, isIconPack, resolveFileIcon, resolveFolderIcon, uniqueIconPackId,
} from '@/core/theme/icon-pack';

let failures = 0;
let passed = 0;

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`✓ ${name}`);
    return;
  }
  failures++;
  console.log(`✗ ${name}`, detail ?? '');
}

/* ------------------------------------------------------------------ *
 * A stand-in host
 * ------------------------------------------------------------------ */

function mockHost() {
  const log: string[] = [];
  const notes: string[] = [];
  let document = 'hallo welt';
  let selection = 'welt';
  const host: GraphHost = {
    selection: () => selection,
    replaceSelection: (text) => {
      document = document.replace(selection, text);
      selection = text;
    },
    insert: (text) => { document += text; },
    documentText: () => document,
    currentLine: () => ({ text: document, number: 1 }),
    filePath: () => '/tmp/a.txt',
    languageId: () => 'plaintext',
    cursor: () => ({ line: 1, column: 1 }),
    gotoLine: () => {},
    notify: (message) => { notes.push(message); },
    prompt: async (_title, _label, initial) => `${initial}!`,
    pick: async (_title, items) => items[1] ?? null,
    output: (text) => { log.push(text); },
    openFile: async () => {},
    readFile: async (path) => `inhalt:${path}`,
    writeFile: async () => {},
    shell: async () => ({ code: 0, stdout: 'ok', stderr: '' }),
    runTask: async () => true,
    runCommand: () => true,
    setTheme: () => {},
    toggleSetting: () => {},
  };
  return { host, log, notes, doc: () => document };
}

/* ------------------------------------------------------------------ *
 * Graph helpers
 * ------------------------------------------------------------------ */

function graph(nodes: [string, string, GraphNode['values']?][], edges: string[]): Graph {
  return {
    nodes: nodes.map(([id, type, values]) => ({ id, type, x: 0, y: 0, values })),
    edges: edges.map((spec, i) => {
      const [from, to] = spec.split('->').map((s) => s.trim());
      const [fromNode, fromPin] = from.split('.');
      const [toNode, toPin] = to.split('.');
      return { id: `e${i}`, from: { node: fromNode, pin: fromPin }, to: { node: toNode, pin: toPin } };
    }),
  };
}

async function run(g: Graph, options: { maxSteps?: number; signal?: AbortSignal; payload?: Record<string, unknown>; } = {}) {
  const mock = mockHost();
  const result = await runGraph(g, { entry: 'start', host: mock.host, addonId: 'user.test', ...options });
  return { ...mock, result };
}

/* ------------------------------------------------------------------ *
 * The catalogue
 * ------------------------------------------------------------------ */

{
  const de = MESSAGES.addonStudio.de as Record<string, Record<string, string>>;
  const missing = nodeDefs().filter((def) => !de.node?.[def.type]).map((def) => def.type);
  check('Catalogue: every node has a German title', missing.length === 0, missing);
  const pins = new Set(nodeDefs().flatMap((def) => [...def.inputs, ...def.outputs]).map((p) => p.label ?? p.id));
  const missingPins = [...pins].filter((p) => !de.pin?.[p]);
  check('Catalogue: every pin has a label', missingPins.length === 0, missingPins);
  check('Catalogue: exec fits exec alone', canConnect('exec', 'exec') && !canConnect('exec', 'string') && !canConnect('string', 'exec'));
  check('Catalogue: number → text allowed, text → number not', canConnect('number', 'string') && !canConnect('string', 'number'));
  check('Catalogue: any fits data', canConnect('list', 'any') && canConnect('any', 'boolean'));
}

/* ------------------------------------------------------------------ *
 * The interpreter
 * ------------------------------------------------------------------ */

/** Branching: 7 > 3 takes the true branch */
async function interpreterBranchingTest() {
  const g = graph([
    ['start', 'event.command'],
    ['cmp', 'logic.compare', { a: 7, b: 3, op: 'gt' }],
    ['if', 'flow.if'],
    ['yes', 'ui.output', { text: 'groß' }],
    ['no', 'ui.output', { text: 'klein' }],
  ], ['start.then -> if.in', 'cmp.result -> if.condition', 'if.true -> yes.in', 'if.false -> no.in']);
  const { log } = await run(g);
  check('Branching follows the true branch', log.join() === 'groß', log);
}

/** A loop with variables: the sum of 0..4 = 10 */
async function interpreterLoopTest() {
  const g = graph([
    ['start', 'event.command'],
    ['init', 'var.set', { name: 'summe', value: 0 }],
    ['loop', 'flow.repeat', { count: 5 }],
    ['get', 'var.get', { name: 'summe' }],
    ['add', 'math.add'],
    ['set', 'var.set', { name: 'summe' }],
    ['final', 'var.get', { name: 'summe' }],
    ['num', 'text.fromNumber'],
    ['out', 'ui.output'],
  ], [
    'start.then -> init.in', 'init.then -> loop.in',
    'loop.body -> set.in', 'get.value -> add.a', 'loop.index -> add.b', 'add.result -> set.value',
    'loop.done -> out.in', 'final.value -> num.number', 'num.text -> out.text',
  ]);
  const { log } = await run(g);
  check('Repeat + variables sum 0..4', log.join() === '10', log);
}

/** For each element, with splitting and joining and upper and lower case */
async function interpreterForEachTest() {
  const g = graph([
    ['start', 'event.command'],
    ['split', 'text.split', { text: 'a,b,c', separator: ',' }],
    ['each', 'flow.forEach'],
    ['upper', 'text.case', { mode: 'upper' }],
    ['out', 'ui.output'],
    ['join', 'text.join', { separator: '-' }],
    ['done', 'ui.output'],
  ], [
    'start.then -> each.in', 'split.list -> each.list',
    'each.body -> out.in', 'each.element -> upper.text', 'upper.result -> out.text',
    'each.done -> done.in', 'split.list -> join.list', 'join.result -> done.text',
  ]);
  const { log } = await run(g);
  check('For each element runs once per element', log.join('|') === 'A|B|C|a-b-c', log);
}

/** Text nodes */
async function interpreterTextNodesTest() {
  const g = graph([
    ['start', 'event.command'],
    ['sel', 'editor.selection'],
    ['tpl', 'text.template', { template: 'Hallo {a}, {b}!' }],
    ['trim', 'text.trim', { text: '  Lumen  ' }],
    ['rep', 'text.replace', { pattern: 'l+', replacement: 'L', flags: 'g' }],
    ['len', 'text.length'],
    ['has', 'text.contains', { search: 'LL' }],
    ['starts', 'text.startsWith', { prefix: 'Ha' }],
    ['concat', 'text.concat', { b: '?' }],
    ['list', 'list.create'],
    ['join', 'text.join', { separator: ';' }],
    ['out', 'ui.output'],
    ['replaceSel', 'editor.replaceSelection', { text: 'Lumen' }],
  ], [
    'start.then -> out.in', 'out.then -> replaceSel.in',
    'sel.text -> tpl.a', 'trim.result -> tpl.b',
    'tpl.result -> rep.text', 'rep.result -> list.a', 'rep.result -> len.text', 'len.length -> list.b',
    'tpl.result -> has.text', 'has.result -> list.c',
    'list.list -> join.list', 'join.result -> concat.a', 'concat.result -> out.text',
  ]);
  const { log, doc } = await run(g);
  check('Template, trim, replace, length, list, join', log.join() === 'HaLo weLt, Lumen!;17;false?', log);
  check('Replacing the selection changes the document', doc() === 'hallo Lumen', doc());
  const starts = await runGraph(graph([['start', 'text.startsWith', { text: 'Hallo', prefix: 'Ha' }]], []), {
    entry: 'start', host: mockHost().host, addonId: 'x',
  }).then(() => 'kein Fehler', (err: Error) => err.message);
  check('A pure node as the entry point is an error', starts !== 'kein Fehler', starts);
}

/** Input, choosing from a list, a sequence, event data */
async function interpreterInputAndEventsTest() {
  const g = graph([
    ['start', 'event.fileSaved'],
    ['seq', 'flow.sequence'],
    ['ask', 'ui.prompt', { initial: 'Hi' }],
    ['o1', 'ui.output'],
    ['pick', 'ui.pick', { items: 'x, y, z' }],
    ['o2', 'ui.output'],
    ['o3', 'ui.output'],
  ], [
    'start.then -> seq.in', 'seq.then1 -> ask.in', 'ask.then -> o1.in', 'ask.value -> o1.text',
    'seq.then2 -> pick.in', 'pick.then -> o2.in', 'pick.value -> o2.text',
    'seq.then3 -> o3.in', 'start.path -> o3.text',
  ]);
  const { log } = await run(g, { payload: { path: '/p/datei.txt' } });
  check('Sequence, input, choice and event data', log.join('|') === 'Hi!|y|/p/datei.txt', log);
}

/** Stop ends without an error */
async function interpreterStopTest() {
  const g = graph([
    ['start', 'event.command'], ['stop', 'flow.stop'], ['out', 'ui.output', { text: 'nie' }],
  ], ['start.then -> stop.in']);
  const { result, log } = await run(g);
  check('Stop ends without an error', result.stopped && log.length === 0, result);
}

/** The error case with a node id */
async function interpreterErrorReportsTest() {
  const g = graph([
    ['start', 'event.command'],
    ['div', 'math.divide', { a: 1, b: 0 }],
    ['num', 'text.fromNumber'],
    ['out', 'ui.output'],
  ], ['start.then -> out.in', 'div.result -> num.number', 'num.text -> out.text']);
  const error = await run(g).then(() => null, (err: unknown) => err);
  check('Division by zero reports the error at the node', error instanceof GraphError && error.nodeId === 'div', error);

  const bad = graph([['start', 'event.command'], ['x', 'gibt.es.nicht']], ['start.then -> x.in']);
  const unknown = await run(bad).then(() => null, (err: unknown) => err);
  check('An unknown node reports the error at the node', unknown instanceof GraphError && unknown.nodeId === 'x', unknown);

  const regex = graph([
    ['start', 'event.command'], ['rep', 'text.replace', { text: 'a', pattern: '(' }], ['out', 'ui.output'],
  ], ['start.then -> out.in', 'rep.result -> out.text']);
  const regexError = await run(regex).then(() => null, (err: unknown) => err);
  check('An invalid regex in the replace node', regexError instanceof GraphError && regexError.nodeId === 'rep', regexError);
}

/** The step limit: an endless loop over a back edge */
async function interpreterStepLimitTest() {
  const g = graph([
    ['start', 'event.command'], ['a', 'ui.output', { text: 'a' }], ['b', 'ui.output', { text: 'b' }],
  ], ['start.then -> a.in', 'a.then -> b.in', 'b.then -> a.in']);
  const error = await run(g, { maxSteps: 50 }).then(() => null, (err: unknown) => err);
  check('The step limit breaks off an endless loop', error instanceof GraphError && /50/.test(error.message), error);
}

/** Cancelling during “Wait” */
async function interpreterCancelTest() {
  const g = graph([
    ['start', 'event.command'], ['wait', 'flow.wait', { ms: 5000 }], ['out', 'ui.output', { text: 'zu spät' }],
  ], ['start.then -> wait.in', 'wait.then -> out.in']);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 20);
  const started = Date.now();
  const error = await run(g, { signal: controller.signal }).then(() => null, (err: unknown) => err);
  check('Cancelling ends the wait at once', error instanceof GraphError && Date.now() - started < 1000, error);
}

/** Maths */
async function interpreterMathsTest() {
  const g = graph([
    ['start', 'event.command'],
    ['mod', 'math.modulo', { a: 17, b: 5 }],
    ['round', 'math.round', { value: 2.6, mode: 'floor' }],
    ['max', 'math.max'],
    ['rnd', 'math.random', { min: 3, max: 3 }],
    ['tpl', 'text.template', { template: '{a}/{b}/{c}' }],
    ['out', 'ui.output'],
  ], ['start.then -> out.in', 'mod.result -> max.a', 'round.result -> max.b', 'max.result -> tpl.a', 'round.result -> tpl.b', 'rnd.result -> tpl.c', 'tpl.result -> out.text']);
  const { log } = await run(g);
  check('Modulo, rounding, max, random', log.join() === '2/2/3', log);
}

async function interpreterTests() {
  await interpreterBranchingTest();
  await interpreterLoopTest();
  await interpreterForEachTest();
  await interpreterTextNodesTest();
  await interpreterInputAndEventsTest();
  await interpreterStopTest();
  await interpreterErrorReportsTest();
  await interpreterStepLimitTest();
  await interpreterCancelTest();
  await interpreterMathsTest();
}

/* ------------------------------------------------------------------ *
 * compile & validate
 * ------------------------------------------------------------------ */

function sampleAddon(): UserAddonModel {
  const model = createUserAddon('Beispiel Sprache');
  model.languages = [{
    id: 'beispiel',
    name: 'Beispiel',
    extensions: ['.bsp'],
    comments: { line: '#' },
    keywords: ['let', 'fn'],
    controls: ['if', 'else'],
    constants: ['wahr', 'falsch'],
    numbers: String.raw`\d+`,
    meta: String.raw`@\w+`,
    indentOpen: String.raw`:\s*$`,
    snippets: [{ label: 'fn', body: 'fn $0()' }],
    run: [{ label: 'Beispiel', command: 'bsp', args: ['${file}'] }],
  }];
  model.commands = [{
    id: 'hallo',
    title: 'Hallo sagen',
    keybinding: 'Ctrl+Alt+H',
    graph: graph([['start', 'event.command'], ['note', 'ui.notify', { message: 'Hallo' }]], ['start.then -> note.in']),
  }];
  model.templates = [{
    id: 'projekt',
    name: 'Beispielprojekt',
    fields: [{ id: 'autor', label: 'Autor', default: 'Ich' }],
    files: [{ path: '{{slug}}/main.bsp', content: '# {{name}} von {{autor}}' }],
    open: '{{slug}}/main.bsp',
  }];
  return model;
}

async function compileTests() {
  const model = sampleAddon();
  const issues = validateAddon(model);
  check('The example add-on is valid', blockingIssues(issues).length === 0, issues);

  const ran: string[] = [];
  const addon = compileAddon(model, { runCommand: (_m, command) => { ran.push(command.id); } });
  check('compile: id, name, version, the user marker', addon.id === 'user.beispiel-sprache' && addon.name === 'Beispiel Sprache' && addon.version === '1.0.0' && addon.user === true, addon);
  const lang = addon.languages?.[0];
  check('compile: a language with regexes', Boolean(lang && lang.numbers instanceof RegExp && lang.numbers.source === String.raw`^(?:\d+)` && lang.indentOpen instanceof RegExp), lang);
  const edited = compileAddon({
    ...model,
    languages: [{
      ...model.languages[0],
      wordPattern: '[@$]?[A-Za-z_][\\w-]*',
      autoClose: [{ open: '<?nv', before: ' ', after: ' ?>' }],
      closeBrackets: ['(', '"'],
      snippets: [{ label: 'only', body: 'x', files: ['project.nv'] }],
    }],
  }, {}).languages?.[0];
  check('compile: wordPattern, autoClose, closeBrackets and scoped snippets', edited?.wordPattern instanceof RegExp && edited.wordPattern.test('@a-b') && edited.autoClose?.[0].after === ' ?>' && edited.closeBrackets?.length === 2 && edited.snippets?.[0].files?.[0] === 'project.nv', edited);
  const command = addon.commands?.[0];
  check('compile: a command with an id and a shortcut', command?.id === 'user.beispiel-sprache.hallo' && command.keybinding === 'Ctrl+Alt+H', command);
  await command?.run();
  check('compile: the command calls the graph', ran.join() === 'hallo', ran);

  const template = addon.projectTemplates?.[0];
  const files = template?.files({ name: 'Mein Test', slug: 'mein-test', dir: '/x', values: { autor: 'Ada' } });
  check('compile: the template replaces the placeholders', files?.['mein-test/main.bsp'] === '# Mein Test von Ada', files);
  check('fillPlaceholders leaves the unknown standing', fillPlaceholders('{{unbekannt}}', { name: '', slug: '', dir: '', values: {} }) === '{{unbekannt}}');

  // The tokenizer with the compiled language
  if (lang) {
    const parser = buildStreamParser(lang);
    const state = parser.startState!(2);
    const stream = new StringStream('let x = 42 # c', 2, 2);
    const kinds: string[] = [];
    while (!stream.eol()) {
      stream.start = stream.pos;
      const kind = parser.token(stream, state);
      if (kind) {
        kinds.push(`${kind}:${stream.current()}`);
      }
    }
    check('The tokenizer colours the compiled language', kinds.includes('lm_keyword:let') && kinds.includes('lm_number:42') && kinds.includes('lm_comment:# c'), kinds);
  }

  // Validation
  check('checkRegex spots an invalid regex', checkRegex('(') !== null && checkRegex(String.raw`\d+`) === null);
  const broken = sampleAddon();
  broken.id = 'lang.falsch';
  broken.version = 'eins';
  broken.languages[0].numbers = '[a-';
  broken.languages[0].extensions = ['bsp'];
  broken.commands[0].graph.nodes = broken.commands[0].graph.nodes.filter((n) => n.type !== 'event.command');
  broken.templates[0].files = [{ path: '../raus.txt', content: '' }];
  const found = blockingIssues(validateAddon(broken));
  const sections = new Set(found.map((i) => `${i.section}:${i.field ?? ''}`));
  check('Validation: an id without a prefix', sections.has('general:id'), found);
  check('Validation: the version', sections.has('general:version'), found);
  check('Validation: an invalid regex', found.some((i) => i.section === 'languages' && i.field === 'numbers'), found);
  check('Validation: an extension without a dot', found.some((i) => i.field === 'extensions'), found);
  check('Validation: a command without an entry point', found.some((i) => i.section === 'commands'), found);
  check('Validation: a template path outside', found.some((i) => i.section === 'templates' && i.field === 'files'), found);
  check('Validation: an invalid regex falls away on compiling', compileAddon(broken).languages?.[0]?.numbers === undefined);

  // Serialisation
  const roundtrip = normalizeModel(JSON.parse(JSON.stringify(model)));
  check('A round trip through JSON stays valid', blockingIssues(validateAddon(roundtrip)).length === 0 && roundtrip.commands[0].graph.nodes.length === 2);
  check('normalizeModel fills in the missing lists', normalizeModel({ id: 'user.x', name: 'X' }).events.length === 0);
  check('Every kind of node in the catalogue is unique', NODE_CATALOG.size === nodeDefs().length);
}

function iconPackTests() {
  console.log('\n— Icon packs —');
  const packs = ALL_ADDONS.flatMap((addon) => addon.iconPacks ?? []);
  check('The bundled icon packs are present', packs.length >= 3);
  for (const pack of packs) {
    const problems = iconPackProblems(pack);
    check(`Icon pack "${pack.name}" valid`, problems.length === 0, problems.slice(0, 5));
  }
  // The pack carries icons for languages that arrive as an extension too, so
  // the comparison has to know about those — otherwise every one of them would
  // read as an entry pointing nowhere.
  const languages = [...ALL_ADDONS, ...extensionAddons()].flatMap((addon) => addon.languages ?? []);
  const ids = new Set(languages.map((language) => language.id));
  const unknown = Object.keys(lumenIconPack.languages ?? {}).filter((id) => !ids.has(id));
  check('The language ids in the Lumen pack exist', unknown.length === 0, unknown);
  const missing = languages.filter((language) => !lumenIconPack.languages?.[language.id] && !language.icon).map((language) => language.id);
  check('Every language has an icon (from the pack or an add-on)', missing.length === 0, missing);

  const rule = (name: string) => explainFileIcon(lumenIconPack, name, languages).rule;
  check('A file name before an extension: package.json', rule('package.json') === 'fileNames');
  check('A file name regardless of case: CMakeLists.txt', rule('CMakeLists.txt') === 'fileNames');
  check('A compound extension before a simple one: app.d.ts', explainFileIcon(lumenIconPack, 'app.d.ts', languages).key === 'd.ts');
  check('A test extension: util.test.ts', explainFileIcon(lumenIconPack, 'util.test.ts', languages).key === 'test.ts');
  check('The language as a fallback: Main.java', rule('Main.java') === 'languages');
  check('A dotfile is not an extension: .env', rule('.env') === 'fileNames');
  check('An unknown file uses the default', resolveFileIcon(lumenIconPack, 'daten.xyz', languages).shape === 'file');
  check('Build tools: pom.xml, build.gradle.kts, Cargo.toml, go.mod', ['pom.xml', 'build.gradle.kts', 'Cargo.toml', 'go.mod'].every((name) => rule(name) === 'fileNames'));
  check('Classic: a language with the abbreviation of the add-on', resolveFileIcon(classicIconPack, 'Main.java', languages).glyph === 'J');
  check('Classic: a folder with no shape, colour alone', !resolveFolderIcon(classicIconPack, 'src').shape && resolveFolderIcon(classicIconPack, 'src').color === '#7c8cff');
  check('Without a pack: the abbreviation of the extension', resolveFileIcon(null, 'notiz.abc', languages).glyph === 'AB');

  check('An invalid shape is spotted', !isIconPack({ id: 'x', name: 'X', extensions: { ts: { shape: 'gibtsnicht' } } }));
  check('An invalid colour is spotted', !isIconPack({ id: 'x', name: 'X', extensions: { ts: { color: 'red; background:url(x)' } } }));
  check('An SVG path with markup is refused', !isIconPack({ id: 'x', name: 'X', file: { path: 'M0 0"/><script>' } }));
  check('An extension with a dot is spotted', !isIconPack({ id: 'x', name: 'X', extensions: { '.ts': { glyph: 'TS' } } }));
  check('A key in capitals is spotted', !isIconPack({ id: 'x', name: 'X', fileNames: { 'Makefile': { glyph: 'M' } } }));
  check('A unique id for copies', uniqueIconPackId('lumen-icons', ['lumen-icons', 'lumen-icons-kopie']) === 'lumen-icons-kopie-2');
  check('A round trip through JSON stays valid', isIconPack(JSON.parse(JSON.stringify(lumenIconPack))));
  const monoColors = new Set([monoIconPack.file, monoIconPack.folder, ...ICON_MAP_KEYS.flatMap((key) => Object.values(monoIconPack[key] ?? {}))]
    .map((def) => def?.color));
  check('Monochrome: only the neutral theme tones', [...monoColors].every((color) => color === 'var(--c-text-muted)' || color === 'var(--c-text-subtle)'), [...monoColors]);
  check('Monochrome: the same entries as Lumen', ICON_MAP_KEYS.every((key) => Object.keys(monoIconPack[key] ?? {}).length === Object.keys(lumenIconPack[key] ?? {}).length));
  check('Monochrome: a folder keeps its role shape', resolveFolderIcon(monoIconPack, 'tests').shape === 'folder-test');
}

function mockFs(files: Record<string, string>, platform = 'linux') {
  return {
    root: '/p', platform,
    readFile: async (path: string) => files[path] ?? null,
    exists: async (path: string) => path in files,
    list: async () => Object.keys(files).filter((path) => !path.includes('/')).map((name) => ({ name, isDirectory: false })),
  };
}

/** Placeholder filters, blocks and choices from JSON. */
async function placeholderTests() {
  const ctx = { name: 'Mein Plugin', slug: 'mein-plugin', dir: '/tmp/mein-plugin', values: { group: 'de.example.tools', commands: 'true', lang: 'kotlin', empty: '' } };
  check('Filter path', fillPlaceholders('src/{{group|path}}/A.java', ctx) === 'src/de/example/tools/A.java');
  check('Filter pascal/camel/snake/kebab', fillPlaceholders('{{name|pascal}} {{name|camel}} {{name|snake}} {{slug|kebab}}', ctx) === 'MeinPlugin meinPlugin mein_plugin mein-plugin');
  check('An unknown filter stays standing', fillPlaceholders('{{name|gibtsnicht}}', ctx) === '{{name|gibtsnicht}}');
  check('#if with a toggle', fillPlaceholders('a{{#if commands}}B{{/if}}c', ctx) === 'aBc');
  check('#if with a comparison', fillPlaceholders('{{#if lang=java}}J{{/if}}{{#if lang=kotlin}}K{{/if}}', ctx) === 'K');
  check('#if with an inequality', fillPlaceholders('{{#if lang!=java}}nicht java{{/if}}', ctx) === 'nicht java');
  check('#unless and empty values', fillPlaceholders('{{#unless empty}}leer{{/unless}}{{#if empty}}x{{/if}}', ctx) === 'leer');
  check('Nested blocks', fillPlaceholders('{{#if commands}}A{{#if lang=kotlin}}K{{/if}}{{#if lang=java}}J{{/if}}Z{{/if}}', ctx) === 'AKZ');
  check('Placeholders in blocks', fillPlaceholders('{{#if commands}}{{name|pascal}}{{/if}}', ctx) === 'MeinPlugin');
  check('A condition without a comparison: false counts as not set', !conditionHolds({ field: 'x' }, { x: 'false' }) && conditionHolds({ field: 'x' }, { x: 'ja' }));

  const versions = { versions: ['1.20.4', '1.21.1', '1.21.4'] };
  check('A choice from JSON: the path, reversed, limited', JSON.stringify(extractChoices(versions, { id: 'v', label: 'V', choicesPath: 'versions', choicesReverse: true, choicesLimit: 2 }).map((c) => c.value)) === '["1.21.4","1.21.1"]');
  check('A choice from objects with a value and a label', extractChoices({ data: { items: [{ id: 'a', name: 'Alpha' }, { id: 'b' }] } }, { id: 'x', label: 'X', choicesPath: 'data.items', choicesValue: 'id', choicesLabel: 'name' })
    .map((c) => `${c.value}=${c.label}`).join() === 'a=Alpha,b=b');
  const fill = { versions: [{ version: { id: '26.3' } }, { version: { id: '26.3-rc-3' } }, { version: { id: '1.21.11' } }] };
  check('A choice: a nested value and a regex filter', extractChoices(fill, { id: 'v', label: 'V', choicesPath: 'versions', choicesValue: 'version.id', choicesMatch: '^[0-9.]+$' }).map((c) => c.value).join() === '26.3,1.21.11');
  check('A choice: no array gives an empty list', extractChoices({ versions: 'x' }, { id: 'v', label: 'V', choicesPath: 'versions' }).length === 0);
}

/** The toolkit starter's template, its loaded choices and snippets. */
async function starterTemplateTests(starter: ReturnType<typeof createToolkitStarter>) {
  const issues = validateAddon(starter);
  check('The tool example is valid', blockingIssues(issues).length === 0, issues.map((i) => i.message));
  const remote = [{ value: '1.21.8', label: '1.21.8' }];
  const addon = compileAddon(starter, { remoteChoices: (field) => (field.choicesUrl ? remote : undefined) });
  const template = addon.projectTemplates![0];
  check('The template points at its own project kind', template.kindId === `${starter.id}.paper-plugin`);
  const mc = template.fields!.find((f) => f.id === 'mcVersion')!;
  check('A loaded choice replaces the fixed values and sets the preselection', mc.choices?.[0]?.value === '1.21.8' && mc.default === '1.21.8');
  const values = (commands: string) => ({ group: 'de.demo', mcVersion: '1.21.8', java: '21', commands });
  const files = template.files({ name: 'Hallo Welt', slug: 'hallo-welt', dir: '/x', values: values('false') });
  check('A conditional file falls away', !Object.keys(files).some((path) => path.endsWith('HelloCommand.java')));
  check('A path with the package and the class name', Boolean(files['src/main/java/de/demo/HalloWelt.java']));
  check('A block in the content falls away', !files['src/main/resources/plugin.yml'].includes('commands:'));
  const withCommands = template.files({ name: 'Hallo Welt', slug: 'hallo-welt', dir: '/x', values: values('true') });
  check('A conditional file and block with the toggle set', Boolean(withCommands['src/main/java/de/demo/HelloCommand.java']) && withCommands['src/main/resources/plugin.yml'].includes('commands:'));
  check('A template with an existing project kind stays unchanged', compileTemplate({ ...starter.templates[0], kindId: 'gradle' }, starter.id).kindId === 'gradle');
  check('Snippets for another language', addon.snippets?.length === 2 && addon.snippets.every((snippet) => snippet.languageId === 'java'));
}

/** The starter's project kind against a mocked project folder. */
async function starterKindTests(starter: ReturnType<typeof createToolkitStarter>) {
  const fsFiles: Record<string, string> = {
    'build.gradle.kts': 'plugins { java }',
    gradlew: '#!/bin/sh',
    'src/main/resources/plugin.yml': "name: Demo\nversion: '2.1.0'\nmain: de.demo.Demo\napi-version: '1.21'\n",
  };
  const withoutWrapper = Object.fromEntries(Object.entries(fsFiles).filter(([name]) => name !== 'gradlew'));
  const kind = compileProjectKind(starter.projectKinds[0], starter.id);
  check('Project kind: the rule holds', await kind.detect!(mockFs(fsFiles)));
  check('Project kind: the rule misses without a plugin.yml', !(await kind.detect!(mockFs({ 'build.gradle.kts': '' }))));
  const tasks = await kind.tasks(mockFs(fsFiles));
  check('The tasks use the wrapper where there is one', tasks[0].command === './gradlew' && tasks.map((task) => task.group).join() === 'build,run,clean');
  check('Without a wrapper, the command itself', (await kind.tasks(mockFs(withoutWrapper)))[0].command === 'gradle');
  check('The Windows wrapper', (await kind.tasks(mockFs({ ...withoutWrapper, 'gradlew.bat': '' }, 'win32')))[0].command === 'gradlew.bat');
  const meta = await kind.inspect!(mockFs(fsFiles));
  check('Facts: name, version, a fact', meta.name === 'Demo' && meta.version === '2.1.0' && meta.facts?.API === '1.21', meta);
}

/** Tasks that follow from the project: per match, with stand-ins, a second stage and file-dependent arguments. */
async function dynamicTaskTests() {
  const presets = JSON.stringify({
    configurePresets: [
      { name: 'debug', displayName: 'Debug-Build' },
      { name: 'intern', hidden: true },
    ],
  });
  const dynamic = compileProjectKind({
    id: 'dyn',
    name: 'Dynamisch',
    markers: ['CMakeLists.txt'],
    tasks: [
      {
        id: 'configure', label: 'configure', command: 'cmake', args: ['-S', '.', '{extraArgs}'], group: 'build',
        argsWhenFile: [{ file: 'vcpkg.json', args: ['-DTOOLCHAIN=vcpkg'] }, { file: ['conanfile.txt'], args: ['-DTOOLCHAIN=conan'] }],
        forEachMatch: {
          file: 'CMakePresets.json', json: 'configurePresets',
          jsonName: 'name', jsonLabel: 'displayName', jsonSkipWhen: 'hidden',
          label: 'Konfigurieren: {match}', args: ['--preset', '{match}'],
        },
        alsoWhenEmpty: [{ id: 'ninja', label: 'Ninja', command: 'cmake', args: ['-G', 'Ninja'], group: 'build' }],
      },
      {
        id: 'run', label: 'run', command: 'cmake', args: ['--build', 'build'], group: 'run',
        then: { command: './build/app', args: [] },
      },
    ],
  }, 'user.test');

  const withPresets = await dynamic.tasks(mockFs({ 'CMakePresets.json': presets, 'conanfile.txt': '' }));
  check('Presets: hidden ones fall away, the display name wins',
    withPresets.map((task) => task.label).join('|') === 'Konfigurieren: Debug-Build|run', withPresets.map((t) => t.label));
  check('Arguments that depend on a file take effect',
    withPresets[0].args.join(' ') === '--preset debug', withPresets[0].args);

  const withoutPresets = await dynamic.tasks(mockFs({ 'vcpkg.json': '{}' }));
  check('Without presets: the task itself plus a stand-in',
    withoutPresets.map((task) => task.id.split(':').pop()).join('|') === 'configure|ninja|run',
    withoutPresets.map((t) => t.id));
  check('Without presets: the toolchain from vcpkg',
    withoutPresets[0].args.join(' ') === '-S . -DTOOLCHAIN=vcpkg', withoutPresets[0].args);
  check('The second stage is kept', withoutPresets[2].then?.command === './build/app');
}

/** Entering a dependency into a build file. */
async function dependencyEditTests() {
  const shards = compileProjectKind({
    id: 'shards', name: 'Shards', markers: ['shard.yml'], tasks: [],
    dependencies: {
      manager: 'Shards', placeholder: 'x',
      edit: {
        file: 'shard.yml',
        sectionPattern: '^{scope}:\\s*$',
        sectionHeader: '{scope}:',
        lines: ['{short}:', '  github: {name}', '  version: {version}'],
        then: { label: 'shards install', command: 'shards', args: ['install'] },
      },
    },
  }, 'user.test');

  const existing = await shards.dependencies!.add(
    mockFs({ 'shard.yml': 'name: demo\n\ndependencies:\n  alt:\n    github: a/alt\n' }),
    { name: 'kemalcr/kemal', version: '1.5.0', scope: 'dependencies' },
  );
  check('The entry lands under the heading already there',
    existing.type === 'edit' && existing.content.includes('dependencies:\n  kemal:\n    github: kemalcr/kemal\n    version: 1.5.0\n  alt:'),
    existing.type === 'edit' ? existing.content : existing);
  check('The follow-up command is passed along',
    existing.type === 'edit' && existing.then?.command === 'shards');

  const created = await shards.dependencies!.add(
    mockFs({ 'shard.yml': 'name: demo\n' }),
    { name: 'kemalcr/kemal', scope: 'development_dependencies' },
  );
  check('A missing heading is created, a line without a value falls away',
    created.type === 'edit'
      && created.content.endsWith('development_dependencies:\n  kemal:\n    github: kemalcr/kemal\n')
      && !created.content.includes('version:'),
    created.type === 'edit' ? created.content : created);
}

/** Validation of a deliberately broken tool add-on. */
async function brokenAddonTests() {
  const broken = createToolkitStarter([]);
  broken.projectKinds[0].markers = [];
  broken.projectKinds[0].facts = [{ label: 'X', file: 'a', pattern: 'ohne gruppe' }];
  broken.templates[0].fields[0].when = { field: 'gibtsnicht' };
  broken.templates[0].fields[1].choicesUrl = 'http://unsicher';
  broken.snippets[0].languageId = '';
  const sections = blockingIssues(validateAddon(broken)).map((issue) => issue.section);
  check('Validation reports the marker, the pattern, the condition, the URL and the snippet language',
    sections.filter((s) => s === 'kinds').length >= 2 && sections.filter((s) => s === 'templates').length >= 2 && sections.includes('snippets'), sections);
}

async function projectAddonTests() {
  console.log('\n— Tool add-ons (project kinds, templates, snippets) —');
  await placeholderTests();
  const starter = createToolkitStarter([]);
  await starterTemplateTests(starter);
  await starterKindTests(starter);
  await dynamicTaskTests();
  await dependencyEditTests();
  await brokenAddonTests();
}

/* ------------------------------------------------------------------ *
 * Syntax contexts, scoped snippets and the typing fields in the add-on pipeline
 * ------------------------------------------------------------------ */

function languageModel(extra: Record<string, unknown>): UserAddonModel {
  const model = sampleAddon();
  model.languages = [{ ...model.languages[0], ...extra } as UserAddonModel['languages'][number]];
  return model;
}

function contextPipelineTests() {
  console.log('\n— Syntax contexts in the add-on pipeline —');
  const compiled = compileAddon(languageModel({
    wordPattern: '[@$]?[A-Za-z_][\\w-]*',
    codeWordPattern: '[$@]?[A-Za-z_]\\w*',
    syntaxContext: 'nvh',
    snippets: [{ label: 'tag', body: 'x', files: ['*.nvh'], scope: ['nvh_tag'] }, { label: 'free', body: 'y' }],
  }), {}).languages?.[0];
  const { before } = splitCursor('<?nv\nx§');
  check('compile: codeWordPattern and the named syntaxContext', compiled?.codeWordPattern instanceof RegExp && new RegExp(`^(?:${compiled.codeWordPattern.source})$`).test('$a') && !new RegExp(`^(?:${compiled.codeWordPattern.source})$`).test('a-b') && compiled.syntaxContext?.(before).scope === 'nvh_block', compiled);
  check('compile: snippet scope survives, unscoped ones stay unscoped', compiled?.snippets?.[0].scope?.[0] === 'nvh_tag' && compiled.snippets[1].scope === undefined, compiled?.snippets);
  const unknown = compileAddon(languageModel({ syntaxContext: 'gibtsnicht' }), {}).languages?.[0];
  check('compile: an unknown syntaxContext name falls away', unknown !== undefined && !('syntaxContext' in unknown), unknown);
  const contributed = compileAddon({ ...sampleAddon(), snippets: [{ languageId: 'nvh', label: 'k', body: 'k', files: ['*.nvh'], scope: ['nvh_template'] }] }, {});
  check('compile: a snippet for another language keeps files and scope', contributed.snippets?.[0].scope?.[0] === 'nvh_template' && contributed.snippets[0].files?.[0] === '*.nvh', contributed.snippets);

  const clean = validateAddon(languageModel({ syntaxContext: 'nvmd', codeWordPattern: '[a-z]+', snippets: [{ label: 'a', body: 'b', scope: ['nvmd_text'] }] }));
  check('validate: a known syntaxContext with scoped snippets is fine', blockingIssues(clean).length === 0 && !clean.some((issue) => issue.field === 'syntaxContext'), clean);
  const unknownName = validateAddon(languageModel({ syntaxContext: 'gibtsnicht' }));
  check('validate: an unknown syntaxContext name is an error that names the known ones', blockingIssues(unknownName).some((issue) => issue.field === 'syntaxContext' && issue.message.includes('nvmd')), unknownName);
  const badPattern = validateAddon(languageModel({ codeWordPattern: '[a-' }));
  check('validate: an invalid codeWordPattern is an error', blockingIssues(badPattern).some((issue) => issue.field === 'codeWordPattern'), badPattern);
  const noDetector = validateAddon(languageModel({ snippets: [{ label: 'a', body: 'b', scope: ['class'] }] }));
  check('validate: scope without a syntaxContext is only a warning', noDetector.some((issue) => issue.field === 'syntaxContext' && issue.warning === true) && blockingIssues(noDetector).length === 0, noDetector);
  const emptyScope = validateAddon(languageModel({ syntaxContext: 'novus', snippets: [{ label: 'a', body: 'b', scope: [' '] }] }));
  check('validate: an empty scope entry is an error', blockingIssues(emptyScope).some((issue) => issue.section === 'languages'), emptyScope);
  const contributedEmpty = validateAddon({ ...sampleAddon(), snippets: [{ languageId: 'nvh', label: 'a', body: 'b', scope: [''] }] });
  check('validate: an empty scope entry of a contributed snippet is an error', blockingIssues(contributedEmpty).some((issue) => issue.section === 'snippets'), contributedEmpty);
  check('the named detectors are novus, nvh and nvmd, and each has samples', contextDetectorNames().join() === 'novus,nvh,nvmd' && contextDetectorNames().every((name) => CONTEXT_CASES.some((sample) => sample.language === name)), contextDetectorNames());
}

function nvhMarkdownTests() {
  console.log('\n— nvh-markdown: the .nvmd language with the new fields —');
  const dist = path.join(process.cwd(), 'addons', 'dist');
  const file = fs.existsSync(dist) ? fs.readdirSync(dist).filter((name) => name.startsWith('addon.nvh-markdown-')).sort().pop() : undefined;
  if (!file) {
    check('addon.nvh-markdown is built (npm run build:ext)', false);
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, file), 'utf8'));
  const model = normalizeModel(manifest.addon);
  const problems = validateAddon(model);
  check('nvh-markdown 1.1.0: valid, no blocking issue, minAppVersion stays 0.7.0', manifest.version === '1.1.0' && manifest.addon.version === '1.1.0' && manifest.minAppVersion === '0.7.0' && blockingIssues(problems).length === 0, problems);
  const addon = compileAddon(model, {});
  const nvmd = addon.languages?.find((language) => language.id === 'nvmd');
  check('nvmd: autoClose for <?nv and <?=, no rule for :::', nvmd?.autoClose?.length === 2 && nvmd.autoClose[0].open === '<?nv' && nvmd.autoClose[0].after === ' ?>' && nvmd.autoClose[1].open === '<?=' && !nvmd.autoClose.some((rule) => rule.open.includes(':')), nvmd?.autoClose);
  check('nvmd: closeBrackets pair ( [ { " and the backtick, not the apostrophe', JSON.stringify(nvmd?.closeBrackets) === JSON.stringify(['(', '[', '{', '"', '`']), nvmd?.closeBrackets);
  const wide = nvmd?.wordPattern;
  const code = nvmd?.codeWordPattern;
  check('nvmd: wide wordPattern keeps - : @ $ and umlauts, codeWordPattern is Novus', Boolean(wide && code) && ['aria-label', 'class:on', '@click', '$value', 'Größe'].every((word) => new RegExp(`^(?:${wide!.source})$`).test(word)) && !new RegExp(`^(?:${code!.source})$`).test('a-b') && new RegExp(`^(?:${code!.source})$`).test('$total'), { wide, code });
  check('nvmd: syntaxContext resolves to the nvmd detector', nvmd?.syntaxContext?.('<?nv\nx').scope === 'nvh_block' && nvmd.syntaxContext('# {x').scope === 'nvh_expr' && nvmd.syntaxContext('```\n{').scope === 'nvmd_fence');
  const scoped = nvmd?.snippets ?? [];
  const scopeOf = (label: string) => scoped.find((snippet) => snippet.label === label)?.scope?.join();
  check('nvmd snippets: prop, ref, import only in the header; containers, fences, template blocks in the text', scopeOf('prop') === 'nvh_block' && scopeOf('ref') === 'nvh_block' && scopeOf('import') === 'nvh_block' && ['note', 'callout', 'table', 'code-nv', 'if', 'for', 'expr', 'header'].every((label) => scopeOf(label) === 'nvmd_text') && scoped.every((snippet) => snippet.scope?.length), scoped.filter((snippet) => !snippet.scope).map((snippet) => snippet.label));
  const forNvh = addon.snippets ?? [];
  check('nvh-markdown contributes its components to *.nvh template text', forNvh.length === 4 && forNvh.every((snippet) => snippet.languageId === 'nvh' && snippet.files?.[0] === '*.nvh' && snippet.scope?.[0] === 'nvh_template'), forNvh);
}

async function manifestTests() {
  console.log('\n— Manifest: the server-side check accepts the new fields —');
  const { checkManifest, ManifestError } = await import('../../extension-server/src/manifest.js');
  const dist = path.join(process.cwd(), 'addons', 'dist');
  const file = fs.existsSync(dist) ? fs.readdirSync(dist).filter((name) => name.startsWith('addon.nvh-markdown-')).sort().pop() : undefined;
  if (!file) {
    check('addon.nvh-markdown is built (npm run build:ext)', false);
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, file), 'utf8'));
  const checked = checkManifest(manifest);
  const language = checked.addon.languages[0];
  check('checkManifest passes the built nvh-markdown and keeps the language fields', checked.version === '1.1.0' && language.syntaxContext === 'nvmd' && typeof language.codeWordPattern === 'string' && language.autoClose.length === 2 && language.snippets[0].scope.length > 0 && checked.addon.snippets[0].files[0] === '*.nvh', language);
  let rejected = false;
  try {
    checkManifest({ ...manifest, addon: { ...manifest.addon, version: '1.0.0' } });
  } catch (err) {
    rejected = err instanceof ManifestError && err.field === 'addon.version';
  }
  check('checkManifest still rejects an add-on whose version differs from the manifest', rejected);
}

iconPackTests();
await projectAddonTests();
await interpreterTests();
await compileTests();
contextPipelineTests();
nvhMarkdownTests();
await manifestTests();

console.log(`\n${passed} passed, ${failures} failed`);
if (failures) {
  process.exit(1);
}
console.log('✓ Add-on studio: the interpreter and compile are in order');
