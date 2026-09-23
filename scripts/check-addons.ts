/**
 * Tests the user's own add-ons without an interface: the graph interpreter
 * (branching, loops, variables, text nodes, errors, the step limit, cancelling)
 * and `compile`/`validate` on an example add-on with a language and a command.
 */

import { StringStream } from '@codemirror/language'
import { buildStreamParser } from '@/core/tokenizer'
import { runGraph, GraphError, type GraphHost } from '@/core/user-addons/interpreter'
import { NODE_CATALOG, canConnect, nodeDefs } from '@/core/user-addons/catalog'
import { compileAddon, compileProjectKind, compileTemplate, conditionHolds, extractChoices, fillPlaceholders } from '@/core/user-addons/compile'
import { createToolkitStarter } from '@/core/user-addons/starter'
import { blockingIssues, checkRegex, validateAddon } from '@/core/user-addons/validate'
import { createUserAddon, normalizeModel, type Graph, type GraphNode, type UserAddonModel } from '@/core/user-addons/schema'
import { MESSAGES } from '@/i18n/messages'
import { ALL_ADDONS } from '@/addons'
import { extensionAddons } from './lib/extension-addons'
import { classicIconPack, lumenIconPack, monoIconPack } from '@/addons/builtin/icons'
import {
  explainFileIcon, ICON_MAP_KEYS, iconPackProblems, isIconPack, resolveFileIcon, resolveFolderIcon, uniqueIconPackId,
} from '@/core/icon-pack'

let failures = 0
let passed = 0

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++
    console.log(`✓ ${name}`)
    return
  }
  failures++
  console.log(`✗ ${name}`, detail ?? '')
}

/* ------------------------------------------------------------------ *
 * A stand-in host
 * ------------------------------------------------------------------ */

function mockHost() {
  const log: string[] = []
  const notes: string[] = []
  let document = 'hallo welt'
  let selection = 'welt'
  const host: GraphHost = {
    selection: () => selection,
    replaceSelection: (text) => {
      document = document.replace(selection, text)
      selection = text
    },
    insert: (text) => { document += text },
    documentText: () => document,
    currentLine: () => ({ text: document, number: 1 }),
    filePath: () => '/tmp/a.txt',
    languageId: () => 'plaintext',
    cursor: () => ({ line: 1, column: 1 }),
    gotoLine: () => {},
    notify: (message) => { notes.push(message) },
    prompt: async (_title, _label, initial) => `${initial}!`,
    pick: async (_title, items) => items[1] ?? null,
    output: (text) => { log.push(text) },
    openFile: async () => {},
    readFile: async (path) => `inhalt:${path}`,
    writeFile: async () => {},
    shell: async () => ({ code: 0, stdout: 'ok', stderr: '' }),
    runTask: async () => true,
    runCommand: () => true,
    setTheme: () => {},
    toggleSetting: () => {},
  }
  return { host, log, notes, doc: () => document }
}

/* ------------------------------------------------------------------ *
 * Graph helpers
 * ------------------------------------------------------------------ */

function graph(nodes: [string, string, GraphNode['values']?][], edges: string[]): Graph {
  return {
    nodes: nodes.map(([id, type, values]) => ({ id, type, x: 0, y: 0, values })),
    edges: edges.map((spec, i) => {
      const [from, to] = spec.split('->').map((s) => s.trim())
      const [fromNode, fromPin] = from.split('.')
      const [toNode, toPin] = to.split('.')
      return { id: `e${i}`, from: { node: fromNode, pin: fromPin }, to: { node: toNode, pin: toPin } }
    }),
  }
}

async function run(g: Graph, options: { maxSteps?: number; signal?: AbortSignal; payload?: Record<string, unknown> } = {}) {
  const mock = mockHost()
  const result = await runGraph(g, { entry: 'start', host: mock.host, addonId: 'user.test', ...options })
  return { ...mock, result }
}

/* ------------------------------------------------------------------ *
 * The catalogue
 * ------------------------------------------------------------------ */

{
  const de = MESSAGES.addonStudio.de as Record<string, Record<string, string>>
  const missing = nodeDefs().filter((def) => !de.node?.[def.type]).map((def) => def.type)
  check('Catalogue: every node has a German title', missing.length === 0, missing)
  const pins = new Set(nodeDefs().flatMap((def) => [...def.inputs, ...def.outputs]).map((p) => p.label ?? p.id))
  const missingPins = [...pins].filter((p) => !de.pin?.[p])
  check('Catalogue: every pin has a label', missingPins.length === 0, missingPins)
  check('Catalogue: exec fits exec alone', canConnect('exec', 'exec') && !canConnect('exec', 'string') && !canConnect('string', 'exec'))
  check('Catalogue: number → text allowed, text → number not', canConnect('number', 'string') && !canConnect('string', 'number'))
  check('Catalogue: any fits data', canConnect('list', 'any') && canConnect('any', 'boolean'))
}

/* ------------------------------------------------------------------ *
 * The interpreter
 * ------------------------------------------------------------------ */

async function interpreterTests() {
  // Branching: 7 > 3 takes the true branch
  {
    const g = graph([
      ['start', 'event.command'],
      ['cmp', 'logic.compare', { a: 7, b: 3, op: 'gt' }],
      ['if', 'flow.if'],
      ['yes', 'ui.output', { text: 'groß' }],
      ['no', 'ui.output', { text: 'klein' }],
    ], ['start.then -> if.in', 'cmp.result -> if.condition', 'if.true -> yes.in', 'if.false -> no.in'])
    const { log } = await run(g)
    check('Branching follows the true branch', log.join() === 'groß', log)
  }

  // A loop with variables: the sum of 0..4 = 10
  {
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
    ])
    const { log } = await run(g)
    check('Repeat + variables sum 0..4', log.join() === '10', log)
  }

  // For each element, with splitting and joining and upper and lower case
  {
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
    ])
    const { log } = await run(g)
    check('For each element runs once per element', log.join('|') === 'A|B|C|a-b-c', log)
  }

  // Text nodes
  {
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
    ])
    const { log, doc } = await run(g)
    check('Template, trim, replace, length, list, join', log.join() === 'HaLo weLt, Lumen!;17;false?', log)
    check('Replacing the selection changes the document', doc() === 'hallo Lumen', doc())
    const starts = await runGraph(graph([['start', 'text.startsWith', { text: 'Hallo', prefix: 'Ha' }]], []), {
      entry: 'start', host: mockHost().host, addonId: 'x',
    }).then(() => 'kein Fehler', (err: Error) => err.message)
    check('A pure node as the entry point is an error', starts !== 'kein Fehler', starts)
  }

  // Input, choosing from a list, a sequence, event data
  {
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
    ])
    const { log } = await run(g, { payload: { path: '/p/datei.txt' } })
    check('Sequence, input, choice and event data', log.join('|') === 'Hi!|y|/p/datei.txt', log)
  }

  // Stop ends without an error
  {
    const g = graph([
      ['start', 'event.command'], ['stop', 'flow.stop'], ['out', 'ui.output', { text: 'nie' }],
    ], ['start.then -> stop.in'])
    const { result, log } = await run(g)
    check('Stop ends without an error', result.stopped && log.length === 0, result)
  }

  // The error case with a node id
  {
    const g = graph([
      ['start', 'event.command'],
      ['div', 'math.divide', { a: 1, b: 0 }],
      ['num', 'text.fromNumber'],
      ['out', 'ui.output'],
    ], ['start.then -> out.in', 'div.result -> num.number', 'num.text -> out.text'])
    const error = await run(g).then(() => null, (err: unknown) => err)
    check('Division by zero reports the error at the node', error instanceof GraphError && error.nodeId === 'div', error)

    const bad = graph([['start', 'event.command'], ['x', 'gibt.es.nicht']], ['start.then -> x.in'])
    const unknown = await run(bad).then(() => null, (err: unknown) => err)
    check('An unknown node reports the error at the node', unknown instanceof GraphError && unknown.nodeId === 'x', unknown)

    const regex = graph([
      ['start', 'event.command'], ['rep', 'text.replace', { text: 'a', pattern: '(' }], ['out', 'ui.output'],
    ], ['start.then -> out.in', 'rep.result -> out.text'])
    const regexError = await run(regex).then(() => null, (err: unknown) => err)
    check('An invalid regex in the replace node', regexError instanceof GraphError && regexError.nodeId === 'rep', regexError)
  }

  // The step limit: an endless loop over a back edge
  {
    const g = graph([
      ['start', 'event.command'], ['a', 'ui.output', { text: 'a' }], ['b', 'ui.output', { text: 'b' }],
    ], ['start.then -> a.in', 'a.then -> b.in', 'b.then -> a.in'])
    const error = await run(g, { maxSteps: 50 }).then(() => null, (err: unknown) => err)
    check('The step limit breaks off an endless loop', error instanceof GraphError && /50/.test(error.message), error)
  }

  // Cancelling during “Wait”
  {
    const g = graph([
      ['start', 'event.command'], ['wait', 'flow.wait', { ms: 5000 }], ['out', 'ui.output', { text: 'zu spät' }],
    ], ['start.then -> wait.in', 'wait.then -> out.in'])
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 20)
    const started = Date.now()
    const error = await run(g, { signal: controller.signal }).then(() => null, (err: unknown) => err)
    check('Cancelling ends the wait at once', error instanceof GraphError && Date.now() - started < 1000, error)
  }

  // Maths
  {
    const g = graph([
      ['start', 'event.command'],
      ['mod', 'math.modulo', { a: 17, b: 5 }],
      ['round', 'math.round', { value: 2.6, mode: 'floor' }],
      ['max', 'math.max'],
      ['rnd', 'math.random', { min: 3, max: 3 }],
      ['tpl', 'text.template', { template: '{a}/{b}/{c}' }],
      ['out', 'ui.output'],
    ], ['start.then -> out.in', 'mod.result -> max.a', 'round.result -> max.b', 'max.result -> tpl.a', 'round.result -> tpl.b', 'rnd.result -> tpl.c', 'tpl.result -> out.text'])
    const { log } = await run(g)
    check('Modulo, rounding, max, random', log.join() === '2/2/3', log)
  }
}

/* ------------------------------------------------------------------ *
 * compile & validate
 * ------------------------------------------------------------------ */

function sampleAddon(): UserAddonModel {
  const model = createUserAddon('Beispiel Sprache')
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
  }]
  model.commands = [{
    id: 'hallo',
    title: 'Hallo sagen',
    keybinding: 'Ctrl+Alt+H',
    graph: graph([['start', 'event.command'], ['note', 'ui.notify', { message: 'Hallo' }]], ['start.then -> note.in']),
  }]
  model.templates = [{
    id: 'projekt',
    name: 'Beispielprojekt',
    fields: [{ id: 'autor', label: 'Autor', default: 'Ich' }],
    files: [{ path: '{{slug}}/main.bsp', content: '# {{name}} von {{autor}}' }],
    open: '{{slug}}/main.bsp',
  }]
  return model
}

async function compileTests() {
  const model = sampleAddon()
  const issues = validateAddon(model)
  check('The example add-on is valid', blockingIssues(issues).length === 0, issues)

  const ran: string[] = []
  const addon = compileAddon(model, { runCommand: (_m, command) => { ran.push(command.id) } })
  check('compile: id, name, version, the user marker', addon.id === 'user.beispiel-sprache' && addon.name === 'Beispiel Sprache' && addon.version === '1.0.0' && addon.user === true, addon)
  const lang = addon.languages?.[0]
  check('compile: a language with regexes', Boolean(lang && lang.numbers instanceof RegExp && lang.numbers.source === String.raw`^(?:\d+)` && lang.indentOpen instanceof RegExp), lang)
  const command = addon.commands?.[0]
  check('compile: a command with an id and a shortcut', command?.id === 'user.beispiel-sprache.hallo' && command.keybinding === 'Ctrl+Alt+H', command)
  await command?.run()
  check('compile: the command calls the graph', ran.join() === 'hallo', ran)

  const template = addon.projectTemplates?.[0]
  const files = template?.files({ name: 'Mein Test', slug: 'mein-test', dir: '/x', values: { autor: 'Ada' } })
  check('compile: the template replaces the placeholders', files?.['mein-test/main.bsp'] === '# Mein Test von Ada', files)
  check('fillPlaceholders leaves the unknown standing', fillPlaceholders('{{unbekannt}}', { name: '', slug: '', dir: '', values: {} }) === '{{unbekannt}}')

  // The tokenizer with the compiled language
  if (lang) {
    const parser = buildStreamParser(lang)
    const state = parser.startState!(2)
    const stream = new StringStream('let x = 42 # c', 2, 2)
    const kinds: string[] = []
    while (!stream.eol()) {
      stream.start = stream.pos
      const kind = parser.token(stream, state)
      if (kind) kinds.push(`${kind}:${stream.current()}`)
    }
    check('The tokenizer colours the compiled language', kinds.includes('lm_keyword:let') && kinds.includes('lm_number:42') && kinds.includes('lm_comment:# c'), kinds)
  }

  // Validation
  check('checkRegex spots an invalid regex', checkRegex('(') !== null && checkRegex(String.raw`\d+`) === null)
  const broken = sampleAddon()
  broken.id = 'lang.falsch'
  broken.version = 'eins'
  broken.languages[0].numbers = '[a-'
  broken.languages[0].extensions = ['bsp']
  broken.commands[0].graph.nodes = broken.commands[0].graph.nodes.filter((n) => n.type !== 'event.command')
  broken.templates[0].files = [{ path: '../raus.txt', content: '' }]
  const found = blockingIssues(validateAddon(broken))
  const sections = new Set(found.map((i) => `${i.section}:${i.field ?? ''}`))
  check('Validation: an id without a prefix', sections.has('general:id'), found)
  check('Validation: the version', sections.has('general:version'), found)
  check('Validation: an invalid regex', found.some((i) => i.section === 'languages' && i.field === 'numbers'), found)
  check('Validation: an extension without a dot', found.some((i) => i.field === 'extensions'), found)
  check('Validation: a command without an entry point', found.some((i) => i.section === 'commands'), found)
  check('Validation: a template path outside', found.some((i) => i.section === 'templates' && i.field === 'files'), found)
  check('Validation: an invalid regex falls away on compiling', compileAddon(broken).languages?.[0]?.numbers === undefined)

  // Serialisation
  const roundtrip = normalizeModel(JSON.parse(JSON.stringify(model)))
  check('A round trip through JSON stays valid', blockingIssues(validateAddon(roundtrip)).length === 0 && roundtrip.commands[0].graph.nodes.length === 2)
  check('normalizeModel fills in the missing lists', normalizeModel({ id: 'user.x', name: 'X' }).events.length === 0)
  check('Every kind of node in the catalogue is unique', NODE_CATALOG.size === nodeDefs().length)
}

function iconPackTests() {
  console.log('\n— Icon packs —')
  const packs = ALL_ADDONS.flatMap((addon) => addon.iconPacks ?? [])
  check('The bundled icon packs are present', packs.length >= 3)
  for (const pack of packs) {
    const problems = iconPackProblems(pack)
    check(`Icon-Paket „${pack.name}“ gültig`, problems.length === 0, problems.slice(0, 5))
  }
  // The pack carries icons for languages that arrive as an extension too, so
  // the comparison has to know about those — otherwise every one of them would
  // read as an entry pointing nowhere.
  const languages = [...ALL_ADDONS, ...extensionAddons()].flatMap((addon) => addon.languages ?? [])
  const ids = new Set(languages.map((language) => language.id))
  const unknown = Object.keys(lumenIconPack.languages ?? {}).filter((id) => !ids.has(id))
  check('The language ids in the Lumen pack exist', unknown.length === 0, unknown)
  const missing = languages.filter((language) => !lumenIconPack.languages?.[language.id] && !language.icon).map((language) => language.id)
  check('Every language has an icon (from the pack or an add-on)', missing.length === 0, missing)

  const rule = (name: string) => explainFileIcon(lumenIconPack, name, languages).rule
  check('A file name before an extension: package.json', rule('package.json') === 'fileNames')
  check('A file name regardless of case: CMakeLists.txt', rule('CMakeLists.txt') === 'fileNames')
  check('A compound extension before a simple one: app.d.ts', explainFileIcon(lumenIconPack, 'app.d.ts', languages).key === 'd.ts')
  check('A test extension: util.test.ts', explainFileIcon(lumenIconPack, 'util.test.ts', languages).key === 'test.ts')
  check('The language as a fallback: Main.java', rule('Main.java') === 'languages')
  check('A dotfile is not an extension: .env', rule('.env') === 'fileNames')
  check('An unknown file uses the default', resolveFileIcon(lumenIconPack, 'daten.xyz', languages).shape === 'file')
  check('Build tools: pom.xml, build.gradle.kts, Cargo.toml, go.mod', ['pom.xml', 'build.gradle.kts', 'Cargo.toml', 'go.mod'].every((name) => rule(name) === 'fileNames'))
  check('Classic: a language with the abbreviation of the add-on', resolveFileIcon(classicIconPack, 'Main.java', languages).glyph === 'J')
  check('Classic: a folder with no shape, colour alone', !resolveFolderIcon(classicIconPack, 'src').shape && resolveFolderIcon(classicIconPack, 'src').color === '#7c8cff')
  check('Without a pack: the abbreviation of the extension', resolveFileIcon(null, 'notiz.abc', languages).glyph === 'AB')

  check('An invalid shape is spotted', !isIconPack({ id: 'x', name: 'X', extensions: { ts: { shape: 'gibtsnicht' } } }))
  check('An invalid colour is spotted', !isIconPack({ id: 'x', name: 'X', extensions: { ts: { color: 'red; background:url(x)' } } }))
  check('An SVG path with markup is refused', !isIconPack({ id: 'x', name: 'X', file: { path: 'M0 0"/><script>' } }))
  check('An extension with a dot is spotted', !isIconPack({ id: 'x', name: 'X', extensions: { '.ts': { glyph: 'TS' } } }))
  check('A key in capitals is spotted', !isIconPack({ id: 'x', name: 'X', fileNames: { 'Makefile': { glyph: 'M' } } }))
  check('A unique id for copies', uniqueIconPackId('lumen-icons', ['lumen-icons', 'lumen-icons-kopie']) === 'lumen-icons-kopie-2')
  check('A round trip through JSON stays valid', isIconPack(JSON.parse(JSON.stringify(lumenIconPack))))
  const monoColors = new Set([monoIconPack.file, monoIconPack.folder, ...ICON_MAP_KEYS.flatMap((key) => Object.values(monoIconPack[key] ?? {}))]
    .map((def) => def?.color))
  check('Monochrome: only the neutral theme tones', [...monoColors].every((color) => color === 'var(--c-text-muted)' || color === 'var(--c-text-subtle)'), [...monoColors])
  check('Monochrome: the same entries as Lumen', ICON_MAP_KEYS.every((key) => Object.keys(monoIconPack[key] ?? {}).length === Object.keys(lumenIconPack[key] ?? {}).length))
  check('Monochrome: a folder keeps its role shape', resolveFolderIcon(monoIconPack, 'tests').shape === 'folder-test')
}

async function projectAddonTests() {
  console.log('\n— Tool add-ons (project kinds, templates, snippets) —')
  const ctx = { name: 'Mein Plugin', slug: 'mein-plugin', dir: '/tmp/mein-plugin', values: { group: 'de.example.tools', commands: 'true', lang: 'kotlin', empty: '' } }
  check('Filter path', fillPlaceholders('src/{{group|path}}/A.java', ctx) === 'src/de/example/tools/A.java')
  check('Filter pascal/camel/snake/kebab', fillPlaceholders('{{name|pascal}} {{name|camel}} {{name|snake}} {{slug|kebab}}', ctx) === 'MeinPlugin meinPlugin mein_plugin mein-plugin')
  check('An unknown filter stays standing', fillPlaceholders('{{name|gibtsnicht}}', ctx) === '{{name|gibtsnicht}}')
  check('#if with a toggle', fillPlaceholders('a{{#if commands}}B{{/if}}c', ctx) === 'aBc')
  check('#if with a comparison', fillPlaceholders('{{#if lang=java}}J{{/if}}{{#if lang=kotlin}}K{{/if}}', ctx) === 'K')
  check('#if with an inequality', fillPlaceholders('{{#if lang!=java}}nicht java{{/if}}', ctx) === 'nicht java')
  check('#unless and empty values', fillPlaceholders('{{#unless empty}}leer{{/unless}}{{#if empty}}x{{/if}}', ctx) === 'leer')
  check('Nested blocks', fillPlaceholders('{{#if commands}}A{{#if lang=kotlin}}K{{/if}}{{#if lang=java}}J{{/if}}Z{{/if}}', ctx) === 'AKZ')
  check('Placeholders in blocks', fillPlaceholders('{{#if commands}}{{name|pascal}}{{/if}}', ctx) === 'MeinPlugin')
  check('A condition without a comparison: false counts as not set', !conditionHolds({ field: 'x' }, { x: 'false' }) && conditionHolds({ field: 'x' }, { x: 'ja' }))

  const versions = { versions: ['1.20.4', '1.21.1', '1.21.4'] }
  check('A choice from JSON: the path, reversed, limited', JSON.stringify(extractChoices(versions, { id: 'v', label: 'V', choicesPath: 'versions', choicesReverse: true, choicesLimit: 2 }).map((c) => c.value)) === '["1.21.4","1.21.1"]')
  check('A choice from objects with a value and a label', extractChoices({ data: { items: [{ id: 'a', name: 'Alpha' }, { id: 'b' }] } }, { id: 'x', label: 'X', choicesPath: 'data.items', choicesValue: 'id', choicesLabel: 'name' })
    .map((c) => `${c.value}=${c.label}`).join() === 'a=Alpha,b=b')
  const fill = { versions: [{ version: { id: '26.3' } }, { version: { id: '26.3-rc-3' } }, { version: { id: '1.21.11' } }] }
  check('A choice: a nested value and a regex filter', extractChoices(fill, { id: 'v', label: 'V', choicesPath: 'versions', choicesValue: 'version.id', choicesMatch: '^[0-9.]+$' }).map((c) => c.value).join() === '26.3,1.21.11')
  check('A choice: no array gives an empty list', extractChoices({ versions: 'x' }, { id: 'v', label: 'V', choicesPath: 'versions' }).length === 0)

  const starter = createToolkitStarter([])
  const issues = validateAddon(starter)
  check('The tool example is valid', blockingIssues(issues).length === 0, issues.map((i) => i.message))
  const remote = [{ value: '1.21.8', label: '1.21.8' }]
  const addon = compileAddon(starter, { remoteChoices: (field) => (field.choicesUrl ? remote : undefined) })
  const template = addon.projectTemplates![0]
  check('The template points at its own project kind', template.kindId === `${starter.id}.paper-plugin`)
  const mc = template.fields!.find((f) => f.id === 'mcVersion')!
  check('A loaded choice replaces the fixed values and sets the preselection', mc.choices?.[0]?.value === '1.21.8' && mc.default === '1.21.8')
  const values = (commands: string) => ({ group: 'de.demo', mcVersion: '1.21.8', java: '21', commands })
  const files = template.files({ name: 'Hallo Welt', slug: 'hallo-welt', dir: '/x', values: values('false') })
  check('A conditional file falls away', !Object.keys(files).some((path) => path.endsWith('HelloCommand.java')))
  check('A path with the package and the class name', Boolean(files['src/main/java/de/demo/HalloWelt.java']))
  check('A block in the content falls away', !files['src/main/resources/plugin.yml'].includes('commands:'))
  const withCommands = template.files({ name: 'Hallo Welt', slug: 'hallo-welt', dir: '/x', values: values('true') })
  check('A conditional file and block with the toggle set', Boolean(withCommands['src/main/java/de/demo/HelloCommand.java']) && withCommands['src/main/resources/plugin.yml'].includes('commands:'))
  check('A template with an existing project kind stays unchanged', compileTemplate({ ...starter.templates[0], kindId: 'gradle' }, starter.id).kindId === 'gradle')
  check('Snippets for another language', addon.snippets?.length === 2 && addon.snippets.every((snippet) => snippet.languageId === 'java'))

  const fsFiles: Record<string, string> = {
    'build.gradle.kts': 'plugins { java }',
    gradlew: '#!/bin/sh',
    'src/main/resources/plugin.yml': "name: Demo\nversion: '2.1.0'\nmain: de.demo.Demo\napi-version: '1.21'\n",
  }
  const mock = (files: Record<string, string>, platform = 'linux') => ({
    root: '/p', platform,
    readFile: async (path: string) => files[path] ?? null,
    exists: async (path: string) => path in files,
    list: async () => Object.keys(files).filter((path) => !path.includes('/')).map((name) => ({ name, isDirectory: false })),
  })
  const withoutWrapper = Object.fromEntries(Object.entries(fsFiles).filter(([name]) => name !== 'gradlew'))
  const kind = compileProjectKind(starter.projectKinds[0], starter.id)
  check('Project kind: the rule holds', await kind.detect!(mock(fsFiles)))
  check('Project kind: the rule misses without a plugin.yml', !(await kind.detect!(mock({ 'build.gradle.kts': '' }))))
  const tasks = await kind.tasks(mock(fsFiles))
  check('The tasks use the wrapper where there is one', tasks[0].command === './gradlew' && tasks.map((task) => task.group).join() === 'build,run,clean')
  check('Without a wrapper, the command itself', (await kind.tasks(mock(withoutWrapper)))[0].command === 'gradle')
  check('The Windows wrapper', (await kind.tasks(mock({ ...withoutWrapper, 'gradlew.bat': '' }, 'win32')))[0].command === 'gradlew.bat')
  const meta = await kind.inspect!(mock(fsFiles))
  check('Facts: name, version, a fact', meta.name === 'Demo' && meta.version === '2.1.0' && meta.facts?.API === '1.21', meta)

  /* Tasks that follow from the project — per match, per folder,
     mit Ersatz, mit zweiter Stufe und mit dateiabhängigen Argumenten. */
  {
    const presets = JSON.stringify({
      configurePresets: [
        { name: 'debug', displayName: 'Debug-Build' },
        { name: 'intern', hidden: true },
      ],
    })
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
    }, 'user.test')

    const withPresets = await dynamic.tasks(mock({ 'CMakePresets.json': presets, 'conanfile.txt': '' }))
    check('Presets: hidden ones fall away, the display name wins',
      withPresets.map((task) => task.label).join('|') === 'Konfigurieren: Debug-Build|run', withPresets.map((t) => t.label))
    check('Arguments that depend on a file take effect',
      withPresets[0].args.join(' ') === '--preset debug', withPresets[0].args)

    const withoutPresets = await dynamic.tasks(mock({ 'vcpkg.json': '{}' }))
    check('Without presets: the task itself plus a stand-in',
      withoutPresets.map((task) => task.id.split(':').pop()).join('|') === 'configure|ninja|run',
      withoutPresets.map((t) => t.id))
    check('Without presets: the toolchain from vcpkg',
      withoutPresets[0].args.join(' ') === '-S . -DTOOLCHAIN=vcpkg', withoutPresets[0].args)
    check('The second stage is kept', withoutPresets[2].then?.command === './build/app')
  }

  /* Enter a dependency into a build file. */
  {
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
    }, 'user.test')

    const existing = await shards.dependencies!.add(
      mock({ 'shard.yml': 'name: demo\n\ndependencies:\n  alt:\n    github: a/alt\n' }),
      { name: 'kemalcr/kemal', version: '1.5.0', scope: 'dependencies' },
    )
    check('The entry lands under the heading already there',
      existing.type === 'edit' && existing.content.includes('dependencies:\n  kemal:\n    github: kemalcr/kemal\n    version: 1.5.0\n  alt:'),
      existing.type === 'edit' ? existing.content : existing)
    check('The follow-up command is passed along',
      existing.type === 'edit' && existing.then?.command === 'shards')

    const created = await shards.dependencies!.add(
      mock({ 'shard.yml': 'name: demo\n' }),
      { name: 'kemalcr/kemal', scope: 'development_dependencies' },
    )
    check('A missing heading is created, a line without a value falls away',
      created.type === 'edit'
        && created.content.endsWith('development_dependencies:\n  kemal:\n    github: kemalcr/kemal\n')
        && !created.content.includes('version:'),
      created.type === 'edit' ? created.content : created)
  }

  const broken = createToolkitStarter([])
  broken.projectKinds[0].markers = []
  broken.projectKinds[0].facts = [{ label: 'X', file: 'a', pattern: 'ohne gruppe' }]
  broken.templates[0].fields[0].when = { field: 'gibtsnicht' }
  broken.templates[0].fields[1].choicesUrl = 'http://unsicher'
  broken.snippets[0].languageId = ''
  const sections = blockingIssues(validateAddon(broken)).map((issue) => issue.section)
  check('Validation reports the marker, the pattern, the condition, the URL and the snippet language',
    sections.filter((s) => s === 'kinds').length >= 2 && sections.filter((s) => s === 'templates').length >= 2 && sections.includes('snippets'), sections)
}

iconPackTests()
await projectAddonTests()
await interpreterTests()
await compileTests()

console.log(`\n${passed} passed, ${failures} failed`)
if (failures) process.exit(1)
console.log('✓ Add-on studio: the interpreter and compile are in order')
