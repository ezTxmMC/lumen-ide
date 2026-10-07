/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/**
 * Chat agents extensions register.
 *
 * An agent is a provider: `send` runs one turn and reports through `emit`,
 * `answer` settles a permission the provider raised, `interrupt` stops a turn.
 * The events have one shape for every agent (`AgentEvent`) — Lumen knows no
 * product names and no protocol.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { BrowserWindow, WebContents } from 'electron';
import type {
  AgentActionId, AgentActionRequest, AgentActionResult, AgentAnswer, AgentCheckpoint, AgentEvent, AgentEventBody, AgentModel, AgentProvider,
  AgentSendRequest,
} from './contract';
import { scanCommandLine } from '../security/security';

const AGENT_ID = /^[a-z][a-z0-9-]*$/;
const MAX_ATTACHMENTS = 12;
const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;
const MAX_MODELS = 64;
const MAX_EFFORTS = 12;
const MAX_SYSTEM_PROMPT = 20_000;
const MAX_CHECKPOINTS = 100;
const ACTIONS = new Set<AgentActionId>(['compact', 'rewind', 'fork', 'rename', 'delete', 'export']);

const providers = new Map<string, AgentProvider>();
const running = new Set<string>();
let getWindow: () => BrowserWindow | null = () => null;

async function assertDirectory(cwd: string) {
  if (!path.isAbsolute(cwd)) {
    throw new Error('Project folder must be an absolute path');
  }
  const stat = await fs.stat(cwd).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`Not a folder: ${cwd}`);
  }
}

function providerFor(agent: string): AgentProvider {
  const provider = providers.get(agent);
  if (!provider) {
    throw new Error(`Agent not available: ${agent} — is the extension installed and running?`);
  }
  return provider;
}

const SHELL_TOOLS = /^(?:bash|shell|sh|exec|run_command|execute_command|terminal|powershell|cmd)$/i;

/**
 * A permission card for a shell command carries the scanner's verdict: whoever
 * decides should not have to recognise `curl … | sh` in a long command line on
 * their own. The agent's own reason, if any, stays.
 */
function annotatePermission(body: AgentEventBody): AgentEventBody {
  if (body.kind !== 'permission' || !SHELL_TOOLS.test(body.tool)) {
    return body;
  }
  const command = body.input?.command ?? body.input?.cmd;
  if (typeof command !== 'string') {
    return body;
  }
  const worst = scanCommandLine(command).findings.find((finding) => finding.severity === 'critical' || finding.severity === 'high');
  if (!worst) {
    return body;
  }
  const warning = `Security scanner: ${worst.title} (${worst.id}) — ${worst.message}`;
  return { ...body, reason: body.reason ? `${warning}\n${body.reason}` : warning };
}

/** Keep only well-formed attachments of reasonable size. */
function cleanAttachments(request: AgentSendRequest) {
  const list = Array.isArray(request.attachments) ? request.attachments.slice(0, MAX_ATTACHMENTS) : [];
  return list.filter((entry) => {
    if (!entry || typeof entry.name !== 'string') {
      return false;
    }
    if (entry.path !== undefined && (typeof entry.path !== 'string' || !path.isAbsolute(entry.path))) {
      return false;
    }
    if (entry.data !== undefined && (typeof entry.data !== 'string' || entry.data.length > MAX_ATTACHMENT_BYTES * 1.4)) {
      return false;
    }
    return Boolean(entry.path || entry.data);
  });
}

/** Only strings; anything else from the renderer is dropped. */
function cleanSettings(values: unknown): Record<string, string> {
  const settings: Record<string, string> = {};
  if (!values || typeof values !== 'object') {
    return settings;
  }
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === 'string') {
      settings[name] = value;
    }
  }
  return settings;
}

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

/** A provider's model list, reduced to well-formed entries. */
function cleanModels(list: unknown): AgentModel[] {
  if (!Array.isArray(list)) {
    return [];
  }
  const seen = new Set<string>();
  const models: AgentModel[] = [];
  for (const entry of list.slice(0, MAX_MODELS)) {
    const id = text(entry?.id);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const efforts = Array.isArray(entry.efforts)
      ? entry.efforts.slice(0, MAX_EFFORTS).filter((effort: unknown) => text((effort as { id?: unknown; })?.id))
        .map((effort: { id: string; label?: unknown; description?: unknown; }) => ({
          id: effort.id, label: text(effort.label), description: text(effort.description),
        }))
      : undefined;
    models.push({
      id,
      label: text(entry.label) ?? id,
      description: text(entry.description),
      efforts,
      defaultEffort: text(entry.defaultEffort),
      isDefault: entry.isDefault === true,
    });
  }
  return models;
}

/** Sends a provider's events to the window that asked, tagged with the agent and chat. */
function emitter(agent: string, chatId: string, owner?: WebContents) {
  return (body: AgentEventBody) => {
    const target = owner && !owner.isDestroyed() ? owner : getWindow()?.webContents;
    if (!target || target.isDestroyed()) {
      return;
    }
    const event: AgentEvent = { ...annotatePermission(body), agent, chatId };
    target.send('agent:event', event);
  };
}

/** A provider's checkpoints, reduced to well-formed entries. */
function cleanCheckpoints(list: unknown): AgentCheckpoint[] {
  if (!Array.isArray(list)) {
    return [];
  }
  return list.slice(0, MAX_CHECKPOINTS).flatMap((entry) => {
    const id = text(entry?.id);
    if (!id) {
      return [];
    }
    return [{ id, label: text(entry.label) ?? id, at: typeof entry.at === 'number' ? entry.at : undefined }];
  });
}

/** An action's result, reduced to the fields the panel understands. */
function cleanResult(result: AgentActionResult | void): AgentActionResult {
  if (!result || typeof result !== 'object') {
    return {};
  }
  const exported = result.export && typeof result.export.text === 'string'
    ? { fileName: text(result.export.fileName) ?? 'export.md', text: result.export.text }
    : undefined;
  return {
    sessionId: text(result.sessionId),
    title: text(result.title),
    deleted: result.deleted === true,
    notice: text(result.notice),
    export: exported,
  };
}

export const agents = {
  attach(windowGetter: () => BrowserWindow | null) {
    getWindow = windowGetter;
  },

  register(extensionId: string, agentId: string, provider: AgentProvider) {
    if (!AGENT_ID.test(agentId)) {
      throw new Error(`Invalid agent id: ${agentId}`);
    }
    providers.set(`${extensionId}/${agentId}`, provider);
  },

  removeExtension(extensionId: string) {
    for (const key of [...providers.keys()]) {
      if (key.startsWith(`${extensionId}/`)) {
        providers.delete(key);
      }
    }
  },

  /** `owner`: the window that asked — the turn's events go back there, not to whichever window has focus. */
  async send(request: AgentSendRequest, owner?: WebContents) {
    const { agent, chatId, text: message, cwd, mode, sessionId, model, effort } = request;
    const provider = providerFor(agent);
    if (typeof chatId !== 'string' || !chatId) {
      throw new Error('Chat id missing');
    }
    if (typeof message !== 'string' || !message.trim()) {
      throw new Error('Message is empty');
    }
    if (typeof mode !== 'string') {
      throw new Error('Mode missing');
    }
    const key = `${agent}:${chatId}`;
    if (running.has(key)) {
      throw new Error('The agent is still answering');
    }
    await assertDirectory(cwd);

    const emit = emitter(agent, chatId, owner);

    const settings = cleanSettings(request.settings);

    running.add(key);
    void (async () => {
      try {
        await provider.send({
          chatId, text: message, cwd, mode, sessionId,
          model: text(model),
          effort: text(effort),
          attachments: cleanAttachments(request),
          settings,
          systemPrompt: text(request.systemPrompt)?.slice(0, MAX_SYSTEM_PROMPT),
        }, emit);
      } catch (err) {
        emit({ kind: 'error', message: (err as Error).message });
      } finally {
        running.delete(key);
        emit({ kind: 'done' });
      }
    })();
  },

  async answer(reply: AgentAnswer) {
    const { agent, ...rest } = reply;
    return providerFor(agent).answer(rest);
  },

  async interrupt(agent: string, chatId: string) {
    await providerFor(agent).interrupt(chatId);
  },

  async models(agent: string, settings?: unknown, refresh = false) {
    const provider = providerFor(agent);
    if (!provider.models) {
      return [];
    }
    return cleanModels(await provider.models({ settings: cleanSettings(settings), refresh: refresh === true }));
  },

  async sessions(agent: string, cwd: string) {
    const provider = providerFor(agent);
    if (!provider.sessions) {
      return [];
    }
    await assertDirectory(cwd);
    return provider.sessions(cwd);
  },

  /** A session action; the turn's events and the closing `done` go to `owner` like a message's. */
  async action(request: AgentActionRequest, owner?: WebContents): Promise<AgentActionResult> {
    const { agent, chatId, action, cwd } = request;
    const provider = providerFor(agent);
    if (!ACTIONS.has(action) || !provider.action) {
      throw new Error(`The agent does not support: ${String(action)}`);
    }
    if (typeof chatId !== 'string' || !chatId) {
      throw new Error('Chat id missing');
    }
    const key = `${agent}:${chatId}`;
    if (running.has(key)) {
      throw new Error('The agent is still answering');
    }
    await assertDirectory(cwd);
    const emit = emitter(agent, chatId, owner);
    running.add(key);
    try {
      const { agent: _agent, ...rest } = request;
      return cleanResult(await provider.action({
        ...rest,
        sessionId: text(request.sessionId),
        argument: text(request.argument),
        checkpointId: text(request.checkpointId),
        settings: cleanSettings(request.settings),
      }, emit));
    } finally {
      running.delete(key);
      emit({ kind: 'done' });
    }
  },

  async checkpoints(agent: string, chatId: string, sessionId: string | undefined, cwd: string, settings?: unknown) {
    const provider = providerFor(agent);
    if (!provider.checkpoints) {
      return [];
    }
    await assertDirectory(cwd);
    return cleanCheckpoints(await provider.checkpoints({ chatId, sessionId: text(sessionId), cwd, settings: cleanSettings(settings) }));
  },
};
