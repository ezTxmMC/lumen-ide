/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The preload bridge for extension code: agents, views, commands, the status bar and questions. */

import { invoke, subscribe } from './ipc';
import type {
  AgentAnswer, AgentEvent, AgentModel, AgentSendRequest, HostEvent, StatusItem, UiMessage, UiRequest, ViewActionEvent, ViewContent,
} from './extension-host/contract';

export const agentApi = {
  /** Starts a turn; everything else arrives through `onEvent`. */
  send: (request: AgentSendRequest): Promise<void> => invoke('agent:send', request),
  answer: (reply: AgentAnswer): Promise<boolean> => invoke('agent:answer', reply),
  interrupt: (agent: string, chatId: string): Promise<void> => invoke('agent:interrupt', agent, chatId),
  /** Earlier conversations of this agent in the folder, when the agent keeps any. */
  sessions: (agent: string, cwd: string): Promise<{ id: string; title: string; updatedAt?: number; }[]> =>
    invoke('agent:sessions', agent, cwd),
  /** Models the agent reports itself, on top of those its manifest lists; `refresh` skips the agent's cache. */
  models: (agent: string, settings?: Record<string, string>, refresh = false): Promise<AgentModel[]> =>
    invoke('agent:models', agent, settings, refresh),
  onEvent: (cb: (event: AgentEvent) => void) => subscribe('agent:event', cb),
};

export const extensionHostApi = {
  /** Ids of the extensions whose code is running. */
  running: (): Promise<string[]> => invoke('extensions:running'),
  renderView: (extensionId: string, viewId: string, instance?: string): Promise<ViewContent> =>
    invoke('extensions:view:render', extensionId, viewId, instance),
  viewAction: (extensionId: string, viewId: string, event: ViewActionEvent): Promise<unknown> =>
    invoke('extensions:view:action', extensionId, viewId, event),
  onViewChanged: (cb: (p: { extensionId: string; viewId: string; instance?: string; }) => void) => subscribe('extensions:view:changed', cb),
  runCommand: (extensionId: string, commandId: string, args?: unknown): Promise<unknown> =>
    invoke('extensions:command', extensionId, commandId, args),
  statusItems: (): Promise<(StatusItem & { extensionId: string; id: string; })[]> => invoke('extensions:status'),
  onStatusChanged: (cb: () => void) => subscribe('extensions:status:changed', cb),
  setSettings: (extensionId: string, values: Record<string, string>): Promise<void> =>
    invoke('extensions:settings', extensionId, values),
  setSecret: (extensionId: string, key: string, value: string): Promise<void> =>
    invoke('extensions:secret:set', extensionId, key, value),
  hasSecret: (extensionId: string, key: string): Promise<boolean> => invoke('extensions:secret:has', extensionId, key),
  onUi: (cb: (message: UiMessage & { extensionId: string; }) => void) => subscribe('extensions:ui', cb),
  onUiRequest: (cb: (request: UiRequest & { requestId: string; extensionId: string; }) => void) =>
    subscribe('extensions:ui:request', cb),
  answer: (requestId: string, answer: unknown): Promise<boolean> => invoke('extensions:ui:answer', requestId, answer),
  emit: (event: HostEvent): Promise<void> => invoke('extensions:event', event),
};
