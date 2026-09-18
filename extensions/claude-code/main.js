/**
 * Claude Code as an agent in Lumen.
 *
 * Lumen loads this bundle into its main process (after the user approved it)
 * and calls `activate`. The Agent SDK runs the same engine as the `claude`
 * command, so the user's login, `CLAUDE.md`, settings and MCP servers apply.
 * Every tool the agent wants to use waits for the user's answer in the panel.
 *
 * The SDK starts the installed `claude` program; this bundle does not carry it.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { query } from '@anthropic-ai/claude-agent-sdk'

const MODES = new Set(['default', 'acceptEdits', 'plan'])
const RESULT_LIMIT = 4000

/** Runs by chat id: the running query and the way to stop it. */
const runs = new Map()
/** Permission requests waiting for an answer, by request id. */
const pending = new Map()
let requestCounter = 0

function clip(text) {
  if (text.length <= RESULT_LIMIT) return text
  return `${text.slice(0, RESULT_LIMIT)}\n… (${text.length - RESULT_LIMIT} more characters)`
}

/** A tool result's content is a string or a list of blocks — flatten it to text. */
function resultText(content) {
  if (typeof content === 'string') return clip(content)
  if (!Array.isArray(content)) return ''
  return clip(content.map((block) => (block.type === 'text' ? block.text ?? '' : `[${block.type ?? 'unknown'}]`)).join('\n'))
}

/** The SDK's messages, in the shape every Lumen agent reports. */
function translate(message) {
  if (message.type === 'system' && message.subtype === 'init') {
    return [{ kind: 'session', sessionId: message.session_id, model: message.model }]
  }

  if (message.type === 'assistant') {
    const blocks = []
    for (const block of message.message.content) {
      if (block.type === 'text' && block.text.trim()) blocks.push({ type: 'text', text: block.text })
      if (block.type === 'tool_use') blocks.push({ type: 'tool', id: block.id, name: block.name, input: block.input ?? {} })
    }
    if (!blocks.length) return []
    return [{ kind: 'assistant', blocks }]
  }

  if (message.type === 'user') {
    const content = message.message.content
    if (!Array.isArray(content)) return []
    return content
      .filter((block) => block.type === 'tool_result')
      .map((block) => ({ kind: 'toolResult', toolUseId: block.tool_use_id, text: resultText(block.content), isError: block.is_error === true }))
  }

  if (message.type === 'result') {
    const text = message.subtype === 'success' ? message.result : message.errors?.join('\n') ?? message.subtype
    return [{ kind: 'result', isError: message.is_error, text, costUsd: message.total_cost_usd, durationMs: message.duration_ms }]
  }

  return []
}

/** The `claude` program: the path from the settings, or the first one found. */
function findClaude(configured) {
  const name = process.platform === 'win32' ? 'claude.exe' : 'claude'
  if (configured && configured !== 'claude') {
    if (!fs.existsSync(configured)) throw new Error(`claude not found at ${configured}`)
    return configured
  }
  // A desktop launcher often starts Lumen with a short PATH, so the usual homes come along.
  const home = os.homedir()
  const folders = [
    ...(process.env.PATH ?? '').split(path.delimiter),
    path.join(home, '.local', 'bin'),
    path.join(home, '.claude', 'local'),
    path.join(home, '.npm-global', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
  ]
  for (const folder of folders.filter(Boolean)) {
    const candidate = path.join(folder, name)
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error('Claude Code is not installed. Install it (npm install -g @anthropic-ai/claude-code) or set the path under Settings → Extensions.')
}

const provider = {
  async send(request, emit) {
    const { chatId, text, cwd, mode, sessionId, settings } = request
    if (!MODES.has(mode)) throw new Error(`Unknown mode: ${mode}`)
    if (runs.has(chatId)) throw new Error('Claude is still answering')
    const executable = findClaude(settings.claudePath)

    const abort = new AbortController()
    const canUseTool = (tool, input, options) => new Promise((resolve) => {
      const requestId = `perm-${++requestCounter}`
      const suggestions = options.suggestions ?? []
      pending.set(requestId, { chatId, suggestions, resolve })
      options.signal.addEventListener('abort', () => {
        if (!pending.delete(requestId)) return
        resolve({ behavior: 'deny', message: 'Cancelled' })
        emit({ kind: 'permissionSettled', requestId })
      }, { once: true })
      emit({ kind: 'permission', requestId, tool, input, blockedPath: options.blockedPath, canRemember: suggestions.length > 0 })
    })

    const stream = query({
      prompt: text,
      options: {
        cwd,
        abortController: abort,
        permissionMode: mode,
        canUseTool,
        resume: sessionId,
        pathToClaudeCodeExecutable: executable,
        // Behave as `claude` does in a terminal: CLAUDE.md, the user's and the project's settings apply.
        systemPrompt: { type: 'preset', preset: 'claude_code' },
        settingSources: ['user', 'project', 'local'],
      },
    })
    runs.set(chatId, abort)
    try {
      for await (const message of stream) {
        for (const event of translate(message)) emit(event)
      }
    } catch (err) {
      if (!abort.signal.aborted) throw err
    } finally {
      settle(chatId)
      runs.delete(chatId)
    }
  },

  answer({ requestId, allow, remember, message }) {
    const entry = pending.get(requestId)
    if (!entry) return false
    pending.delete(requestId)
    if (!allow) {
      entry.resolve({ behavior: 'deny', message: message?.trim() || 'The user denied this action' })
      return true
    }
    entry.resolve({ behavior: 'allow', updatedPermissions: remember ? entry.suggestions : undefined })
    return true
  },

  interrupt(chatId) {
    const abort = runs.get(chatId)
    if (!abort) return
    settle(chatId)
    abort.abort()
  },
}

/** Deny whatever still waits for an answer in this chat. */
function settle(chatId) {
  for (const [id, entry] of pending) {
    if (entry.chatId !== chatId) continue
    entry.resolve({ behavior: 'deny', message: 'Stopped by the user', interrupt: true })
    pending.delete(id)
  }
}

export function activate(ctx) {
  ctx.agents.register('claude', provider)
  return () => {
    for (const abort of runs.values()) abort.abort()
  }
}
