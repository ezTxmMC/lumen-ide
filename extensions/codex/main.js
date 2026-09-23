/**
 * ChatGPT Codex as an agent in Lumen.
 *
 * Lumen loads this bundle into its main process (after the user approved it)
 * and calls `activate`. Each message runs the installed `codex` program in its
 * non-interactive JSON mode — `codex exec --experimental-json`, the prompt on
 * standard input — exactly as OpenAI's own TypeScript SDK does, and turns the
 * JSON lines it prints into Lumen's agent events. A conversation continues
 * with `codex exec … resume <thread id>`.
 *
 * `codex exec` does not ask before acting: what Codex may do is set by the
 * sandbox. The panel's modes therefore are sandbox levels — read only, write
 * inside the project, or full access (which has to be allowed in the
 * settings first).
 *
 * The models come from Codex too: from the list it keeps in
 * `~/.codex/models_cache.json`, or — when that is missing or the user asks
 * for a fresh one — from `codex app-server` (`model/list`). Each model brings
 * the reasoning levels it supports, so the panel offers only those.
 *
 * This bundle does not carry the `codex` binary; it starts the one installed.
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'

const SANDBOXES = new Set(['read-only', 'workspace-write', 'danger-full-access'])
const APPROVALS = new Set(['never', 'on-request', 'on-failure', 'untrusted'])
const EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh'])
const SUMMARIES = new Set(['auto', 'concise', 'detailed', 'none'])
const VERBOSITIES = new Set(['low', 'medium', 'high'])
/** How long `codex app-server` may take to list its models. */
const MODELS_TIMEOUT = 20_000
const OUTPUT_LIMIT = 6000
const IMAGE_EXTENSIONS = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' }
/** How many recent session files the history looks through. */
const SESSION_SCAN_LIMIT = 300

/** Runs by chat id: the running process. */
const runs = new Map()
/** The last list `codex app-server` reported, per program and environment. */
let modelCache = { key: '', at: 0, list: [] }

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

const lines = (value) => String(value ?? '').split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)
const isOn = (value) => value === 'true'
const expandHome = (value) => value.replace(/^~(?=\/|$)/, os.homedir())
const codexHome = () => process.env.CODEX_HOME || path.join(os.homedir(), '.codex')

/** `KEY=VALUE` per line. */
function envFrom(value) {
  const env = {}
  for (const line of String(value ?? '').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (match) env[match[1]] = match[2]
  }
  return env
}

/** The `codex` program: the path from the settings, or the first one found. */
function findCodex(configured) {
  const name = process.platform === 'win32' ? 'codex.cmd' : 'codex'
  if (configured && configured !== 'codex') {
    if (!fs.existsSync(configured)) throw new Error(`codex not found at ${configured}`)
    return configured
  }
  // A desktop launcher often starts Lumen with a short PATH, so the usual homes come along.
  const home = os.homedir()
  const folders = [
    ...(process.env.PATH ?? '').split(path.delimiter),
    path.join(home, '.local', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.bun', 'bin'),
    path.join(home, '.cargo', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
  ]
  for (const folder of folders.filter(Boolean)) {
    const candidate = path.join(folder, name)
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error('Codex is not installed. Install it (npm install -g @openai/codex), sign in with `codex login`, or set its path under Settings → Extensions → ChatGPT Codex.')
}

/** The sandbox for this message; full access needs its own explicit setting. */
function sandboxFor(mode, settings) {
  if (!SANDBOXES.has(mode)) throw new Error(`Unknown mode: ${mode}`)
  if (mode === 'danger-full-access' && !isOn(settings.allowFullAccess)) {
    throw new Error('“Full access” is switched off. Enable it under Settings → Extensions → ChatGPT Codex first.')
  }
  return mode
}

const tomlString = (value) => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/** The reasoning effort for this message: the panel's choice, else the setting. */
function effortFor(request) {
  const effort = request.effort || request.settings.reasoningEffort
  if (!effort || effort === 'auto') return undefined
  if (!EFFORTS.has(effort)) throw new Error(`Unknown reasoning effort: ${effort}`)
  return effort
}

/** The command line, in the order the official SDK uses. */
function argsFor(request, images) {
  const { cwd, mode, sessionId, model, settings } = request
  const effort = effortFor(request)
  const args = ['exec', '--experimental-json']
  for (const override of lines(settings.configOverrides)) args.push('--config', override)
  const chosenModel = model || (settings.model !== 'auto' ? settings.model : '')
  if (chosenModel) args.push('--model', chosenModel)
  if (settings.profile) args.push('--config', `profile=${tomlString(settings.profile)}`)
  args.push('--sandbox', sandboxFor(mode, settings))
  args.push('--cd', cwd)
  for (const dir of lines(settings.additionalDirectories)) args.push('--add-dir', expandHome(dir))
  if (settings.skipGitRepoCheck !== 'false') args.push('--skip-git-repo-check')
  if (effort) args.push('--config', `model_reasoning_effort=${tomlString(effort)}`)
  if (SUMMARIES.has(settings.reasoningSummary)) args.push('--config', `model_reasoning_summary=${tomlString(settings.reasoningSummary)}`)
  if (VERBOSITIES.has(settings.verbosity)) args.push('--config', `model_verbosity=${tomlString(settings.verbosity)}`)
  if (settings.hideReasoning === 'true') args.push('--config', 'hide_agent_reasoning=true')
  if (settings.networkAccess === 'true' || settings.networkAccess === 'false') {
    args.push('--config', `sandbox_workspace_write.network_access=${settings.networkAccess}`)
  }
  if (settings.webSearch && settings.webSearch !== 'auto') args.push('--config', `web_search=${tomlString(settings.webSearch)}`)
  if (APPROVALS.has(settings.approvalPolicy)) args.push('--config', `approval_policy=${tomlString(settings.approvalPolicy)}`)
  if (sessionId) args.push('resume', sessionId)
  for (const image of images) args.push('--image', image)
  return args
}

/* ------------------------------------------------------------------ *
 * Attachments
 * ------------------------------------------------------------------ */

/** Pasted images go to temporary files — `codex` takes image paths. */
async function imageFiles(attachments = []) {
  const files = []
  let dir = null
  for (const entry of attachments) {
    if (entry.path && /\.(png|jpe?g|gif|webp)$/i.test(entry.path)) {
      files.push(entry.path)
      continue
    }
    const extension = IMAGE_EXTENSIONS[entry.mimeType]
    if (!entry.data || !extension) continue
    dir ??= await fsp.mkdtemp(path.join(os.tmpdir(), 'lumen-codex-'))
    const file = path.join(dir, `image-${files.length + 1}${extension}`)
    await fsp.writeFile(file, Buffer.from(entry.data, 'base64'))
    files.push(file)
  }
  return { files, cleanup: () => (dir ? fsp.rm(dir, { recursive: true, force: true }) : Promise.resolve()) }
}

/** Project files the user attached are named in the prompt. */
function promptWith(text, attachments = []) {
  const files = attachments.filter((entry) => entry.path && !/\.(png|jpe?g|gif|webp)$/i.test(entry.path))
  if (!files.length) return text
  return `${text}\n\nFiles: ${files.map((entry) => entry.path).join(', ')}`
}

/* ------------------------------------------------------------------ *
 * Translating Codex's events
 * ------------------------------------------------------------------ */

function clip(text) {
  const value = String(text ?? '')
  if (value.length <= OUTPUT_LIMIT) return value
  return `${value.slice(0, OUTPUT_LIMIT)}\n… (${value.length - OUTPUT_LIMIT} more characters)`
}

const CHANGE_TOOL = { add: 'Write', update: 'Edit', delete: 'Delete' }

/** An MCP result's content blocks as text. */
function mcpText(item) {
  if (item.error?.message) return item.error.message
  const content = Array.isArray(item.result?.content) ? item.result.content : []
  return clip(content.map((block) => (block.type === 'text' ? block.text : `[${block.type}]`)).join('\n'))
}

/** Codex's to-do list: the first open entry counts as the one in progress. */
function todosOf(item) {
  const entries = Array.isArray(item.items) ? item.items : []
  const current = entries.findIndex((entry) => !entry.completed)
  return entries.map((entry, index) => {
    if (entry.completed) return { text: entry.text, status: 'completed' }
    return { text: entry.text, status: index === current ? 'in_progress' : 'pending' }
  })
}

/** Events for an item that just started. */
function started(item) {
  if (item.type === 'command_execution') {
    return [{ kind: 'assistant', blocks: [{ type: 'tool', id: item.id, name: 'Shell', input: { command: item.command } }] }]
  }
  if (item.type === 'mcp_tool_call') {
    const input = item.arguments && typeof item.arguments === 'object' ? item.arguments : { arguments: item.arguments }
    return [{ kind: 'assistant', blocks: [{ type: 'tool', id: item.id, name: `${item.server}.${item.tool}`, input }] }]
  }
  if (item.type === 'web_search') {
    return [{ kind: 'assistant', blocks: [{ type: 'tool', id: item.id, name: 'WebSearch', input: { query: item.query } }] }]
  }
  if (item.type === 'todo_list') return [{ kind: 'todos', items: todosOf(item) }]
  return []
}

/** Events for an item that finished. */
function completed(item, cwd) {
  if (item.type === 'agent_message') return [{ kind: 'assistant', blocks: [{ type: 'text', text: item.text ?? '' }] }]
  if (item.type === 'reasoning') return [{ kind: 'assistant', blocks: [{ type: 'thinking', text: item.text ?? '' }] }]
  if (item.type === 'command_execution') {
    const failed = item.status === 'failed' || (typeof item.exit_code === 'number' && item.exit_code !== 0)
    return [{ kind: 'toolResult', toolUseId: item.id, text: clip(item.aggregated_output), isError: failed }]
  }
  if (item.type === 'file_change') {
    // One row per file, so each can be opened; the chat opens edited files itself.
    return (item.changes ?? []).flatMap((change, index) => {
      const id = `${item.id}-${index}`
      const file = path.isAbsolute(change.path) ? change.path : path.join(cwd, change.path)
      return [
        { kind: 'assistant', blocks: [{ type: 'tool', id, name: CHANGE_TOOL[change.kind] ?? 'Edit', input: { file_path: file } }] },
        { kind: 'toolResult', toolUseId: id, text: '', isError: item.status === 'failed' },
      ]
    })
  }
  if (item.type === 'mcp_tool_call') return [{ kind: 'toolResult', toolUseId: item.id, text: mcpText(item), isError: item.status === 'failed' }]
  if (item.type === 'web_search') return [{ kind: 'toolResult', toolUseId: item.id, text: '', isError: false }]
  if (item.type === 'todo_list') return [{ kind: 'todos', items: todosOf(item) }]
  if (item.type === 'error') return [{ kind: 'error', message: item.message }]
  return []
}

function usageOf(usage, startedAt) {
  return {
    inputTokens: usage?.input_tokens,
    outputTokens: (usage?.output_tokens ?? 0) + (usage?.reasoning_output_tokens ?? 0),
    cacheReadTokens: usage?.cached_input_tokens,
    cacheWriteTokens: usage?.cache_write_input_tokens,
    durationMs: Date.now() - startedAt,
  }
}

function translate(event, context) {
  if (event.type === 'thread.started') return [{ kind: 'session', sessionId: event.thread_id, model: context.model }]
  if (event.type === 'turn.started') return [{ kind: 'status', text: '' }]
  if (event.type === 'item.started') return started(event.item)
  if (event.type === 'item.updated' && event.item?.type === 'todo_list') return [{ kind: 'todos', items: todosOf(event.item) }]
  if (event.type === 'item.completed') return completed(event.item, context.cwd)
  if (event.type === 'turn.completed') return [{ kind: 'result', isError: false, text: '', usage: usageOf(event.usage, context.startedAt) }]
  if (event.type === 'turn.failed') {
    return [{ kind: 'result', isError: true, text: event.error?.message ?? 'The turn failed', usage: usageOf(null, context.startedAt) }]
  }
  if (event.type === 'error') return [{ kind: 'error', message: event.message }]
  return []
}

/* ------------------------------------------------------------------ *
 * Earlier sessions (~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl)
 * ------------------------------------------------------------------ */

async function rolloutFiles(root) {
  const found = []
  const walk = async (dir, depth) => {
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory() && depth < 3) await walk(full, depth + 1)
      if (entry.isFile() && entry.name.endsWith('.jsonl')) found.push(full)
    }
  }
  await walk(root, 0)
  // The file names carry the start time, so sorting them sorts by age.
  return found.sort((a, b) => path.basename(b).localeCompare(path.basename(a))).slice(0, SESSION_SCAN_LIMIT)
}

/** The text of the first real user message in a rollout line, if it is one. */
function userText(record) {
  const payload = record?.payload ?? record
  if (payload?.type === 'user_message' && typeof payload.message === 'string') return payload.message
  if (payload?.type !== 'message' || payload.role !== 'user' || !Array.isArray(payload.content)) return ''
  const text = payload.content.map((part) => part.text ?? '').join(' ').trim()
  // Codex puts the environment and AGENTS.md in front as user messages of their own.
  if (text.startsWith('<')) return ''
  return text
}

/** The session id, folder and first prompt of one rollout file. */
async function readRollout(file) {
  const stream = fs.createReadStream(file, { encoding: 'utf8', end: 256 * 1024 })
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity })
  const info = { id: '', cwd: '', title: '' }
  try {
    for await (const line of reader) {
      let record
      try {
        record = JSON.parse(line)
      } catch {
        continue
      }
      const payload = record?.payload ?? {}
      if (!info.id && (record?.type === 'session_meta' || payload.id) && typeof payload.id === 'string') {
        info.id = payload.id
        info.cwd = typeof payload.cwd === 'string' ? payload.cwd : ''
      }
      if (!info.title) info.title = userText(record)
      if (info.id && info.title) break
    }
  } finally {
    reader.close()
    stream.destroy()
  }
  return info
}

async function listSessions(cwd) {
  const root = path.join(codexHome(), 'sessions')
  const files = await rolloutFiles(root)
  const sessions = []
  for (const file of files) {
    const info = await readRollout(file).catch(() => null)
    if (!info?.id || path.resolve(info.cwd || '/') !== path.resolve(cwd)) continue
    const stat = await fsp.stat(file).catch(() => null)
    sessions.push({ id: info.id, title: (info.title || info.id).split('\n')[0].slice(0, 80), updatedAt: stat?.mtimeMs })
    if (sessions.length >= 40) break
  }
  return sessions.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

/* ------------------------------------------------------------------ *
 * Models
 * ------------------------------------------------------------------ */

/** A reasoning level as the cache (`{ effort }`) or the app server (`{ reasoningEffort }`) writes it. */
function effortOf(level) {
  if (typeof level === 'string') return { id: level }
  const id = level?.effort ?? level?.reasoningEffort ?? level?.reasoning_effort ?? level?.id
  if (typeof id !== 'string' || !id) return null
  return { id, description: level.description || undefined }
}

const effortsOf = (levels) => (Array.isArray(levels) ? levels.map(effortOf).filter(Boolean) : undefined)

/**
 * The models Codex itself offers: it keeps the list its servers gave it in
 * ~/.codex/models_cache.json. Hidden ones stay out, the best come first.
 */
async function modelsFromCache(includeHidden = false) {
  const content = await fsp.readFile(path.join(codexHome(), 'models_cache.json'), 'utf8').catch(() => '')
  if (!content) return []
  const cache = JSON.parse(content)
  return (Array.isArray(cache.models) ? cache.models : [])
    .filter((entry) => entry?.slug && (includeHidden || (entry.visibility ?? 'list') === 'list'))
    .sort((a, b) => (a.priority ?? 1e9) - (b.priority ?? 1e9))
    .map((entry) => ({
      id: entry.slug,
      label: entry.display_name || entry.slug,
      description: [entry.visibility === 'list' || !entry.visibility ? '' : 'Älteres Modell', entry.description].filter(Boolean).join(' — ') || undefined,
      efforts: effortsOf(entry.supported_reasoning_levels),
      defaultEffort: entry.default_reasoning_level || undefined,
    }))
}

/** One JSON-RPC conversation with `codex app-server` over its standard streams. */
function appServer(settings) {
  const child = spawn(findCodex(settings.codexPath), ['app-server'], {
    env: { ...process.env, ...envFrom(settings.env) },
    shell: process.platform === 'win32',
    windowsHide: true,
  })
  const waiting = new Map()
  let counter = 0
  const failAll = (err) => {
    for (const { reject } of waiting.values()) reject(err)
    waiting.clear()
  }
  child.once('error', failAll)
  child.once('close', (code) => failAll(new Error(`codex app-server exited with code ${code}`)))
  child.stdin.on('error', () => {})
  const reader = readline.createInterface({ input: child.stdout, crlfDelay: Infinity })
  reader.on('line', (line) => {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      return
    }
    const entry = waiting.get(message?.id)
    if (!entry) return
    waiting.delete(message.id)
    if (message.error) {
      entry.reject(new Error(message.error.message ?? 'codex app-server failed'))
      return
    }
    entry.resolve(message.result)
  })
  const write = (message) => child.stdin.write(`${JSON.stringify(message)}\n`)
  return {
    request(method, params) {
      const id = ++counter
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject })
        write({ id, method, params })
      })
    },
    notify: (method, params) => write(params ? { method, params } : { method }),
    close() {
      reader.close()
      child.stdin.end()
      child.kill('SIGTERM')
    },
  }
}

/** Ask the installed `codex` for its models (`model/list`, all pages). */
async function modelsFromCli(settings, includeHidden = false) {
  const server = appServer(settings)
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('codex did not report its models in time')), MODELS_TIMEOUT)
  })
  const ask = async () => {
    await server.request('initialize', { clientInfo: { name: 'lumen', title: 'Lumen', version: '1.0.0' } })
    server.notify('initialized')
    const rows = []
    let cursor
    for (let page = 0; page < 10; page++) {
      const result = await server.request('model/list', { ...(cursor ? { cursor } : {}), ...(includeHidden ? { includeHidden: true } : {}) })
      rows.push(...(result?.data ?? result?.models ?? result?.items ?? []))
      cursor = result?.nextCursor ?? result?.next_cursor
      if (!cursor) break
    }
    return rows
  }
  try {
    const rows = await Promise.race([ask(), timeout])
    return rows
      .filter((entry) => (entry?.model || entry?.id || entry?.slug) && (includeHidden || !entry.hidden))
      .map((entry) => ({
        id: entry.model || entry.id || entry.slug,
        label: entry.displayName || entry.display_name || entry.model || entry.id,
        description: [entry.hidden ? 'Älteres Modell' : '', entry.description].filter(Boolean).join(' — ') || undefined,
        efforts: effortsOf(entry.supportedReasoningEfforts ?? entry.supported_reasoning_levels),
        defaultEffort: entry.defaultReasoningEffort || entry.default_reasoning_level || undefined,
        isDefault: entry.isDefault === true,
      }))
  } finally {
    clearTimeout(timer)
    server.close()
  }
}

/** The `model = "…"` at the top of ~/.codex/config.toml — what Codex uses without `--model`. */
async function configuredModel() {
  const content = await fsp.readFile(path.join(codexHome(), 'config.toml'), 'utf8').catch(() => '')
  const top = content.split(/^\s*\[/m)[0]
  return /^\s*model\s*=\s*["']([^"']+)["']/m.exec(top)?.[1] ?? ''
}

/** Models the user adds by hand: `id` or `id | Label` per line. */
function extraModels(value) {
  return lines(value).map((line) => {
    const [id, label] = line.split('|').map((part) => part.trim())
    return { id, label: label || id, efforts: [...EFFORTS].map((effort) => ({ id: effort })) }
  })
}

/** From the source the settings name: the cache file, the CLI, or the cache with the CLI as fallback. */
async function freshModels(settings, refresh) {
  const source = settings.modelSource || 'auto'
  const legacy = settings.showLegacyModels === 'true'
  if (source === 'cache') return modelsFromCache(legacy)
  const key = JSON.stringify([settings.codexPath, settings.env, legacy])
  const minutes = Number(settings.modelCacheMinutes || 60)
  const fresh = modelCache.key === key && Date.now() - modelCache.at < Math.max(0, minutes) * 60_000
  if (source === 'auto' && !refresh) {
    const cached = await modelsFromCache(legacy).catch(() => [])
    if (cached.length) return cached
  }
  if (fresh && !refresh && modelCache.list.length) return modelCache.list
  try {
    const list = await modelsFromCli(settings, legacy)
    modelCache = { key, at: Date.now(), list }
    return list
  } catch (err) {
    if (source === 'cli') throw err
    console.warn('[codex] could not list models via codex app-server:', err.message)
    return modelsFromCache(legacy)
  }
}

async function listModels({ settings = {}, refresh = false } = {}) {
  const models = await freshModels(settings, refresh)
  if (!models.some((entry) => entry.isDefault)) {
    const configured = await configuredModel()
    const match = models.find((entry) => entry.id === configured)
    if (match) match.isDefault = true
  }
  const known = new Set(models.map((entry) => entry.id))
  return [...models, ...extraModels(settings.extraModels).filter((entry) => !known.has(entry.id))]
}

/* ------------------------------------------------------------------ *
 * The provider
 * ------------------------------------------------------------------ */

/** Run one turn: start `codex`, stream its JSON lines, report its exit. */
async function runTurn(request, emit) {
  const { chatId, text, cwd, attachments, settings } = request
  const executable = findCodex(settings.codexPath)
  const images = await imageFiles(attachments)
  const context = { cwd, model: request.model || settings.model || undefined, startedAt: Date.now() }
  const child = spawn(executable, argsFor(request, images.files), {
    cwd,
    env: { ...process.env, ...envFrom(settings.env) },
    shell: process.platform === 'win32',
    windowsHide: true,
  })
  const run = { child, stopped: false }
  runs.set(chatId, run)
  const stderr = []
  child.stderr?.on('data', (chunk) => stderr.push(chunk))
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  // A failed start is reported after the output is read; keep it from counting as unhandled until then.
  exited.catch(() => {})
  child.stdin?.end(promptWith(text, attachments))

  try {
    const reader = readline.createInterface({ input: child.stdout, crlfDelay: Infinity })
    for await (const line of reader) {
      let event
      try {
        event = JSON.parse(line)
      } catch {
        continue
      }
      for (const body of translate(event, context)) emit(body)
    }
    const { code, signal } = await exited
    if (run.stopped || (code === 0 && !signal)) return
    const detail = Buffer.concat(stderr).toString('utf8').trim().split('\n').slice(-12).join('\n')
    throw new Error(`codex exited with ${signal ? `signal ${signal}` : `code ${code}`}${detail ? `:\n${detail}` : ''}`)
  } finally {
    runs.delete(chatId)
    await images.cleanup().catch(() => {})
  }
}

const provider = {
  async send(request, emit) {
    if (runs.has(request.chatId)) throw new Error('Codex is still answering')
    await runTurn(request, emit)
  },

  /** `codex exec` never asks — there is nothing to answer. */
  answer() {
    return false
  },

  interrupt(chatId) {
    const run = runs.get(chatId)
    if (!run) return
    run.stopped = true
    run.child.kill('SIGTERM')
    setTimeout(() => {
      if (run.child.exitCode === null && run.child.signalCode === null) run.child.kill('SIGKILL')
    }, 3000)
  },

  sessions: (cwd) => listSessions(cwd),

  models: (options) => listModels(options).catch((err) => {
    console.warn('[codex] could not list models:', err.message)
    return extraModels(options?.settings?.extraModels)
  }),
}

export function activate(ctx) {
  ctx.agents.register('codex', provider)
  return () => {
    for (const run of runs.values()) {
      run.stopped = true
      run.child.kill('SIGTERM')
    }
  }
}
