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
 * The HTTP interface of the extension server.
 *
 * Two faces on the same port:
 *   • `/api/v1/…` — what Lumen fetches: the catalogue, the details, the manifests.
 *   • `/` and `/e/<id>` — project pages to look at in a browser.
 *
 * Reading is open, writing needs a token (`Authorization: Bearer …`). With no
 * token set up the server accepts nothing — a freshly started server is
 * therefore never open by accident.
 *
 * CORS stands at `*`, but for the read paths alone: the catalogue is public and
 * Lumen should be able to fetch it directly. Publishing never runs from inside
 * a browser.
 */

import crypto from 'node:crypto';
import http from 'node:http';
import { URL } from 'node:url';
import { ManifestError, MAX_MANIFEST_BYTES, checkManifest } from './manifest.js';
import { errorPage, extensionPage, indexPage } from './pages.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'cache-control': 'no-cache',
};

function sendJson(response, status, data) {
  const body = `${JSON.stringify(data, null, 2)}\n`;
  response.writeHead(status, { ...JSON_HEADERS, 'content-length': Buffer.byteLength(body) });
  response.end(body);
}

function sendHtml(response, status, html) {
  response.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    // The pages make do entirely without scripts and without foreign sources.
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src * data:; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
    'content-length': Buffer.byteLength(html),
  });
  response.end(html);
}

/** Read the body of the request, with a hard upper bound. */
function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error(`Request larger than ${limit} bytes`), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

/**
 * Check the token — in constant time.
 *
 * A plain comparison gives away, through how long it takes, how many
 * characters at the start are right. For a token arriving over the network that
 * is a way in.
 */
function tokenMatches(tokens, candidate) {
  if (!candidate) {
    return false;
  }
  const given = Buffer.from(candidate);
  let hit = false;
  for (const token of tokens) {
    const expected = Buffer.from(token);
    if (expected.length !== given.length) {
      continue;
    }
    // `timingSafeEqual` needs equal lengths — the length check above is
    // harmless, token lengths are no secret.
    if (crypto.timingSafeEqual(expected, given)) {
      hit = true;
    }
  }
  return hit;
}

function bearer(request) {
  const header = request.headers.authorization ?? '';
  // No regex over the whole header: whitespace runs make that slow on hostile input.
  const value = header.trim();
  if (value.slice(0, 6).toLowerCase() !== 'bearer' || !/^\s/.test(value.slice(6, 7))) {
    return null;
  }
  return value.slice(7).trim() || null;
}

const EXTENSION_PATH = /^\/api\/v1\/extensions\/([^/]+)(?:\/([^/]+))?$/;
const PAGE_PATH = /^\/e\/([^/]+)\/?$/;

/** The read-only routes that need no lookup in the URL. */
function createRoutes({ store, config, server }) {
  return {
    /** A short profile — Lumen uses it to check whether an address is a server. */
    'GET /api/v1/info': (_request, response) => sendJson(response, 200, {
      schema: 1,
      product: 'lumen-extension-server',
      name: config.name,
      url: config.publicUrl,
      extensions: store.latest.size,
    }),

    'GET /api/v1/index': (_request, response, url) => {
      const query = url.searchParams.get('q') ?? '';
      sendJson(response, 200, {
        schema: 1,
        server,
        updatedAt: new Date().toISOString(),
        extensions: store.search(query),
      });
    },
  };
}

/** GET /api/v1/extensions/<id>[/<version>] */
async function getExtension({ store, server }, response, api) {
  const id = decodeURIComponent(api[1]);
  const version = api[2] ? decodeURIComponent(api[2]) : null;
  const entry = store.get(id);
  if (!entry) {
    return sendJson(response, 404, { error: 'not_found', message: `Unknown extension: ${id}` });
  }
  if (!version) {
    return sendJson(response, 200, { schema: 1, server, ...entry.meta, manifest: entry.manifest });
  }
  const manifest = await store.manifest(id, version);
  if (!manifest) {
    return sendJson(response, 404, { error: 'not_found', message: `Unknown version: ${version}` });
  }
  return sendJson(response, 200, manifest);
}

/** DELETE /api/v1/extensions/<id>/<version> */
async function deleteExtension({ store, config }, request, response, api) {
  if (!tokenMatches(config.tokens, bearer(request))) {
    return sendJson(response, 401, { error: 'unauthorized', message: 'A valid token is required' });
  }
  const id = decodeURIComponent(api[1]);
  const version = api[2] ? decodeURIComponent(api[2]) : null;
  if (!version) {
    return sendJson(response, 400, { error: 'bad_request', message: 'Version missing' });
  }
  if (!store.get(id)) {
    return sendJson(response, 404, { error: 'not_found', message: `Unknown extension: ${id}` });
  }
  await store.remove(id, version);
  return sendJson(response, 200, { ok: true, id, version });
}

/** The manifest from the request body: `{ manifest }` or the error already sent as `{ failure }`. */
async function readManifest(request) {
  let payload;
  try {
    payload = JSON.parse((await readBody(request, MAX_MANIFEST_BYTES)).toString('utf8'));
  } catch (err) {
    return { failure: { status: err.status ?? 400, body: { error: 'bad_json', message: err.message } } };
  }
  try {
    return { manifest: checkManifest(payload) };
  } catch (err) {
    if (!(err instanceof ManifestError)) {
      throw err;
    }
    return { failure: { status: 422, body: { error: 'invalid_manifest', field: err.field, message: err.message } } };
  }
}

/** POST /api/v1/publish */
async function publishExtension({ store, config }, request, response) {
  if (!config.tokens.length) {
    return sendJson(response, 503, {
      error: 'publishing_disabled',
      message: 'No token is set up on this server — publishing is disabled.',
    });
  }
  if (!tokenMatches(config.tokens, bearer(request))) {
    return sendJson(response, 401, { error: 'unauthorized', message: 'A valid token is required' });
  }
  const { manifest, failure } = await readManifest(request);
  if (failure) {
    return sendJson(response, failure.status, failure.body);
  }
  const existing = await store.manifest(manifest.id, manifest.version);
  if (existing && !config.allowOverwrite) {
    return sendJson(response, 409, {
      error: 'version_exists',
      message: `${manifest.id} ${manifest.version} already exists. Raise the version or start the server with --allow-overwrite.`,
    });
  }
  const { replaced } = await store.publish(manifest);
  return sendJson(response, replaced ? 200 : 201, {
    ok: true,
    id: manifest.id,
    version: manifest.version,
    replaced,
    url: `${config.publicUrl}/e/${encodeURIComponent(manifest.id)}`,
  });
}

/** The project pages; `undefined` when the request is not for one. */
function servePage({ store, server }, request, response, url) {
  if (request.method === 'GET' && url.pathname === '/') {
    return sendHtml(response, 200, indexPage(server, store.search('')));
  }
  const page = PAGE_PATH.exec(url.pathname);
  if (!page || request.method !== 'GET') {
    return undefined;
  }
  const id = decodeURIComponent(page[1]);
  const entry = store.get(id);
  if (!entry) {
    return sendHtml(response, 404, errorPage(404, `Unknown extension: ${id}`));
  }
  return sendHtml(response, 200, extensionPage(server, entry));
}

export function createServer({ store, config }) {
  const env = { store, config, server: { name: config.name, url: config.publicUrl } };
  const routes = createRoutes(env);

  async function handle(request, response, url) {
    const route = `${request.method} ${url.pathname}`;
    const exact = routes[route];
    if (exact) {
      return exact(request, response, url);
    }

    const api = EXTENSION_PATH.exec(url.pathname);
    if (api && request.method === 'GET') {
      return getExtension(env, response, api);
    }
    if (api && request.method === 'DELETE') {
      return deleteExtension(env, request, response, api);
    }
    if (route === 'POST /api/v1/publish') {
      return publishExtension(env, request, response);
    }

    const page = servePage(env, request, response, url);
    if (page) {
      return page;
    }

    if (url.pathname.startsWith('/api/')) {
      return sendJson(response, 404, { error: 'not_found', message: `Unknown route: ${url.pathname}` });
    }
    return sendHtml(response, 404, errorPage(404, 'This page does not exist.'));
  }

  return http.createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
    if (request.method === 'OPTIONS') {
      response.writeHead(204, JSON_HEADERS);
      response.end();
      return;
    }
    handle(request, response, url).catch((err) => {
      config.log(`✗ ${request.method} ${url.pathname}: ${err.stack ?? err.message}`);
      if (response.headersSent) {
        response.end();
        return;
      }
      sendJson(response, err.status ?? 500, { error: 'server_error', message: err.message });
    });
  });
}
