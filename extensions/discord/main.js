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
 * Discord Rich Presence for Lumen: shows in Discord what is being worked on —
 * the file, the project, the language, how long.
 *
 * The code talks to the local Discord client itself (`src/ipc.js`, the
 * socket `discord-ipc-N`) and works from what Lumen reports: the active file
 * with its language, the project, the window's focus. Nothing leaves the
 * machine except through Discord, and only what the settings allow.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { DiscordIpcClient } from './src/ipc.js';
import { buildActivity, isInside, readSettings, repoUrlFromGitConfig } from './src/activity.js';
import { createT } from './src/i18n.js';

/** A short rest, so that typing or switching tabs quickly does not send every time. */
const DEBOUNCE_MS = 600;
/** How often idleness is checked while the window has no focus. */
const IDLE_CHECK_MS = 30_000;

const STATUS_LOOK = {
  connected: { icon: 'messages', tone: 'success' },
  connecting: { icon: 'loader', tone: 'muted' },
  disconnected: { icon: 'circle-dashed', tone: 'muted' },
  error: { icon: 'circle-alert', tone: 'danger' },
};

/** The web link of the repository at `root`, from `.git/config`; `null` when there is none. */
async function readRepoUrl(root) {
  if (!root) {
    return null;
  }
  const text = await fs.readFile(path.join(root, '.git', 'config'), 'utf8').catch(() => null);
  return text ? repoUrlFromGitConfig(text) : null;
}

/** The mutable session state; one object so the feature functions below can share it. */
function createSession(ctx) {
  const lastFile = ctx.events.last('activeFile');
  const lastProject = ctx.events.last('project');
  let markedPrivate = ctx.storage.get('privateProjects', []);
  if (!Array.isArray(markedPrivate)) {
    markedPrivate = [];
  }
  return {
    sessionStart: Date.now(),
    settings: readSettings(ctx.settings.all()),
    enabled: ctx.storage.get('enabled', true) !== false,
    /** Folders marked private with the command — next to the ones typed into the settings. */
    markedPrivate,
    file: lastFile?.path ? lastFile : null,
    project: lastProject?.root ? { root: lastProject.root, name: lastProject.name } : null,
    fileStart: Date.now(),
    projectStart: Date.now(),
    blurredAt: null,
    idle: false,
    repoUrl: null,
    timer: null,
    idleTimer: null,
    disposed: false,
    /** Does the next connection announce itself (after a command)? */
    announce: false,
    lastError: '',
    hintShown: false,
  };
}

/* The activity -------------------------------------------------------- */

function isPrivate(env) {
  const { s } = env;
  return Boolean(s.project) && isInside(s.project.root, [...s.settings.privateProjects, ...s.markedPrivate]);
}

function startOf(s) {
  if (s.settings.elapsedFrom === 'file' && s.file) {
    return s.fileStart;
  }
  if (s.settings.elapsedFrom === 'project' && s.project) {
    return s.projectStart;
  }
  return s.sessionStart;
}

function push(env) {
  const { ctx, t, s, client } = env;
  if (s.disposed) {
    return;
  }
  // The settings arrive from the window; until then nothing is known about the user's wishes.
  if (!Object.keys(ctx.settings.all()).length) {
    return;
  }
  if (!s.enabled) {
    client.stop();
    return;
  }
  if (!s.settings.clientId) {
    client.stop();
    if (s.hintShown) {
      return;
    }
    s.hintShown = true;
    ctx.ui.notify(t('toast.missingClientId'), 'info');
    return;
  }
  const activity = buildActivity(
    {
      file: s.file ? { path: s.file.path, languageId: s.file.languageId, languageName: s.file.languageName } : null,
      project: s.project,
      private: isPrivate(env),
      idle: s.idle,
      start: startOf(s),
      version: ctx.appVersion,
      repoUrl: s.repoUrl,
    },
    s.settings,
    t,
  );
  client.update(s.settings.clientId, activity);
}

function schedule(env) {
  const { s } = env;
  if (s.timer || s.disposed) {
    return;
  }
  s.timer = setTimeout(() => {
    s.timer = null;
    push(env);
  }, DEBOUNCE_MS);
}

/* Status -------------------------------------------------------------- */

function statusText(env, status) {
  const { t, s } = env;
  if (!s.settings.clientId) {
    return t('status.noClientId');
  }
  if (status.state === 'connected' && status.user) {
    return t('status.connectedAs', { user: status.user });
  }
  if (status.state === 'error') {
    return t('status.error', { message: status.message ?? '' });
  }
  return t(`status.${status.state}`);
}

function updateStatusBar(env) {
  const { ctx, t, s, client } = env;
  if (s.disposed) {
    return;
  }
  if (!s.enabled) {
    ctx.statusBar.set('status', {
      text: 'Discord',
      icon: 'pause',
      tone: 'muted',
      tooltip: t('status.disabled'),
      command: 'discord.enable',
      side: 'right',
      priority: 5,
    });
    return;
  }
  const status = client.status();
  const look = STATUS_LOOK[status.state] ?? STATUS_LOOK.disconnected;
  ctx.statusBar.set('status', {
    text: 'Discord',
    icon: look.icon,
    tone: look.tone,
    tooltip: `${statusText(env, status)}\n${t('status.click')}`,
    command: 'discord.reconnect',
    side: 'right',
    priority: 5,
  });
}

function onStatus(env, status) {
  const { ctx, t, s } = env;
  if (s.disposed) {
    return;
  }
  if (status.state === 'connected' && s.announce) {
    s.announce = false;
    ctx.ui.notify(status.user ? t('toast.connectedAs', { user: status.user }) : t('toast.connected'), 'success');
    return;
  }
  if (status.state !== 'error' || !status.message || status.message === s.lastError) {
    return;
  }
  s.lastError = status.message;
  ctx.ui.notify(t('toast.error', { message: status.message }), 'warning');
}

/* Idleness ------------------------------------------------------------ */

function checkIdle(env) {
  const { s } = env;
  const now = s.blurredAt !== null && s.settings.idleMinutes > 0 && Date.now() - s.blurredAt >= s.settings.idleMinutes * 60_000;
  if (now === s.idle) {
    return;
  }
  s.idle = now;
  push(env);
}

function stopIdleTimer(s) {
  if (!s.idleTimer) {
    return;
  }
  clearInterval(s.idleTimer);
  s.idleTimer = null;
}

/* Commands ------------------------------------------------------------ */

function setEnabled(env, value) {
  const { ctx, t, s } = env;
  s.enabled = value;
  void ctx.storage.set('enabled', value);
  s.lastError = '';
  s.announce = value;
  ctx.ui.notify(t(value ? 'toast.enabled' : 'toast.disabled'), 'info');
  updateStatusBar(env);
  push(env);
}

function reconnect(env) {
  const { ctx, t, s, client } = env;
  if (!s.enabled) {
    setEnabled(env, true);
    return;
  }
  if (!s.settings.clientId) {
    ctx.ui.notify(t('toast.missingClientId'), 'info');
    return;
  }
  s.announce = true;
  s.lastError = '';
  ctx.ui.notify(t('toast.connecting'), 'info');
  push(env);
  client.reconnect();
}

function togglePrivate(env) {
  const { ctx, t, s } = env;
  if (!s.project) {
    ctx.ui.notify(t('toast.noProject'), 'info');
    return;
  }
  const marked = s.markedPrivate.includes(s.project.root);
  s.markedPrivate = marked ? s.markedPrivate.filter((root) => root !== s.project.root) : [...s.markedPrivate, s.project.root];
  void ctx.storage.set('privateProjects', s.markedPrivate);
  ctx.ui.notify(t(marked ? 'toast.privateOff' : 'toast.privateOn', { project: s.project.name ?? s.project.root }), 'info');
  push(env);
}

function registerCommands(env) {
  const { ctx, s } = env;
  const commands = {
    'discord.reconnect': () => reconnect(env),
    'discord.enable': () => setEnabled(env, true),
    'discord.disable': () => setEnabled(env, false),
    'discord.toggle': () => setEnabled(env, !s.enabled),
    'discord.toggle-private': () => togglePrivate(env),
  };
  for (const [id, run] of Object.entries(commands)) {
    ctx.commands.register(id, run);
  }
}

/* Events -------------------------------------------------------------- */

async function loadRepoUrl(env) {
  const { s } = env;
  const root = s.project?.root ?? null;
  const url = await readRepoUrl(root);
  if (s.disposed || (s.project?.root ?? null) !== root) {
    return;
  }
  s.repoUrl = url;
  schedule(env);
}

function registerEvents(env) {
  const { ctx, s } = env;
  ctx.events.on('activeFile', (event) => {
    const next = event.path ? event : null;
    if (next?.path !== s.file?.path) {
      s.fileStart = Date.now();
    }
    s.file = next;
    schedule(env);
  });
  ctx.events.on('project', (event) => {
    const root = event.root ?? null;
    if (root !== (s.project?.root ?? null)) {
      s.projectStart = Date.now();
    }
    s.project = root ? { root, name: event.name } : null;
    s.repoUrl = null;
    void loadRepoUrl(env);
    schedule(env);
  });
  ctx.events.on('windowBlur', () => {
    s.blurredAt = Date.now();
    stopIdleTimer(s);
    s.idleTimer = setInterval(() => checkIdle(env), IDLE_CHECK_MS);
  });
  ctx.events.on('windowFocus', () => {
    s.blurredAt = null;
    stopIdleTimer(s);
    checkIdle(env);
  });
  ctx.events.on('locale', () => {
    updateStatusBar(env);
    schedule(env);
  });
  ctx.settings.onDidChange((values) => {
    const before = s.settings.clientId;
    s.settings = readSettings(values);
    if (s.settings.clientId !== before) {
      s.hintShown = false;
    }
    s.lastError = '';
    updateStatusBar(env);
    checkIdle(env);
    schedule(env);
  });
}

export function activate(ctx) {
  const env = { ctx, t: createT(ctx), s: createSession(ctx), client: null };
  env.client = new DiscordIpcClient({
    onStatus(status) {
      updateStatusBar(env);
      onStatus(env, status);
    },
    log: (message) => ctx.log(message),
  });

  registerCommands(env);
  registerEvents(env);

  updateStatusBar(env);
  void loadRepoUrl(env);
  push(env);

  return () => {
    env.s.disposed = true;
    if (env.s.timer) {
      clearTimeout(env.s.timer);
    }
    stopIdleTimer(env.s);
    env.client.stop();
  };
}
