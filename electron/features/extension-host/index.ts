/**
 * Running the program code of extensions.
 *
 * Most extensions are data. One that needs logic — an AI agent talking to its
 * SDK, a Git panel running `git` — ships one bundled ES module (`code.main` in
 * its manifest). That module runs here, in the main process, **with the rights
 * of Lumen itself**. Three things stand between a foreign server and that:
 *
 *   1. The renderer asks the user before saving the code, naming the risk,
 *      and pins the SHA-256 of what was shown.
 *   2. The main process hashes the code again and refuses on a mismatch.
 *   3. At startup the file is hashed once more against the hash stored in the
 *      installed record — a file changed on disk afterwards does not run.
 *
 * The module exports `activate(ctx)`. What `ctx` offers is built in
 * `context.ts`; the shapes that cross into the interface are in
 * `contract.ts`.
 */

import { app, ipcMain, type BrowserWindow } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createContext, type ExtensionContext } from './context'
import { agents } from './agents'
import { contributions } from './contributions'
import { services } from './services'
import type { AgentAnswer, AgentSendRequest, HostEvent, ViewActionEvent } from './contract'
import { codeHashInput, type CodeParts } from './code-hash'
import { fitsApp } from '../../../src/core/extensions/compat'

export type * from './contract'

interface ExtensionModule {
  activate?: (ctx: ExtensionContext) => void | (() => void | Promise<void>) | Promise<void | (() => void | Promise<void>)>
}

const EXTENSION_ID = /^ext\.[a-z0-9][a-z0-9._-]{0,63}$/
const HASH = /^[0-9a-f]{64}$/
const MAX_CODE_BYTES = 8 * 1024 * 1024

interface Active {
  dispose: (() => void | Promise<void>)[]
}

const active = new Map<string, Active>()

const extensionsDir = () => path.join(app.getPath('userData'), 'extensions')
const codeDir = () => path.join(extensionsDir(), 'code')

function assertId(id: string) {
  if (typeof id !== 'string' || !EXTENSION_ID.test(id)) throw new Error(`Invalid extension id: ${id}`)
}

const sha256 = (data: string) => crypto.createHash('sha256').update(data, 'utf8').digest('hex')

/** The file's name carries the hash: a new version is a new URL, so `import()` never serves a stale module. */
const codeFile = (id: string, hash: string) => path.join(codeDir(), `${id}.${hash.slice(0, 16)}.mjs`)

/** The window's part of the code (`code.renderer`), handed out by `extensions:code:renderer`. */
const rendererFile = (id: string, hash: string) => path.join(codeDir(), `${id}.${hash.slice(0, 16)}.renderer.mjs`)

/** Both parts as stored for an approved hash — `null` when they no longer match it. */
async function readVerified(id: string, hash: string): Promise<CodeParts | null> {
  const main = await fs.readFile(codeFile(id, hash), 'utf8').catch(() => undefined)
  const renderer = await fs.readFile(rendererFile(id, hash), 'utf8').catch(() => undefined)
  if (main === undefined && renderer === undefined) return null
  if (sha256(codeHashInput({ main, renderer })) !== hash) return null
  return { main, renderer }
}

/** A manifest's code as the renderer passes it — older windows send the main module alone. */
function codeParts(code: CodeParts | string): CodeParts {
  if (typeof code === 'string') return { main: code }
  return {
    main: typeof code?.main === 'string' && code.main ? code.main : undefined,
    renderer: typeof code?.renderer === 'string' && code.renderer ? code.renderer : undefined,
  }
}

/* ------------------------------------------------------------------ *
 * Loading
 * ------------------------------------------------------------------ */

async function deactivate(id: string) {
  const entry = active.get(id)
  if (!entry) return
  active.delete(id)
  for (const dispose of entry.dispose.reverse()) {
    try {
      await dispose()
    } catch (err) {
      console.error(`[lumen] ${id}: dispose failed:`, err)
    }
  }
  agents.removeExtension(id)
  contributions.removeExtension(id)
  services.removeExtension(id)
}

async function activate(id: string, file: string) {
  await deactivate(id)
  const mod = await import(/* @vite-ignore */ pathToFileURL(file).href) as ExtensionModule
  if (typeof mod.activate !== 'function') throw new Error(`${id} has no activate() function`)

  // `ctx.storage.get` answers synchronously, so the stored state is read first.
  await services.loadState(id)
  const entry: Active = { dispose: [] }
  active.set(id, entry)
  const context = createContext(id, (fn) => entry.dispose.push(fn))
  try {
    const dispose = await mod.activate(context)
    if (typeof dispose === 'function') entry.dispose.push(dispose)
  } catch (err) {
    await deactivate(id)
    throw err
  }
}

/** Save approved code and run its main part. `hash` is what the user was shown. */
async function installCode(id: string, raw: CodeParts | string, hash: string) {
  assertId(id)
  const code = codeParts(raw)
  if (!code.main && !code.renderer) throw new Error('No code given')
  if (Buffer.byteLength(`${code.main ?? ''}${code.renderer ?? ''}`) > MAX_CODE_BYTES) throw new Error('The code is too large')
  if (!HASH.test(hash) || sha256(codeHashInput(code)) !== hash) throw new Error('The code does not match the approved hash')

  await fs.mkdir(codeDir(), { recursive: true })
  const keep: string[] = []
  if (code.renderer) {
    keep.push(rendererFile(id, hash))
    await fs.writeFile(rendererFile(id, hash), code.renderer, 'utf8')
  }
  if (!code.main) {
    await deactivate(id)
    await pruneCode(id, keep)
    return
  }
  const file = codeFile(id, hash)
  keep.push(file)
  await fs.writeFile(file, code.main, 'utf8')
  await activate(id, file)
  await pruneCode(id, keep)
}

/** Delete older versions of an extension's code. */
async function pruneCode(id: string, keep: string[] = []) {
  const names = await fs.readdir(codeDir()).catch(() => [] as string[])
  for (const name of names) {
    if (!name.startsWith(`${id}.`) || !name.endsWith('.mjs')) continue
    const file = path.join(codeDir(), name)
    if (!keep.includes(file)) await fs.rm(file, { force: true })
  }
}

async function removeCode(id: string) {
  assertId(id)
  await deactivate(id)
  await pruneCode(id)
  await services.forget(id)
}

/** Start one installed extension from its record, when its code still matches the approved hash. */
async function activateRecord(name: string) {
  const record = JSON.parse(await fs.readFile(path.join(extensionsDir(), name), 'utf8')) as { manifest?: { id?: string; minAppVersion?: string }; codeHash?: string }
  const id = record.manifest?.id
  if (!fitsApp(record.manifest?.minAppVersion, app.getVersion())) {
    console.warn(`[lumen] ${id}: needs Lumen ${record.manifest?.minAppVersion} — not started`)
    return
  }
  const hash = record.codeHash
  if (!id || !hash || !EXTENSION_ID.test(id) || !HASH.test(hash)) return
  const code = await readVerified(id, hash)
  if (!code) {
    console.error(`[lumen] ${id}: the code on disk does not match the approved hash — not started`)
    return
  }
  if (!code.main) return
  await activate(id, codeFile(id, hash))
}

/** The verified window part of an installed extension's code, or `null`. */
async function rendererCode(id: string): Promise<string | null> {
  assertId(id)
  const record = JSON.parse(await fs.readFile(path.join(extensionsDir(), `${id}.json`), 'utf8')) as { codeHash?: string }
  if (!record.codeHash || !HASH.test(record.codeHash)) return null
  const code = await readVerified(id, record.codeHash)
  return code?.renderer ?? null
}

/** At startup: run every installed extension whose code still matches its approved hash. */
async function activateInstalled() {
  const names = await fs.readdir(extensionsDir()).catch(() => [] as string[])
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    await activateRecord(name).catch((err: Error) => {
      console.error(`[lumen] ${name}: could not start:`, err.message)
    })
  }
}

/* ------------------------------------------------------------------ *
 * IPC
 * ------------------------------------------------------------------ */

export function registerExtensionHostIpc(getWindow: () => BrowserWindow | null) {
  services.attach(getWindow)
  agents.attach(getWindow)

  ipcMain.handle('extensions:code:install', (_e, id: string, code: CodeParts | string, hash: string) => installCode(id, code, hash))
  ipcMain.handle('extensions:code:renderer', (_e, id: string) => rendererCode(id).catch(() => null))
  ipcMain.handle('extensions:code:remove', (_e, id: string) => removeCode(id))
  ipcMain.handle('extensions:running', () => [...active.keys()])

  ipcMain.handle('agent:send', (e, request: AgentSendRequest) => agents.send(request, e.sender))
  ipcMain.handle('agent:answer', (_e, reply: AgentAnswer) => agents.answer(reply))
  ipcMain.handle('agent:interrupt', (_e, agent: string, chatId: string) => agents.interrupt(agent, chatId))
  ipcMain.handle('agent:models', (_e, agent: string, settings?: Record<string, string>, refresh?: boolean) =>
    agents.models(agent, settings, refresh))
  ipcMain.handle('agent:sessions', (_e, agent: string, cwd: string) => agents.sessions(agent, cwd))

  ipcMain.handle('extensions:view:render', (_e, extensionId: string, viewId: string, instance?: string) =>
    contributions.render(extensionId, viewId, instance))
  ipcMain.handle('extensions:view:action', (_e, extensionId: string, viewId: string, event: ViewActionEvent) =>
    contributions.action(extensionId, viewId, event))
  ipcMain.handle('extensions:command', (_e, extensionId: string, commandId: string, args?: unknown) =>
    contributions.runCommand(extensionId, commandId, args))
  ipcMain.handle('extensions:status', () => contributions.statusItems())

  ipcMain.handle('extensions:settings', (_e, extensionId: string, values: Record<string, string>) =>
    services.setSettings(extensionId, values))
  ipcMain.handle('extensions:secret:set', (_e, extensionId: string, key: string, value: string) =>
    services.setSecret(extensionId, key, value))
  ipcMain.handle('extensions:secret:has', (_e, extensionId: string, key: string) => services.hasSecret(extensionId, key))
  ipcMain.handle('extensions:ui:answer', (_e, requestId: string, answer: unknown) => services.answer(requestId, answer))
  ipcMain.handle('extensions:event', (_e, event: HostEvent) => services.dispatch(event))

  void activateInstalled()
  app.on('before-quit', () => {
    for (const id of [...active.keys()]) void deactivate(id)
  })
}
