/** The preload bridge for extension code and the agents it registers. */

import { invoke, subscribe } from './ipc'
import type { AgentAnswer, AgentEvent, AgentSendRequest } from './extension-host'

export const agentApi = {
  /** Starts a turn; everything else arrives through `onEvent`. */
  send: (request: AgentSendRequest): Promise<void> => invoke('agent:send', request),
  answer: (reply: AgentAnswer): Promise<boolean> => invoke('agent:answer', reply),
  interrupt: (agent: string, chatId: string): Promise<void> => invoke('agent:interrupt', agent, chatId),
  onEvent: (cb: (event: AgentEvent) => void) => subscribe('agent:event', cb),
}
