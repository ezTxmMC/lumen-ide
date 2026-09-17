/**
 * Localisation.
 *
 * Texts live per area (namespace) in `src/i18n/messages/<area>.ts`, with every
 * language side by side. German is the source: where a key is missing in one
 * language, English steps in, then German, then the key itself.
 *
 *   t('settings.title')                        → “Einstellungen”
 *   t('tabs.closeNamed', { name: 'a.ts' })     → “Close a.ts” (in English)
 *   t('problems.count', { count: 3 })          → uses `count_one` / `count_other` where present
 *
 * In components use `useT()`, which re-renders on a language change.
 */

import { useSyncExternalStore } from 'react'
import { MESSAGES } from './messages'

export const LANGUAGES = [
  { id: 'de', name: 'Deutsch', english: 'German' },
  { id: 'en', name: 'English', english: 'English' },
  { id: 'es', name: 'Español', english: 'Spanish' },
  { id: 'fr', name: 'Français', english: 'French' },
  { id: 'pl', name: 'Polski', english: 'Polish' },
  { id: 'it', name: 'Italiano', english: 'Italian' },
  { id: 'pt', name: 'Português', english: 'Portuguese' },
  { id: 'nl', name: 'Nederlands', english: 'Dutch' },
] as const

export type LanguageCode = (typeof LANGUAGES)[number]['id']

/** `system` follows the operating system's language. */
export type LanguageSetting = LanguageCode | 'system'

export type Params = Record<string, string | number>

/** A dictionary: nested objects with texts at the leaves. */
export interface Dictionary {
  [key: string]: string | Dictionary
}

/** Contents of a namespace file: German required, every other language expected. */
export type NamespaceMessages = { de: Dictionary } & Partial<Record<LanguageCode, Dictionary>>

const FALLBACK_CHAIN: LanguageCode[] = ['en', 'de']

let current: LanguageCode = 'de'
let version = 0
const listeners = new Set<() => void>()
const flatCache = new Map<LanguageCode, Map<string, string>>()

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

function table(lang: LanguageCode): Map<string, string> {
  const hit = flatCache.get(lang)
  if (hit) return hit
  const out = new Map<string, string>()
  for (const [ns, messages] of Object.entries(MESSAGES)) {
    const dict = messages[lang]
    if (dict) flatten(ns, dict, out)
  }
  flatCache.set(lang, out)
  return out
}

function lookup(key: string, lang: LanguageCode): string | undefined {
  const own = table(lang).get(key)
  if (own !== undefined) return own
  for (const fallback of FALLBACK_CHAIN) {
    const value = table(fallback).get(key)
    if (value !== undefined) return value
  }
  return undefined
}

function interpolate(text: string, params?: Params) {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    if (value === undefined) return match
    if (typeof value === 'number') return value.toLocaleString(current)
    return value
  })
}

/** Translates a key into the current language. */
export function t(key: string, params?: Params): string {
  const count = params?.count
  if (typeof count === 'number') {
    const category = new Intl.PluralRules(current).select(count)
    const plural = lookup(`${key}_${category}`, current) ?? lookup(`${key}_other`, current)
    if (plural !== undefined) return interpolate(plural, params)
  }
  return interpolate(lookup(key, current) ?? key, params)
}

const KEY_PATTERN = /^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+$/

/**
 * Text or key: for texts that sit in static objects — add-ons, templates,
 * tasks — and are only translated when displayed. When the value looks like a
 * key that exists (`templates.java.groupId`) it is translated, otherwise it
 * comes back unchanged.
 */
export function tr(textOrKey: string | undefined, params?: Params): string {
  if (!textOrKey) return ''
  if (!KEY_PATTERN.test(textOrKey)) return interpolate(textOrKey, params)
  const hit = lookup(textOrKey, current)
  if (hit === undefined) return textOrKey
  return t(textOrKey, params)
}

/** The operating system's language where supported — otherwise English. */
export function systemLanguage(): LanguageCode {
  const candidates = [...(navigator.languages ?? []), navigator.language]
  for (const tag of candidates) {
    const base = tag?.toLowerCase().split('-')[0]
    const match = LANGUAGES.find((l) => l.id === base)
    if (match) return match.id
  }
  return 'en'
}

export function resolveLanguage(setting: LanguageSetting | string | undefined): LanguageCode {
  if (!setting || setting === 'system') return systemLanguage()
  const match = LANGUAGES.find((l) => l.id === setting)
  return match ? match.id : systemLanguage()
}

export function setLanguage(setting: LanguageSetting | string | undefined) {
  const next = resolveLanguage(setting)
  if (next === current) return
  current = next
  version++
  document.documentElement.lang = next
  for (const fn of listeners) fn()
}

export function getLanguage(): LanguageCode {
  return current
}

/** The BCP-47 tag for `localeCompare`, `Intl.DateTimeFormat` and the like. */
export function locale(): string {
  return current
}

export function subscribeLanguage(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

const getVersion = () => version

/** The translation function for components; re-renders on a language change. */
export function useT() {
  useSyncExternalStore(subscribeLanguage, getVersion)
  return t
}

/** The current language as a hook, for use as a `useMemo` dependency. */
export function useLanguage(): LanguageCode {
  useSyncExternalStore(subscribeLanguage, getVersion)
  return current
}
