/**
 * Minecraft development: templates for plugins (Spigot, Paper, Leaf, Velocity,
 * BungeeCord) and mods (Fabric, Forge, NeoForge, Quilt, Architectury), project
 * kinds with build and run tasks, snippets and a command that updates the
 * version lists from the official sources.
 */

import { snippet } from '@codemirror/autocomplete'
import type { Addon, AddonContext, Command, ProjectTemplate } from '@/core/types'
import { t } from '@/i18n'
import { editorBridge } from '@/lib/editor-bridge'
import { architecturyTemplate } from '../lib/minecraft/architectury'
import { MINECRAFT_KINDS } from '../lib/minecraft/kinds'
import { MOD_TEMPLATES } from '../lib/minecraft/mods'
import { PLUGIN_TEMPLATES } from '../lib/minecraft/plugins'
import { MINECRAFT_SNIPPETS } from '../lib/minecraft/snippets'
import {
  DEFAULT_CATALOG, currentCatalog, fetchCatalog, setCatalog, type McCatalog,
} from '../lib/minecraft/versions'

const TEMPLATES: ProjectTemplate[] = [...PLUGIN_TEMPLATES, ...MOD_TEMPLATES, architecturyTemplate]

const STORAGE_KEY = 'catalog'

/* ------------------------------------------------------------------ *
 * The version catalogue
 * ------------------------------------------------------------------ */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Lay the stored catalogue over the structure kept here: entries missing or of
 * the wrong type (an older version, a broken store) come from the defaults.
 */
function mergeCatalog(base: unknown, stored: unknown): unknown {
  if (Array.isArray(base)) return Array.isArray(stored) && stored.every((v) => typeof v === 'string') && stored.length ? stored : base
  if (!isRecord(base)) return typeof stored === typeof base ? stored : base
  if (!isRecord(stored)) return base
  const out: Record<string, unknown> = { ...base }
  for (const key of Object.keys(stored)) {
    if (key in base) {
      out[key] = mergeCatalog(base[key], stored[key])
      continue
    }
    // Take on the extra versions in the tables (a new MC version, say).
    if (typeof stored[key] === 'string' || typeof stored[key] === 'number') out[key] = stored[key]
  }
  return out
}

function loadCatalog(ctx: AddonContext) {
  const stored = ctx.storage.get<unknown>(STORAGE_KEY, null)
  if (!stored) return
  setCatalog(mergeCatalog(DEFAULT_CATALOG, stored) as McCatalog)
}

function updateCommand(ctx: AddonContext): Command {
  let running = false
  return {
    id: 'minecraft.updateVersions',
    get title() { return t('minecraft.command.updateVersions') },
    category: 'Minecraft',
    async run() {
      if (running) return
      running = true
      ctx.notify(t('minecraft.toast.updating'), 'info')
      try {
        const { catalog, errors } = await fetchCatalog(currentCatalog())
        setCatalog(catalog)
        ctx.storage.set(STORAGE_KEY, catalog)
        // Report the templates afresh — their fields read the new catalogue, and the dialog reloads.
        for (const template of TEMPLATES) ctx.registerProjectTemplate(template)
        if (errors.length) {
          console.warn('[minecraft] Versionen teilweise nicht geladen:', errors)
          ctx.notify(t('minecraft.toast.partial', { count: errors.length, first: errors[0] }), 'warning')
          return
        }
        ctx.notify(t('minecraft.toast.updated'), 'success')
      } catch (err) {
        ctx.notify(t('minecraft.toast.failed', { message: (err as Error).message }), 'error')
      } finally {
        running = false
      }
    },
  }
}

function resetCommand(ctx: AddonContext): Command {
  return {
    id: 'minecraft.resetVersions',
    get title() { return t('minecraft.command.resetVersions') },
    category: 'Minecraft',
    run() {
      setCatalog(DEFAULT_CATALOG)
      ctx.storage.set(STORAGE_KEY, null)
      for (const template of TEMPLATES) ctx.registerProjectTemplate(template)
      ctx.notify(t('minecraft.toast.reset'), 'success')
    },
  }
}

/* ------------------------------------------------------------------ *
 * Snippets
 * ------------------------------------------------------------------ */

function insertSnippetCommand(ctx: AddonContext): Command {
  return {
    id: 'minecraft.insertSnippet',
    get title() { return t('minecraft.command.insertSnippet') },
    category: 'Minecraft',
    scope: 'editor',
    async run() {
      if (!editorBridge.view) {
        ctx.notify(t('minecraft.toast.noEditor'), 'warning')
        return
      }
      // Load only when called: the store pulls the whole interface along with it.
      const { useStore } = await import('@/state/store')
      const store = useStore.getState()
      const language = store.activeTab()?.languageId
      const matching = MINECRAFT_SNIPPETS.filter((s) => s.language === language)
      const list = matching.length ? matching : MINECRAFT_SNIPPETS

      store.openForm({
        title: t('minecraft.command.insertSnippet'),
        description: t('minecraft.snippet.description'),
        submitLabel: t('minecraft.snippet.submit'),
        fields: [{
          id: 'snippet',
          label: t('minecraft.snippet.label'),
          type: 'select',
          choices: list.map((s, i) => ({
            value: String(i),
            label: `${s.platform} · ${s.detail}`,
            hint: `${s.label} (${s.language === 'java' ? 'Java' : 'Kotlin'})`,
          })),
        }],
        onSubmit(values) {
          const chosen = list[Number(values.snippet)]
          const view = editorBridge.view
          if (!chosen) return t('minecraft.snippet.missing')
          if (!view) return t('minecraft.toast.noEditor')
          const { from, to } = view.state.selection.main
          snippet(chosen.body.replaceAll('$0', '${}'))(view, null, from, to)
          view.focus()
        },
      })
    },
  }
}

/* ------------------------------------------------------------------ *
 * The add-on
 * ------------------------------------------------------------------ */

export const minecraftAddon: Addon = {
  id: 'tool.minecraft',
  name: 'Minecraft Development',
  version: '1.0.0',
  get description() { return t('minecraft.addon.description') },
  author: 'Lumen',
  icon: 'MC',
  category: 'tool',
  projectKinds: MINECRAFT_KINDS,
  projectTemplates: TEMPLATES,
  snippets: MINECRAFT_SNIPPETS.map(({ language, platform, ...snippet }) => ({ ...snippet, languageId: language, detail: `${platform} · ${snippet.detail ?? ''}` })),
  activate(ctx) {
    loadCatalog(ctx)
    ctx.registerCommand(updateCommand(ctx))
    ctx.registerCommand(resetCommand(ctx))
    ctx.registerCommand(insertSnippetCommand(ctx))
    return () => setCatalog(DEFAULT_CATALOG)
  },
}
