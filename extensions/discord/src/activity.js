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
 * What Discord shows, worked out from what Lumen reports and the settings.
 * Pure — no sockets, no timers — so the tests can run it on its own.
 */

/** The application Lumen registered; its art assets are named after the language ids plus `lumen`. */
export const DEFAULT_CLIENT_ID = '1550197013260275863';

/** Setting values arrive as text; these apply until the interface has sent its own. */
export const DEFAULTS = {
  clientId: DEFAULT_CLIENT_ID,
  showFileName: 'true',
  showProject: 'true',
  showLanguage: 'true',
  showElapsed: 'true',
  elapsedFrom: 'session',
  idleText: '',
  idleMinutes: '5',
  idleAction: 'idle',
  repoButton: 'false',
  privateMode: 'names',
  privateProjects: '',
};

const ELAPSED_FROM = new Set(['session', 'project', 'file']);
const IDLE_ACTIONS = new Set(['idle', 'clear']);
const PRIVATE_MODES = new Set(['names', 'hide']);

const bool = (value) => value === 'true' || value === true;
const oneOf = (allowed, value, fallback) => (allowed.has(value) ? value : fallback);

/** The raw setting values (text) as a typed object, defaults filled in. */
export function readSettings(values = {}) {
  const raw = { ...DEFAULTS, ...values };
  const minutes = Number(raw.idleMinutes);
  return {
    clientId: /^\d{1,32}$/.test(String(raw.clientId).trim()) ? String(raw.clientId).trim() : '',
    showFileName: bool(raw.showFileName),
    showProject: bool(raw.showProject),
    showLanguage: bool(raw.showLanguage),
    showElapsed: bool(raw.showElapsed),
    elapsedFrom: oneOf(ELAPSED_FROM, raw.elapsedFrom, 'session'),
    idleText: String(raw.idleText ?? '').trim(),
    idleMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 0,
    idleAction: oneOf(IDLE_ACTIONS, raw.idleAction, 'idle'),
    repoButton: bool(raw.repoButton),
    privateMode: oneOf(PRIVATE_MODES, raw.privateMode, 'names'),
    privateProjects: String(raw.privateProjects ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  };
}

/* ------------------------------------------------------------------ *
 * Private projects
 * ------------------------------------------------------------------ */

const normalize = (dir) => String(dir).replace(/\\/g, '/').replace(/\/+$/, '');

/** Is `root` one of `folders`, or inside one? */
export function isInside(root, folders) {
  if (!root) {
    return false;
  }
  const target = normalize(root);
  return folders.some((folder) => {
    const base = normalize(folder);
    if (!base) {
      return false;
    }
    return target === base || target.startsWith(`${base}/`);
  });
}

/* ------------------------------------------------------------------ *
 * The repository link
 * ------------------------------------------------------------------ */

/**
 * A remote's address as a web link: `git@host:owner/repo.git`,
 * `ssh://git@host/owner/repo` and `https://user:token@host/owner/repo.git`
 * all become `https://host/owner/repo`. Credentials never leave; anything that
 * is not a network address (a local path) gives `null`.
 */
export function toWebUrl(remote) {
  const value = String(remote ?? '').trim();
  const scp = /^[\w.-]+@([\w.-]+):(?!\/)(.+?)(?:\.git)?\/?$/.exec(value);
  if (scp) {
    return `https://${scp[1]}/${scp[2]}`;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  const repoPath = url.pathname.replace(/\.git\/?$/, '').replace(/\/+$/, '');
  if (!repoPath || repoPath === '/') {
    return null;
  }
  const protocol = url.protocol === 'http:' ? 'http:' : 'https:';
  // ssh ports are not web ports.
  const port = url.port && (url.protocol === 'https:' || url.protocol === 'http:') ? `:${url.port}` : '';
  return `${protocol}//${url.hostname}${port}${repoPath}`;
}

/** The web link of `origin` (or else the first remote) in the text of `.git/config`. */
export function repoUrlFromGitConfig(text) {
  const remotes = [];
  let current = null;
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const section = /^\s*\[\s*remote\s+"([^"]+)"\s*\]/.exec(line);
    if (section) {
      current = { name: section[1], url: null };
      remotes.push(current);
      continue;
    }
    if (/^\s*\[/.test(line)) {
      current = null;
      continue;
    }
    const url = /^\s*url\s*=\s*(.+?)\s*$/.exec(line);
    if (current && url && !current.url) {
      current.url = url[1];
    }
  }
  const remote = remotes.find((entry) => entry.name === 'origin' && entry.url) ?? remotes.find((entry) => entry.url);
  return remote ? toWebUrl(remote.url) : null;
}

/* ------------------------------------------------------------------ *
 * The activity
 * ------------------------------------------------------------------ */

const baseName = (file) => String(file).split(/[\\/]/).filter(Boolean).pop() ?? String(file);

/** A Discord asset key: lower case, letters, digits and `_` alone. */
export const assetKey = (id) =>
  String(id)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');

/**
 * The activity for the current state, or `null` to show nothing.
 *
 * `state`: `{ file: { path, languageId?, languageName? } | null,
 * project: { root, name } | null, private, idle, start, version, repoUrl }`.
 */
export function buildActivity(state, settings, t) {
  if (state.idle && settings.idleAction === 'clear') {
    return null;
  }
  if (state.private && settings.privateMode === 'hide') {
    return null;
  }

  const showFile = settings.showFileName && !state.private;
  const activity = {};
  const idleText = settings.idleText || t('activity.idle');
  activity.details = idleText;
  if (state.file && !state.idle && showFile) {
    activity.details = t('activity.editing', { file: baseName(state.file.path) });
  }
  if (state.file && !state.idle && !showFile) {
    activity.details = t('activity.editingHidden');
  }

  const project = state.project?.name;
  if (project && settings.showProject && !state.private) {
    activity.state = t('activity.project', { project });
  }
  if (project && settings.showProject && state.private) {
    activity.state = t('activity.privateProject');
  }
  if (settings.showElapsed && state.start) {
    activity.timestamps = { start: state.start };
  }

  const lumenText = state.version ? t('activity.version', { version: state.version }) : 'Lumen';
  activity.assets = { large_image: 'lumen', large_text: lumenText };
  if (settings.repoButton && state.repoUrl && !state.private) {
    activity.buttons = [{ label: t('activity.repoButton'), url: state.repoUrl }];
  }

  const language = state.file?.languageId;
  if (!language || !settings.showLanguage || state.idle) {
    return activity;
  }
  activity.assets = {
    large_image: assetKey(language),
    large_text: state.file.languageName || language,
    small_image: 'lumen',
    small_text: lumenText,
  };
  return activity;
}
