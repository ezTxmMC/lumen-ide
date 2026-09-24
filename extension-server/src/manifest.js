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
 * Checking an extension manifest.
 *
 * The server accepts only what it can also describe: the catalogue and the
 * project pages are built from the same fields. The check happens here by
 * design rather than in Lumen — a manifest the server accepts must work out in
 * every client, an older one included.
 *
 * Deliberately without a dependency on Lumen's source: the server runs on its
 * own, often on another machine and in another version. It checks the shell —
 * the id, the version, the size, the rough shape — and does not touch the
 * contents of the add-on. What stands in there Lumen checks once more itself
 * before loading it.
 */

/** The version of the manifest format this server understands. */
export const MANIFEST_SCHEMA = 1;

/** Ids: `ext.` for server extensions, `user.` for ones built by hand. */
export const ID_PATTERN = /^(?:ext|user)\.[a-z0-9][a-z0-9._-]{0,63}$/;

/** A semantic version, optionally with a prerelease tag (`1.2.0-beta.1`). */
export const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** A manifest larger than this the server does not accept. */
export const MAX_MANIFEST_BYTES = 6 * 1024 * 1024;

const CATEGORIES = new Set(['language', 'theme', 'tool']);
const SETTING_TYPES = new Set(['text', 'number', 'toggle', 'select', 'multiselect', 'list', 'textarea', 'path', 'color', 'secret']);
const PAGE_FORMATS = new Set(['markdown', 'html']);
const PAGE_LOCATIONS = new Set(['sidebar', 'left', 'right', 'bottom', 'editor']);
const VIEW_LOCATIONS = new Set(['left', 'right', 'bottom']);
/** A view may also be a tab in the editor area, opened by its code. */
const CODE_VIEW_LOCATIONS = new Set([...VIEW_LOCATIONS, 'editor']);
const LOCAL_ID = /^[a-z][a-z0-9.-]{0,63}$/;

/** The bundled program code of an extension may not be larger than this. */
export const MAX_CODE_CHARS = 3 * 1024 * 1024;

export class ManifestError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ManifestError';
    this.field = field;
  }
}

const fail = (message, field) => { throw new ManifestError(message, field); };

function text(value, field, { max = 200, required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      fail(`${field} is missing`, field);
    }
    return undefined;
  }
  if (typeof value !== 'string') {
    fail(`${field} must be text`, field);
  }
  if (value.length > max) {
    fail(`${field} is longer than ${max} characters`, field);
  }
  return value;
}

function list(value, field, { max = 64 } = {}) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    fail(`${field} must be a list`, field);
  }
  if (value.length > max) {
    fail(`${field} has more than ${max} entries`, field);
  }
  return value;
}

/** `https:` only — and `http:` for local servers during development alone. */
function link(value, field) {
  const raw = text(value, field, { max: 500 });
  if (!raw) {
    return undefined;
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail(`${field} is not a valid address`, field);
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    fail(`${field} must use https`, field);
  }
  return raw;
}

const LANGUAGE_KEY = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;

/**
 * `i18n: { en: { label: '…' }, fr: { … } }` — the same texts in other
 * interface languages. `limits` names each allowed text field with its length.
 */
function checkI18n(value, where, limits, { choices = false } = {}) {
  if (value === undefined) {
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${where}.i18n must be an object`, `${where}.i18n`);
  }
  const languages = Object.keys(value);
  if (languages.length > 32) {
    fail(`${where}.i18n has more than 32 languages`, `${where}.i18n`);
  }
  for (const language of languages) {
    const field = `${where}.i18n.${language}`;
    if (!LANGUAGE_KEY.test(language)) {
      fail(`${field} — unknown language code`, field);
    }
    const texts = value[language];
    if (!texts || typeof texts !== 'object' || Array.isArray(texts)) {
      fail(`${field} must be an object`, field);
    }
    for (const key of Object.keys(texts)) {
      if (key === 'choices' && choices) {
        continue;
      }
      if (!(key in limits)) {
        fail(`${field}.${key} cannot be translated here`, `${field}.${key}`);
      }
      text(texts[key], `${field}.${key}`, { max: limits[key] });
    }
    if (texts.choices === undefined) {
      continue;
    }
    if (!texts.choices || typeof texts.choices !== 'object' || Array.isArray(texts.choices)) {
      fail(`${field}.choices must be an object`, `${field}.choices`);
    }
    for (const [choice, label] of Object.entries(texts.choices)) {
      text(label, `${field}.choices.${choice}`, { max: 120 });
    }
  }
}

function checkSetting(setting, index) {
  const where = `settings[${index}]`;
  if (!setting || typeof setting !== 'object') {
    fail(`${where} must be an object`, where);
  }
  const key = text(setting.key, `${where}.key`, { max: 64, required: true });
  if (!/^[a-z][a-zA-Z0-9]*$/.test(key)) {
    fail(`${where}.key must start with a lowercase letter and contain only letters and digits`, `${where}.key`);
  }
  text(setting.label, `${where}.label`, { max: 120, required: true });
  text(setting.hint, `${where}.hint`, { max: 400 });
  text(setting.section, `${where}.section`, { max: 80 });
  text(setting.when, `${where}.when`, { max: 120 });
  text(setting.placeholder, `${where}.placeholder`, { max: 200 });
  for (const field of ['min', 'max', 'step', 'rows']) {
    if (setting[field] !== undefined && typeof setting[field] !== 'number') {
      fail(`${where}.${field} must be a number`, `${where}.${field}`);
    }
  }
  if (setting.pathKind !== undefined && setting.pathKind !== 'file' && setting.pathKind !== 'folder') {
    fail(`${where}.pathKind must be file or folder`, `${where}.pathKind`);
  }
  const type = setting.type ?? 'text';
  if (!SETTING_TYPES.has(type)) {
    fail(`${where}.type must be one of ${[...SETTING_TYPES].join(', ')}`, `${where}.type`);
  }
  if (type === 'secret' && setting.default) {
    fail(`${where}.default — a secret has no default value`, `${where}.default`);
  }
  checkI18n(setting.i18n, where, { label: 120, hint: 400, section: 80, placeholder: 200 }, { choices: true });
  if (type !== 'select' && type !== 'multiselect') {
    return key;
  }
  const choices = list(setting.choices, `${where}.choices`, { max: 128 });
  if (!choices.length) {
    fail(`${where}.choices is missing — a choice needs entries`, `${where}.choices`);
  }
  choices.forEach((choice, i) => {
    text(choice?.value, `${where}.choices[${i}].value`, { max: 120, required: true });
    text(choice?.label, `${where}.choices[${i}].label`, { max: 120, required: true });
  });
  return key;
}

function checkPage(page, index) {
  const where = `pages[${index}]`;
  if (!page || typeof page !== 'object') {
    fail(`${where} must be an object`, where);
  }
  const id = text(page.id, `${where}.id`, { max: 64, required: true });
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    fail(`${where}.id may contain only lowercase letters, digits and hyphens`, `${where}.id`);
  }
  text(page.title, `${where}.title`, { max: 120, required: true });
  text(page.icon, `${where}.icon`, { max: 64 });
  const format = page.format ?? 'markdown';
  if (!PAGE_FORMATS.has(format)) {
    fail(`${where}.format must be markdown or html`, `${where}.format`);
  }
  const location = page.location ?? 'editor';
  if (!PAGE_LOCATIONS.has(location)) {
    fail(`${where}.location must be one of ${[...PAGE_LOCATIONS].join(', ')}`, `${where}.location`);
  }
  text(page.content, `${where}.content`, { max: 512 * 1024, required: true });
  return id;
}

function checkAgent(agent, index) {
  const where = `agents[${index}]`;
  if (!agent || typeof agent !== 'object') {
    fail(`${where} must be an object`, where);
  }
  const id = text(agent.id, `${where}.id`, { max: 64, required: true });
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    fail(`${where}.id may contain only lowercase letters, digits and hyphens`, `${where}.id`);
  }
  text(agent.name, `${where}.name`, { max: 80, required: true });
  text(agent.description, `${where}.description`, { max: 300 });
  text(agent.icon, `${where}.icon`, { max: 64 });
  text(agent.placeholder, `${where}.placeholder`, { max: 200 });
  const modes = list(agent.modes, `${where}.modes`, { max: 8 });
  const modeIds = modes.map((mode, i) => {
    const modeId = text(mode?.id, `${where}.modes[${i}].id`, { max: 64, required: true });
    text(mode?.label, `${where}.modes[${i}].label`, { max: 60, required: true });
    text(mode?.description, `${where}.modes[${i}].description`, { max: 200 });
    return modeId;
  });
  requireUnique(modeIds, `${where}.modes.id`);
  const models = list(agent.models, `${where}.models`, { max: 32 });
  requireUnique(models.map((model, i) => {
    const modelId = text(model?.id, `${where}.models[${i}].id`, { max: 120, required: true });
    text(model?.label, `${where}.models[${i}].label`, { max: 80, required: true });
    text(model?.description, `${where}.models[${i}].description`, { max: 200 });
    const efforts = list(model?.efforts, `${where}.models[${i}].efforts`, { max: 12 });
    requireUnique(efforts.map((effort, j) => {
      const effortId = text(effort?.id, `${where}.models[${i}].efforts[${j}].id`, { max: 32, required: true });
      text(effort?.label, `${where}.models[${i}].efforts[${j}].label`, { max: 60 });
      text(effort?.description, `${where}.models[${i}].efforts[${j}].description`, { max: 200 });
      return effortId;
    }), `${where}.models[${i}].efforts.id`);
    text(model?.defaultEffort, `${where}.models[${i}].defaultEffort`, { max: 32 });
    if (model?.isDefault !== undefined && typeof model.isDefault !== 'boolean') {
      fail(`${where}.models[${i}].isDefault must be true or false`, `${where}.models[${i}].isDefault`);
    }
    return modelId;
  }), `${where}.models.id`);
  text(agent.modelSetting, `${where}.modelSetting`, { max: 64 });
  if (agent.location !== undefined && !VIEW_LOCATIONS.has(agent.location)) {
    fail(`${where}.location must be left, right or bottom`, `${where}.location`);
  }
  list(agent.suggestions, `${where}.suggestions`, { max: 12 }).forEach((entry, i) => text(entry, `${where}.suggestions[${i}]`, { max: 200, required: true }));
  if (agent.images !== undefined && typeof agent.images !== 'boolean') {
    fail(`${where}.images must be true or false`, `${where}.images`);
  }
  return id;
}

function checkView(view, index) {
  const where = `views[${index}]`;
  if (!view || typeof view !== 'object') {
    fail(`${where} must be an object`, where);
  }
  const id = text(view.id, `${where}.id`, { max: 64, required: true });
  if (!LOCAL_ID.test(id)) {
    fail(`${where}.id may contain only lowercase letters, digits, dots and hyphens`, `${where}.id`);
  }
  text(view.title, `${where}.title`, { max: 80, required: true });
  checkI18n(view.i18n, where, { title: 80 });
  text(view.icon, `${where}.icon`, { max: 64 });
  if (view.location !== undefined && !CODE_VIEW_LOCATIONS.has(view.location)) {
    fail(`${where}.location must be left, right, bottom or editor`, `${where}.location`);
  }
  if (view.order !== undefined && typeof view.order !== 'number') {
    fail(`${where}.order must be a number`, `${where}.order`);
  }
  return id;
}

function checkCommand(command, index) {
  const where = `commands[${index}]`;
  if (!command || typeof command !== 'object') {
    fail(`${where} must be an object`, where);
  }
  const id = text(command.id, `${where}.id`, { max: 64, required: true });
  if (!LOCAL_ID.test(id)) {
    fail(`${where}.id may contain only lowercase letters, digits, dots and hyphens`, `${where}.id`);
  }
  text(command.title, `${where}.title`, { max: 120, required: true });
  text(command.category, `${where}.category`, { max: 60 });
  text(command.keybinding, `${where}.keybinding`, { max: 60 });
  text(command.icon, `${where}.icon`, { max: 64 });
  checkI18n(command.i18n, where, { title: 120, category: 60 });
  return id;
}

/**
 * Program code, run once the user has approved it: `main` in Lumen's main
 * process, `renderer` in its window (an add-on with computed templates and
 * project kinds). At least one of the two.
 */
function checkCode(code) {
  if (code === undefined) {
    return undefined;
  }
  if (!code || typeof code !== 'object' || Array.isArray(code)) {
    fail('code must be an object', 'code');
  }
  const main = text(code.main, 'code.main', { max: MAX_CODE_CHARS });
  const renderer = text(code.renderer, 'code.renderer', { max: MAX_CODE_CHARS });
  if (!main && !renderer) {
    fail('code needs main or renderer', 'code');
  }
  return { ...(main ? { main } : {}), ...(renderer ? { renderer } : {}) };
}

/** A kind of file the extension opens itself: a command of its own and name patterns (`*.db`). */
function checkOpenWith(entry, index, commandIds) {
  const where = `openWith[${index}]`;
  if (!entry || typeof entry !== 'object') {
    fail(`${where} must be an object`, where);
  }
  const command = text(entry.command, `${where}.command`, { max: 64, required: true });
  if (!commandIds.includes(command)) {
    fail(`${where}.command "${command}" is not listed under commands`, `${where}.command`);
  }
  const title = text(entry.title, `${where}.title`, { max: 80, required: true });
  checkI18n(entry.i18n, where, { title: 80 });
  const patterns = list(entry.patterns, `${where}.patterns`, { max: 32 });
  if (!patterns.length) {
    fail(`${where}.patterns is missing`, `${where}.patterns`);
  }
  patterns.forEach((pattern, i) => {
    text(pattern, `${where}.patterns[${i}]`, { max: 64, required: true });
    if (pattern.slice(1).includes('*') || /[\\/]/.test(pattern)) {
      fail(`${where}.patterns[${i}] — only a leading * and a file name`, `${where}.patterns[${i}]`);
    }
  });
  return { command, title, patterns, ...(entry.i18n ? { i18n: entry.i18n } : {}) };
}

/** The oldest Lumen the extension needs: a version number such as `0.5.0`. */
function checkMinAppVersion(value) {
  const version = text(value, 'minAppVersion', { max: 32 });
  if (version !== undefined && !/^\d+(\.\d+){0,2}(-[\w.]+)?$/.test(version)) {
    fail('minAppVersion must be a version number, such as 0.5.0', 'minAppVersion');
  }
  return version;
}

/** Report duplicate ids in a list. */
function requireUnique(ids, what) {
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) {
      fail(`${what} "${id}" occurs more than once`, what);
    }
    seen.add(id);
  }
}

/**
 * Check a manifest and return it in the shape in which it is stored.
 *
 * Throws `ManifestError` naming the field concerned — the caller turns that
 * into an answer telling the publisher what to change.
 */
export function checkManifest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('Manifest must be an object');
  }
  if (raw.schema !== MANIFEST_SCHEMA) {
    fail(`schema must be ${MANIFEST_SCHEMA} (read: ${JSON.stringify(raw.schema)})`, 'schema');
  }

  const id = text(raw.id, 'id', { max: 64, required: true });
  if (!ID_PATTERN.test(id)) {
    fail('id must start with "ext." or "user." and contain only lowercase letters, digits, dots, hyphens and underscores', 'id');
  }

  const version = text(raw.version, 'version', { max: 64, required: true });
  if (!VERSION_PATTERN.test(version)) {
    fail('version must follow the form 1.2.3', 'version');
  }

  const name = text(raw.name, 'name', { max: 80, required: true });
  const category = raw.category ?? 'tool';
  if (!CATEGORIES.has(category)) {
    fail(`category must be one of ${[...CATEGORIES].join(', ')}`, 'category');
  }

  const addon = raw.addon;
  if (!addon || typeof addon !== 'object' || Array.isArray(addon)) {
    fail('addon is missing — it says what the extension brings', 'addon');
  }
  if (addon.id !== id) {
    fail('addon.id must match the id of the extension', 'addon.id');
  }
  if (addon.version !== version) {
    fail('addon.version must match the version of the extension', 'addon.version');
  }

  const settings = list(raw.settings, 'settings', { max: 64 });
  requireUnique(settings.map(checkSetting), 'settings.key');

  const pages = list(raw.pages, 'pages', { max: 16 });
  requireUnique(pages.map(checkPage), 'pages.id');

  const agents = list(raw.agents, 'agents', { max: 8 });
  requireUnique(agents.map(checkAgent), 'agents.id');
  const views = list(raw.views, 'views', { max: 16 });
  requireUnique(views.map(checkView), 'views.id');
  const commands = list(raw.commands, 'commands', { max: 128 });
  const commandIds = commands.map(checkCommand);
  requireUnique(commandIds, 'commands.id');
  const openWith = list(raw.openWith, 'openWith', { max: 16 }).map((entry, index) => checkOpenWith(entry, index, commandIds));
  const code = checkCode(raw.code);
  if (agents.length && !code?.main) {
    fail('agents needs code.main — without code there is no agent', 'code');
  }
  if (views.length && !code?.main) {
    fail('views needs code.main — without code a view has no content', 'code');
  }
  if (commands.length && !code?.main) {
    fail('commands needs code.main — without code a command does nothing', 'code');
  }

  const keywords = list(raw.keywords, 'keywords', { max: 16 });
  keywords.forEach((word, i) => text(word, `keywords[${i}]`, { max: 40, required: true }));

  return {
    schema: MANIFEST_SCHEMA,
    id,
    name,
    version,
    category,
    description: text(raw.description, 'description', { max: 300 }) ?? '',
    author: text(raw.author, 'author', { max: 120}) ?? '',
    icon: text(raw.icon, 'icon', { max: 64 }) ?? name.slice(0, 2),
    color: text(raw.color, 'color', { max: 32 }) ?? '#7c8cff',
    license: text(raw.license, 'license', { max: 64 }),
    homepage: link(raw.homepage, 'homepage'),
    repository: link(raw.repository, 'repository'),
    minAppVersion: checkMinAppVersion(raw.minAppVersion),
    keywords,
    readme: text(raw.readme, 'readme', { max: 512 * 1024 }) ?? '',
    settings,
    pages,
    agents,
    views,
    commands,
    ...(openWith.length ? { openWith } : {}),
    ...(code ? { code } : {}),
    addon,
  };
}

/** Descending by version: `2.0.0` before `1.9.0` before `1.9.0-beta.1`. */
export function compareVersions(a, b) {
  const [coreA, preA = ''] = String(a).split('-', 2);
  const [coreB, preB = ''] = String(b).split('-', 2);
  const partsA = coreA.split('.').map(Number);
  const partsB = coreB.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (partsB[i] || 0) - (partsA[i] || 0);
    if (diff !== 0) {
      return diff;
    }
  }
  // A prerelease comes after the finished version of the same number.
  if (preA === preB) {
    return 0;
  }
  if (!preA) {
    return -1;
  }
  if (!preB) {
    return 1;
  }
  return preA < preB ? 1 : -1;
}
