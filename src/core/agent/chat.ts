/**
 * The state of agent chats.
 *
 * An agent is whatever an extension's code registers — Lumen knows nothing
 * about which product is behind it. This file turns the events every agent
 * reports (`AgentEvent`) into a list of items the panel draws, and remembers
 * the answers to permission requests.
 *
 * It lives outside the panel on purpose: switching the sidebar to another view
 * unmounts the panel, but a running answer must not be lost with it.
 * One chat per agent and project.
 */

import { useStore } from '@/state/store'
import { t } from '@/i18n'
import { extensions } from '@/core/extensions/manager'
import type { ExtensionAgent } from '@/core/extensions/types'
import type { AgentEvent } from '../../../electron/features/extension-host'

export type ChatItem =
  | { id: number; role: 'user'; text: string; context?: string }
  | { id: number; role: 'assistant'; text: string }
  | { id: number; role: 'tool'; toolId: string; name: string; input: Record<string, unknown>; status: 'running' | 'done' | 'error'; output?: string }
  | { id: number; role: 'permission'; requestId: string; tool: string; input: Record<string, unknown>; blockedPath?: string; canRemember: boolean; state: 'pending' | 'allowed' | 'denied' }
  | { id: number; role: 'note'; text: string; error: boolean }

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never

/** An agent an installed extension offers. */
export interface AgentInfo {
  /** `<extension id>/<agent id>` — what the main process addresses it by. */
  key: string
  extensionId: string
  agent: ExtensionAgent
}

interface Chat {
  items: ChatItem[]
  running: boolean
  sessionId?: string
  sessionRoot: string | null
  mode: string | null
  includeFile: boolean
}

/** Tools that change a file: the file is opened once the tool has run. */
const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const CHAT_ID = 'main'

const listeners = new Set<() => void>()
const chats = new Map<string, Chat>()
let version = 0
let counter = 0
let started = false

function emit() {
  version++
  for (const fn of listeners) fn()
}

function chatOf(key: string): Chat {
  const known = chats.get(key)
  if (known) return known
  const fresh: Chat = { items: [], running: false, sessionRoot: null, mode: null, includeFile: true }
  chats.set(key, fresh)
  return fresh
}

function push(key: string, item: DistributiveOmit<ChatItem, 'id'>) {
  const chat = chatOf(key)
  chat.items = [...chat.items, { ...item, id: ++counter } as ChatItem]
  emit()
}

function patch(key: string, match: (item: ChatItem) => boolean, change: (item: ChatItem) => ChatItem) {
  const chat = chatOf(key)
  chat.items = chat.items.map((item) => (match(item) ? change(item) : item))
  emit()
}

const relativeTo = (root: string, file: string) => (file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file)

function onEvent(event: AgentEvent) {
  const key = event.agent
  const chat = chatOf(key)

  if (event.kind === 'session') {
    chat.sessionId = event.sessionId
    emit()
    return
  }

  if (event.kind === 'assistant') {
    for (const block of event.blocks) {
      if (block.type === 'text') push(key, { role: 'assistant', text: block.text })
      if (block.type === 'tool') push(key, { role: 'tool', toolId: block.id, name: block.name, input: block.input, status: 'running' })
    }
    return
  }

  if (event.kind === 'toolResult') {
    const tool = chat.items.find((item) => item.role === 'tool' && item.toolId === event.toolUseId)
    patch(
      key,
      (item) => item.role === 'tool' && item.toolId === event.toolUseId,
      (item) => ({ ...item, status: event.isError ? 'error' : 'done', output: event.text }) as ChatItem,
    )
    if (tool?.role !== 'tool' || event.isError || !FILE_TOOLS.has(tool.name)) return
    const file = tool.input.file_path ?? tool.input.notebook_path
    // Open what the agent touched; tabs that are open and unedited reload themselves.
    if (typeof file === 'string') void useStore.getState().openFile(file, true).catch(() => {})
    return
  }

  if (event.kind === 'permission') {
    push(key, { role: 'permission', requestId: event.requestId, tool: event.tool, input: event.input, blockedPath: event.blockedPath, canRemember: event.canRemember, state: 'pending' })
    return
  }

  if (event.kind === 'permissionSettled') {
    patch(key, (item) => item.role === 'permission' && item.requestId === event.requestId && item.state === 'pending', (item) => ({ ...item, state: 'denied' }) as ChatItem)
    return
  }

  if (event.kind === 'result') {
    if (event.isError) push(key, { role: 'note', text: event.text, error: true })
    return
  }

  if (event.kind === 'error') {
    push(key, { role: 'note', text: event.message, error: true })
    return
  }

  if (event.kind === 'done') {
    chat.running = false
    emit()
  }
}

export const agentChat = {
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  },
  getVersion: () => version,

  /** Every agent the installed extensions declare. */
  agents(): AgentInfo[] {
    return extensions.list().flatMap(({ manifest }) =>
      (manifest.agents ?? []).map((agent) => ({ key: `${manifest.id}/${agent.id}`, extensionId: manifest.id, agent })))
  },

  find: (key: string): AgentInfo | undefined => agentChat.agents().find((entry) => entry.key === key),

  items: (key: string) => chatOf(key).items,
  isRunning: (key: string) => chatOf(key).running,
  includeFile: (key: string) => chatOf(key).includeFile,

  /** The chosen mode; before any choice, the agent's first one. */
  mode(key: string): string {
    return chatOf(key).mode ?? agentChat.find(key)?.agent.modes?.[0]?.id ?? ''
  },

  /** Once at startup, so events are never missed while the panel is closed. */
  init() {
    if (started) return
    started = true
    window.lumen.agent.onEvent(onEvent)
  },

  setMode(key: string, mode: string) {
    chatOf(key).mode = mode
    emit()
  },

  setIncludeFile(key: string, value: boolean) {
    chatOf(key).includeFile = value
    emit()
  },

  /** A fresh conversation. */
  reset(key: string) {
    const chat = chatOf(key)
    if (chat.running) return
    chat.items = []
    chat.sessionId = undefined
    emit()
  },

  async send(key: string, text: string) {
    const state = useStore.getState()
    const root = state.workspace
    const chat = chatOf(key)
    const info = agentChat.find(key)
    const message = text.trim()
    if (!message || chat.running || !info) return
    if (!root) {
      push(key, { role: 'note', text: t('agent.noProject'), error: true })
      return
    }
    // Another project is another conversation.
    if (chat.sessionRoot !== root) {
      chat.sessionId = undefined
      chat.sessionRoot = root
    }

    const tab = state.activeTab()
    const file = chat.includeFile && tab?.path && !tab.virtual ? relativeTo(root, tab.path) : undefined
    const line = state.cursor.line + 1
    const prompt = file ? `[The user has ${file} open, cursor at line ${line}.]\n\n${message}` : message

    push(key, { role: 'user', text: message, context: file ? `${file}:${line}` : undefined })
    chat.running = true
    emit()
    try {
      await window.lumen.agent.send({
        agent: key,
        chatId: CHAT_ID,
        text: prompt,
        cwd: root,
        mode: agentChat.mode(key),
        sessionId: chat.sessionId,
        settings: state.extensionSettings[info.extensionId],
      })
    } catch (err) {
      chat.running = false
      push(key, { role: 'note', text: (err as Error).message, error: true })
    }
  },

  async interrupt(key: string) {
    await window.lumen.agent.interrupt(key, CHAT_ID)
  },

  async answer(key: string, requestId: string, allow: boolean, remember = false) {
    patch(key, (item) => item.role === 'permission' && item.requestId === requestId, (item) => ({ ...item, state: allow ? 'allowed' : 'denied' }) as ChatItem)
    await window.lumen.agent.answer({ agent: key, requestId, allow, remember })
  },
}
