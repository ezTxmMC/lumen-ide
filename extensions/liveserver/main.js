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
 * Live Server for Lumen: serves the project folder, opens it in the browser
 * and reloads the page when a file changes. PHP files run through `php -S`.
 * The server itself lives in `src/server.js`.
 */

import path from 'node:path';
import { startLiveServer } from './src/server.js';

/** Files that make sense as the page to open. */
const PAGE_EXTENSIONS = new Set(['.html', '.htm', '.xhtml', '.php', '.phtml', '.svg', '.md', '.xml']);

const list = (text) =>
  String(text ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const text = (ctx, key, fallback = '') => {
  const value = ctx.settings.get(key);
  return value === undefined || value === null || value === '' ? fallback : String(value);
};

const flag = (ctx, key, fallback) => {
  const value = ctx.settings.get(key);
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return value === true || value === 'true';
};

function serveRoot({ ctx, st }) {
  if (!st.projectRoot) {
    return null;
  }
  const sub = text(ctx, 'subfolder');
  return sub ? path.resolve(st.projectRoot, sub) : st.projectRoot;
}

function baseUrl({ st }) {
  return `http://${st.server.host === '0.0.0.0' ? 'localhost' : st.server.host}:${st.server.port}`;
}

function updateStatusBar(env) {
  const { ctx, st } = env;
  if (st.starting) {
    ctx.statusBar.set('live', { text: 'Live…', icon: 'loader', tooltip: 'Live Server', command: 'liveserver.toggle', priority: 50 });
    return;
  }
  if (!st.server) {
    ctx.statusBar.set('live', {
      text: 'Go Live',
      icon: 'radio',
      tooltip: 'Live Server starten',
      command: 'liveserver.toggle',
      priority: 50,
    });
    return;
  }
  ctx.statusBar.set('live', {
    text: `Port ${st.server.port}`,
    icon: 'radio-tower',
    tone: 'success',
    tooltip: `${baseUrl(env)} — click to stop`,
    command: 'liveserver.toggle',
    priority: 50,
  });
}

/** The address of a file below the served folder, or the site's root. */
function urlFor(env, file) {
  const root = serveRoot(env);
  if (!env.st.server || !root) {
    return null;
  }
  if (!file) {
    return `${baseUrl(env)}/`;
  }
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  if (!PAGE_EXTENSIONS.has(path.extname(file).toLowerCase())) {
    return null;
  }
  const encoded = relative.split(path.sep).map(encodeURIComponent).join('/');
  return `${baseUrl(env)}/${encoded}`;
}

/** The options of the server, read from the settings. */
function serverOptions(ctx, root) {
  return {
    root,
    port: Number(text(ctx, 'port', '5500')) || 5500,
    host: text(ctx, 'host', '127.0.0.1'),
    liveReload: flag(ctx, 'liveReload', true),
    php: flag(ctx, 'php', true),
    phpPath: text(ctx, 'phpPath', 'php'),
    ignore: list(text(ctx, 'ignore', 'node_modules,.git,vendor,.idea,.vscode')),
    reloadOn: list(text(ctx, 'reloadOn', 'html,htm,php,js,mjs,json,svg,xml,md,txt,twig,phtml')).map(
      (ext) => `.${ext.replace(/^\./, '').toLowerCase()}`,
    ),
    log: (line) => ctx.log(line),
  };
}

async function start(env, { open = flag(env.ctx, 'openBrowser', true) } = {}) {
  const { ctx, st } = env;
  if (st.server || st.starting) {
    return;
  }
  const root = serveRoot(env);
  if (!root) {
    ctx.ui.notify('Live Server: No project open.', 'warning');
    return;
  }
  st.starting = true;
  updateStatusBar(env);
  try {
    st.server = await startLiveServer(serverOptions(ctx, root));
  } catch (err) {
    st.server = null;
    ctx.ui.notify(`Live Server: ${err.message}`, 'error');
    return;
  } finally {
    st.starting = false;
    updateStatusBar(env);
  }
  const note = st.server.phpEnabled ? ' (with PHP)' : '';
  ctx.ui.notify(`Live Server running at ${baseUrl(env)}${note}`, 'success');
  if (open) {
    await ctx.openExternal(urlFor(env, st.activePath) ?? `${baseUrl(env)}/`);
  }
}

async function stop(env, { quiet = false } = {}) {
  const { ctx, st } = env;
  if (!st.server) {
    return;
  }
  const running = st.server;
  st.server = null;
  updateStatusBar(env);
  await running.stop().catch(() => {});
  if (!quiet) {
    ctx.ui.notify('Live Server gestoppt', 'info');
  }
}

async function openActive(env) {
  const { ctx, st } = env;
  if (!st.server) {
    await start(env, { open: false });
  }
  if (!st.server) {
    return;
  }
  const url = urlFor(env, st.activePath);
  if (!url) {
    ctx.ui.notify('Live Server: The active file is not in the served folder or is not a page.', 'warning');
    return;
  }
  await ctx.openExternal(url);
}

async function openRoot(env) {
  if (!env.st.server) {
    await start(env, { open: false });
  }
  if (env.st.server) {
    await env.ctx.openExternal(`${baseUrl(env)}/`);
  }
}

function registerCommands(env) {
  const commands = {
    'liveserver.toggle': () => (env.st.server ? stop(env) : start(env)),
    'liveserver.start': () => start(env),
    'liveserver.stop': () => stop(env),
    'liveserver.open': () => openActive(env),
    'liveserver.open-root': () => openRoot(env),
  };
  for (const [id, run] of Object.entries(commands)) {
    env.ctx.commands.register(id, run);
  }
}

function registerEvents(env) {
  const { ctx, st } = env;
  ctx.events.on('project', (event) => {
    if ((event.root ?? null) === st.projectRoot) {
      return;
    }
    st.projectRoot = event.root ?? null;
    // The server belongs to the folder it was started for.
    if (st.server) {
      void stop(env, { quiet: true });
    }
  });
  ctx.events.on('activeFile', (event) => {
    st.activePath = event.path ?? null;
  });
  // The watcher does the work; a save in Lumen is the backup where watching is unreliable.
  ctx.events.on('fileSaved', (event) => st.server?.changed(event.path));
}

export function activate(ctx) {
  const st = {
    server: null,
    starting: false,
    projectRoot: ctx.events.last('project')?.root ?? ctx.workspace.root() ?? null,
    activePath: ctx.events.last('activeFile')?.path ?? null,
  };
  const env = { ctx, st };

  registerCommands(env);
  registerEvents(env);

  updateStatusBar(env);

  return () => {
    void stop(env, { quiet: true });
    ctx.statusBar.set('live', null);
  };
}
