/**
 * Drives LspManager + LspClient against a real clangd — `window.lumen.lsp` is
 * rebuilt with child_process (the same framing as electron/main.ts). Without a
 * clangd in the PATH the test is skipped.
 *
 *   npm run check:lsp
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

type Listener<T> = (p: T) => void
const msgListeners = new Set<Listener<{ id: string; message: Record<string, unknown> }>>()
const errListeners = new Set<Listener<{ id: string; text: string }>>()
const closeListeners = new Set<Listener<{ id: string; reason: string }>>()
const servers = new Map<string, { child: ChildProcess; buffer: Buffer }>()

function drain(id: string, s: { child: ChildProcess; buffer: Buffer }) {
  for (;;) {
    const headerEnd = s.buffer.indexOf('\r\n\r\n')
    if (headerEnd === -1) return
    const header = s.buffer.subarray(0, headerEnd).toString('ascii')
    const m = /content-length:\s*(\d+)/i.exec(header)
    if (!m) { s.buffer = s.buffer.subarray(headerEnd + 4); continue }
    const len = Number(m[1]); const start = headerEnd + 4
    if (s.buffer.length < start + len) return
    const body = s.buffer.subarray(start, start + len).toString('utf8')
    s.buffer = s.buffer.subarray(start + len)
    const message = JSON.parse(body)
    for (const l of msgListeners) l({ id, message })
  }
}

const lumen = {
  fs: {
    readFile: (p: string) => fs.readFile(p, 'utf8'),
    writeFile: async (p: string, c: string) => { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, c); return true },
    create: async (p: string, dir: boolean) => {
      if (dir) {
        await fs.mkdir(p, { recursive: true })
        return true
      }
      await fs.writeFile(p, '')
      return true
    },
    exists: (p: string) => fs.access(p).then(() => true, () => false),
    list: async (p: string) => (await fs.readdir(p, { withFileTypes: true })).map((e) => ({ name: e.name, isDirectory: e.isDirectory() })),
    findRoot: async (start: string, markers: string[]) => {
      let dir = start
      for (;;) {
        for (const m of markers) if (await fs.access(path.join(dir, m)).then(() => true, () => false)) return dir
        const parent = path.dirname(dir); if (parent === dir) return null; dir = parent
      }
    },
  },
  lsp: {
    available: async (c: string) => c === 'clangd',
    resolve: async (cands: string[]) => cands.find((c) => c === 'clangd') ?? null,
    start: async (id: string, cmd: string, args: string[], cwd: string, env: Record<string, string>) => {
      const child = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } })
      const s = { child, buffer: Buffer.alloc(0) }
      servers.set(id, s)
      child.stdout!.on('data', (chunk: Buffer) => { s.buffer = Buffer.concat([s.buffer, chunk]); drain(id, s) })
      child.stderr!.on('data', (chunk: Buffer) => { for (const l of errListeners) l({ id, text: chunk.toString() }) })
      child.on('close', (code) => {
        // as in electron/main.ts: a process that has been replaced reports no more
        if (servers.get(id) !== s) return
        servers.delete(id)
        for (const l of closeListeners) l({ id, reason: `beendet (Code ${code})` })
      })
      return id
    },
    send: async (id: string, message: unknown) => {
      const s = servers.get(id); if (!s?.child.stdin?.writable) return false
      const body = Buffer.from(JSON.stringify(message), 'utf8')
      s.child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`); s.child.stdin.write(body); return true
    },
    stop: async (id: string) => { const s = servers.get(id); if (!s) return; servers.delete(id); s.child.stdin?.end(); s.child.kill('SIGTERM') },
    onMessage: (cb: Listener<{ id: string; message: Record<string, unknown> }>) => { msgListeners.add(cb); return () => msgListeners.delete(cb) },
    onStderr: (cb: Listener<{ id: string; text: string }>) => { errListeners.add(cb); return () => errListeners.delete(cb) },
    onClosed: (cb: Listener<{ id: string; reason: string }>) => { closeListeners.add(cb); return () => closeListeners.delete(cb) },
  },
  shell: { openExternal: async () => {} },
}
;(globalThis as unknown as { window: unknown }).window = { lumen }

/* Installing — package managers, root detection and install plans. Pure
   functions, so they are checked even where clangd is missing. */
{
  const managers = await import('../electron/features/package-managers')
  const plans = await import('@/core/lsp/install-plan')
  let bad = 0
  const expect = (cond: boolean, label: string) => { console.log(`  ${cond ? '✓' : '✗'}  ${label}`); if (!cond) bad++ }
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

  const pacman = managers.installInvocation('pacman', ['clang'])
  expect(same(pacman.argv, ['pacman', '-S', '--noconfirm', '--needed', 'clang']) && pacman.root, 'pacman: -S --noconfirm --needed, as root')
  const apt = managers.installInvocation('apt', ['clangd'])
  expect(same(apt.argv, ['apt-get', 'install', '-y', 'clangd']) && apt.env.DEBIAN_FRONTEND === 'noninteractive', 'apt: apt-get install -y, non-interactive')
  expect(same(managers.installInvocation('dnf', ['a', 'b']).argv, ['dnf', 'install', '-y', 'a', 'b']), 'dnf: several packages')
  expect(same(managers.installInvocation('zypper', ['x']).argv, ['zypper', '--non-interactive', 'install', 'x']), 'zypper: --non-interactive')
  expect(same(managers.installInvocation('apk', ['x']).argv, ['apk', 'add', '--no-cache', 'x']), 'apk: --no-cache')
  expect(!managers.installInvocation('brew', ['llvm']).root, 'Homebrew needs no root')
  expect(managers.formatInvocation(pacman) === 'sudo pacman -S --noconfirm --needed clang', 'preview puts sudo in front')
  const rejects = (fn: () => unknown) => { try { fn(); return false } catch { return true } }
  expect(rejects(() => managers.installInvocation('pacman', ['clang; rm -rf /'])), 'a package name with shell syntax is refused')
  expect(rejects(() => managers.installInvocation('pacman', ['--overwrite=*'])), 'an option smuggled in as a package is refused')
  expect(rejects(() => managers.installInvocation('winget', ['A.B', 'C.D'])), 'winget takes one package at a time')
  expect(rejects(() => managers.installInvocation('nope' as never, ['x'])), 'an unknown manager is refused')

  const arch = managers.parseOsRelease('NAME="Arch Linux"\nID=arch\n')
  expect(managers.managerForDistro(arch) === 'pacman', 'Arch → pacman')
  const mint = managers.parseOsRelease('ID=linuxmint\nID_LIKE="ubuntu debian"\n')
  expect(managers.managerForDistro(mint) === 'apt', 'Linux Mint → apt')
  const derived = managers.parseOsRelease('ID=someos\nID_LIKE=fedora\n')
  expect(managers.managerForDistro(derived) === 'dnf', 'ID_LIKE=fedora → dnf')
  expect(managers.candidateManagers('linux', 'apt')[0] === 'apt', 'the distribution\'s manager is probed first')
  expect(!managers.candidateManagers('darwin', null).includes('pacman'), 'macOS probes no Linux managers')

  expect(managers.commandNeedsRoot('sudo apt install clangd'), 'sudo … needs root')
  expect(managers.commandNeedsRoot('pacman -S ccls'), 'pacman needs root')
  expect(!managers.commandNeedsRoot('cargo install taplo-cli'), 'cargo needs no root')
  expect(managers.stripElevation('sudo -E apt install x') === 'apt install x', 'sudo is taken off a command')
  expect(managers.isWrongPassword('Sorry, try again.\nsudo: 1 incorrect password attempt'), 'a wrong password is recognised')
  expect(!managers.isWrongPassword('error: target not found: clangx'), 'a package error is not a wrong password')

  const system = { platform: 'linux', managers: ['pacman' as const], isRoot: false, sudo: true, pkexec: false }
  const clangd = { label: 'clangd', command: 'clangd', systemPackages: { pacman: 'clang', apt: 'clangd' } }
  const onlySystem = plans.installPlans(clangd, { platform: 'linux', platformKey: 'linux-x64', system })
  expect(onlySystem.length === 1 && onlySystem[0].kind === 'system' && onlySystem[0].root, 'systemPackages → a pacman plan with root')
  expect(onlySystem[0]?.summary === 'sudo pacman -S --noconfirm --needed clang', `plan preview: ${onlySystem[0]?.summary}`)
  const asRoot = plans.installPlans(clangd, { platform: 'linux', system: { ...system, isRoot: true } })
  expect(asRoot[0]?.kind === 'system' && !asRoot[0].root, 'running as root needs no sudo')
  const npm = plans.installPlans({ label: 'x', command: 'x', installCommands: { linux: 'npm i -g x-server' } }, { platform: 'linux', system })
  expect(npm.length === 1 && npm[0].kind === 'managed', 'a plain npm install becomes a managed plan only')
  const both = plans.installPlans({
    label: 'deno', command: 'deno',
    package: { type: 'github', repo: 'denoland/deno', assets: { 'linux-x64': 'x' } },
    systemPackages: { pacman: 'deno' },
    installCommands: { linux: 'sh -c "curl -fsSL https://deno.land/install.sh | sh"' },
  }, { platform: 'linux', platformKey: 'linux-x64', system })
  expect(same(both.map((p) => p.kind), ['managed', 'system', 'command']), 'order: managed, system, command')
  const noAsset = plans.installPlans({ label: 'y', command: 'y', package: { type: 'github', repo: 'a/b', assets: {} } }, { platform: 'linux', platformKey: 'linux-x64', system: null })
  expect(noAsset.length === 0, 'a release without a download for this platform offers nothing')
  const sudoCommand = plans.installPlans({ label: 'z', command: 'z', installCommands: { linux: 'sudo apt install z' } }, { platform: 'linux', system })
  expect(sudoCommand[0]?.kind === 'command' && sudoCommand[0].root, 'a sudo command is marked as needing root')

  if (bad) {
    console.log(`\n${bad} install check(s) failed`)
    process.exit(1)
  }
}

if (spawnSync('clangd', ['--version'], { stdio: 'ignore' }).error) {
  console.log('clangd not on the PATH — LSP check skipped')
  process.exit(0)
}

const { lsp } = await import('@/core/lsp/manager')

// C and C++ are extensions; their language specs come out of the built
// manifests, exactly as they reach a running Lumen.
const { extensionAddons, extensionsBuilt } = await import('./lib/extension-addons')
if (!extensionsBuilt()) {
  console.log('extensions/dist is missing — run `npm run build:ext` first.')
  process.exit(1)
}
const languagesById = new Map(
  extensionAddons().flatMap((addon) => addon.languages ?? []).map((lang) => [lang.id, lang]),
)
const cSpec = languagesById.get('c')
const cppSpec = languagesById.get('cpp')
if (!cSpec || !cppSpec) {
  console.log('ext.c or ext.cpp is not built — LSP check skipped')
  process.exit(0)
}

let failures = 0
const ok = (cond: boolean, label: string) => { console.log(`  ${cond ? '✓' : '✗'}  ${label}`); if (!cond) failures++ }

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-lsp-'))
await fs.writeFile(path.join(root, 'compile_flags.txt'), '-std=c17\n-Wall\n')
const cFile = path.join(root, 'main.c')
const cText = '#include <stdio.h>\n\nstatic int add(int a, int b) { return a + b; }\n\nint main(void) {\n    int x = add(1, 2);\n    printf("%d\\n", x);\n    return x\n}\n'
await fs.writeFile(cFile, cText)
const cppFile = path.join(root, 'other.cpp')
await fs.writeFile(cppFile, '#include <vector>\nint f() { std::vector<int> v{1}; return v.size(); }\n')

lsp.setPaths({ home: os.homedir(), userData: path.join(root, 'userData'), platform: 'linux' })
lsp.setWorkspace(root)

const diagnostics: Record<string, number> = {}
lsp.subscribe(() => { for (const d of lsp.allDiagnostics()) diagnostics[d.path] = d.diagnostics.length })

await lsp.openDocument(cSpec, cFile, cText)
const client = lsp.clientForPath(cFile)
ok(client?.status === 'ready', `Client bereit: ${client?.serverInfo.name} ${client?.serverInfo.version ?? ''}`)
if (!client) process.exit(1)

await lsp.openDocument(cppSpec, cppFile, await fs.readFile(cppFile, 'utf8'))
ok(lsp.clientForPath(cppFile) === client, 'C und C++ teilen sich einen clangd-Prozess')
ok(client.servedLanguages.includes('c') && client.servedLanguages.includes('cpp'), `bedient: ${client.servedLanguages.join(', ')}`)

// Wait for diagnostics (a missing semicolon on line 8)
for (let i = 0; i < 100 && !diagnostics[cFile]; i++) await new Promise((r) => setTimeout(r, 100))
ok((diagnostics[cFile] ?? 0) > 0, `Diagnosen für main.c: ${diagnostics[cFile] ?? 0}`)

const hover = await client.hover(cFile, { line: 5, character: 13 })
ok(Boolean(hover), `Hover auf add(): ${JSON.stringify(hover?.contents).slice(0, 80)}`)

const completion = await client.completion(cFile, { line: 6, character: 5 }, undefined)
ok(completion.items.length > 0, `Vervollständigung: ${completion.items.length} Einträge (${completion.items.slice(0, 3).map((i) => i.label).join(', ')})`)

const def = await client.definition(cFile, { line: 5, character: 13 })
ok(def.length === 1 && def[0].range.start.line === 2, `Definition von add: Zeile ${def[0]?.range.start.line + 1}`)

const refs = await client.references(cFile, { line: 2, character: 12 }, true)
ok(refs.length === 2, `Referenzen von add: ${refs.length}`)

const symbols = await client.documentSymbols(cFile)
ok(symbols.length >= 2, `Dokumentsymbole: ${symbols.map((s) => s.name).join(', ')}`)

const highlights = await client.documentHighlight(cFile, { line: 5, character: 9 })
ok(highlights.length >= 2, `Vorkommen von x: ${highlights.length}`)

const sig = await client.signatureHelp(cFile, { line: 5, character: 17 }, undefined)
ok(Boolean(sig?.signatures.length), `Signaturhilfe: ${sig?.signatures[0]?.label ?? '-'}`)

const hints = await client.inlayHints(cFile, { start: { line: 0, character: 0 }, end: { line: 9, character: 0 } })
ok(hints.length >= 1, `Inlay-Hints: ${hints.map((h) => typeof h.label === 'string' ? h.label : h.label.map((p) => p.value).join('')).join(' ')}`)

const prepared = await client.prepareRename(cFile, { line: 2, character: 12 })
ok(Boolean(prepared), `prepareRename: ${JSON.stringify(prepared?.range)} ${prepared?.placeholder ?? ''}`)
const edit = await client.rename(cFile, { line: 2, character: 12 }, 'sum')
const editCount = Object.values(edit?.changes ?? {}).flat().length + (edit?.documentChanges ?? []).reduce((n, c) => n + ('edits' in c ? c.edits.length : 0), 0)
ok(editCount === 2, `Umbenennen liefert ${editCount} Änderungen`)

const actions = await client.codeActions(cFile, { start: { line: 7, character: 4 }, end: { line: 7, character: 12 } }, lsp.diagnostics(cFile))
ok(Array.isArray(actions), `Code-Aktionen: ${actions.map((a) => a.title).join(' | ') || '(keine)'}`)

const fmt = await client.formatting(cFile, 4)
ok(Array.isArray(fmt), `Formatierung: ${fmt?.length ?? 0} Edits`)

// An incremental change → the diagnostic disappears
ok(client.incrementalSync, 'Server erlaubt inkrementelle Synchronisation')
client.changeDocument(cFile, cText.replace('return x\n', 'return x;\n'), [{ range: { start: { line: 7, character: 12 }, end: { line: 7, character: 12 } }, text: ';' }])
// Straight after the change the diagnostics belong to the old state — they may
// no longer be set in the editor, otherwise the squiggles sit beside the text.
ok(!lsp.diagnosticsAreCurrent(cFile), 'Diagnosen nach Tippen als veraltet erkannt')
for (let i = 0; i < 100 && lsp.diagnostics(cFile).length !== 0; i++) await new Promise((r) => setTimeout(r, 100))
ok(lsp.diagnosticsAreCurrent(cFile), 'Nach der Neuberechnung wieder aktuell')
ok(lsp.diagnostics(cFile).length === 0, `Nach Korrektur: ${lsp.diagnostics(cFile).length} Diagnosen`)

const ws = await lsp.workspaceSymbols('add')
ok(ws.some((s) => s.name === 'add'), `Arbeitsbereichs-Symbole: ${ws.map((s) => s.name).join(', ')}`)

const entry = lsp.list()[0]
ok(entry.documents === 2 && entry.status === 'ready', `list(): ${entry.label} ${entry.status}, ${entry.documents} Dokumente, ${entry.languages.join('+')}`)
ok(lsp.logs().length > 0, `Protokoll: ${lsp.logs().length} Zeilen`)

// A restart: the same process id as before — the late “close” of the old
// process may not clear the new one away, and open files come back.
const brokenText = cText
lsp.documentFor = (p) => {
  if (p === cFile) return { spec: cSpec, text: brokenText }
  if (p === cppFile) return { spec: cppSpec, text: '#include <vector>\nint f() { std::vector<int> v{1}; return v.size(); }\n' }
  return null
}
await lsp.restartClient(client.id)
await new Promise((r) => setTimeout(r, 1500))
const restarted = lsp.clientForPath(cFile)
ok(Boolean(restarted) && restarted !== client, 'Neustart: neuer Client')
ok(restarted?.status === 'ready', `Neustart: Status ${restarted?.status} ${restarted?.detail ?? ''}`)
ok(lsp.list()[0]?.documents === 2, `Neustart: ${lsp.list()[0]?.documents ?? 0} Dokumente wieder geöffnet`)
for (let i = 0; i < 100 && lsp.diagnostics(cFile).length === 0; i++) await new Promise((r) => setTimeout(r, 100))
ok(lsp.diagnostics(cFile).length > 0, `Neustart: Diagnosen kommen wieder (${lsp.diagnostics(cFile).length})`)

// The command “Restart the LSP” on the active file
await lsp.restart(cSpec, cFile)
await new Promise((r) => setTimeout(r, 1500))
ok(lsp.clientForPath(cFile)?.status === 'ready', `Befehl: Status ${lsp.clientForPath(cFile)?.status}`)
ok(lsp.list()[0]?.documents === 2, `Befehl: ${lsp.list()[0]?.documents ?? 0} Dokumente wieder geöffnet`)

await lsp.shutdownAll()
await new Promise((r) => setTimeout(r, 300))
ok(servers.size === 0, 'Prozess beendet')

// Without a compilation database (a single file with no project) clangd takes
// on the add-on's fallbackFlags — without them there would never be a warning there.
const plainRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-lsp-plain-'))
const plainFile = path.join(plainRoot, 'plain.cpp')
const plainText = 'int main() {\n  int unbenutzt = 42;\n  return 0;\n}\n'
await fs.writeFile(plainFile, plainText)
lsp.setWorkspace(plainRoot)
await lsp.openDocument(cppSpec, plainFile, plainText)
const warned = () => lsp.diagnostics(plainFile).some((d) => d.severity === 2)
for (let i = 0; i < 100 && !warned(); i++) await new Promise((r) => setTimeout(r, 100))
ok(warned(), `Warnung ohne compile_commands.json: ${lsp.diagnostics(plainFile).map((d) => d.message).join(' | ') || '(keine)'}`)

console.log('\nDocument sync:')
{
  const { applyContentChanges } = await import('@/core/lsp/client')
  const before = 'class Main {\n  int a;\n}\n'
  const pos = (line: number, character: number) => ({ line, character })
  // Back to front in the old coordinates — as the editor reports them.
  const changes = [
    { range: { start: pos(2, 0), end: pos(2, 0) }, text: '  // end\n' },
    { range: { start: pos(1, 2), end: pos(1, 5) }, text: 'long' },
  ]
  ok(applyContentChanges(before, changes) === 'class Main {\n  long a;\n  // end\n}\n', 'Content changes apply back to front')
  ok(applyContentChanges(before, [{ range: { start: pos(9, 0), end: pos(9, 0) }, text: 'x' }]) === `${before}x`, 'A position past the end clamps to the end')
}

console.log('\nDefinition fallback:')
{
  const { declarationHits, declarationPattern, definitionSymbols, searchExtensions } = await import('@/components/editor/definition-fallback')
  const at = (uri: string, line: number) => ({ uri, range: { start: { line, character: 0 }, end: { line, character: 1 } } })
  const symbols = [
    { name: 'StorageNetworks', kind: 5, location: at('file:///p/core/StorageNetworks.java', 3) },
    { name: 'storageNetworks', kind: 8, location: at('file:///p/app/Main.java', 9) },
    { name: 'StorageNetworks', kind: 13, location: at('file:///p/app/Other.java', 2) },
    { name: 'StorageNetworksImpl', kind: 5, location: at('file:///p/core/Impl.java', 1) },
  ]
  const found = definitionSymbols(symbols, 'StorageNetworks')
  ok(found.length === 1 && found[0].uri.endsWith('core/StorageNetworks.java'), 'Workspace symbols: the class wins over a variable of the same name')
  ok(definitionSymbols([{ name: 'X', kind: 5, location: { uri: 'file:///x' } }], 'X').length === 0, 'Workspace symbols without a range are skipped')
  const pattern = declarationPattern('EnergyCableNetworks')
  ok(pattern.test('public final class EnergyCableNetworks extends Base {') && pattern.test('record EnergyCableNetworks(int a) {')
    && pattern.test('object EnergyCableNetworks') && !pattern.test('EnergyCableNetworks.register(x);') && !pattern.test('class EnergyCableNetworksTest {'),
  'Declaration pattern: class/record/object, not uses or longer names')
  const exts = searchExtensions(['.java'])
  ok(exts.has('.kt') && exts.has('.java'), 'Java searches Kotlin files too')
  const hits = declarationHits([
    { path: '/p/core/src/EnergyCableNetworks.java', line: 12, text: 'public class EnergyCableNetworks {' },
    { path: '/p/app/src/Main.java', line: 4, text: 'EnergyCableNetworks.init();' },
    { path: '/p/docs/notes.md', line: 1, text: 'class EnergyCableNetworks is great' },
  ], 'EnergyCableNetworks', exts)
  ok(hits.length === 1 && hits[0].range.start.line === 11 && hits[0].uri.includes('core/src'), 'Text search: only the declaration in a source file, 0-based line')
}

console.log('\nJumps into dependencies:')
{
  const { preferCurrentModule, jdtModule } = await import('@/components/editor/definition-fallback')
  const at = (uri: string) => ({ uri, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } })
  const hits = ['fabric', 'common', 'neoforge'].map((m) => at(`jdt://contents/mc.jar/net/X/ArmorMaterial.java?=${m}/%5C/home%5C/x`))
  ok(jdtModule(hits[1].uri) === 'common', 'The module is read from the jdt:// query')
  const own = preferCurrentModule(hits, '/p/neoforge/src/main/java/A.java')
  ok(own.length === 1 && jdtModule(own[0].uri) === 'neoforge', 'Only the hit of the current module stays')
  ok(preferCurrentModule(hits, '/p/other/A.java').length === 3, 'Without a matching module all hits stay')
}

console.log('\njdtls javac backend:')
{
  const { javacBackendArgs, javacBackendRuntime } = await import('@/core/sdk/lsp')
  const { javacBackendRange } = await import('../electron/features/javac-backend')
  const manifest = 'Build-Jdk-Spec: 26\r\nRequire-Capability: osgi.ee; filter:="(&(osgi.ee=JavaSE)(vers\r\n ion=25))"\r\n'
  const parsed = javacBackendRange(manifest)
  ok(parsed?.minJava === 25 && parsed.buildJava === 26, 'Backend range read from the manifest, across a continuation line')
  const jdk = (home: string, major: number) => ({
    providerId: 'java', home, version: `${major}.0.1`, major, distribution: '', vendor: '', sources: [], managed: false, runtimeOnly: false,
  })
  const installed = [jdk('/jdk/21', 21), jdk('/jdk/25', 25), jdk('/jdk/26', 26), jdk('/jdk/27', 27)]
  const range = { minJava: 25, buildJava: 26 }
  ok(javacBackendRuntime({ home: '/jdk/25', major: 25 }, installed, range)?.switched === false, 'An active JDK in range runs jdtls itself')
  const fitting = javacBackendRuntime({ home: '/jdk/21', major: 21 }, installed, range)
  ok(fitting?.home === '/jdk/26' && fitting.switched, 'With JDK 21 active, the installed JDK the backend was built with runs jdtls')
  ok(javacBackendRuntime({ home: '/jdk/27', major: 27 }, installed, range)?.home === '/jdk/26', 'A JDK newer than the backend is passed over (javac internals differ)')
  ok(javacBackendRuntime({ home: '/jdk/21', major: 21 }, [jdk('/jdk/17', 17), jdk('/jdk/27', 27)], range) === null, 'Without a fitting JDK the Eclipse compiler stays')
  const { netBeansRuntime } = await import('@/core/sdk/lsp')
  ok(netBeansRuntime(null, installed) === '/jdk/25', 'NetBeans without an active JDK: the newest LTS, not an early-access 27')
  ok(netBeansRuntime({ home: '/jdk/26', major: 26 }, installed) === '/jdk/26', 'NetBeans takes an active JDK 17+')
  ok(netBeansRuntime({ home: '/jdk/8', major: 8 }, [jdk('/jdk/11', 11)]) === null, 'NetBeans without any JDK 17+: none')
  const args = javacBackendArgs({ home: '/jdk/26', switched: true }, '/agent.jar')
  ok(args[0] === '--java-executable=/jdk/26/bin/java'
    && args.includes('--jvm-arg=-javaagent:/agent.jar')
    && args.includes('--jvm-arg=-DAbstractImageBuilder.compilerFactory=org.eclipse.jdt.internal.javac.JavacCompilerFactory')
    && args.every((arg, i) => i === 0 || arg.startsWith('--jvm-arg=')), 'Launcher arguments: the JDK, then the backend options as --jvm-arg')
}

await lsp.shutdownAll()
await new Promise((r) => setTimeout(r, 300))
await fs.rm(plainRoot, { recursive: true, force: true })
await fs.rm(root, { recursive: true, force: true })
console.log(`\n${failures} error(s)`)
process.exit(failures ? 1 : 0)
