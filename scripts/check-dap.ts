/**
 * Drives DebugSession + DapClient against real debug adapters — the transport
 * uses the same functions as the main process (electron/features/dap.ts).
 * Adapters not installed are skipped.
 *
 *   npm run check:dap
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {
  resolveProgram, startAdapter, sendAdapter, stopAdapter, type DapEvents, type DapProgram,
} from '../electron/features/dap'
import { DapClient, type DapTransport } from '@/core/debug/client'
import { DebugSession, type SessionHooks } from '@/core/debug/session'
import type { DapMessage, OutputEventBody, StoppedEventBody } from '@/core/debug/protocol'

type Handler = { message: Set<(m: DapMessage) => void>; close: Set<(r: string) => void> }
const handlers = new Map<string, Handler>()
const handlerFor = (id: string) => {
  let hit = handlers.get(id)
  if (!hit) {
    hit = { message: new Set(), close: new Set() }
    handlers.set(id, hit)
  }
  return hit
}

const verbose = process.argv.includes('--verbose')

const events: DapEvents = {
  message: (id, message) => {
    if (verbose) console.log('  ←', JSON.stringify(message).slice(0, 300))
    for (const cb of handlerFor(id).message) cb(message as DapMessage)
  },
  output: (_id, _stream, text) => { if (verbose) process.stdout.write(`  [adapter] ${text}`) },
  closed: (id, reason) => { for (const cb of handlerFor(id).close) cb(reason) },
}

let transportCounter = 0
async function connect(options: Parameters<typeof startAdapter>[1]): Promise<DapTransport & { port?: number }> {
  const id = `t${++transportCounter}`
  const { port } = await startAdapter(id, options, events)
  return {
    port,
    send: (message) => {
      if (verbose) console.log('  →', JSON.stringify(message).slice(0, 300))
      sendAdapter(id, message)
    },
    onMessage: (cb) => { handlerFor(id).message.add(cb); return () => handlerFor(id).message.delete(cb) },
    onClose: (cb) => { handlerFor(id).close.add(cb); return () => handlerFor(id).close.delete(cb) },
    close: () => stopAdapter(id),
  }
}

let failures = 0
const ok = (label: string) => console.log(`  ✓ ${label}`)
const fail = (label: string, detail?: unknown) => {
  failures++
  console.log(`  ✗ ${label}${detail ? `: ${String(detail)}` : ''}`)
}
const expect = (cond: unknown, label: string, detail?: unknown) => (cond ? ok(label) : fail(label, detail))

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timed out: ${label}`)), ms)),
  ])
}

interface Scenario {
  name: string
  programs: DapProgram[]
  transport: 'stdio' | 'tcp'
  type: string
  file: string
  /** The 1-based line of the breakpoint. */
  line: number
  launch: Record<string, unknown>
  /** A variable that must be visible at the breakpoint. */
  variable: string
  expression: string
  expected: string
}

async function runScenario(s: Scenario) {
  console.log(`\n${s.name}`)
  const program = await resolveProgram(s.programs)
  if (!program) {
    console.log('  – skipped (adapter not found)')
    return
  }
  ok(`Adapter: ${program.command} ${(program.args ?? []).join(' ')}`)

  const stops: { session: DebugSession; threadId?: number; body: StoppedEventBody }[] = []
  const output: string[] = []
  let terminated = false
  const waiters: (() => void)[] = []
  const poke = () => { for (const w of waiters.splice(0)) w() }
  const until = async (cond: () => boolean, ms: number, label: string) => {
    const deadline = Date.now() + ms
    while (!cond()) {
      if (Date.now() > deadline) throw new Error(`Timed out: ${label}`)
      await new Promise<void>((resolve) => { waiters.push(resolve); setTimeout(resolve, 100) })
    }
  }

  const hooks: SessionHooks = {
    sourceBreakpoints: () => [{ path: s.file, ids: ['bp1'], breakpoints: [{ line: s.line }] }],
    exceptionFilters: () => [],
    breakpointsVerified: (_session, ids, result) => {
      // GDB reports breakpoints as “pending” before the program starts and confirms them later by an event.
      const state = result[0]?.verified ? 'bestätigt' : `ausstehend${result[0]?.message ? ` – ${result[0].message}` : ''}`
      expect(result.length === 1, `Haltepunkt ${ids[0]} gesetzt (${state})`)
    },
    breakpointChanged: () => {},
    stopped: (session, threadId, body) => { stops.push({ session, threadId, body }); poke() },
    continued: () => poke(),
    output: (_session, body: OutputEventBody) => { output.push(body.output); poke() },
    terminated: (session) => { if (!session.parent) terminated = true; poke() },
    runInTerminal: async () => ({}),
    // Child sessions (vscode-js-debug): a new connection to the same adapter port.
    startDebugging: async (parent, args) => {
      const childTransport = await connect({ transport: 'tcp', port: transport.port })
      const child = new DebugSession(new DapClient(childTransport), 'child', s.type, args.request, args.configuration, hooks, parent)
      parent.children.push(child)
      ok(`Kind-Sitzung gestartet (${args.request})`)
      void child.start().catch((err: Error) => fail('Kind-Sitzung', err.message))
    },
    changed: () => poke(),
  }

  const transport = await connect({
    transport: s.transport,
    command: program.command,
    args: program.args,
    cwd: path.dirname(s.file),
  })
  const client = new DapClient(transport)
  const session = new DebugSession(client, s.name, s.type, 'launch', s.launch, hooks)
  try {
    await withTimeout(session.start(), 30_000, 'Start')
    ok(`gestartet (${Object.keys(session.capabilities).length} Fähigkeiten)`)
    await until(() => stops.length > 0 || terminated, 30_000, 'stopped')
    const stop = stops[0]
    expect(stop, `angehalten: ${stop?.body.reason}`)
    if (stop?.threadId === undefined) return
    const stoppedSession = stop.session
    const thread = stoppedSession.threads.get(stop.threadId)
    const top = thread?.frames[0]
    expect(top?.line === s.line, `Rahmen ${top?.name} Zeile ${top?.line}`, `erwartet ${s.line}`)
    if (!top) return
    const scopes = await stoppedSession.scopes(top.id)
    expect(scopes.length > 0, `Scopes: ${scopes.map((sc) => sc.name).join(', ')}`)
    const locals = await stoppedSession.variables(scopes[0].variablesReference)
    const variable = locals.find((v) => v.name === s.variable)
    expect(variable, `Variable ${s.variable} = ${variable?.value}`, locals.map((v) => v.name).join(','))
    const evaluated = await stoppedSession.evaluate(s.expression, top.id, 'watch').catch((err: Error) => ({ result: `Fehler ${err.message}`, variablesReference: 0 }))
    expect(evaluated.result.includes(s.expected), `evaluate ${s.expression} → ${evaluated.result}`)

    await stoppedSession.step('next', stop.threadId)
    await until(() => stops.length > 1 || terminated, 15_000, 'next')
    const after = stoppedSession.threads.get(stop.threadId)?.frames[0]
    expect(stops.length > 1 && after && after.line !== s.line, `Schritt → Zeile ${after?.line}`)

    await stoppedSession.continue(stop.threadId)
    await until(() => terminated, 20_000, 'terminated')
    ok('beendet')
    expect(output.join('').length > 0, `Ausgabe: ${JSON.stringify(output.join('').slice(-80))}`)
  } catch (err) {
    fail('Ablauf', (err as Error).message)
  } finally {
    await session.stop().catch(() => {})
  }
}

async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-dap-'))
  const home = os.homedir()

  // C with GDB (≥ 14) and lldb-dap
  const cFile = path.join(dir, 'main.c')
  await fs.writeFile(cFile, [
    '#include <stdio.h>',
    '',
    'int add(int a, int b) { return a + b; }',
    '',
    'int main(void) {',
    '  int counter = 41;',
    '  counter = add(counter, 1);',
    '  printf("counter=%d\\n", counter);',
    '  return 0;',
    '}',
    '',
  ].join('\n'))
  const exe = path.join(dir, 'main')
  const cc = spawnSync('gcc', ['-g', '-O0', cFile, '-o', exe])
  if (cc.status === 0) {
    const native = { program: exe, args: [], cwd: dir }
    await runScenario({
      name: 'gdb --interpreter=dap', type: 'gdb', transport: 'stdio',
      programs: [{ command: 'gdb', args: ['--interpreter=dap', '--quiet'] }],
      file: cFile, line: 7, launch: native, variable: 'counter', expression: 'counter + 1', expected: '42',
    })
    await runScenario({
      name: 'lldb-dap', type: 'lldb', transport: 'stdio',
      programs: [{ command: 'lldb-dap' }, { command: 'lldb-vscode' }],
      file: cFile, line: 7, launch: native, variable: 'counter', expression: 'counter + 1', expected: '42',
    })
  }

  // Python with debugpy
  const pyFile = path.join(dir, 'main.py')
  await fs.writeFile(pyFile, [
    'def add(a, b):',
    '    return a + b',
    '',
    'counter = 41',
    'counter = add(counter, 1)',
    'print("counter", counter)',
    '',
  ].join('\n'))
  await runScenario({
    name: 'debugpy', type: 'debugpy', transport: 'stdio',
    programs: [
      { command: 'python3', args: ['-m', 'debugpy.adapter'], probe: ['-c', 'import debugpy'] },
      { command: `${home}/.vscode/extensions/ms-python.debugpy-*/bundled/libs/debugpy/adapter` },
      { command: `${home}/.local/share/nvim/mason/packages/debugpy/venv/bin/python`, args: ['-m', 'debugpy.adapter'] },
    ],
    file: pyFile, line: 5, launch: { program: pyFile, cwd: dir, console: 'internalConsole', justMyCode: true },
    variable: 'counter', expression: 'counter + 1', expected: '42',
  })

  // Node.js with vscode-js-debug (TCP, child sessions through startDebugging)
  const jsFile = path.join(dir, 'main.js')
  await fs.writeFile(jsFile, [
    'function add(a, b) {',
    '  return a + b',
    '}',
    '',
    'let counter = 41',
    'counter = add(counter, 1)',
    'console.log("counter", counter)',
    '',
  ].join('\n'))
  const jsServer = process.env.JS_DEBUG_SERVER
  await runScenario({
    name: 'vscode-js-debug', type: 'pwa-node', transport: 'tcp',
    programs: [
      ...(jsServer ? [{ command: jsServer, args: ['${port}', '127.0.0.1'] }] : []),
      { command: 'js-debug-adapter', args: ['${port}', '127.0.0.1'] },
      { command: `${home}/.local/share/nvim/mason/packages/js-debug-adapter/js-debug/src/dapDebugServer.js`, args: ['${port}', '127.0.0.1'] },
      { command: `${home}/.local/share/js-debug/src/dapDebugServer.js`, args: ['${port}', '127.0.0.1'] },
    ],
    file: jsFile, line: 6, launch: { type: 'pwa-node', request: 'launch', name: 'check', program: jsFile, cwd: dir, console: 'internalConsole', outputCapture: 'std' },
    variable: 'counter', expression: 'counter + 1', expected: '42',
  })

  // Go with Delve (TCP)
  const goFile = path.join(dir, 'gomain', 'main.go')
  await fs.mkdir(path.dirname(goFile), { recursive: true })
  await fs.writeFile(goFile, 'package main\n\nimport "fmt"\n\nfunc main() {\n\tcounter := 41\n\tcounter = counter + 1\n\tfmt.Println("counter", counter)\n}\n')
  await fs.writeFile(path.join(dir, 'gomain', 'go.mod'), 'module example.com/gomain\n\ngo 1.21\n')
  await runScenario({
    name: 'dlv dap', type: 'go', transport: 'tcp',
    programs: [{ command: 'dlv', args: ['dap', '-l', '127.0.0.1:${port}'] }, { command: `${home}/go/bin/dlv`, args: ['dap', '-l', '127.0.0.1:${port}'] }],
    file: goFile, line: 7, launch: { mode: 'debug', program: path.dirname(goFile), cwd: path.dirname(goFile) },
    variable: 'counter', expression: 'counter + 1', expected: '42',
  })

  await fs.rm(dir, { recursive: true, force: true })
  console.log(failures ? `\n${failures} error(s)` : '\nAll good')
  process.exit(failures ? 1 : 0)
}

void main()
