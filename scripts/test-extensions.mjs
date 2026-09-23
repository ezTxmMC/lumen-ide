#!/usr/bin/env node
/**
 * Runs the tests extensions keep beside their code (`extensions/<name>/test.mjs`),
 * each in its own Node process — they test the pure parts of `main.js` and
 * `renderer.ts` without Lumen.
 *
 *   npm run test:extensions            # all of them
 *   npm run test:extensions -- git     # only these
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'extensions')
const wanted = process.argv.slice(2)
const names = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(ROOT, entry.name, 'test.mjs')))
  .map((entry) => entry.name)
  .filter((name) => !wanted.length || wanted.includes(name))
  .sort()

let failed = 0
for (const name of names) {
  process.stdout.write(`\n▶ ${name}\n`)
  const result = spawnSync(process.execPath, ['test.mjs'], { cwd: path.join(ROOT, name), stdio: 'inherit' })
  if (result.status !== 0) failed++
}
process.stdout.write(`\n${names.length - failed} of ${names.length} extension test suites passed\n`)
process.exit(failed ? 1 : 0)
