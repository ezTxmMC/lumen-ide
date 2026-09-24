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
 * The extension server's tests.
 *
 * A real server is started on a free port and addressed over HTTP — what is
 * tested is therefore the path Lumen and the publishing scripts take too, not
 * just individual functions.
 *
 *   node test/run.js
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { createServer } from '../src/server.js';
import { ManifestError, checkManifest, compareVersions } from '../src/manifest.js';

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed++;
    process.stdout.write(`✓ ${name}\n`);
  } catch (err) {
    failed++;
    process.stdout.write(`✗ ${name}\n    ${err.message}\n`);
  }
}

/** A valid manifest that the individual tests bend on purpose. */
function sample(overrides = {}) {
  const id = overrides.id ?? 'ext.demo';
  const version = overrides.version ?? '1.0.0';
  return {
    schema: 1,
    id,
    name: 'Demo',
    version,
    description: 'An example extension',
    category: 'tool',
    keywords: ['demo'],
    readme: '# Demo\n\nText.',
    settings: [{ key: 'apiUrl', label: 'API', type: 'text' }],
    pages: [{ id: 'welcome', title: 'Welcome', content: '# Hello' }],
    addon: {
      schema: 1, id, name: 'Demo', version,
      languages: [], themes: [], commands: [], events: [], templates: [], projectKinds: [], snippets: [],
    },
    ...overrides,
  };
}

function rejects(manifest, field) {
  assert.throws(() => checkManifest(manifest), (err) => {
    assert.ok(err instanceof ManifestError, `expected ManifestError, got ${err.name}`);
    assert.equal(err.field, field, `expected field ${field}, got ${err.field}`);
    return true;
  });
}

/** The manifest checks and version ordering. */
async function manifestChecks() {
  /* -------------------------------------------------------------- *
   * Checking the manifest
   * -------------------------------------------------------------- */

  await check('valid manifest passes', () => {
    const checked = checkManifest(sample());
    assert.equal(checked.id, 'ext.demo');
    assert.equal(checked.settings.length, 1);
  });

  await check('user. id built by hand passes', () => {
    const manifest = sample({ id: 'user.demo' });
    manifest.addon.id = 'user.demo';
    assert.equal(checkManifest(manifest).id, 'user.demo');
  });

  await check('agent with code passes and is kept', () => {
    const agent = { id: 'helper', name: 'Helper', modes: [{ id: 'ask', label: 'Ask' }] };
    const checked = checkManifest(sample({ agents: [agent], code: { main: 'export function activate() {}' } }));
    assert.equal(checked.agents[0].id, 'helper');
    assert.equal(checked.code.main, 'export function activate() {}');
  });
  await check('agent without code is rejected', () => rejects(sample({ agents: [{ id: 'helper', name: 'Helper' }] }), 'code'));
  await check('code must be text', () => rejects(sample({ code: { main: 42 } }), 'code.main'));
  await check('agent id with capitals is rejected', () => rejects(sample({ agents: [{ id: 'Helper', name: 'H' }], code: { main: 'x' } }), 'agents[0].id'));
  await check('duplicate modes of an agent are rejected', () => rejects(sample({
    agents: [{ id: 'a', name: 'A', modes: [{ id: 'm', label: 'M' }, { id: 'm', label: 'N' }] }], code: { main: 'x' },
  }), 'agents[0].modes.id'));

  await check('id without ext./user. prefix is rejected', () => rejects(sample({ id: 'demo' }), 'id'));
  await check('id with capitals is rejected', () => rejects(sample({ id: 'ext.Demo' }), 'id'));
  await check('version without semver is rejected', () => rejects(sample({ version: '1.0' }), 'version'));
  await check('wrong schema is rejected', () => rejects(sample({ schema: 2 }), 'schema'));
  await check('missing addon is rejected', () => rejects({ ...sample(), addon: undefined }, 'addon'));
  await check('mismatching addon.id is rejected', () => {
    const manifest = sample();
    manifest.addon.id = 'ext.other';
    rejects(manifest, 'addon.id');
  });
  await check('mismatching addon.version is rejected', () => {
    const manifest = sample();
    manifest.addon.version = '9.9.9';
    rejects(manifest, 'addon.version');
  });
  await check('setting key with spaces is rejected', () =>
    rejects(sample({ settings: [{ key: 'api url', label: 'API' }] }), 'settings[0].key'));
  await check('duplicate setting key is rejected', () =>
    rejects(sample({ settings: [{ key: 'a', label: 'A' }, { key: 'a', label: 'B' }] }), 'settings.key'));
  await check('select without entries is rejected', () =>
    rejects(sample({ settings: [{ key: 'a', label: 'A', type: 'select' }] }), 'settings[0].choices'));
  await check('translations of a setting are accepted', () => {
    const checked = checkManifest(sample({ settings: [{
      key: 'mode', label: 'Mode', type: 'select', choices: [{ value: 'a', label: 'A' }],
      i18n: { en: { label: 'Mode', hint: 'Pick one', choices: { a: 'Ay' } }, 'pt-BR': { label: 'Modo' } },
    }] }));
    assert.equal(checked.settings[0].i18n.en.label, 'Mode');
  });
  await check('unknown field in translations is rejected', () =>
    rejects(sample({ settings: [{ key: 'a', label: 'A', i18n: { en: { key: 'b' } } }] }), 'settings[0].i18n.en.key'));
  await check('translation with invalid language code is rejected', () =>
    rejects(sample({ settings: [{ key: 'a', label: 'A', i18n: { 'English!': { label: 'B' } } }] }), 'settings[0].i18n.English!'));
  await check('page without content is rejected', () =>
    rejects(sample({ pages: [{ id: 'a', title: 'A' }] }), 'pages[0].content'));
  await check('duplicate page id is rejected', () =>
    rejects(sample({ pages: [{ id: 'a', title: 'A', content: 'x' }, { id: 'a', title: 'B', content: 'y' }] }), 'pages.id'));
  await check('homepage over http is rejected', () =>
    rejects(sample({ homepage: 'http://example.com' }), 'homepage'));
  await check('homepage over https passes', () => {
    assert.equal(checkManifest(sample({ homepage: 'https://example.com' })).homepage, 'https://example.com');
  });

  await check('versions sort descending, prerelease after the finished one', () => {
    const list = ['1.0.0', '2.0.0-beta.1', '0.9.0', '2.0.0', '1.1.0'].sort(compareVersions);
    assert.deepEqual(list, ['2.0.0', '2.0.0-beta.1', '1.1.0', '1.0.0', '0.9.0']);
  });
}

/** Publishing: tokens, duplicates and validation. */
async function publishChecks(call) {
  await check('info names product and count', async () => {
    const data = await (await call('GET', '/api/v1/info')).json();
    assert.equal(data.product, 'lumen-extension-server');
    assert.equal(data.extensions, 0);
  });

  await check('publishing without token is turned away', async () => {
    const response = await call('POST', '/api/v1/publish', { body: sample() });
    assert.equal(response.status, 401);
  });

  await check('publishing with wrong token is turned away', async () => {
    const response = await call('POST', '/api/v1/publish', { token: 'wrong', body: sample() });
    assert.equal(response.status, 401);
  });

  await check('publishing with token creates', async () => {
    const response = await call('POST', '/api/v1/publish', { token: 't0ken', body: sample() });
    assert.equal(response.status, 201);
    const data = await response.json();
    assert.equal(data.id, 'ext.demo');
  });

  await check('the same version a second time is turned away', async () => {
    const response = await call('POST', '/api/v1/publish', { token: 't0ken', body: sample() });
    assert.equal(response.status, 409);
  });

  await check('invalid manifest names the field', async () => {
    const response = await call('POST', '/api/v1/publish', { token: 't0ken', body: sample({ id: 'demo' }) });
    assert.equal(response.status, 422);
    assert.equal((await response.json()).field, 'id');
  });
}

/** Reading: catalogue, search, versions and the project pages. */
async function readChecks(call) {
  await check('catalogue lists the extension with a summary of contents', async () => {
    const data = await (await call('GET', '/api/v1/index')).json();
    assert.equal(data.extensions.length, 1);
    assert.equal(data.extensions[0].provides.settings, 1);
    assert.equal(data.extensions[0].provides.pages, 1);
  });

  await check('search finds by keyword and filters out otherwise', async () => {
    const hit = await (await call('GET', '/api/v1/index?q=demo')).json();
    assert.equal(hit.extensions.length, 1);
    const miss = await (await call('GET', '/api/v1/index?q=zzz')).json();
    assert.equal(miss.extensions.length, 0);
  });

  await check('prerelease does not become the recommended version', async () => {
    await call('POST', '/api/v1/publish', { token: 't0ken', body: sample({ version: '2.0.0-beta.1' }) });
    const data = await (await call('GET', '/api/v1/extensions/ext.demo')).json();
    assert.equal(data.manifest.version, '1.0.0', 'the finished version stays recommended');
    assert.equal(data.preview, '2.0.0-beta.1');
    assert.deepEqual(data.versions, ['2.0.0-beta.1', '1.0.0']);
  });

  await check('a particular version can be fetched', async () => {
    const data = await (await call('GET', '/api/v1/extensions/ext.demo/2.0.0-beta.1')).json();
    assert.equal(data.version, '2.0.0-beta.1');
  });

  await check('unknown extension reports 404', async () => {
    assert.equal((await call('GET', '/api/v1/extensions/ext.nothing')).status, 404);
  });

  await check('project page shows name and Markdown', async () => {
    const html = await (await call('GET', '/e/ext.demo')).text();
    assert.ok(html.includes('<h1>'), 'heading missing');
    assert.ok(html.includes('Demo'), 'name missing');
  });

  await check('overview page lists the extension', async () => {
    const html = await (await call('GET', '/')).text();
    assert.ok(html.includes('/e/ext.demo'), 'link missing');
  });

  await check('project pages do not pass foreign HTML through', async () => {
    await call('POST', '/api/v1/publish', {
      token: 't0ken',
      body: sample({ id: 'ext.evil', version: '1.0.0', readme: '<script>alert(1)</script>' }),
    });
    const html = await (await call('GET', '/e/ext.evil')).text();
    assert.ok(!html.includes('<script>alert(1)</script>'), 'script came through unfiltered');
    assert.ok(html.includes('&lt;script&gt;'), 'script should appear as text');
  });
}

/** Deleting versions. */
async function deleteChecks(call) {
  await check('deleting needs a token', async () => {
    assert.equal((await call('DELETE', '/api/v1/extensions/ext.demo/2.0.0-beta.1')).status, 401);
  });

  await check('deleting removes the version', async () => {
    const response = await call('DELETE', '/api/v1/extensions/ext.demo/2.0.0-beta.1', { token: 't0ken' });
    assert.equal(response.status, 200);
    const data = await (await call('GET', '/api/v1/extensions/ext.demo')).json();
    assert.deepEqual(data.versions, ['1.0.0']);
  });
}

/** What is on disk after the server is gone. */
async function stockChecks(root) {
  await check('stock survives a restart', async () => {
    const again = new Store(root);
    const count = await again.load();
    assert.equal(count, 2, 'ext.demo and ext.evil');
    assert.equal(again.get('ext.demo').manifest.version, '1.0.0');
  });
}

async function main() {
  await manifestChecks();

  /* -------------------------------------------------------------- *
   * The server over HTTP
   * -------------------------------------------------------------- */

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-ext-test-'));
  const store = new Store(root);
  await store.load();
  const config = {
    name: 'Test', publicUrl: '', tokens: ['t0ken'], allowOverwrite: false, log: () => {},
  };
  const server = createServer({ store, config });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  config.publicUrl = base;

  const call = (method, route, { token, body } = {}) => fetch(`${base}${route}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  await publishChecks(call);
  await readChecks(call);
  await deleteChecks(call);
  await stockChecks(root);

  server.close();
  await fs.rm(root, { recursive: true, force: true });

  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`${err.stack}\n`);
  process.exit(1);
});
