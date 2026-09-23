/**
 * Agents from extensions: listen for their events from startup, give each one
 * a view (a chat, docked on the right unless the extension says otherwise) and
 * a command that opens it.
 */

import { createElement } from 'react'
import { Sparkles } from 'lucide-react'
import { useStore } from '@/state/store'
import { registerCommandProvider } from '@/core/commands'
import { agentChat } from '@/core/agent/chat'
import { extensions } from '@/core/extensions/manager'
import { viewRegistry, type ViewDef } from '@/core/views'
import { namedIcon } from '@/components/ui/named-icons'
import { AgentPanel } from '@/components/panels/AgentPanel'
import type { Command } from '@/core/types'

let started = false

function commands(): Command[] {
  return agentChat.agents().map(({ key, agent }) => ({
    id: `agent.${key}`,
    title: agent.name,
    category: agent.name,
    run: () => useStore.getState().showView(`agent:${key}`),
  }))
}

function syncViews() {
  const views: ViewDef[] = agentChat.agents().map(({ key, extensionId, agent }, index) => ({
    id: `agent:${key}`,
    title: () => agent.name,
    icon: agent.icon && agent.icon.length > 2 ? namedIcon(agent.icon) : Sparkles,
    defaultDock: agent.location ?? 'right',
    order: 200 + index,
    command: `agent.${key}`,
    source: () => extensions.get(extensionId)?.manifest.name,
    render: () => createElement(AgentPanel, { key, agentKey: key }),
  }))
  viewRegistry.sync('agent:', views)
}

export function init() {
  if (started) return
  started = true
  agentChat.init()
  registerCommandProvider(commands)
  syncViews()
  extensions.subscribe(syncViews)
}
