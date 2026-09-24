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
 * The server's project pages: an overview and one page per extension.
 *
 * Plain HTML with the style embedded and the content from Markdown. No
 * scripts, no fonts from foreign servers, nothing to fetch — the pages should
 * run in a walled-off network and without a toolchain too. Whoever runs the
 * server themselves gets a presentable overview page for their extensions with
 * no effort.
 */

import { escapeHtml, renderMarkdown } from './markdown.js';
import { provides } from './store.js';

const STYLE = `
:root {
  color-scheme: light dark;
  --bg: #ffffff; --fg: #1b1d21; --muted: #5d636e; --subtle: #878d99;
  --edge: #e2e5ea; --card: #f7f8fa; --accent: #4f5bd5; --code: #f0f2f5;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0e1014; --fg: #e6e8ec; --muted: #a3a9b5; --subtle: #767d8a;
    --edge: #23262d; --card: #14171c; --accent: #8b95ff; --code: #181b21;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 0 20px 64px;
  background: var(--bg); color: var(--fg);
  font: 15px/1.6 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}
.wrap { max-width: 880px; margin: 0 auto; }
header { padding: 40px 0 28px; border-bottom: 1px solid var(--edge); margin-bottom: 28px; }
header h1 { margin: 0 0 6px; font-size: 26px; letter-spacing: -0.02em; }
header p { margin: 0; color: var(--muted); }
a { color: var(--accent); }
.grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
.card {
  display: block; padding: 14px 16px; border: 1px solid var(--edge); border-radius: 12px;
  background: var(--card); text-decoration: none; color: inherit;
}
.card:hover { border-color: var(--accent); }
.card h2 { margin: 0 0 4px; font-size: 15px; display: flex; align-items: center; gap: 8px; }
.card p { margin: 0; color: var(--muted); font-size: 13px; }
.badge {
  display: inline-grid; place-items: center; width: 26px; height: 26px; flex: none;
  border-radius: 7px; font-size: 11px; font-weight: 600; color: #fff;
}
.meta { margin-top: 8px; color: var(--subtle); font-size: 12px; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.tag { padding: 1px 8px; border: 1px solid var(--edge); border-radius: 999px; font-size: 11.5px; color: var(--muted); }
code { background: var(--code); padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
pre { background: var(--code); padding: 12px 14px; border-radius: 10px; overflow-x: auto; }
pre code { background: none; padding: 0; }
blockquote { margin: 0; padding-left: 14px; border-left: 3px solid var(--edge); color: var(--muted); }
table { border-collapse: collapse; }
td, th { border: 1px solid var(--edge); padding: 5px 10px; text-align: left; }
hr { border: none; border-top: 1px solid var(--edge); margin: 24px 0; }
.install { margin: 20px 0; padding: 14px 16px; border: 1px solid var(--edge); border-radius: 12px; background: var(--card); }
.install p { margin: 0 0 8px; color: var(--muted); font-size: 13px; }
.empty { padding: 40px 0; color: var(--subtle); text-align: center; }
footer { margin-top: 48px; padding-top: 18px; border-top: 1px solid var(--edge); color: var(--subtle); font-size: 12.5px; }
`;

const DEFAULT_BADGE_COLOR = '#7c8cff';
const BADGE_LETTERS = 2;
const NO_DESCRIPTION = 'No description';
const BACK_LINK = '<a href="/">← All extensions</a>';

function layout(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body><div class="wrap">${body}</div></body>
</html>
`;
}

function badge(entry) {
  const label = escapeHtml((entry.icon ?? entry.name).slice(0, BADGE_LETTERS));
  return `<span class="badge" style="background:${escapeHtml(entry.color ?? DEFAULT_BADGE_COLOR)}">${label}</span>`;
}

/** Optional text with a separator in front, empty when there is nothing to show. */
function suffix(value) {
  if (!value) {
    return '';
  }
  return ` · ${escapeHtml(value)}`;
}

function pluralize(count) {
  if (count === 1) {
    return 'extension';
  }
  return 'extensions';
}

/** What the extension brings, as a readable list. */
function providesText(provides) {
  const names = {
    languages: 'languages', themes: 'themes', commands: 'commands', templates: 'templates',
    projectKinds: 'project kinds', snippets: 'snippets', settings: 'settings', pages: 'pages', agents: 'agents', code: 'code',
  };
  const parts = Object.entries(provides ?? {})
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${count} ${names[key] ?? key}`);
  return parts.join(' · ');
}

function card(entry) {
  return `
    <a class="card" href="/e/${encodeURIComponent(entry.id)}">
      <h2>${badge(entry)}${escapeHtml(entry.name)}</h2>
      <p>${escapeHtml(entry.description || NO_DESCRIPTION)}</p>
      <div class="meta">${escapeHtml(entry.version)}${suffix(entry.author)}</div>
    </a>`;
}

function cardGrid(extensions) {
  if (!extensions.length) {
    return '<div class="empty">This server does not host any extension yet.</div>';
  }
  return `<div class="grid">${extensions.map(card).join('')}</div>`;
}

export function indexPage(server, extensions) {
  const body = `
    <header>
      <h1>${escapeHtml(server.name)}</h1>
      <p>Extension server for Lumen — ${extensions.length} ${pluralize(extensions.length)}</p>
    </header>
    ${cardGrid(extensions)}
    <div class="install">
      <p>Add it in Lumen: <strong>Settings → Extensions → Add server</strong></p>
      <code>${escapeHtml(server.url)}</code>
    </div>
    <footer>Catalogue as JSON: <a href="/api/v1/index">/api/v1/index</a></footer>`;
  return layout(server.name, body);
}

function listSection(title, items) {
  if (!items?.length) {
    return '';
  }
  return `<h2>${title}</h2><ul>${items.join('')}</ul>`;
}

function externalLink(url, label) {
  if (!url) {
    return '';
  }
  return `<a href="${escapeHtml(url)}" rel="noopener noreferrer">${label}</a>`;
}

function tagList(keywords) {
  if (!keywords?.length) {
    return '';
  }
  const tags = keywords.map((word) => `<span class="tag">${escapeHtml(word)}</span>`).join('');
  return `<div class="tags">${tags}</div>`;
}

function readmeHtml(manifest) {
  if (manifest.readme) {
    return renderMarkdown(manifest.readme);
  }
  return renderMarkdown(`# ${manifest.name}\n\n${manifest.description || ''}`);
}

function versionItem(manifest, version) {
  const href = `/api/v1/extensions/${encodeURIComponent(manifest.id)}/${encodeURIComponent(version)}`;
  return `<li><code>${escapeHtml(version)}</code> — <a href="${href}">Manifest</a></li>`;
}

export function extensionPage(server, entry) {
  const { manifest, meta } = entry;
  const settings = listSection('Settings', manifest.settings?.map((setting) => `<li><code>${escapeHtml(setting.key)}</code> — ${escapeHtml(setting.label)}</li>`));
  const pages = listSection('Pages', manifest.pages?.map((page) => `<li>${escapeHtml(page.title)}</li>`));
  const links = [
    externalLink(manifest.homepage, 'Project page'),
    externalLink(manifest.repository, 'Source code'),
  ].filter(Boolean).join(' · ');
  const linkLine = links ? `<br>${links}` : '';

  const body = `
    <header>
      <h1>${badge(manifest)} ${escapeHtml(manifest.name)}</h1>
      <p>${escapeHtml(manifest.description || NO_DESCRIPTION)}</p>
    </header>

    <div class="install">
      <p>Install in Lumen: add the server, then pick <strong>${escapeHtml(manifest.name)}</strong> from the list.</p>
      <code>${escapeHtml(server.url)}</code>
    </div>

    <p class="meta">
      Version ${escapeHtml(manifest.version)}${suffix(manifest.author)}${suffix(manifest.license)}<br>
      Identifier <code>${escapeHtml(manifest.id)}</code><br>
      ${escapeHtml(providesText(provides(manifest)))}
      ${linkLine}
    </p>
    ${tagList(manifest.keywords)}
    <hr>
    ${readmeHtml(manifest)}
    ${settings}
    ${pages}
    <h2>Versions</h2>
    <ul>${meta.versions.map((version) => versionItem(manifest, version)).join('')}</ul>
    <footer>${BACK_LINK}</footer>`;
  return layout(`${manifest.name} — ${server.name}`, body);
}

export function errorPage(status, message) {
  return layout(`${status}`, `<header><h1>${status}</h1><p>${escapeHtml(message)}</p></header><footer>${BACK_LINK}</footer>`);
}
