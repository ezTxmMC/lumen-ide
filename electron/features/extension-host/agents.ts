/**
 * Chat agents extensions register.
 *
 * An agent is a provider: `send` runs one turn and reports through `emit`,
 * `answer` settles a permission the provider raised, `interrupt` stops a turn.
 * The events have one shape for every agent (`AgentEvent`) — Lumen knows no
 * product names and no protocol.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import type { BrowserWindow, WebContents } from 'electron'
import type { AgentAnswer, AgentEvent, AgentEventBody, AgentModel, AgentProvider, AgentSendRequest } from './contract'

const AGENT_ID = /^[a-z][a-z0-9-]*$/
const MAX_ATTACHMENTS = 12
const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024
const MAX_MODELS = 64
const MAX_EFFORTS = 12

const providers = new Map<string, AgentProvider>()
const running = new Set<string>()
let getWindow: () => BrowserWindow | null = () => null

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

/** Keep only well-formed attachments of reasonable size. */
function cleanAttachments(request: AgentSendRequest) {
  const list = Array.isArray(request.attachments) ? request.attachments.slice(0, MAX_ATTACHMENTS) : []
  return list.filter((entry) => {
    if (!entry || typeof entry.name !== 'string') return false
    if (entry.path !== undefined && (typeof entry.path !== 'string' || !path.isAbsolute(entry.path))) return false
    if (entry.data !== undefined && (typeof entry.data !== 'string' || entry.data.length > MAX_ATTACHMENT_BYTES * 1.4)) return false
    return Boolean(entry.path || entry.data)
  })
}

/** Only strings; anything else from the renderer is dropped. */
function cleanSettings(values: unknown): Record<string, string> {
  const settings: Record<string, string> = {}
  if (!values || typeof values !== 'object') return settings
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === 'string') settings[name] = value
  }
  return settings
}

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined)

/** A provider's model list, reduced to well-formed entries. */
function cleanModels(list: unknown): AgentModel[] {
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const models: AgentModel[] = []
  for (const entry of list.slice(0, MAX_MODELS)) {
    const id = text(entry?.id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const efforts = Array.isArray(entry.efforts)
      ? entry.efforts.slice(0, MAX_EFFORTS).filter((effort: unknown) => text((effort as { id?: unknown })?.id))
        .map((effort: { id: string; label?: unknown; description?: unknown }) => ({
          id: effort.id, label: text(effort.label), description: text(effort.description),
        }))
      : undefined
    models.push({
      id,
      label: text(entry.label) ?? id,
      description: text(entry.description),
      efforts,
      defaultEffort: text(entry.defaultEffort),
      isDefault: entry.isDefault === true,
    })
  }
  return models
}

export const agents = {
  attach(windowGetter: () => BrowserWindow | null) {
    getWindow = windowGetter
  },

  register(extensionId: string, agentId: string, provider: AgentProvider) {
    if (!AGENT_ID.test(agentId)) throw new Error(`Invalid agent id: ${agentId}`)
    providers.set(`${extensionId}/${agentId}`, provider)
  },

  removeExtension(extensionId: string) {
    for (const key of [...providers.keys()]) {
      if (key.startsWith(`${extensionId}/`)) providers.delete(key)
    }
  },

  /** `owner`: the window that asked — the turn's events go back there, not to whichever window has focus. */
  async send(request: AgentSendRequest, owner?: WebContents) {
    const { agent, chatId, text: message, cwd, mode, sessionId, model, effort } = request
    const provider = providerFor(agent)
    if (typeof chatId !== 'string' || !chatId) throw new Error('Chat id missing')
    if (typeof message !== 'string' || !message.trim()) throw new Error('Message is empty')
    if (typeof mode !== 'string') throw new Error('Mode missing')
    const key = `${agent}:${chatId}`
    if (running.has(key)) throw new Error('The agent is still answering')
    await assertDirectory(cwd)

    const emit = (body: AgentEventBody) => {
      const target = owner && !owner.isDestroyed() ? owner : getWindow()?.webContents
      if (!target || target.isDestroyed()) return
      const event: AgentEvent = { ...body, agent, chatId }
      target.send('agent:event', event)
    }

    const settings = cleanSettings(request.settings)

    running.add(key)
    void (async () => {
      try {
        await provider.send({
          chatId, text: message, cwd, mode, sessionId,
          model: text(model),
          effort: text(effort),
          attachments: cleanAttachments(request),
          settings,
        }, emit)
      } catch (err) {
        emit({ kind: 'error', message: (err as Error).message })
      } finally {
        running.delete(key)
        emit({ kind: 'done' })
      }
    })()
  },

  async answer(reply: AgentAnswer) {
    const { agent, ...rest } = reply
    return providerFor(agent).answer(rest)
  },

  async interrupt(agent: string, chatId: string) {
    await providerFor(agent).interrupt(chatId)
  },

  async models(agent: string, settings?: unknown, refresh = false) {
    const provider = providerFor(agent)
    if (!provider.models) return []
    return cleanModels(await provider.models({ settings: cleanSettings(settings), refresh: refresh === true }))
  },

  async sessions(agent: string, cwd: string) {
    const provider = providerFor(agent)
    if (!provider.sessions) return []
    await assertDirectory(cwd)
    return provider.sessions(cwd)
  },
}
