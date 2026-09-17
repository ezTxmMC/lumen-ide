/**
 * The server's project pages: an overview and one page per extension.
 *
 * Plain HTML with the style embedded and the content from Markdown. No
 * scripts, no fonts from foreign servers, nothing to fetch — the pages should
 * run in a walled-off network and without a toolchain too. Whoever runs the
 * server themselves gets a presentable overview page for their extensions with
 * no effort.
 */

import { escapeHtml, renderMarkdown } from './markdown.js'
import { provides } from './store.js'

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
`

function layout(title, body) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body><div class="wrap">${body}</div></body>
</html>
`
}

function badge(entry) {
  const label = escapeHtml((entry.icon ?? entry.name).slice(0, 2))
  return `<span class="badge" style="background:${escapeHtml(entry.color ?? '#7c8cff')}">${label}</span>`
}

/** What the extension brings, as a readable list. */
function providesText(provides) {
  const names = {
    languages: 'Sprachen', themes: 'Themes', commands: 'Befehle', templates: 'Vorlagen',
    projectKinds: 'Projektarten', snippets: 'Snippets', settings: 'Einstellungen', pages: 'Seiten',
  }
  const parts = Object.entries(provides ?? {})
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${count} ${names[key] ?? key}`)
  return parts.join(' · ')
}

export function indexPage(server, extensions) {
  const cards = extensions.map((entry) => `
    <a class="card" href="/e/${encodeURIComponent(entry.id)}">
      <h2>${badge(entry)}${escapeHtml(entry.name)}</h2>
      <p>${escapeHtml(entry.description || 'Ohne Beschreibung')}</p>
      <div class="meta">${escapeHtml(entry.version)}${entry.author ? ` · ${escapeHtml(entry.author)}` : ''}</div>
    </a>`).join('')

  const body = `
    <header>
      <h1>${escapeHtml(server.name)}</h1>
      <p>Erweiterungsserver für Lumen — ${extensions.length} ${extensions.length === 1 ? 'Erweiterung' : 'Erweiterungen'}</p>
    </header>
    ${extensions.length ? `<div class="grid">${cards}</div>` : '<div class="empty">Auf diesem Server liegt noch keine Erweiterung.</div>'}
    <div class="install">
      <p>In Lumen hinzufügen: <strong>Einstellungen → Erweiterungen → Server hinzufügen</strong></p>
      <code>${escapeHtml(server.url)}</code>
    </div>
    <footer>Katalog als JSON: <a href="/api/v1/index">/api/v1/index</a></footer>`
  return layout(server.name, body)
}

export function extensionPage(server, entry) {
  const { manifest, meta } = entry
  const settings = manifest.settings?.length
    ? `<h2>Einstellungen</h2><ul>${manifest.settings
        .map((setting) => `<li><code>${escapeHtml(setting.key)}</code> — ${escapeHtml(setting.label)}</li>`)
        .join('')}</ul>`
    : ''
  const pages = manifest.pages?.length
    ? `<h2>Seiten</h2><ul>${manifest.pages
        .map((page) => `<li>${escapeHtml(page.title)}</li>`)
        .join('')}</ul>`
    : ''
  const links = [
    manifest.homepage ? `<a href="${escapeHtml(manifest.homepage)}" rel="noopener noreferrer">Projektseite</a>` : '',
    manifest.repository ? `<a href="${escapeHtml(manifest.repository)}" rel="noopener noreferrer">Quelltext</a>` : '',
  ].filter(Boolean).join(' · ')

  const body = `
    <header>
      <h1>${badge(manifest)} ${escapeHtml(manifest.name)}</h1>
      <p>${escapeHtml(manifest.description || 'Ohne Beschreibung')}</p>
    </header>

    <div class="install">
      <p>In Lumen installieren: Server hinzufügen, dann <strong>${escapeHtml(manifest.name)}</strong> in der Liste wählen.</p>
      <code>${escapeHtml(server.url)}</code>
    </div>

    <p class="meta">
      Version ${escapeHtml(manifest.version)}${manifest.author ? ` · ${escapeHtml(manifest.author)}` : ''}${manifest.license ? ` · ${escapeHtml(manifest.license)}` : ''}<br>
      Kennung <code>${escapeHtml(manifest.id)}</code><br>
      ${escapeHtml(providesText(provides(manifest)))}
      ${links ? `<br>${links}` : ''}
    </p>
    ${manifest.keywords?.length ? `<div class="tags">${manifest.keywords.map((word) => `<span class="tag">${escapeHtml(word)}</span>`).join('')}</div>` : ''}
    <hr>
    ${renderMarkdown(manifest.readme || `# ${manifest.name}\n\n${manifest.description || ''}`)}
    ${settings}
    ${pages}
    <h2>Versionen</h2>
    <ul>${meta.versions.map((version) => `<li><code>${escapeHtml(version)}</code> — <a href="/api/v1/extensions/${encodeURIComponent(manifest.id)}/${encodeURIComponent(version)}">Manifest</a></li>`).join('')}</ul>
    <footer><a href="/">← Alle Erweiterungen</a></footer>`
  return layout(`${manifest.name} — ${server.name}`, body)
}

export function errorPage(status, message) {
  return layout(`${status}`, `<header><h1>${status}</h1><p>${escapeHtml(message)}</p></header><footer><a href="/">← Alle Erweiterungen</a></footer>`)
}
