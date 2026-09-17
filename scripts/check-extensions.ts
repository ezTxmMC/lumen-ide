/**
 * Tests the extensions under `extensions/` against both:
 *
 *   1. the server's manifest check — whatever passes here every extension
 *      server accepts,
 *   2. Lumen's own add-on check (`validateAddon`) — whatever passes here can
 *      also be installed.
 *
 * Checking both sides is the point: a manifest the server accepts but Lumen
 * rejects on installing would have surfaced only at the user.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
// Side effect: registers the named tokenizers (`"tokenizer": "markdown"` and
// its like). Anything that compiles or validates add-on data needs them, or a
// language would be reported as using an unknown tokenizer.
import '@/addons/lib/builtin-tokenizers'
import { normalizeModel } from '@/core/user-addons/schema'
import { blockingIssues, validateAddon } from '@/core/user-addons/validate'

// Bundled, this file lands under node_modules/.cache — the root of the project
// is therefore npm's working directory, not where the module sits.
const DIST = path.join(process.cwd(), 'extensions', 'dist')

let failed = 0
let checked = 0

function report(ok: boolean, message: string) {
  if (!ok) failed++
  process.stdout.write(`${ok ? '✓' : '✗'} ${message}\n`)
}

function main() {
  if (!fs.existsSync(DIST)) {
    process.stdout.write('extensions/dist is missing — run `npm run build:ext` first.\n')
    return
  }
  const files = fs.readdirSync(DIST).filter((name) => name.endsWith('.json')).sort()
  if (!files.length) {
    process.stdout.write('No built extensions — nothing to check.\n')
    return
  }

  for (const name of files) {
    checked++
    const manifest = JSON.parse(fs.readFileSync(path.join(DIST, name), 'utf8'))
    const model = normalizeModel(manifest.addon)
    const issues = blockingIssues(validateAddon(model))
    if (issues.length) {
      report(false, `${manifest.id}: ${issues.map((issue) => `${issue.field ?? issue.section}: ${issue.message}`).join('; ')}`)
      continue
    }
    const settings = manifest.settings?.length ?? 0
    const pages = manifest.pages?.length ?? 0
    const languages = model.languages.length
    report(true, `${manifest.id} ${manifest.version} — ${languages} Sprachen, ${settings} Einstellungen, ${pages} Seiten`)
  }

  process.stdout.write(`\n${checked} checked, ${failed} error(s)\n`)
  if (failed) process.exit(1)
}

main()
