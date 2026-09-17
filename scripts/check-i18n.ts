/**
 * Tests the translations: every language must carry the same keys as German,
 * and the placeholders (`{name}`) must agree.
 */

import { LANGUAGES, type Dictionary } from '@/i18n'
import { MESSAGES } from '@/i18n/messages'

function flatten(prefix: string, dict: Dictionary, out: Map<string, string>) {
  for (const [key, value] of Object.entries(dict)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      out.set(path, value)
      continue
    }
    flatten(path, value, out)
  }
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')

let problems = 0
let keys = 0
for (const [ns, messages] of Object.entries(MESSAGES)) {
  const source = new Map<string, string>()
  flatten(ns, messages.de, source)
  keys += source.size
  for (const { id } of LANGUAGES) {
    if (id === 'de') continue
    const dict = messages[id]
    const target = new Map<string, string>()
    if (dict) flatten(ns, dict, target)
    for (const [key, text] of source) {
      const translated = target.get(key)
      if (translated === undefined) {
        // Plural forms may differ per language (_one/_few/_many/_other).
        if (/_(one|few|many|two|zero)$/.test(key)) continue
        console.log(`✗ ${id}: fehlt ${key}`)
        problems++
        continue
      }
      if (placeholders(text) !== placeholders(translated)) {
        console.log(`✗ ${id}: Platzhalter in ${key} weichen ab („${translated}“)`)
        problems++
      }
    }
    for (const key of target.keys()) {
      if (source.has(key) || /_(one|few|many|two|zero|other)$/.test(key)) continue
      console.log(`✗ ${id}: extra key ${key}`)
      problems++
    }
  }
}

console.log(`${Object.keys(MESSAGES).length} namespaces, ${keys} keys, ${LANGUAGES.length} languages`)
if (problems) {
  console.log(`${problems} Probleme`)
  process.exit(1)
}
console.log('✓ translations complete')
