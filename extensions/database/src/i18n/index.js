/**
 * The texts of the Database extension in Lumen's eight languages. The
 * interface language comes from `ctx.locale()`; a missing text falls back to
 * English.
 */

import de from './de.js'
import en from './en.js'
import es from './es.js'
import fr from './fr.js'
import it from './it.js'
import nl from './nl.js'
import pl from './pl.js'
import pt from './pt.js'

export const MESSAGES = { de, en, es, fr, it, nl, pl, pt }

function lookup(tree, key) {
  let node = tree
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

const languageOf = (ctx) => String(ctx.locale?.() ?? 'en').slice(0, 2)

/** `t(key, params)` in the interface language, with English as the fallback. */
export function createT(ctx) {
  return (key, params = {}) => {
    const text = lookup(MESSAGES[languageOf(ctx)], key) ?? lookup(MESSAGES.en, key) ?? key
    return String(text).replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
  }
}

/** For the tests: every key of a language, flattened. */
export function keysOf(language) {
  const out = []
  const walk = (node, prefix) => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key
      if (typeof value === 'string') out.push(path)
      if (typeof value !== 'string') walk(value, path)
    }
  }
  walk(MESSAGES[language] ?? {}, '')
  return out
}
