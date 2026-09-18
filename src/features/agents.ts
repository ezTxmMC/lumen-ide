/** Agents from extensions: listen for their events from startup, register a command per agent. */

import { useStore } from '@/state/store'
import { registerCommandProvider } from '@/core/commands'
import { agentChat } from '@/core/agent/chat'
import type { Command } from '@/core/types'

let started = false

function commands(): Command[] {
  return agentChat.agents().map(({ key, agent }) => ({
    id: `agent.${key}`,
    title: agent.name,
    category: agent.name,
    run: () => useStore.getState().showSidebar(`agent:${key}`),
  }))
}

export function init() {
  if (started) return
  started = true
  agentChat.init()
  registerCommandProvider(commands)
}
