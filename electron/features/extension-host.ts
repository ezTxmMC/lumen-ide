/**
 * Running the program code of extensions, and the agents they register.
 *
 * Most extensions are data. One that needs logic — an AI agent talking to its
 * own SDK, say — ships one bundled ES module (`code.main` in its manifest).
 * That module runs here, in the main process, **with the rights of Lumen
 * itself**. Three things stand between a foreign server and that:
 *
 *   1. The renderer asks the user before saving the code, naming the risk
 *      (`core/extensions/approval.ts`), and pins the SHA-256 of what was shown.
 *   2. The main process hashes the code again and refuses on a mismatch.
 *   3. At startup the file is hashed once more against the hash stored in the
 *      installed record — a file changed on disk afterwards does not run.
 *
 * What the extension sees is deliberately small (`activate(ctx)`); what Lumen
 * knows about agents is only this file — no product names, no protocol.
 *
 * An agent is a provider: `send` runs one turn and reports through `emit`,
 * `answer` settles a permission the provider raised, `interrupt` stops a turn.
 * The events have one shape for every agent (`AgentEvent`).
 */

import { app, ipcMain, type BrowserWindow } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/* ------------------------------------------------------------------ *
 * The contract (mirrored in src/core/agent/types.ts)
 * ------------------------------------------------------------------ */

export type AgentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool'; id: string; name: string; input: Record<string, unknown> }

/** What a provider reports; the host adds `agent` and `chatId`. */
export type AgentEventBody =
  | { kind: 'session'; sessionId: string; model?: string }
  | { kind: 'assistant'; blocks: AgentBlock[] }
  | { kind: 'toolResult'; toolUseId: string; text: string; isError: boolean }
  | { kind: 'permission'; requestId: string; tool: string; input: Record<string, unknown>; blockedPath?: string; canRemember: boolean }
  | { kind: 'permissionSettled'; requestId: string }
  | { kind: 'result'; isError: boolean; text: string; costUsd?: number; durationMs?: number }
  | { kind: 'error'; message: string }
  | { kind: 'done' }

export type AgentEvent = AgentEventBody & { agent: string; chatId: string }

export interface AgentSendRequest {
  /** `<extension id>/<agent id>`. */
  agent: string
  chatId: string
  text: string
  cwd: string
  mode: string
  sessionId?: string
  /** The extension's settings as the user set them. */
  settings?: Record<string, string>
}

export interface AgentAnswer {
  agent: string
  requestId: string
  allow: boolean
  remember?: boolean
  message?: string
}

/** What an extension implements. */
export interface AgentProvider {
  send(request: { chatId: string; text: string; cwd: string; mode: string; sessionId?: string; settings: Record<string, string> }, emit: (event: AgentEventBody) => void): Promise<void>
  answer(reply: { requestId: string; allow: boolean; remember?: boolean; message?: string }): boolean | Promise<boolean>
  interrupt(chatId: string): void | Promise<void>
}

interface ExtensionContext {
  agents: { register(agentId: string, provider: AgentProvider): void }
  log(...args: unknown[]): void
  platform: NodeJS.Platform
}

interface ExtensionModule {
  activate?: (ctx: ExtensionContext) => void | (() => void | Promise<void>) | Promise<void | (() => void | Promise<void>)>
}

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

const EXTENSION_ID = /^ext\.[a-z0-9][a-z0-9._-]{0,63}$/
const AGENT_ID = /^[a-z][a-z0-9-]*$/
const HASH = /^[0-9a-f]{64}$/
const MAX_CODE_BYTES = 8 * 1024 * 1024

interface Active {
  agents: Set<string>
  dispose?: () => void | Promise<void>
}

const active = new Map<string, Active>()
const providers = new Map<string, AgentProvider>()
const running = new Set<string>()

const extensionsDir = () => path.join(app.getPath('userData'), 'extensions')
const codeDir = () => path.join(extensionsDir(), 'code')

function assertId(id: string) {
  if (typeof id !== 'string' || !EXTENSION_ID.test(id)) throw new Error(`Invalid extension id: ${id}`)
}

const sha256 = (data: string) => crypto.createHash('sha256').update(data, 'utf8').digest('hex')

/** The file's name carries the hash: a new version is a new URL, so `import()` never serves a stale module. */
const codeFile = (id: string, hash: string) => path.join(codeDir(), `${id}.${hash.slice(0, 16)}.mjs`)

/* ------------------------------------------------------------------ *
 * Loading
 * ------------------------------------------------------------------ */

async function deactivate(id: string) {
  const entry = active.get(id)
  if (!entry) return
  active.delete(id)
  for (const agentId of entry.agents) providers.delete(`${id}/${agentId}`)
  try {
    await entry.dispose?.()
  } catch (err) {
    console.error(`[lumen] ${id}: dispose failed:`, err)
  }
}

async function activate(id: string, file: string) {
  await deactivate(id)
  const mod = await import(/* @vite-ignore */ pathToFileURL(file).href) as ExtensionModule
  if (typeof mod.activate !== 'function') throw new Error(`${id} has no activate() function`)

  const entry: Active = { agents: new Set() }
  active.set(id, entry)
  const context: ExtensionContext = {
    agents: {
      register(agentId, provider) {
        if (!AGENT_ID.test(agentId)) throw new Error(`Invalid agent id: ${agentId}`)
        providers.set(`${id}/${agentId}`, provider)
        entry.agents.add(agentId)
      },
    },
    log: (...args) => console.log(`[${id}]`, ...args),
    platform: process.platform,
  }
  try {
    const dispose = await mod.activate(context)
    if (typeof dispose === 'function') entry.dispose = dispose
  } catch (err) {
    await deactivate(id)
    throw err
  }
}

/** Save approved code and run it. `hash` is what the user was shown. */
async function installCode(id: string, code: string, hash: string) {
  assertId(id)
  if (typeof code !== 'string' || !code) throw new Error('No code given')
  if (Buffer.byteLength(code) > MAX_CODE_BYTES) throw new Error('The code is too large')
  if (!HASH.test(hash) || sha256(code) !== hash) throw new Error('The code does not match the approved hash')

  await fs.mkdir(codeDir(), { recursive: true })
  const file = codeFile(id, hash)
  await fs.writeFile(file, code, 'utf8')
  await activate(id, file)
  await pruneCode(id, file)
}

/** Delete older versions of an extension's code. */
async function pruneCode(id: string, keep?: string) {
  const names = await fs.readdir(codeDir()).catch(() => [] as string[])
  for (const name of names) {
    if (!name.startsWith(`${id}.`) || !name.endsWith('.mjs')) continue
    const file = path.join(codeDir(), name)
    if (file !== keep) await fs.rm(file, { force: true })
  }
}

async function removeCode(id: string) {
  assertId(id)
  await deactivate(id)
  await pruneCode(id)
}

/** At startup: run every installed extension whose code still matches its approved hash. */
async function activateInstalled() {
  const names = await fs.readdir(extensionsDir()).catch(() => [] as string[])
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    try {
      const record = JSON.parse(await fs.readFile(path.join(extensionsDir(), name), 'utf8')) as { manifest?: { id?: string }; codeHash?: string }
      const id = record.manifest?.id
      const hash = record.codeHash
      if (!id || !hash || !EXTENSION_ID.test(id) || !HASH.test(hash)) continue
      const file = codeFile(id, hash)
      const code = await fs.readFile(file, 'utf8')
      if (sha256(code) !== hash) {
        console.error(`[lumen] ${id}: the code on disk does not match the approved hash — not started`)
        continue
      }
      await activate(id, file)
    } catch (err) {
      console.error(`[lumen] ${name}: could not start:`, (err as Error).message)
    }
  }
}

/* ------------------------------------------------------------------ *
 * Agents
 * ------------------------------------------------------------------ */

async function assertDirectory(cwd: string) {
  if (!path.isAbsolute(cwd)) throw new Error('Project folder must be an absolute path')
  const stat = await fs.stat(cwd).catch(() => null)
  if (!stat?.isDirectory()) throw new Error(`Not a folder: ${cwd}`)
}

function providerFor(agent: string): AgentProvider {
  const provider = providers.get(agent)
  if (!provider) throw new Error(`Agent not available: ${agent} — is the extension installed and running?`)
  return provider
}

async function sendTurn(request: AgentSendRequest, getWindow: () => BrowserWindow | null) {
  const { agent, chatId, text, cwd, mode, sessionId } = request
  const provider = providerFor(agent)
  if (typeof chatId !== 'string' || !chatId) throw new Error('Chat id missing')
  if (typeof text !== 'string' || !text.trim()) throw new Error('Message is empty')
  if (typeof mode !== 'string') throw new Error('Mode missing')
  const key = `${agent}:${chatId}`
  if (running.has(key)) throw new Error('The agent is still answering')
  await assertDirectory(cwd)

  const emit = (body: AgentEventBody) => {
    const win = getWindow()
    if (!win || win.isDestroyed()) return
    const event: AgentEvent = { ...body, agent, chatId }
    win.webContents.send('agent:event', event)
  }

  const settings: Record<string, string> = {}
  for (const [name, value] of Object.entries(request.settings ?? {})) {
    if (typeof value === 'string') settings[name] = value
  }

  running.add(key)
  void (async () => {
    try {
      await provider.send({ chatId, text, cwd, mode, sessionId, settings }, emit)
    } catch (err) {
      emit({ kind: 'error', message: (err as Error).message })
    } finally {
      running.delete(key)
      emit({ kind: 'done' })
    }
  })()
}

export function registerExtensionHostIpc(getWindow: () => BrowserWindow | null) {
  ipcMain.handle('extensions:code:install', (_e, id: string, code: string, hash: string) => installCode(id, code, hash))
  ipcMain.handle('extensions:code:remove', (_e, id: string) => removeCode(id))

  ipcMain.handle('agent:send', (_e, request: AgentSendRequest) => sendTurn(request, getWindow))
  ipcMain.handle('agent:answer', async (_e, reply: AgentAnswer) => {
    const { agent, ...rest } = reply
    return providerFor(agent).answer(rest)
  })
  ipcMain.handle('agent:interrupt', async (_e, agent: string, chatId: string) => {
    await providerFor(agent).interrupt(chatId)
  })

  void activateInstalled()
  app.on('before-quit', () => {
    for (const id of [...active.keys()]) void deactivate(id)
  })
}
