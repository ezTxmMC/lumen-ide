/**
 * The extension server's tests.
 *
 * A real server is started on a free port and addressed over HTTP — what is
 * tested is therefore the path Lumen and the publishing scripts take too, not
 * just individual functions.
 *
 *   node test/run.js
 */

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Store } from '../src/store.js'
import { createServer } from '../src/server.js'
import { ManifestError, checkManifest, compareVersions } from '../src/manifest.js'

let passed = 0
let failed = 0

async function check(name, fn) {
  try {
    await fn()
    passed++
    process.stdout.write(`✓ ${name}\n`)
  } catch (err) {
    failed++
    process.stdout.write(`✗ ${name}\n    ${err.message}\n`)
  }
}

/** A valid manifest that the individual tests bend on purpose. */
function sample(overrides = {}) {
  const id = overrides.id ?? 'ext.demo'
  const version = overrides.version ?? '1.0.0'
  return {
    schema: 1,
    id,
    name: 'Demo',
    version,
    description: 'Eine Beispielerweiterung',
    category: 'tool',
    keywords: ['demo'],
    readme: '# Demo\n\nText.',
    settings: [{ key: 'apiUrl', label: 'API', type: 'text' }],
    pages: [{ id: 'welcome', title: 'Willkommen', content: '# Hallo' }],
    addon: {
      schema: 1, id, name: 'Demo', version,
      languages: [], themes: [], commands: [], events: [], templates: [], projectKinds: [], snippets: [],
    },
    ...overrides,
  }
}

function rejects(manifest, field) {
  assert.throws(() => checkManifest(manifest), (err) => {
    assert.ok(err instanceof ManifestError, `erwartet ManifestError, kam ${err.name}`)
    assert.equal(err.field, field, `erwartet Feld ${field}, kam ${err.field}`)
    return true
  })
}

async function main() {
  /* -------------------------------------------------------------- *
   * Checking the manifest
   * -------------------------------------------------------------- */

  await check('gültiges Manifest geht durch', () => {
    const checked = checkManifest(sample())
    assert.equal(checked.id, 'ext.demo')
    assert.equal(checked.settings.length, 1)
  })

  await check('user.-Kennung von Nutzern geht durch', () => {
    const manifest = sample({ id: 'user.demo' })
    manifest.addon.id = 'user.demo'
    assert.equal(checkManifest(manifest).id, 'user.demo')
  })

  await check('Agent mit Programmcode geht durch und bleibt erhalten', () => {
    const agent = { id: 'helper', name: 'Helfer', modes: [{ id: 'ask', label: 'Fragen' }] }
    const checked = checkManifest(sample({ agents: [agent], code: { main: 'export function activate() {}' } }))
    assert.equal(checked.agents[0].id, 'helper')
    assert.equal(checked.code.main, 'export function activate() {}')
  })
  await check('Agent ohne Programmcode wird abgelehnt', () => rejects(sample({ agents: [{ id: 'helper', name: 'Helfer' }] }), 'code'))
  await check('Programmcode muss Text sein', () => rejects(sample({ code: { main: 42 } }), 'code.main'))
  await check('Agent-Kennung mit Großbuchstaben wird abgelehnt', () => rejects(sample({ agents: [{ id: 'Helper', name: 'H' }], code: { main: 'x' } }), 'agents[0].id'))
  await check('doppelte Modi eines Agenten werden abgelehnt', () => rejects(sample({
    agents: [{ id: 'a', name: 'A', modes: [{ id: 'm', label: 'M' }, { id: 'm', label: 'N' }] }], code: { main: 'x' },
  }), 'agents[0].modes.id'))

  await check('Kennung ohne ext.-/user.-Präfix wird abgelehnt', () => rejects(sample({ id: 'demo' }), 'id'))
  await check('Kennung mit Großbuchstaben wird abgelehnt', () => rejects(sample({ id: 'ext.Demo' }), 'id'))
  await check('Version ohne Semver wird abgelehnt', () => rejects(sample({ version: '1.0' }), 'version'))
  await check('falsches Schema wird abgelehnt', () => rejects(sample({ schema: 2 }), 'schema'))
  await check('fehlendes addon wird abgelehnt', () => rejects({ ...sample(), addon: undefined }, 'addon'))
  await check('abweichende addon.id wird abgelehnt', () => {
    const manifest = sample()
    manifest.addon.id = 'ext.anders'
    rejects(manifest, 'addon.id')
  })
  await check('abweichende addon.version wird abgelehnt', () => {
    const manifest = sample()
    manifest.addon.version = '9.9.9'
    rejects(manifest, 'addon.version')
  })
  await check('Einstellungsschlüssel mit Leerzeichen wird abgelehnt', () =>
    rejects(sample({ settings: [{ key: 'api url', label: 'API' }] }), 'settings[0].key'))
  await check('doppelter Einstellungsschlüssel wird abgelehnt', () =>
    rejects(sample({ settings: [{ key: 'a', label: 'A' }, { key: 'a', label: 'B' }] }), 'settings.key'))
  await check('Auswahl ohne Einträge wird abgelehnt', () =>
    rejects(sample({ settings: [{ key: 'a', label: 'A', type: 'select' }] }), 'settings[0].choices'))
  await check('Übersetzungen einer Einstellung werden angenommen', () => {
    const checked = checkManifest(sample({ settings: [{
      key: 'mode', label: 'Modus', type: 'select', choices: [{ value: 'a', label: 'A' }],
      i18n: { en: { label: 'Mode', hint: 'Pick one', choices: { a: 'Ay' } }, 'pt-BR': { label: 'Modo' } },
    }] }))
    assert.equal(checked.settings[0].i18n.en.label, 'Mode')
  })
  await check('unbekanntes Feld in Übersetzungen wird abgelehnt', () =>
    rejects(sample({ settings: [{ key: 'a', label: 'A', i18n: { en: { key: 'b' } } }] }), 'settings[0].i18n.en.key'))
  await check('Übersetzung mit ungültigem Sprachkürzel wird abgelehnt', () =>
    rejects(sample({ settings: [{ key: 'a', label: 'A', i18n: { 'English!': { label: 'B' } } }] }), 'settings[0].i18n.English!'))
  await check('Seite ohne Inhalt wird abgelehnt', () =>
    rejects(sample({ pages: [{ id: 'a', title: 'A' }] }), 'pages[0].content'))
  await check('doppelte Seitenkennung wird abgelehnt', () =>
    rejects(sample({ pages: [{ id: 'a', title: 'A', content: 'x' }, { id: 'a', title: 'B', content: 'y' }] }), 'pages.id'))
  await check('homepage über http wird abgelehnt', () =>
    rejects(sample({ homepage: 'http://example.com' }), 'homepage'))
  await check('homepage über https geht durch', () => {
    assert.equal(checkManifest(sample({ homepage: 'https://example.com' })).homepage, 'https://example.com')
  })

  await check('Versionen sortieren absteigend, Vorab hinter der fertigen', () => {
    const list = ['1.0.0', '2.0.0-beta.1', '0.9.0', '2.0.0', '1.1.0'].sort(compareVersions)
    assert.deepEqual(list, ['2.0.0', '2.0.0-beta.1', '1.1.0', '1.0.0', '0.9.0'])
  })

  /* -------------------------------------------------------------- *
   * The server over HTTP
   * -------------------------------------------------------------- */

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-ext-test-'))
  const store = new Store(root)
  await store.load()
  const config = {
    name: 'Test', publicUrl: '', tokens: ['t0ken'], allowOverwrite: false, log: () => {},
  }
  const server = createServer({ store, config })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  config.publicUrl = base

  const call = (method, route, { token, body } = {}) => fetch(`${base}${route}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  await check('info nennt Produkt und Anzahl', async () => {
    const data = await (await call('GET', '/api/v1/info')).json()
    assert.equal(data.product, 'lumen-extension-server')
    assert.equal(data.extensions, 0)
  })

  await check('Veröffentlichen ohne Token wird abgewiesen', async () => {
    const response = await call('POST', '/api/v1/publish', { body: sample() })
    assert.equal(response.status, 401)
  })

  await check('Veröffentlichen mit falschem Token wird abgewiesen', async () => {
    const response = await call('POST', '/api/v1/publish', { token: 'falsch', body: sample() })
    assert.equal(response.status, 401)
  })

  await check('Veröffentlichen mit Token legt an', async () => {
    const response = await call('POST', '/api/v1/publish', { token: 't0ken', body: sample() })
    assert.equal(response.status, 201)
    const data = await response.json()
    assert.equal(data.id, 'ext.demo')
  })

  await check('dieselbe Version ein zweites Mal wird abgewiesen', async () => {
    const response = await call('POST', '/api/v1/publish', { token: 't0ken', body: sample() })
    assert.equal(response.status, 409)
  })

  await check('ungültiges Manifest nennt das Feld', async () => {
    const response = await call('POST', '/api/v1/publish', { token: 't0ken', body: sample({ id: 'demo' }) })
    assert.equal(response.status, 422)
    assert.equal((await response.json()).field, 'id')
  })

  await check('Katalog listet die Erweiterung mit Inhaltsangabe', async () => {
    const data = await (await call('GET', '/api/v1/index')).json()
    assert.equal(data.extensions.length, 1)
    assert.equal(data.extensions[0].provides.settings, 1)
    assert.equal(data.extensions[0].provides.pages, 1)
  })

  await check('Suche findet über Stichwort und filtert sonst weg', async () => {
    const hit = await (await call('GET', '/api/v1/index?q=demo')).json()
    assert.equal(hit.extensions.length, 1)
    const miss = await (await call('GET', '/api/v1/index?q=zzz')).json()
    assert.equal(miss.extensions.length, 0)
  })

  await check('Vorabversion wird nicht zur empfohlenen Fassung', async () => {
    await call('POST', '/api/v1/publish', { token: 't0ken', body: sample({ version: '2.0.0-beta.1' }) })
    const data = await (await call('GET', '/api/v1/extensions/ext.demo')).json()
    assert.equal(data.manifest.version, '1.0.0', 'empfohlen bleibt die fertige Fassung')
    assert.equal(data.preview, '2.0.0-beta.1')
    assert.deepEqual(data.versions, ['2.0.0-beta.1', '1.0.0'])
  })

  await check('eine bestimmte Version ist abrufbar', async () => {
    const data = await (await call('GET', '/api/v1/extensions/ext.demo/2.0.0-beta.1')).json()
    assert.equal(data.version, '2.0.0-beta.1')
  })

  await check('unbekannte Erweiterung meldet 404', async () => {
    assert.equal((await call('GET', '/api/v1/extensions/ext.nichts')).status, 404)
  })

  await check('Projektseite zeigt Name und Markdown', async () => {
    const html = await (await call('GET', '/e/ext.demo')).text()
    assert.ok(html.includes('<h1>'), 'Überschrift fehlt')
    assert.ok(html.includes('Demo'), 'Name fehlt')
  })

  await check('Übersichtsseite listet die Erweiterung', async () => {
    const html = await (await call('GET', '/')).text()
    assert.ok(html.includes('/e/ext.demo'), 'Verweis fehlt')
  })

  await check('Projektseiten reichen kein fremdes HTML durch', async () => {
    await call('POST', '/api/v1/publish', {
      token: 't0ken',
      body: sample({ id: 'ext.evil', version: '1.0.0', readme: '<script>alert(1)</script>' }),
    })
    const html = await (await call('GET', '/e/ext.evil')).text()
    assert.ok(!html.includes('<script>alert(1)</script>'), 'Skript kam ungefiltert durch')
    assert.ok(html.includes('&lt;script&gt;'), 'Skript sollte als Text erscheinen')
  })

  await check('Löschen braucht ein Token', async () => {
    assert.equal((await call('DELETE', '/api/v1/extensions/ext.demo/2.0.0-beta.1')).status, 401)
  })

  await check('Löschen entfernt die Version', async () => {
    const response = await call('DELETE', '/api/v1/extensions/ext.demo/2.0.0-beta.1', { token: 't0ken' })
    assert.equal(response.status, 200)
    const data = await (await call('GET', '/api/v1/extensions/ext.demo')).json()
    assert.deepEqual(data.versions, ['1.0.0'])
  })

  await check('Bestand übersteht einen Neustart', async () => {
    const again = new Store(root)
    const count = await again.load()
    assert.equal(count, 2, 'ext.demo und ext.evil')
    assert.equal(again.get('ext.demo').manifest.version, '1.0.0')
  })

  server.close()
  await fs.rm(root, { recursive: true, force: true })

  process.stdout.write(`\n${passed} bestanden, ${failed} fehlgeschlagen\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  process.stderr.write(`${err.stack}\n`)
  process.exit(1)
})
