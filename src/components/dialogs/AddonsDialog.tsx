/**
 * The add-on dialog: every add-on by category, a search, switches, and a
 * detail area with languages, language servers, project kinds, templates,
 * commands and themes. User add-ons can be created, edited, duplicated,
 * exported, imported and deleted here.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  Blocks, Code2, Copy, Download, FolderOpen, Hammer, Lock, Palette, Pencil, Plus, Sparkles, Trash2, Upload, User, Wrench, Zap,
} from 'lucide-react'
import { useStore } from '@/state/store'
import { registry } from '@/core/registry'
import { formatBindingsFor } from '@/core/keybindings'
import { useT } from '@/i18n'
import { userAddons } from '@/core/user-addons/manager'
import type { Addon } from '@/core/types'
import { Button, Empty } from '../ui'
import { DialogShell, type DialogSection } from './DialogShell'

type Filter = 'all' | 'language' | 'theme' | 'tool' | 'user'

const FILTER_ICONS: Record<Filter, typeof Blocks> = {
  all: Blocks,
  language: Code2,
  theme: Palette,
  tool: Wrench,
  user: User,
}

/** An add-on's category — stated, or inferred from its contents. */
function categoryOf(addon: Addon): Exclude<Filter, 'all' | 'user'> {
  if (addon.category) return addon.category
  if (addon.languages?.length) return 'language'
  if (addon.themes?.length && !addon.commands?.length) return 'theme'
  return 'tool'
}

const matchesFilter: Record<Filter, (addon: Addon) => boolean> = {
  all: () => true,
  language: (addon) => categoryOf(addon) === 'language',
  theme: (addon) => categoryOf(addon) === 'theme',
  tool: (addon) => categoryOf(addon) === 'tool',
  user: (addon) => Boolean(addon.user),
}

export function AddonsDialog() {
  const t = useT()
  const open = useStore((s) => s.dialog === 'addons')
  const initialSection = useStore((s) => s.dialogSection)
  const registryVersion = useStore((s) => s.registryVersion)
  const openStudio = useStore((s) => s.openAddonStudio)
  useSyncExternalStore(userAddons.subscribe, userAddons.getVersion)

  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (initialSection && initialSection in matchesFilter) setFilter(initialSection as Filter)
  }, [open, initialSection])

  const addons = useMemo(() => registry.all(), [registryVersion])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return addons.filter(matchesFilter[filter]).filter((a) => {
      if (!needle) return true
      return (
        a.name.toLowerCase().includes(needle)
        || a.id.toLowerCase().includes(needle)
        || (a.description ?? '').toLowerCase().includes(needle)
        || (a.languages ?? []).some((l) => l.name.toLowerCase().includes(needle) || l.extensions.some((e) => e.includes(needle)))
      )
    })
  }, [addons, filter, query])

  const selected = filtered.find((a) => a.id === selectedId) ?? filtered[0] ?? null
  const activeCount = addons.filter((a) => registry.isActive(a.id)).length

  const sections: DialogSection[] = (Object.keys(matchesFilter) as Filter[]).map((id) => ({
    id,
    label: t(`addonStudio.dialog.nav.${id}`),
    icon: FILTER_ICONS[id],
    badge: String(addons.filter(matchesFilter[id]).length),
  }))

  const importAddon = async () => {
    const model = await userAddons.importFile()
    if (!model) return
    setFilter('user')
    setSelectedId(model.id)
  }

  return (
    <DialogShell
      id="addons"
      title={t('shell.dialog.addons')}
      icon={Blocks}
      wide
      sections={sections}
      section={filter}
      onSection={(id) => setFilter(id as Filter)}
      search={query}
      onSearch={setQuery}
      searchPlaceholder={t('addonStudio.dialog.search')}
      headerExtra={(
        <>
          <Button size="sm" variant="outline" onClick={() => void importAddon()} title={t('addonStudio.dialog.importHint')}>
            <Upload size={12} /> {t('common.import')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => openStudio(null, 'toolkit')} title={t('studioProject.starter.hint')}>
            <Hammer size={12} /> {t('studioProject.starter.button')}
          </Button>
          <Button size="sm" variant="solid" onClick={() => openStudio(null)}>
            <Plus size={12} /> {t('addonStudio.dialog.new')}
          </Button>
        </>
      )}
      footer={(
        <>
          <span className="text-[11.5px] text-subtle">{t('addonStudio.dialog.activeCount', { active: activeCount, total: addons.length })}</span>
          <span className="flex-1" />
          <span className="text-[11.5px] text-subtle">{t('addonStudio.dialog.footerHint')}</span>
        </>
      )}
    >
      <div className="flex h-full min-h-0">
        <div className="w-[380px] shrink-0 overflow-y-auto border-r border-edge p-2">
          {filtered.length === 0 && (
            <Empty
              icon={<Blocks size={24} strokeWidth={1.4} />}
              title={t('common.nothingFound')}
              hint={filter === 'user' ? t('addonStudio.dialog.userEmpty') : undefined}
            />
          )}
          {filter === 'user' && <LoadProblems />}
          {filtered.map((addon, index) => (
            <AddonCard
              key={addon.id}
              addon={addon}
              index={index}
              selected={selected?.id === addon.id}
              onSelect={() => setSelectedId(addon.id)}
            />
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-y-auto">
          {selected && <AddonDetails key={selected.id} addon={selected} onSelect={setSelectedId} />}
        </div>
      </div>
    </DialogShell>
  )
}

/* ------------------------------------------------------------------ */

function Switch({ addon }: { addon: Addon }) {
  const t = useT()
  const toggleAddon = useStore((s) => s.toggleAddon)
  const active = registry.isActive(addon.id)
  return (
    <button
      role="switch"
      aria-checked={active}
      disabled={addon.builtin}
      onClick={(e) => {
        e.stopPropagation()
        toggleAddon(addon.id)
      }}
      title={addon.builtin ? t('addonStudio.dialog.builtinHint') : undefined}
      aria-label={t(active ? 'addonStudio.dialog.disable' : 'addonStudio.dialog.enable', { name: addon.name })}
      className={[
        'lm-transition relative mt-0.5 h-[18px] w-[31px] shrink-0 rounded-full',
        addon.builtin ? 'cursor-not-allowed opacity-35' : '',
        active ? 'bg-accent' : 'bg-active',
      ].join(' ')}
    >
      <span className="lm-transition absolute top-[3px] size-3 rounded-full bg-white" style={{ left: active ? 16 : 3 }} />
    </button>
  )
}

function AddonIcon({ addon, size = 28 }: { addon: Addon; size?: number }) {
  return (
    <span
      className="lm-transition flex shrink-0 items-center justify-center rounded-lumen-sm bg-active font-mono font-bold"
      style={{ width: size, height: size, fontSize: size * 0.4, color: addon.languages?.[0]?.color ?? 'var(--c-accent)' }}
    >
      {addon.icon ?? addon.name.slice(0, 2)}
    </span>
  )
}

const snippetCount = (addon: Addon) => (addon.languages ?? []).reduce((n, l) => n + (l.snippets?.length ?? 0), 0)

function Badge({ children, title, className = '' }: { children: React.ReactNode; title?: string; className?: string }) {
  return (
    <span title={title} className={`flex items-center gap-0.5 rounded-full border border-edge px-1.5 py-px text-[10px] text-muted ${className}`}>
      {children}
    </span>
  )
}

function AddonCard({ addon, index, selected, onSelect }: { addon: Addon; index: number; selected: boolean; onSelect: () => void }) {
  const t = useT()
  const active = registry.isActive(addon.id)
  const snippets = snippetCount(addon)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        onSelect()
      }}
      style={{ animationDelay: `calc(var(--duration) * ${Math.min(index, 12) * 0.08})` }}
      className={[
        'lm-transition lm-anim-up mb-1.5 cursor-pointer rounded-lumen border p-2.5 outline-none focus-visible:border-accent',
        selected ? 'border-accent bg-active' : 'border-edge bg-surface hover:border-edge-strong',
        active ? '' : 'opacity-65',
      ].join(' ')}
    >
      <div className="flex items-start gap-2.5">
        <AddonIcon addon={addon} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">{addon.name}</span>
            <span className="shrink-0 font-mono text-[10px] text-subtle">v{addon.version}</span>
          </div>
          {addon.description && <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-subtle">{addon.description}</p>}
        </div>
        <Switch addon={addon} />
      </div>
      <div className="mt-1.5 ml-[38px] flex flex-wrap items-center gap-1">
        {addon.builtin && <Badge title={t('addonStudio.dialog.builtinHint')}><Lock size={8} /> {t('common.builtin')}</Badge>}
        {addon.user && <Badge className="text-accent"><Sparkles size={8} /> {t('addonStudio.dialog.userBadge')}</Badge>}
        {addon.languages?.slice(0, 4).map((l) => (
          <span key={l.id} className="rounded-full border border-edge px-1.5 py-px text-[10px]" style={{ color: l.color ?? 'var(--c-text-muted)' }}>
            {l.name}
          </span>
        ))}
        {(addon.languages?.length ?? 0) > 4 && <Badge>+{(addon.languages?.length ?? 0) - 4}</Badge>}
        {addon.languages?.some((l) => l.lsp?.length) && <Badge className="text-accent"><Zap size={8} /> LSP</Badge>}
        {snippets > 0 && <Badge title={t('addonStudio.dialog.snippetsHint')}>{t('addonStudio.dialog.snippets', { count: snippets })}</Badge>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function DetailSection({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="border-t border-edge px-5 py-3">
      <h4 className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">
        {title}{count !== undefined ? ` · ${count}` : ''}
      </h4>
      {children}
    </section>
  )
}

function AddonDetails({ addon, onSelect }: { addon: Addon; onSelect: (id: string) => void }) {
  const t = useT()
  const openStudio = useStore((s) => s.openAddonStudio)
  const setTheme = useStore((s) => s.setTheme)
  const themeId = useStore((s) => s.themeId)
  const closeDialog = useStore((s) => s.closeDialog)
  const notify = useStore((s) => s.notify)
  const active = registry.isActive(addon.id)
  const model = addon.user ? userAddons.get(addon.id) : undefined

  const languages = addon.languages ?? []
  const kinds = addon.projectKinds ?? []
  const templates = addon.projectTemplates ?? []
  const commands = addon.commands ?? []
  const themes = addon.themes ?? []

  const copyAsUser = async () => {
    const copy = await userAddons.copyFromAddon(addon)
    if (!copy) return
    notify(t('addonStudio.dialog.copied', { name: copy.name }), 'success')
    openStudio(copy.id)
  }

  return (
    <div className="lm-anim-fade">
      <div className="flex items-start gap-3 px-5 pt-4 pb-3">
        <AddonIcon addon={addon} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h3 className="truncate text-[16px] font-medium text-fg">{addon.name}</h3>
            <span className="font-mono text-[11px] text-subtle">v{addon.version}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] text-subtle">
            <span className="font-mono">{addon.id}</span>
            {addon.author && <span>{t('common.author')}: {addon.author}</span>}
            <span>{t(active ? 'common.enabled' : 'common.disabled')}</span>
          </div>
          {addon.description && <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{addon.description}</p>}
        </div>
        <Switch addon={addon} />
      </div>

      <div className="flex flex-wrap gap-1.5 px-5 pb-3">
        {model && (
          <>
            <Button size="sm" variant="solid" onClick={() => openStudio(model.id)}><Pencil size={12} /> {t('common.edit')}</Button>
            <Button size="sm" variant="outline" onClick={async () => {
              const copy = await userAddons.duplicate(model.id)
              if (copy) onSelect(copy.id)
            }}>
              <Copy size={12} /> {t('common.duplicate')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void userAddons.exportModel(model)}><Download size={12} /> {t('common.export')}</Button>
            <Button size="sm" variant="danger" onClick={async () => {
              if (!confirm(t('common.confirmDelete', { name: model.name }))) return
              await userAddons.remove(model.id)
              notify(t('addonStudio.dialog.deleted', { name: model.name }), 'info')
            }}>
              <Trash2 size={12} /> {t('common.delete')}
            </Button>
          </>
        )}
        {!addon.user && (languages.length > 0 || themes.length > 0) && (
          <Button size="sm" variant="outline" onClick={() => void copyAsUser()} title={t('addonStudio.dialog.copyAsUserHint')}>
            <Copy size={12} /> {t('addonStudio.dialog.copyAsUser')}
          </Button>
        )}
      </div>

      {languages.length > 0 && (
        <DetailSection title={t('addonStudio.nav.languages')} count={languages.length}>
          {languages.map((lang) => (
            <div key={lang.id} className="mb-2.5 rounded-lumen-sm border border-edge p-2.5">
              <div className="flex items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: lang.color ?? 'var(--c-border-strong)' }} />
                <span className="text-[12.5px] font-medium text-fg">{lang.name}</span>
                <span className="font-mono text-[10.5px] text-subtle">{lang.id}</span>
                <span className="flex-1" />
                {(lang.snippets?.length ?? 0) > 0 && <Badge>{t('addonStudio.dialog.snippets', { count: lang.snippets?.length ?? 0 })}</Badge>}
                {lang.tokenizer && <Badge>{t('addonStudio.dialog.customTokenizer')}</Badge>}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {[...lang.extensions, ...(lang.filenames ?? [])].map((ext) => (
                  <span key={ext} className="rounded-[4px] bg-input px-1.5 py-px font-mono text-[10.5px] text-muted">{ext}</span>
                ))}
              </div>
              {(lang.run?.length ?? 0) > 0 && (
                <div className="mt-1.5 text-[11.5px] text-subtle">
                  {t('addonStudio.languages.run')}: {lang.run?.map((r) => r.label).join(', ')}
                </div>
              )}
              {lang.lsp?.map((server) => (
                <div key={`${server.label}${server.command}`} className="mt-1.5 flex items-start gap-1.5 text-[11.5px]">
                  <Zap size={11} className="mt-0.5 shrink-0 text-accent" />
                  <div className="min-w-0">
                    <span className="text-muted">{server.label}</span>
                    <span className="ml-1.5 font-mono text-[10.5px] text-subtle">{[server.command, ...(server.args ?? [])].join(' ')}</span>
                    {server.install && <div className="text-subtle">{server.install}</div>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </DetailSection>
      )}

      {kinds.length > 0 && (
        <DetailSection title={t('addonStudio.dialog.projectKinds')} count={kinds.length}>
          <div className="flex flex-wrap gap-1.5">
            {kinds.map((kind) => (
              <span key={kind.id} title={kind.markers.join(', ')} className="flex items-center gap-1 rounded-lumen-sm border border-edge px-2 py-1 text-[11.5px] text-muted">
                <span className="size-2 rounded-full" style={{ background: kind.color ?? 'var(--c-accent)' }} />
                {kind.name}
                <span className="font-mono text-[10px] text-subtle">{kind.markers.slice(0, 2).join(' ')}</span>
              </span>
            ))}
          </div>
        </DetailSection>
      )}

      {templates.length > 0 && (
        <DetailSection title={t('addonStudio.nav.templates')} count={templates.length}>
          {templates.map((tpl) => (
            <div key={tpl.id} className="mb-1 text-[12px]">
              <span className="text-fg">{tpl.name}</span>
              {tpl.description && <span className="ml-2 text-subtle">{tpl.description}</span>}
            </div>
          ))}
        </DetailSection>
      )}

      {commands.length > 0 && (
        <DetailSection title={t('addonStudio.nav.commands')} count={commands.length}>
          {commands.map((command) => (
            <div key={command.id} className="mb-1 flex items-center gap-2 text-[12px]">
              <span className="min-w-0 flex-1 truncate text-fg">{command.title}</span>
              {formatBindingsFor(command.id) && (
                <kbd className="rounded border border-edge bg-input px-1.5 py-px font-mono text-[10.5px] text-muted">{formatBindingsFor(command.id)}</kbd>
              )}
            </div>
          ))}
        </DetailSection>
      )}

      {themes.length > 0 && (
        <DetailSection title={t('addonStudio.nav.themes')} count={themes.length}>
          <div className="grid grid-cols-2 gap-1.5">
            {themes.map((theme) => (
              <button
                key={theme.id}
                disabled={!active}
                onClick={() => setTheme(theme.id)}
                className={[
                  'lm-transition flex items-center gap-2 rounded-lumen-sm border px-2 py-1.5 text-left disabled:opacity-50',
                  theme.id === themeId ? 'border-accent' : 'border-edge hover:border-edge-strong',
                ].join(' ')}
              >
                <span className="flex overflow-hidden rounded-[4px] border border-edge">
                  {[theme.ui.bg, theme.ui.accent, theme.ui.text].map((c, i) => <span key={i} className="block h-5 w-3.5" style={{ background: c }} />)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-fg">{theme.name}</span>
                <span className="text-[10.5px] text-subtle">{t(theme.type === 'dark' ? 'common.dark' : 'common.light')}</span>
              </button>
            ))}
          </div>
        </DetailSection>
      )}

      {!languages.length && !kinds.length && !templates.length && !commands.length && !themes.length && (
        <DetailSection title={t('addonStudio.dialog.contents')}>
          <p className="text-[12px] text-subtle">{t('addonStudio.dialog.noContents')}</p>
          {model && (
            <Button size="sm" variant="outline" className="mt-2" onClick={() => { closeDialog(); openStudio(model.id) }}>
              <Pencil size={12} /> {t('common.edit')}
            </Button>
          )}
        </DetailSection>
      )}
    </div>
  )
}

function LoadProblems() {
  const t = useT()
  const problems = userAddons.problems()
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lumen-sm border border-dashed border-edge px-2.5 py-1.5">
      <div className="min-w-0 flex-1 text-[11.5px] text-subtle">
        {problems.length === 0 && t('addonStudio.dialog.folderHint')}
        {problems.map((p) => (
          <div key={p.file} className="truncate text-bad" title={p.message}>{p.file}: {p.message}</div>
        ))}
      </div>
      <Button size="sm" title={t('addonStudio.dialog.openFolder')} onClick={async () => {
        const dir = await window.lumen.userAddons.dir()
        void window.lumen.shell.showItemInFolder(dir)
      }}>
        <FolderOpen size={12} />
      </Button>
    </div>
  )
}
