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
 * Claude Code as an agent in Lumen.
 *
 * Lumen loads this bundle into its main process (after the user approved it)
 * and calls `activate`. The Agent SDK runs the same engine as the `claude`
 * command, so the user's login, `CLAUDE.md`, settings and MCP servers apply.
 * Every tool the agent wants to use waits for the user's answer in the panel,
 * unless the chosen mode or the allowed tools say otherwise.
 *
 * The SDK starts the installed `claude` program; this bundle does not carry it.
 * Everything configurable lives in the extension's settings (see
 * `extension.json`); the panel adds the mode, the model and its effort per
 * message. The models come from `claude` itself (`supportedModels()`), so the
 * list always matches the installed version and the user's account.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listSessions, query } from '@anthropic-ai/claude-agent-sdk';

const MODES = new Set(['default', 'acceptEdits', 'plan', 'bypassPermissions']);
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
/** How long `claude` may take to report its models. */
const MODELS_TIMEOUT = 30_000;
const RESULT_LIMIT = 6000;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/** Runs by chat id: the running query's abort controller. */
const runs = new Map();
/** Permission requests waiting for an answer, by request id. */
const pending = new Map();
let requestCounter = 0;
/** The last model list `claude` reported, per program and environment. */
let modelCache = { key: '', at: 0, list: [] };

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

const lines = (value) => String(value ?? '').split(/\r?\n|,/).map((entry) => entry.trim()).filter(Boolean);
const isOn = (value) => value === 'true';
/** A select setting's value; `auto` (and nothing) leaves the choice to Claude Code. */
const chosen = (value) => (value && value !== 'auto' ? value : undefined);

function number(value) {
  const parsed = Number(value);
  if (!value || !Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.round(parsed);
}

/** `KEY=VALUE` per line. */
function envFrom(value) {
  const env = {};
  for (const line of String(value ?? '').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match) {
      env[match[1]] = match[2];
    }
  }
  return env;
}

/** MCP servers as JSON: `{ "name": { "command": "…", "args": [] } }`, or the `mcpServers` of a `.mcp.json`. */
function mcpFrom(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return undefined;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`MCP servers: invalid JSON — ${err.message}`);
  }
  const servers = parsed && typeof parsed === 'object' && parsed.mcpServers ? parsed.mcpServers : parsed;
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) {
    throw new Error('MCP servers: expected an object of servers');
  }
  return servers;
}

/** The thinking setting: adaptive (the model decides), off, or a fixed budget. */
function thinkingFrom(settings) {
  if (settings.thinking === 'disabled') {
    return { type: 'disabled' };
  }
  if (settings.thinking === 'budget') {
    const budgetTokens = number(settings.thinkingBudget) ?? 8000;
    return { type: 'enabled', budgetTokens };
  }
  if (settings.thinking === 'adaptive') {
    return { type: 'adaptive' };
  }
  return undefined;
}

function settingSources(settings) {
  const sources = [];
  if (settings.userSettings !== 'false') {
    sources.push('user');
  }
  if (settings.projectSettings !== 'false') {
    sources.push('project');
  }
  if (settings.localSettings !== 'false') {
    sources.push('local');
  }
  return sources;
}

/** The `claude` program: the path from the settings, or the first one found. */
function findClaude(configured) {
  const name = process.platform === 'win32' ? 'claude.exe' : 'claude';
  if (configured && configured !== 'claude') {
    if (!fs.existsSync(configured)) {
      throw new Error(`claude not found at ${configured}`);
    }
    return configured;
  }
  // A desktop launcher often starts Lumen with a short PATH, so the usual homes come along.
  const home = os.homedir();
  const folders = [
    ...(process.env.PATH ?? '').split(path.delimiter),
    path.join(home, '.local', 'bin'),
    path.join(home, '.claude', 'local'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.bun', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
  ];
  for (const folder of folders.filter(Boolean)) {
    const candidate = path.join(folder, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error('Claude Code is not installed. Install it (npm install -g @anthropic-ai/claude-code) or set its path under Settings → Extensions → Claude Code.');
}

/** The effort for this message: the panel's choice, else the setting. */
function effortFor(request) {
  const effort = request.effort || chosen(request.settings.effort);
  if (!effort) {
    return undefined;
  }
  if (!EFFORTS.has(effort)) {
    throw new Error(`Unknown effort: ${effort}`);
  }
  return effort;
}

/** Settings handed to `claude` for this run only (fast mode, output style). */
function flagSettings(settings) {
  const flags = {};
  if (settings.fastMode === 'true' || settings.fastMode === 'false') {
    flags.fastMode = settings.fastMode === 'true';
  }
  const style = String(settings.outputStyle ?? '').trim();
  if (style) {
    flags.outputStyle = style;
  }
  if (!Object.keys(flags).length) {
    return undefined;
  }
  return flags;
}

/** The permission mode for this message; bypassing needs its own explicit setting. */
function permissionMode(mode, settings) {
  if (!MODES.has(mode)) {
    throw new Error(`Unknown mode: ${mode}`);
  }
  if (mode === 'bypassPermissions' && !isOn(settings.allowBypass)) {
    throw new Error('“Bypass permissions” is switched off. Enable it under Settings → Extensions → Claude Code first.');
  }
  return mode;
}

/* ------------------------------------------------------------------ *
 * Translating the SDK's messages
 * ------------------------------------------------------------------ */

function clip(text) {
  if (text.length <= RESULT_LIMIT) {
    return text;
  }
  return `${text.slice(0, RESULT_LIMIT)}\n… (${text.length - RESULT_LIMIT} more characters)`;
}

/** A tool result's content is a string or a list of blocks — flatten it to text. */
function resultText(content) {
  if (typeof content === 'string') {
    return clip(content);
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return clip(content.map((block) => (block.type === 'text' ? block.text ?? '' : `[${block.type ?? 'unknown'}]`)).join('\n'));
}

function usageOf(message) {
  const usage = message.usage ?? {};
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens,
    cacheWriteTokens: usage.cache_creation_input_tokens,
    costUsd: message.total_cost_usd,
    durationMs: message.duration_ms,
    turns: message.num_turns,
  };
}

/** Text and thinking as they are written (`includePartialMessages`). */
function streamDelta(event) {
  if (event?.type !== 'content_block_delta') {
    return [];
  }
  const delta = event.delta ?? {};
  if (delta.type === 'text_delta' && delta.text) {
    return [{ kind: 'delta', text: delta.text }];
  }
  if (delta.type === 'thinking_delta' && delta.thinking) {
    return [{ kind: 'delta', text: delta.thinking, thinking: true }];
  }
  return [];
}

const TRANSLATORS = {
  system(message) {
    if (message.subtype === 'init') {
      return [{
        kind: 'session', sessionId: message.session_id, model: message.model, tools: message.tools,
        slashCommands: message.slash_commands, cwd: message.cwd,
      }];
    }
    if (message.subtype === 'status') {
      return [{ kind: 'status', text: message.status ?? '' }];
    }
    return [];
  },

  stream_event(message) {
    // Subagents write too; only the main conversation streams into the chat.
    if (message.parent_tool_use_id) {
      return [];
    }
    return streamDelta(message.event);
  },

  assistant(message) {
    if (message.parent_tool_use_id) {
      return [];
    }
    const blocks = [];
    for (const block of message.message.content) {
      if (block.type === 'text' && block.text.trim()) {
        blocks.push({ type: 'text', text: block.text });
      }
      if (block.type === 'thinking' && block.thinking?.trim()) {
        blocks.push({ type: 'thinking', text: block.thinking });
      }
      if (block.type === 'tool_use') {
        blocks.push({ type: 'tool', id: block.id, name: block.name, input: block.input ?? {} });
      }
    }
    if (!blocks.length) {
      return [];
    }
    return [{ kind: 'assistant', blocks }];
  },

  user(message) {
    const content = message.message.content;
    if (!Array.isArray(content)) {
      return [];
    }
    return content
      .filter((block) => block.type === 'tool_result')
      .map((block) => ({ kind: 'toolResult', toolUseId: block.tool_use_id, text: resultText(block.content), isError: block.is_error === true }));
  },

  result(message) {
    const text = message.subtype === 'success' ? message.result : (message.errors ?? []).join('\n') || message.subtype;
    return [{ kind: 'result', isError: message.is_error, text, costUsd: message.total_cost_usd, durationMs: message.duration_ms, usage: usageOf(message) }];
  },
};

/** The SDK's messages, in the shape every Lumen agent reports. */
function translate(message) {
  const translator = TRANSLATORS[message.type];
  if (!translator) {
    return [];
  }
  return translator(message);
}

/* ------------------------------------------------------------------ *
 * The prompt
 * ------------------------------------------------------------------ */

/** Pasted images as content blocks; project files as a mention in the text. */
function contentOf(text, attachments = []) {
  const images = attachments.filter((entry) => entry.data && IMAGE_TYPES.has(entry.mimeType));
  const files = attachments.filter((entry) => entry.path);
  const mentions = files.map((entry) => `@${entry.path}`).join(' ');
  const body = mentions ? `${text}\n\n${mentions}` : text;
  return [
    ...images.map((entry) => ({ type: 'image', source: { type: 'base64', media_type: entry.mimeType, data: entry.data } })),
    { type: 'text', text: body },
  ];
}

/** One user message as the SDK's streaming input — the form that also carries images. */
async function* promptOf(text, attachments) {
  yield {
    type: 'user',
    message: { role: 'user', content: contentOf(text, attachments) },
    parent_tool_use_id: null,
  };
}

function optionsFor(request, abort, canUseTool) {
  const { cwd, mode, sessionId, model, settings } = request;
  const append = String(settings.appendSystemPrompt ?? '').trim();
  const env = envFrom(settings.env);
  const options = {
    cwd,
    abortController: abort,
    permissionMode: permissionMode(mode, settings),
    canUseTool,
    resume: sessionId,
    pathToClaudeCodeExecutable: findClaude(settings.claudePath),
    // Behave as `claude` does in a terminal: CLAUDE.md, the user's and the project's settings apply.
    systemPrompt: { type: 'preset', preset: 'claude_code', ...(append ? { append } : {}) },
    settingSources: settingSources(settings),
    includePartialMessages: settings.streaming !== 'false',
    model: model || chosen(settings.model),
    fallbackModel: settings.fallbackModel || undefined,
    maxTurns: number(settings.maxTurns),
    maxBudgetUsd: Number(settings.maxBudget) > 0 ? Number(settings.maxBudget) : undefined,
    effort: effortFor(request),
    settings: flagSettings(settings),
    persistSession: settings.persistSessions === 'false' ? false : undefined,
    thinking: thinkingFrom(settings),
    allowedTools: lines(settings.allowedTools),
    disallowedTools: lines(settings.disallowedTools),
    additionalDirectories: lines(settings.additionalDirectories).map((dir) => dir.replace(/^~(?=\/|$)/, os.homedir())),
    mcpServers: mcpFrom(settings.mcpServers),
    env: Object.keys(env).length ? { ...process.env, ...env } : undefined,
    allowDangerouslySkipPermissions: mode === 'bypassPermissions' ? true : undefined,
  };
  for (const key of Object.keys(options)) {
    if (options[key] === undefined) {
      delete options[key];
    }
    if (Array.isArray(options[key]) && !options[key].length) {
      delete options[key];
    }
  }
  return options;
}

/* ------------------------------------------------------------------ *
 * Models
 * ------------------------------------------------------------------ */

/** Models the user adds by hand: `id` or `id | Label` per line. */
function extraModels(value) {
  return String(value ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [id, label] = line.split('|').map((part) => part.trim());
    return { id, label: label || id, efforts: [...EFFORTS].map((effort) => ({ id: effort })) };
  });
}

/** Used only when `claude` cannot be asked: the aliases every version understands. */
const FALLBACK_MODELS = [
  { id: 'opus', label: 'Opus', efforts: [...EFFORTS].map((effort) => ({ id: effort })) },
  { id: 'sonnet', label: 'Sonnet', efforts: [...EFFORTS].map((effort) => ({ id: effort })) },
  { id: 'haiku', label: 'Haiku', efforts: [] },
];

/** A stream that never sends a message: `claude` starts, answers control requests, and waits. */
async function* idle(signal) {
  await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
}

/** Ask the installed `claude` which models it offers — without sending a message. */
async function askClaude(settings) {
  const abort = new AbortController();
  const env = envFrom(settings.env);
  const run = query({
    prompt: idle(abort.signal),
    options: {
      cwd: os.homedir(),
      abortController: abort,
      pathToClaudeCodeExecutable: findClaude(settings.claudePath),
      settingSources: settingSources(settings),
      persistSession: false,
      ...(Object.keys(env).length ? { env: { ...process.env, ...env } } : {}),
    },
  });
  // Nobody reads the messages; an abort must not surface as an unhandled rejection.
  const drained = (async () => {
    for await (const _message of run) { /* nothing to show */ }
  })().catch(() => {});
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('claude did not report its models in time')), MODELS_TIMEOUT);
  });
  try {
    return await Promise.race([run.supportedModels(), timeout]);
  } finally {
    clearTimeout(timer);
    abort.abort();
    run.close();
    await drained;
  }
}

/** `claude-opus-5-5[1m]` → `claude-opus-5-5`: the model without its context suffix. */
const bare = (id) => String(id ?? '').replace(/\[[^\]]*\]$/, '');

/** `claude-opus-5-5` → `Opus 5.5`, `claude-haiku-4-5-20251001` → `Haiku 4.5`; anything else stays as it is. */
function nameOf(id) {
  const parts = bare(id).replace(/^claude-/, '').replace(/-\d{8}$/, '').split('-');
  if (!/^[a-z]+$/.test(parts[0]) || !parts.slice(1).every((part) => /^\d+$/.test(part))) {
    return '';
  }
  return [parts[0][0].toUpperCase() + parts[0].slice(1), parts.slice(1).join('.')].filter(Boolean).join(' ');
}

/** The name Lumen shows: the version from the id, `(1M)` for the long-context variant; the CLI's own name otherwise. */
function labelled(rows) {
  const count = new Map();
  const label = (row) => {
    const name = nameOf(row.resolvedModel || row.value);
    if (!name) {
      return row.displayName || row.value;
    }
    return /\[1m\]$/i.test(row.value) || /\[1m\]$/i.test(row.resolvedModel ?? '') ? `${name} (1M)` : name;
  };
  for (const row of rows) {
    count.set(label(row), (count.get(label(row)) ?? 0) + 1);
  }
  // Names must tell rows apart: a repeated one gets the id behind it.
  return (row) => (count.get(label(row)) > 1 ? `${label(row)} (${row.value})` : label(row));
}

/** Older models that still answer; they only show up when the setting asks for them. */
const LEGACY_MODELS = [
  { id: 'claude-opus-4-5', label: 'Opus 4.5', efforts: ['low', 'medium', 'high'] },
  { id: 'claude-sonnet-4-5', label: 'Sonnet 4.5', efforts: [] },
  { id: 'claude-opus-4-1', label: 'Opus 4.1', efforts: [] },
  { id: 'claude-opus-4-0', label: 'Opus 4', efforts: [] },
  { id: 'claude-sonnet-4-0', label: 'Sonnet 4', efforts: [] },
  { id: 'claude-3-7-sonnet-latest', label: 'Sonnet 3.7', efforts: [] },
  { id: 'claude-3-5-haiku-latest', label: 'Haiku 3.5', efforts: [] },
].map((entry) => ({
  id: entry.id,
  label: entry.label,
  description: 'Older model',
  efforts: entry.efforts.map((effort) => ({ id: effort })),
}));

/** The older models, minus those the CLI already lists (by id or by what it resolves to). */
function legacyModels(listed) {
  const known = new Set(listed.flatMap((entry) => [entry.id, bare(entry.id)]));
  return LEGACY_MODELS.filter((entry) => !known.has(entry.id) && !listed.some((row) => row.label === entry.label));
}

/**
 * Claude Code's list, in the panel's shape. Its first row (`default`) only
 * names another model; that one gets marked as the default instead.
 */
function toModels(list) {
  const rows = Array.isArray(list) ? list.filter((entry) => entry?.value) : [];
  const fallback = rows.find((entry) => entry.value === 'default');
  const labelOf = labelled(rows.filter((entry) => entry.value !== 'default'));
  const models = rows.filter((entry) => entry.value !== 'default').map((entry) => ({
    id: entry.value,
    label: labelOf(entry),
    description: entry.description || undefined,
    efforts: entry.supportsEffort === false ? [] : (entry.supportedEffortLevels ?? []).map((effort) => ({ id: effort })),
    isDefault: Boolean(fallback?.resolvedModel) && entry.resolvedModel === fallback.resolvedModel,
  }));
  if (!fallback || models.some((entry) => entry.isDefault)) {
    return models;
  }
  // The default is none of the listed ones — offer it under its real name.
  return [{
    id: fallback.resolvedModel || 'default',
    label: nameOf(fallback.resolvedModel) || bare(fallback.resolvedModel) || fallback.displayName || 'Default',
    description: fallback.description || undefined,
    efforts: (fallback.supportedEffortLevels ?? []).map((effort) => ({ id: effort })),
    isDefault: true,
  }, ...models];
}

/** Cached for `modelCacheMinutes`; the panel's refresh button asks again. */
async function listModels({ settings = {}, refresh = false } = {}) {
  const minutes = Number(settings.modelCacheMinutes || 60);
  const key = JSON.stringify([settings.claudePath, settings.env, settingSources(settings)]);
  const fresh = modelCache.key === key && Date.now() - modelCache.at < Math.max(0, minutes) * 60_000;
  const extras = extraModels(settings.extraModels);
  const withExtras = (list) => [...list, ...(settings.showLegacyModels === 'true' ? legacyModels(list) : []), ...extras];
  if (fresh && !refresh) {
    return withExtras(modelCache.list);
  }
  const list = toModels(await askClaude(settings));
  modelCache = { key, at: Date.now(), list };
  return withExtras(list);
}

/* ------------------------------------------------------------------ *
 * The provider
 * ------------------------------------------------------------------ */

/** Deny whatever still waits for an answer in this chat. */
function settle(chatId) {
  for (const [id, entry] of pending) {
    if (entry.chatId !== chatId) {
      continue;
    }
    entry.resolve({ behavior: 'deny', message: 'Stopped by the user', interrupt: true });
    pending.delete(id);
  }
}

const provider = {
  async send(request, emit) {
    const { chatId, text, attachments } = request;
    if (runs.has(chatId)) {
      throw new Error('Claude is still answering');
    }

    const abort = new AbortController();
    const canUseTool = (tool, input, options) => new Promise((resolve) => {
      const requestId = `perm-${++requestCounter}`;
      const suggestions = options.suggestions ?? [];
      pending.set(requestId, { chatId, suggestions, input, resolve });
      options.signal.addEventListener('abort', () => {
        if (!pending.delete(requestId)) {
          return;
        }
        resolve({ behavior: 'deny', message: 'Cancelled' });
        emit({ kind: 'permissionSettled', requestId });
      }, { once: true });
      emit({
        kind: 'permission', requestId, tool, input, blockedPath: options.blockedPath,
        reason: options.decisionReason, canRemember: suggestions.length > 0,
      });
    });

    const stream = query({ prompt: promptOf(text, attachments), options: optionsFor(request, abort, canUseTool) });
    runs.set(chatId, abort);
    try {
      for await (const message of stream) {
        for (const event of translate(message)) {
          emit(event);
        }
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        throw err;
      }
    } finally {
      settle(chatId);
      runs.delete(chatId);
    }
  },

  answer({ requestId, allow, remember, message, answers }) {
    const entry = pending.get(requestId);
    if (!entry) {
      return false;
    }
    pending.delete(requestId);
    if (!allow) {
      entry.resolve({ behavior: 'deny', message: message?.trim() || 'The user denied this action' });
      return true;
    }
    // A question the agent asked: the chosen answers travel back inside the tool's input.
    const updatedInput = answers ? { ...entry.input, answers } : entry.input;
    entry.resolve({ behavior: 'allow', updatedInput, updatedPermissions: remember ? entry.suggestions : undefined });
    return true;
  },

  interrupt(chatId) {
    const abort = runs.get(chatId);
    if (!abort) {
      return;
    }
    settle(chatId);
    abort.abort();
  },

  /** The conversations Claude Code keeps for this folder, newest first. */
  async sessions(cwd) {
    const list = await listSessions({ dir: cwd, limit: 40, includeWorktrees: false }).catch(() => []);
    return list
      .sort((a, b) => b.lastModified - a.lastModified)
      .map((session) => ({
        id: session.sessionId,
        title: (session.customTitle || session.summary || session.firstPrompt || session.sessionId).split('\n')[0].slice(0, 80),
        updatedAt: session.lastModified,
      }));
  },

  /** What the installed `claude` offers; if it cannot be asked, the last list or the plain aliases. */
  async models(options) {
    try {
      return await listModels(options);
    } catch (err) {
      console.warn('[claude-code] could not list models:', err.message);
      if (modelCache.list.length) {
        return modelCache.list;
      }
      return FALLBACK_MODELS;
    }
  },
};

export function activate(ctx) {
  ctx.agents.register('claude', provider);
  return () => {
    for (const abort of runs.values()) {
      abort.abort();
    }
  };
}
