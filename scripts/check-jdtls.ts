/**
 * END-TO-END: the real jdtls with Lumen's real java settings, LspManager and
 * LspClient, and the pure planner (`planCompletion`) applied to a string
 * document exactly as the editor would. Opt-in (slow: jdtls imports a
 * workspace first).
 *
 *   npm run check:jdtls        (LUMEN_SKIP_JDTLS=1 skips, LUMEN_JDTLS_DUMP=1 prints the raw items)
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ChangeSet, Text } from '@codemirror/state'
import { diffChanges, needsResolve, offsetToPos, planCompletion, type CompletionPlan } from '@/core/completion/apply'
import { parseSnippet } from '@/core/completion/snippet'
import { listReusable, triggerBefore } from '@/core/completion/context'
import type { CompletionItem, CompletionList } from '@/core/lsp/protocol'
import { installLumenShim } from './lib/lsp-shim'

const DUMP = process.env.LUMEN_JDTLS_DUMP === '1'
/** Pause between an edit and the completion request (a person needs >100 ms from keystroke to Enter; jdtls reconciles asynchronously). */
const SETTLE_MS = Number(process.env.LUMEN_JDTLS_SETTLE_MS ?? 300)
const skip = (why: string): never => {
  console.log(`SKIP: ${why}`)
  process.exit(0)
}

if (process.env.LUMEN_SKIP_JDTLS === '1') skip('LUMEN_SKIP_JDTLS=1')
const which = (cmd: string): string | null => {
  const r = spawnSync('which', [cmd], { encoding: 'utf8' })
  if (r.status !== 0) return null
  return r.stdout.trim() || null
}
const jdtlsPath = which('jdtls')
const javaPath = which('java')
if (!jdtlsPath || !javaPath) skip('jdtls or java not on the PATH')
if (!which('javac') || !which('jar')) skip('javac/jar not on the PATH (needed to build the dependency jar)')
const javaMajor = Number(/version "(\d+)/.exec(spawnSync('java', ['-version'], { encoding: 'utf8' }).stderr)?.[1] ?? 0)
if (javaMajor < 21) skip(`java ${javaMajor} < 21`)

const shim = installLumenShim({ commands: { jdtls: jdtlsPath!, java: javaPath! } })
const cleanup: (() => Promise<void> | void)[] = []
const finish = async (code: number): Promise<never> => {
  shim.killAll()
  for (const fn of cleanup.reverse()) await Promise.resolve(fn()).catch(() => {})
  process.exit(code)
}
process.on('SIGINT', () => { void finish(130) })
process.on('SIGTERM', () => { void finish(143) })
process.on('uncaughtException', (err) => { console.log(`uncaught: ${err.stack ?? err}`); void finish(1) })

/* ------------------------------------------------------------------ *
 * Results
 * ------------------------------------------------------------------ */

type Status = 'PASS' | 'FAIL' | 'SKIP'
const results: { name: string; status: Status; note: string }[] = []
class SkipScenario extends Error {}
const skipHere = (why: string): never => { throw new SkipScenario(why) }

let currentChecks: string[] = []
function ok(cond: boolean, label: string, evidence?: unknown) {
  if (cond) return
  const extra = evidence === undefined ? '' : `\n        ${typeof evidence === 'string' ? evidence : JSON.stringify(evidence)}`
  currentChecks.push(`${label}${extra}`)
}
const eq = (actual: unknown, expected: unknown, label: string) => {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  ok(a === b, label, `got ${a}\n        expected ${b}`)
}

const ONLY = process.env.LUMEN_JDTLS_ONLY ? new RegExp(process.env.LUMEN_JDTLS_ONLY, 'i') : null

async function scenario(name: string, fn: () => Promise<void>, timeoutMs = 60_000) {
  if (ONLY && !ONLY.test(name)) return
  currentChecks = []
  let status: Status = 'PASS'
  let note = ''
  const started = Date.now()
  try {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`timeout after ${timeoutMs} ms`)), timeoutMs) })
    try { await Promise.race([fn(), timeout]) } finally { clearTimeout(timer) }
  } catch (err) {
    if (err instanceof SkipScenario) {
      status = 'SKIP'
      note = err.message
    }
    if (!(err instanceof SkipScenario)) currentChecks.push(`threw: ${(err as Error).stack?.split('\n').slice(0, 3).join(' | ') ?? err}`)
  }
  if (status !== 'SKIP' && currentChecks.length) {
    status = 'FAIL'
    note = currentChecks.join('\n      ')
  }
  results.push({ name, status, note })
  console.log(`  ${status === 'PASS' ? '✓' : status === 'SKIP' ? '-' : '✗'} ${status}  ${name}  (${((Date.now() - started) / 1000).toFixed(1)}s)${note ? `\n      ${note}` : ''}`)
}

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-jdtls-'))
if (process.env.LUMEN_JDTLS_KEEP === '1') console.log(`keeping ${tmp}`)
if (process.env.LUMEN_JDTLS_KEEP !== '1') cleanup.push(() => fs.rm(tmp, { recursive: true, force: true }))
const userData = path.join(tmp, 'userData') // the jdtls -data dir lives here, OUTSIDE every project
const projectDirs: string[] = []

const write = async (file: string, text: string) => {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, text)
}

/** The plain, build-tool-free project: sources + a dependency jar in lib/. */
async function buildPlainProject(): Promise<string> {
  const root = path.join(tmp, 'plain')
  projectDirs.push(root)
  await fs.mkdir(path.join(root, '.git'), { recursive: true }) // root marker, like a repo checkout
  const gen = path.join(tmp, 'jargen')
  await write(path.join(gen, 'lib/Greeter.java'), [
    'package lib;',
    '',
    'public class Greeter {',
    '    public String hello(String name) { return "hi " + name; }',
    '    public static Greeter create() { return new Greeter(); }',
    '    public Greeter() {}',
    '    public Greeter(String prefix, int times) {}',
    '    /** @deprecated use hello */',
    '    @Deprecated public void oldHello() {}',
    '}',
    '',
  ].join('\n'))
  await write(path.join(gen, 'lib/util/Shouter.java'), 'package lib.util;\n\npublic class Shouter {\n    public static String shout(String s) { return s.toUpperCase(); }\n}\n')
  const out = path.join(tmp, 'jarout')
  await fs.mkdir(out, { recursive: true })
  const javac = spawnSync('javac', ['--release', '21', '-parameters', '-g', '-d', out, path.join(gen, 'lib/Greeter.java'), path.join(gen, 'lib/util/Shouter.java')], { encoding: 'utf8' })
  if (javac.status !== 0) throw new Error(`javac failed: ${javac.stderr}`)
  await fs.mkdir(path.join(root, 'lib'), { recursive: true })
  const jar = spawnSync('jar', ['cf', path.join(root, 'lib/greeter.jar'), '-C', out, '.'], { encoding: 'utf8' })
  if (jar.status !== 0) throw new Error(`jar failed: ${jar.stderr}`)

  await write(path.join(root, 'src/app/Main.java'), mainText('        '))
  await write(path.join(root, 'src/app/Util.java'), 'package app;\n\npublic class Util {\n    public static int twice(int x) { return x * 2; }\n    public String describe() { return "util"; }\n}\n')
  await write(path.join(root, 'src/other/Helper.java'), 'package other;\n\npublic class Helper {\n    public static String help() { return "help"; }\n}\n')
  return root
}

function classText(members: string): string {
  return `package app;\n\npublic class Main {\n${members}\n}\n`
}

function mainText(body: string): string {
  return `package app;\n\npublic class Main {\n    public static void main(String[] args) {\n${body}\n    }\n}\n`
}

/* ------------------------------------------------------------------ *
 * Session: manager + client from the real java addon
 * ------------------------------------------------------------------ */

const { lsp } = await import('@/core/lsp/manager')
const { javaSpec } = await import('@/addons/builtin/java')
const { pathToUri } = await import('@/core/lsp/protocol')
import type { LspClient } from '@/core/lsp/client'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
async function waitFor<T>(what: string, fn: () => T | Promise<T>, ms: number, step = 250): Promise<T> {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > end) throw new Error(`timeout waiting for ${what}`)
    await sleep(step)
  }
}

interface Session { root: string; client: LspClient; file: string; text: string }
const session: Partial<Session> = {}

/** A request against a marked document (`|` = cursor) — what the editor's completion source does. */
interface Req {
  file: string; text: string; doc: Text; head: number; from: number; to: number
  pattern: string; list: CompletionList; trigger?: string
}

function cur(): { client: LspClient; file: string } {
  if (!session.client || !session.file) throw new Error('no session')
  return { client: session.client, file: session.file }
}

/** Puts `marked` into the open file (full-text didChange like a reload) and returns the plain text + cursor. */
function setText(marked: string, file = cur().file) {
  const head = marked.indexOf('|')
  const text = marked.replace('|', '')
  lsp.changeDocument(file, text)
  session.text = text
  return { text, head }
}

async function requestAt(marked: string, opts: { file?: string; trigger?: string | null; kind?: number; settle?: number } = {}): Promise<Req> {
  const { client } = cur()
  const file = opts.file ?? cur().file
  const { text, head } = setText(marked, file)
  await sleep(opts.settle ?? SETTLE_MS)
  const doc = Text.of(text.split('\n'))
  const line = doc.lineAt(head)
  const before = doc.sliceString(line.from, head)
  const word = /[\w$]*$/.exec(before)![0]
  const triggers = ((client.capabilities.completionProvider as { triggerCharacters?: string[] } | undefined)?.triggerCharacters) ?? []
  const trigger = opts.trigger === null ? undefined : opts.trigger ?? (word ? undefined : triggerBefore(before, triggers) ?? undefined)
  const list = await client.completion(file, offsetToPos(doc, head), trigger)
  if (DUMP) console.log(`    [dump] ${before.trim()}| -> ${list.items.length} items, incomplete=${list.isIncomplete}; first 6:\n${list.items.slice(0, 6).map((i) => `      ${JSON.stringify(i)}`).join('\n')}`)
  return { file, text, doc, head, from: head - word.length, to: head, pattern: word, list, trigger }
}

const RESOLVE_TIMEOUT_MS = 2500 // as lsp-extension.ts

interface Applied { resolveNote: string; text: string; plan: CompletionPlan; resolved?: CompletionItem; resolvedCalled: boolean; cursor: number; item: CompletionItem }

/**
 * acceptCompletion() of lsp-extension.ts on a string: resolve when needed,
 * optionally let the document change meanwhile (`during`), plan, apply in ONE ChangeSet.
 */
async function accept(req: Req, item: CompletionItem, opts: { during?: (text: string) => string; mode?: 'insert' | 'replace' } = {}): Promise<Applied> {
  const { client } = cur()
  const baseDoc = req.doc
  const resolvedCalled = needsResolve(item)
  let resolved: CompletionItem | undefined
  let pendingResolve: Promise<CompletionItem | null> | undefined
  let resolveNote = ''
  if (resolvedCalled) {
    // the product's newest resolve entry point when it exists (verdict + cache + retry), else the plain one
    const withVerdict = (client as unknown as { resolveCompletionResult?: (i: CompletionItem) => Promise<{ ok: boolean; item?: CompletionItem }> }).resolveCompletionResult
    const call = withVerdict
      ? withVerdict.call(client, item).then((r) => { if (!r.ok) resolveNote = `resolve failed: ${JSON.stringify(r)}`; return r.ok ? r.item ?? null : null })
      : client.resolveCompletion(item)
    pendingResolve = Promise.race([call.catch((e: Error) => { resolveNote = `resolve threw: ${e.message}`; return null }), sleep(RESOLVE_TIMEOUT_MS).then(() => { resolveNote ||= `resolve timed out after ${RESOLVE_TIMEOUT_MS} ms`; return null })])
  }
  let doc = baseDoc
  let head = req.head
  let changes: ChangeSet | undefined
  if (opts.during) {
    const next = Text.of(opts.during(req.text).split('\n'))
    changes = diffChanges(baseDoc, next)
    head = changes.mapPos(req.head, 1)
    doc = next
  }
  if (pendingResolve) resolved = (await pendingResolve) ?? undefined
  const plan = planCompletion({
    doc, head,
    from: changes ? changes.mapPos(req.from, -1) : req.from,
    to: changes ? changes.mapPos(req.to, 1) : req.to,
    item, resolved, baseDoc: changes ? baseDoc : undefined, changes, mode: opts.mode,
    filePath: req.file,
  })
  if (DUMP) console.log(`    [accept] item=${JSON.stringify(item)}\n             resolved=${JSON.stringify(resolved)}\n             plan=${JSON.stringify(plan.changes)} dropped=${JSON.stringify(plan.dropped)}`)
  const after = ChangeSet.of(plan.changes, doc.length).apply(doc)
  const text = after.toString()
  return { resolveNote, text, plan, resolved, resolvedCalled, cursor: plan.selection[0]?.head ?? -1, item }
}

/* ---- picking ------------------------------------------------------ */

const nameOf = (i: CompletionItem) => i.label.replace(/[<(\s-].*$/, '')
const describe = (i: CompletionItem) => `${i.label} [kind ${i.kind}] ${i.detail ?? ''} ${i.labelDetails?.description ?? ''}`.trim()
const summary = (req: Req, n = 12) => req.list.items.slice(0, n).map(describe).join(' | ')
/** The qualified name jdtls puts into labelDetails / detail for a type item. */
const qualifiedOf = (i: CompletionItem) => {
  const q = i.labelDetails?.description ?? i.detail ?? ''
  return q
}
function findType(req: Req, simple: string, pkg: string): CompletionItem | undefined {
  return req.list.items.find((i) => nameOf(i) === simple && (qualifiedOf(i) === pkg || i.detail === `${pkg}.${simple}`))
}

const importsOf = (text: string) => [...text.matchAll(/^import\s+(?:static\s+)?([\w.*]+);/gm)].map((m) => m[0])
const countOf = (text: string, needle: string) => text.split(needle).length - 1

/** Import placement: after `package`, before the first type declaration; no duplicates. */
function checkImportPlacement(text: string, label: string) {
  const pkg = text.indexOf('package ')
  const firstImport = text.indexOf('\nimport ')
  const typeDecl = text.search(/^(public\s+)?(class|interface|enum|record)\s/m)
  ok(firstImport > pkg && firstImport < typeDecl, `${label}: import sits between package and class`, text.slice(0, 200))
  const imps = importsOf(text)
  ok(new Set(imps).size === imps.length, `${label}: no duplicate imports`, imps)
}

async function diagnosticsFor(file: string, ms = 20_000): Promise<{ message: string; severity?: number }[]> {
  const version = cur().client.documentVersion(file)
  await waitFor('current diagnostics', () => lsp.diagnosticsAreCurrent(file), ms, 300).catch(() => null)
  void version
  return lsp.diagnostics(file) as { message: string; severity?: number }[]
}

/* ------------------------------------------------------------------ *
 * Startup
 * ------------------------------------------------------------------ */

/**
 * Diagnostics only — compare against the shipped settings:
 *   LUMEN_JDTLS_SOURCEPATHS=src                      injects java.project.sourcePaths
 *   LUMEN_JDTLS_SETTINGS='{"completion":{...}}'      deep-merges JSON into the java settings
 */
const deepMerge = (target: any, patch: any) => {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') deepMerge(target[key], value)
    if (!(value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object')) target[key] = value
  }
}
{
  const cfg = javaSpec.lsp![0] as { settings: { java: any }; initializationOptions: { settings: { java: any } } }
  const patch: any = process.env.LUMEN_JDTLS_SETTINGS ? JSON.parse(process.env.LUMEN_JDTLS_SETTINGS) : {}
  if (process.env.LUMEN_JDTLS_SOURCEPATHS) patch.project = { ...(patch.project ?? {}), sourcePaths: process.env.LUMEN_JDTLS_SOURCEPATHS.split(',') }
  if (Object.keys(patch).length) {
    for (const java of [cfg.settings.java, cfg.initializationOptions.settings.java]) deepMerge(java, patch)
    console.log(`  (diagnostic) java settings patched: ${JSON.stringify(patch)}`)
  }
}

async function startSession(root: string, file: string, initial: string, label: string, probeClass?: string) {
  console.log(`\n== ${label}: starting jdtls (first import can take a while) ==`)
  lsp.setPaths({ home: os.homedir(), userData, platform: 'linux' })
  lsp.setWorkspace(root)
  await lsp.openDocument(javaSpec, file, initial)
  const client = lsp.clientForPath(file)
  if (!client || client.status !== 'ready') throw new Error(`jdtls did not become ready: ${client?.status} ${client?.detail}\n${shim.stderr.slice(-5).join('')}`)
  Object.assign(session, { root, client, file, text: initial })
  if (session.client && session.client !== client) session.client = client
  await waitFor('ServiceReady', () => (client as unknown as { javaReady: boolean }).javaReady, 240_000, 500)
  await waitFor('no pending progress', () => client.busy === null, 240_000, 500).catch(() => null)
  // probe until completion really answers with project classes
  await waitFor('completion answers', async () => {
    const req = await requestAt(mainText('        Str|'))
    if (DUMP) {
      const raw = await (client as any).request('textDocument/completion', { textDocument: { uri: pathToUri(file) }, position: { line: 4, character: 11 }, context: { triggerKind: 1 } }).catch((e: Error) => `ERR ${e.message}`)
      console.log('    [probe]', JSON.stringify(raw)?.slice(0, 300), lsp.diagnostics(file).map((d: any) => d.message).slice(0, 5))
    }
    return req.list.items.some((i) => nameOf(i) === 'String')
  }, 40_000, 1000)
  // a freshly imported invisible project needs the JDK index for imports too
  await waitFor('type index', async () => {
    const req = await requestAt(mainText('        ArrayLi|'))
    return req.list.items.some((i) => nameOf(i) === 'ArrayList')
  }, 240_000, 1000)
  if (probeClass) {
    // a build import is done when a class of the project itself shows up (the JDK alone is available before)
    await waitFor(`${probeClass} of the imported project`, async () => {
      const req = await requestAt(mainText(`        ${probeClass.slice(0, 4)}|`))
      return req.list.items.some((i) => nameOf(i) === probeClass)
    }, 240_000, 2000)
  }
  console.log(`  ready: ${client.serverInfo.name ?? 'jdtls'} ${client.serverInfo.version ?? ''}`)
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

const plain = await buildPlainProject()
const mainFile = path.join(plain, 'src/app/Main.java')
const utilFile = path.join(plain, 'src/app/Util.java')
const helperFile = path.join(plain, 'src/other/Helper.java')

try {
  await startSession(plain, mainFile, await fs.readFile(mainFile, 'utf8'), 'plain project (src + lib/greeter.jar)')
  const { registerScenarios } = await import('./lib/jdtls-scenarios')
  await registerScenarios({
    scenario, ok, eq, skipHere, requestAt, accept, setText, cur, findType, nameOf, describe, summary, importsOf, countOf,
    checkImportPlacement, diagnosticsFor, mainText, classText, sleep, waitFor, mainFile, utilFile, helperFile, plain, lsp, listReusable, parseSnippet, pathToUri, DUMP,
  })


  const { registerBuildScenarios } = await import('./lib/jdtls-scenarios')
  const sessionOf = async (kind: 'maven' | 'gradle') => {
    const label = kind === 'maven' ? 'maven project' : 'gradle project (without Lumen\'s init script, a main-process feature)'
    if (ONLY && !ONLY.test(kind)) return
    if (!which(kind === 'maven' ? 'mvn' : 'gradle')) {
      results.push({ name: `${kind}: session`, status: 'SKIP', note: `${kind} not installed` })
      return
    }
    const root = path.join(tmp, kind)
    projectDirs.push(root)
    const srcDir = kind === 'maven' || kind === 'gradle' ? 'src/main/java' : 'src'
    await fs.mkdir(path.join(root, '.git'), { recursive: true })
    if (kind === 'maven') {
      await write(path.join(root, 'pom.xml'), '<project xmlns="http://maven.apache.org/POM/4.0.0">\n  <modelVersion>4.0.0</modelVersion>\n  <groupId>demo</groupId>\n  <artifactId>demo</artifactId>\n  <version>1.0</version>\n  <properties>\n    <maven.compiler.release>21</maven.compiler.release>\n    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>\n  </properties>\n</project>\n')
    }
    if (kind === 'gradle') {
      await write(path.join(root, 'settings.gradle'), "rootProject.name = 'demo'\n")
      await write(path.join(root, 'build.gradle'), "plugins { id 'java' }\njava { sourceCompatibility = JavaVersion.VERSION_21 }\nrepositories { mavenCentral() }\n")
    }
    const main = path.join(root, srcDir, 'app/Main.java')
    await write(main, mainText('        '))
    await write(path.join(root, srcDir, 'app/Util.java'), 'package app;\n\npublic class Util {\n    public static int twice(int x) { return x * 2; }\n}\n')
    await write(path.join(root, srcDir, 'other/Helper.java'), 'package other;\n\npublic class Helper {\n    public static String help() { return "help"; }\n}\n')
    try {
      lsp.setWorkspace(null)
      await sleep(1500)
      await startSession(root, main, await fs.readFile(main, 'utf8'), label, 'Helper')
    } catch (err) {
      const log = session.client?.log.slice(-6).map((l) => l.text.slice(0, 160)).join(' | ') ?? ''
      results.push({ name: `${kind}: session`, status: 'SKIP', note: `jdtls did not import the ${kind} project here: ${(err as Error).message.split('\n')[0]} ${log}` })
      console.log(`  - SKIP  ${kind}: ${(err as Error).message.split('\n')[0]}`)
      return
    }
    await registerBuildScenarios({ scenario, ok, eq, requestAt, accept, cur, findType, nameOf, summary, importsOf, checkImportPlacement, mainText, kind })
  }
  await sessionOf('maven')
  await sessionOf('gradle')

  // no Eclipse metadata anywhere in the project fixtures
  await scenario('no Eclipse metadata in the project (.project .classpath .settings .factorypath .eclipse bin/)', async () => {
    const all = ['.project', '.classpath', '.settings', '.factorypath', '.eclipse', 'bin']
    for (const dir of projectDirs) {
      // Gradle's Eclipse plugin puts `bin/` into the project unless Lumen's init script (main-process feature, not loaded here) redirects it
      const bad = path.basename(dir) === 'gradle' ? all.filter((n) => n !== 'bin') : all
      for (const name of bad) ok(!(await fs.access(path.join(dir, name)).then(() => true, () => false)), `${path.basename(dir)}/${name} must not exist`)
      const found: string[] = []
      const walk = async (d: string) => {
        for (const e of await fs.readdir(d, { withFileTypes: true })) {
          if (bad.includes(e.name)) found.push(path.join(d, e.name))
          if (e.isDirectory() && e.name !== '.git') await walk(path.join(d, e.name))
        }
      }
      await walk(dir)
      ok(found.length === 0, 'no metadata at any depth', found)
    }
    const data = path.join(userData, 'lsp')
    ok(await fs.access(data).then(() => true, () => false), 'the -data dir was created under userData (outside the project)')
  })
} catch (err) {
  console.log(`\nharness error: ${(err as Error).stack ?? err}`)
  const c = session.client ?? lsp.clientForPath(mainFile)
  if (c) console.log(`client log (tail):\n${c.log.slice(-25).map((l) => `  ${l.kind}: ${l.text.slice(0, 300)}`).join('\n')}`)
  console.log(`stderr (tail): ${shim.stderr.slice(-6).join('').slice(0, 1500)}`)
  results.push({ name: 'harness', status: 'FAIL', note: String(err) })
}

/* ------------------------------------------------------------------ *
 * Table
 * ------------------------------------------------------------------ */

console.log('\n==== jdtls end-to-end ====')
const width = Math.max(10, ...results.map((r) => r.name.length))
for (const r of results) console.log(`${r.status.padEnd(5)} ${r.name.padEnd(width)}`)
const failed = results.filter((r) => r.status === 'FAIL')
const skipped = results.filter((r) => r.status === 'SKIP')
console.log(`\n${results.length - failed.length - skipped.length} passed, ${failed.length} failed, ${skipped.length} skipped`)
for (const r of failed) console.log(`\nFAIL ${r.name}\n      ${r.note}`)
await finish(failed.length ? 1 : 0)
