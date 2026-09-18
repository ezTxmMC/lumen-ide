#!/usr/bin/env node
/**
 * Builds the extensions under `extensions/` into finished manifests.
 *
 *   node extensions/build.mjs                 # all of them
 *   node extensions/build.mjs go rust         # only these
 *
 * A source folder looks like this:
 *
 *   extensions/<name>/
 *     extension.json    the particulars: id, name, version, settings …
 *     addon.json        what the extension brings (languages, templates …)
 *     README.md         becomes the project page on the server
 *     pages/<id>.md     pages that Lumen itself displays
 *     main.js           program code (optional) — bundled into `code.main`
 *
 * The result lands in `extensions/dist/<id>-<version>.json` and goes to
 * `POST /api/v1/publish` exactly as it is.
 *
 * Checking uses the same module the server does
 * (`extension-server/src/manifest.js`). Whatever passes here every server will
 * accept — mistakes surface at build time, not at publishing time.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { build as bundle } from 'esbuild'
import { ManifestError, checkManifest } from '../extension-server/src/manifest.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(HERE, 'dist')

/** Folders that are not an extension. */
const SKIP = new Set(['dist', 'node_modules'])

async function readJson(file, { required = true } = {}) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (err) {
    if (!required && err.code === 'ENOENT') return null
    if (err.code === 'ENOENT') throw new Error(`${path.relative(HERE, file)} is missing`)
    throw new Error(`${path.relative(HERE, file)}: ${err.message}`)
  }
}

async function readText(file) {
  try {
    return await fs.readFile(file, 'utf8')
  } catch {
    return null
  }
}

/**
 * Read the header of a page.
 *
 * A block `---` … `---` at the start sets the title, the icon and the place.
 * Without one the first heading serves as the title — so a simple page stays a
 * simple Markdown file without ceremony.
 */
function pageFrontMatter(source, fallbackTitle) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source)
  const meta = {}
  let body = source
  if (match) {
    body = source.slice(match[0].length)
    for (const line of match[1].split(/\r?\n/)) {
      const pair = /^([a-z]+)\s*:\s*(.*)$/i.exec(line.trim())
      if (!pair) continue
      meta[pair[1].toLowerCase()] = pair[2].trim()
    }
  }
  const heading = /^#\s+(.+)$/m.exec(body)
  return {
    title: meta.title ?? heading?.[1]?.trim() ?? fallbackTitle,
    icon: meta.icon,
    location: meta.location,
    body,
  }
}

async function collectPages(dir) {
  let names = []
  try {
    names = (await fs.readdir(dir)).sort()
  } catch {
    return []
  }
  const pages = []
  for (const name of names) {
    const ext = path.extname(name)
    if (ext !== '.md' && ext !== '.html') continue
    const id = name.slice(0, -ext.length)
    const source = await fs.readFile(path.join(dir, name), 'utf8')
    const { title, icon, location, body } = pageFrontMatter(source, id)
    pages.push({
      id,
      title,
      ...(icon ? { icon } : {}),
      location: location ?? 'editor',
      format: ext === '.html' ? 'html' : 'markdown',
      content: body.trim(),
    })
  }
  return pages
}

/**
 * Bundle an extension's program code into one ES module.
 *
 * `main.js` may import packages from node_modules; they end up inside the
 * bundle, so nothing has to be installed next to it on the user's machine.
 * Node's own modules stay imports — the code runs in Lumen's main process.
 */
async function bundleCode(dir) {
  const entry = path.join(dir, 'main.js')
  if (!(await readText(entry))) return null
  const result = await bundle({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    minify: true,
    legalComments: 'none',
    logLevel: 'silent',
    // Bundled CommonJS packages call `require`, which an ES module does not have.
    banner: { js: "import { createRequire as __lumenRequire } from 'node:module'; const require = __lumenRequire(import.meta.url);" },
  })
  return { main: result.outputFiles[0].text }
}

/** Assemble a source folder into a manifest. */
async function buildOne(name) {
  const dir = path.join(HERE, name)
  const meta = await readJson(path.join(dir, 'extension.json'))
  const addon = await readJson(path.join(dir, 'addon.json'), { required: false }) ?? {}
  const readme = await readText(path.join(dir, 'README.md'))
  const pages = await collectPages(path.join(dir, 'pages'))
  const code = await bundleCode(dir)

  // The id and the version live in one place only; the add-on inherits them.
  const manifest = {
    schema: 1,
    ...meta,
    readme: readme ?? meta.readme ?? '',
    pages: [...(meta.pages ?? []), ...pages],
    ...(code ? { code } : {}),
    addon: {
      schema: 1,
      languages: [], themes: [], commands: [], events: [], templates: [], projectKinds: [], snippets: [],
      ...addon,
      id: meta.id,
      name: meta.name,
      version: meta.version,
      description: meta.description,
      author: meta.author,
      icon: meta.icon,
      color: meta.color,
      category: meta.category,
    },
  }
  return checkManifest(manifest)
}

async function main() {
  const wanted = process.argv.slice(2).filter((arg) => !arg.startsWith('-'))
  const entries = (await fs.readdir(HERE, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !SKIP.has(entry.name) && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort()

  const names = wanted.length ? wanted : entries
  const unknown = names.filter((name) => !entries.includes(name))
  if (unknown.length) throw new Error(`Unknown extension: ${unknown.join(', ')}`)
  if (!names.length) {
    process.stdout.write('No extensions under extensions/ — nothing to build.\n')
    return
  }

  await fs.mkdir(DIST, { recursive: true })
  let failed = 0
  for (const name of names) {
    try {
      const manifest = await buildOne(name)
      const file = path.join(DIST, `${manifest.id}-${manifest.version}.json`)
      await fs.writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
      const size = (Buffer.byteLength(JSON.stringify(manifest)) / 1024).toFixed(1)
      process.stdout.write(`✓ ${name} → ${path.relative(path.join(HERE, '..'), file)}  ${size} kB\n`)
    } catch (err) {
      failed++
      const where = err instanceof ManifestError && err.field ? ` (${err.field})` : ''
      process.stdout.write(`✗ ${name}${where}: ${err.message}\n`)
    }
  }
  if (failed) {
    process.stderr.write(`\n${failed} of ${names.length} failed.\n`)
    process.exit(1)
  }
  process.stdout.write(`\n${names.length} ${names.length === 1 ? 'extension' : 'extensions'} built.\n`)
}

main().catch((err) => {
  process.stderr.write(`✗ ${err.message}\n`)
  process.exit(1)
})
