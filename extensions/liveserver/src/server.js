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
 * The live server: serves a folder over HTTP, tells open pages to reload when
 * a file changes, and hands PHP to PHP's own development server (`php -S`)
 * while still injecting the reload script into what comes back.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const EVENTS_PATH = '/__lumen_livereload';
export const CLIENT_PATH = '/__lumen_livereload.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.xhtml': 'application/xhtml+xml; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
};

const INDEX_FILES = ['index.html', 'index.htm', 'index.php'];

const CLIENT_SCRIPT = `(() => {
  const source = new EventSource('${EVENTS_PATH}')
  source.addEventListener('reload', () => location.reload())
  source.addEventListener('css', () => {
    for (const link of document.querySelectorAll('link[rel~="stylesheet"][href]')) {
      const url = new URL(link.href, location.href)
      if (url.origin !== location.origin) continue
      url.searchParams.set('__lumen', Date.now())
      const fresh = link.cloneNode()
      fresh.href = url.href
      fresh.onload = () => link.remove()
      link.after(fresh)
    }
  })
})()
`;

const SNIPPET = `<script src="${CLIENT_PATH}"></script>`;

/** Put the reload script in front of `</body>` — or at the end, for fragments and pages without one. */
export function injectScript(html) {
  const at = html.search(/<\/body\s*>/i);
  if (at === -1) {
    return html + SNIPPET;
  }
  return html.slice(0, at) + SNIPPET + html.slice(at);
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
}

function page(title, body, status = 200) {
  const html = `<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;max-width:52rem;margin:2rem auto;padding:0 1rem;color:#222}a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}li{list-style:none;padding:.1rem 0}code{background:#eee;padding:.1rem .3rem;border-radius:4px}</style>
${body}`;
  return { status, html: injectScript(html) };
}

async function isFreePort(port, host) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, host);
  });
}

async function findPort(start, host, attempts = 20) {
  for (let port = start; port < start + attempts; port += 1) {
    if (await isFreePort(port, host)) {
      return port;
    }
  }
  throw new Error(`No free port from ${start} to ${start + attempts - 1}`);
}

async function phpAvailable(phpPath) {
  return new Promise((resolve) => {
    const child = spawn(phpPath, ['-v'], { stdio: 'ignore' });
    child.once('error', () => resolve(false));
    child.once('exit', (code) => resolve(code === 0));
  });
}

function send(res, status, headers, body) {
  res.writeHead(status, { 'cache-control': 'no-store', ...headers });
  res.end(body);
}

function sendPage(res, made) {
  send(res, made.status, { 'content-type': MIME['.html'] }, made.html);
}

/** Starts PHP's built-in server on a free port, or reports why not; `php` is `null` when it is off. */
async function startPhp(options, log) {
  const phpOn = options.php && (await phpAvailable(options.phpPath));
  const phpPort = phpOn ? await findPort(options.port + 1000, '127.0.0.1') : 0;
  const php = phpOn
    ? spawn(options.phpPath, ['-S', `127.0.0.1:${phpPort}`, '-t', options.root], { cwd: options.root, stdio: ['ignore', 'ignore', 'pipe'] })
    : null;
  // PHP logs every request to stderr — only what looks like a problem is worth a line.
  php?.stderr.on('data', (chunk) => {
    for (const line of String(chunk).split('\n')) {
      if (/(Warning|Fatal|Parse error|Notice|Deprecated)/i.test(line)) {
        log(line.trim());
      }
    }
  });
  php?.on('error', (err) => log(`php: ${err.message}`));
  if (options.php && !phpOn) {
    log(`php not found (${options.phpPath}) — .php files are not run`);
  }
  return { php, phpOn, phpPort };
}

function proxy(req, res, { phpPort, liveReload }) {
  const headers = { ...req.headers, 'accept-encoding': 'identity', host: `127.0.0.1:${phpPort}` };
  const upstream = http.request({ host: '127.0.0.1', port: phpPort, path: req.url, method: req.method, headers }, (reply) => {
    const type = String(reply.headers['content-type'] ?? '');
    if (!liveReload || !type.includes('text/html')) {
      res.writeHead(reply.statusCode ?? 502, reply.headers);
      reply.pipe(res);
      return;
    }
    const chunks = [];
    reply.on('data', (chunk) => chunks.push(chunk));
    reply.on('end', () => {
      const body = injectScript(Buffer.concat(chunks).toString('utf8'));
      const { 'content-length': _length, ...rest } = reply.headers;
      res.writeHead(reply.statusCode ?? 502, rest);
      res.end(body);
    });
  });
  upstream.on('error', (err) => sendPage(res, page('PHP', `<h1>PHP</h1><p>${escapeHtml(err.message)}</p>`, 502)));
  req.pipe(upstream);
}

async function listing(res, dir, urlPath) {
  const names = await fsp.readdir(dir, { withFileTypes: true });
  const rows = names
    .filter((entry) => !entry.name.startsWith('.'))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .map((entry) => {
      const name = entry.name + (entry.isDirectory() ? '/' : '');
      return `<li><a href="${encodeURI(path.posix.join(urlPath, name))}">${escapeHtml(name)}</a></li>`;
    });
  const up = urlPath === '/' ? '' : '<li><a href="../">../</a></li>';
  sendPage(res, page(urlPath, `<h1>${escapeHtml(urlPath)}</h1><ul>${up}${rows.join('')}</ul>`));
}

async function serveFile(res, file, req, liveReload) {
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] ?? 'application/octet-stream';
  if (ext === '.php') {
    sendPage(
      res,
      page(
        'PHP',
        `<h1>PHP is not available</h1><p>Install PHP or set its path in the extension's settings — <code>${escapeHtml(path.basename(file))}</code> was not run.</p>`,
        501,
      ),
    );
    return;
  }
  if (liveReload && (ext === '.html' || ext === '.htm' || ext === '.xhtml')) {
    send(res, 200, { 'content-type': type }, injectScript(await fsp.readFile(file, 'utf8')));
    return;
  }
  const stat = await fsp.stat(file);
  res.writeHead(200, { 'content-type': type, 'content-length': stat.size, 'cache-control': 'no-store' });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res);
}

/** Serves the first existing index file of `dir`; `false` when there is none. */
async function serveIndex(res, dir, req, liveReload) {
  for (const name of INDEX_FILES) {
    const index = path.join(dir, name);
    const isFile = await fsp.stat(index).then(
      (s) => s.isFile(),
      () => false,
    );
    if (isFile) {
      await serveFile(res, index, req, liveReload);
      return true;
    }
  }
  return false;
}

/** The static part of a request: maps the URL to a file or folder below the root. */
async function serveStatic(req, res, url, { root, liveReload }) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(url.pathname);
  } catch {
    sendPage(res, page('400', '<h1>Bad request</h1>', 400));
    return;
  }
  const target = path.resolve(root, `.${urlPath}`);
  if (!isInside(root, target)) {
    sendPage(res, page('403', '<h1>Forbidden</h1>', 403));
    return;
  }
  const stat = await fsp.stat(target).catch(() => null);
  if (!stat) {
    sendPage(res, page('404', `<h1>404</h1><p><code>${escapeHtml(urlPath)}</code> was not found.</p>`, 404));
    return;
  }
  if (!stat.isDirectory()) {
    await serveFile(res, target, req, liveReload);
    return;
  }
  if (!urlPath.endsWith('/')) {
    send(res, 301, { location: `${url.pathname}/${url.search}` }, '');
    return;
  }
  if (await serveIndex(res, target, req, liveReload)) {
    return;
  }
  await listing(res, target, urlPath);
}

async function handle(req, res, env) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === EVENTS_PATH) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write('retry: 800\n\n');
    env.clients.add(res);
    req.on('close', () => env.clients.delete(res));
    return;
  }
  if (url.pathname === CLIENT_PATH) {
    send(res, 200, { 'content-type': MIME['.js'] }, CLIENT_SCRIPT);
    return;
  }
  if (env.phpOn) {
    proxy(req, res, env);
    return;
  }
  await serveStatic(req, res, url, env);
}

/** Watches the root and tells the connected pages to reload or swap styles. */
function createWatcher({ root, liveReload, ignore, reloadOn, clients, log }) {
  let pending = null;
  let kind = 'css';
  const notify = (event) => {
    if (!liveReload) {
      return;
    }
    // A reload wins over a style swap when both are due.
    if (event === 'reload') {
      kind = 'reload';
    }
    if (pending) {
      return;
    }
    pending = setTimeout(() => {
      pending = null;
      for (const client of clients) {
        client.write(`event: ${kind}\ndata: ${Date.now()}\n\n`);
      }
      kind = 'css';
    }, 80);
  };

  const ignored = new Set(ignore);
  const changed = (file) => {
    const relative = file.split(/[\\/]/);
    if (relative.some((part) => ignored.has(part))) {
      return;
    }
    const ext = path.extname(file).toLowerCase();
    if (ext === '.css') {
      notify('css');
      return;
    }
    if (reloadOn.has(ext)) {
      notify('reload');
    }
  };

  let watcher = null;
  try {
    watcher = fs.watch(root, { recursive: true }, (_type, file) => {
      if (file) {
        changed(String(file));
      }
    });
    watcher.on('error', () => {});
  } catch (err) {
    log(`Watching ${root} failed (${err.message}) — pages reload on save only`);
  }
  const keepAlive = setInterval(() => {
    for (const client of clients) {
      client.write(': ping\n\n');
    }
  }, 20_000);

  return {
    changed,
    stop() {
      clearInterval(keepAlive);
      if (pending) {
        clearTimeout(pending);
      }
      watcher?.close();
    },
  };
}

/**
 * @param {object} options
 * @param {string} options.root        folder to serve
 * @param {number} options.port        first port to try
 * @param {string} options.host
 * @param {boolean} options.liveReload
 * @param {boolean} options.php        use PHP's server for .php files when `php` is found
 * @param {string} options.phpPath
 * @param {string[]} options.ignore    folder names never watched
 * @param {string[]} options.reloadOn  extensions (with dot) that reload the page; `.css` swaps styles instead
 * @param {(line: string) => void} options.log
 */
export async function startLiveServer(options) {
  const { root, host, liveReload, ignore, log } = options;
  const reloadOn = new Set(options.reloadOn);
  const clients = new Set();

  const { php, phpOn, phpPort } = await startPhp(options, log);
  const env = { root, liveReload, phpOn, phpPort, clients };

  const server = http.createServer((req, res) => {
    handle(req, res, env).catch((err) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      sendPage(res, page('500', `<h1>500</h1><pre>${escapeHtml(String(err?.stack ?? err))}</pre>`, 500));
    });
  });

  const port = await findPort(options.port, host);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const watching = createWatcher({ root, liveReload, ignore, reloadOn, clients, log });

  return {
    port,
    host,
    phpEnabled: phpOn,
    /** A change reported from outside (a save in Lumen) — for when the watcher misses it. */
    changed: watching.changed,
    async stop() {
      watching.stop();
      for (const client of clients) {
        client.end();
      }
      php?.kill();
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections?.();
      });
    },
  };
}
