/**
 * Extensions and add-ons in one place.
 *
 *   Explore    everything all enabled servers offer, in one list
 *   Installed  every add-on that is present — built in, from a server, by hand
 *   Updates    installed extensions with a newer version on their server
 *   Servers    the servers themselves
 *
 * A server Lumen has not verified raises a prompt before installing — which
 * is also where it can be marked trusted for good.
 */

import { appVersion } from '@/core/extensions/app-version'
import { fitsApp } from '@/core/extensions/compat'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  Blocks, CheckCircle2, Compass, Globe, Plus, RefreshCw, ShieldCheck, ShieldAlert, Trash2,
} from 'lucide-react'
import { useStore } from '@/state/store'
import { useT } from '@/i18n'
import { catalog, type AvailableUpdate, type CatalogEntry } from '@/core/extensions/catalog'
import { isNewer } from '@/core/extensions/version'
import { extensions as installedExtensions } from '@/core/extensions/manager'
import { offerServers } from '@/core/extensions/lsp'
import { installExtension } from '@/core/extensions/flow'
import { hostOf, isOfficial, isTrusted } from '@/core/extensions/trust'
import type { ExtensionServer, ExtensionSummary } from '@/core/extensions/types'
import { Button, Empty } from '../ui'
import { DialogShell, type DialogSection } from './DialogShell'
import { InstalledView } from './InstalledView'

/** How a server's standing reads in the list. */
function trustLabel(official: boolean, trusted: boolean): string {
  if (official) return 'extensions.serverOfficial'
  if (trusted) return 'extensions.serverTrusted'
  return 'extensions.serverUnverified'
}

function Badge({ icon, color, size = 26 }: { icon?: string; color?: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-lumen-sm font-semibold text-white"
      style={{ background: color ?? '#7c8cff', width: size, height: size, fontSize: size * 0.42 }}
    >
      {(icon ?? '?').slice(0, 2)}
    </span>
  )
}

/** What the extension brings, as a list. */
function useProvidesText() {
  const t = useT()
  return useCallback((provides: Record<string, number> | undefined) => {
    if (!provides) return ''
    return Object.entries(provides)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => t(`extensions.provides.${key}`, { count }))
      .filter((part) => !part.startsWith('extensions.provides.'))
      .join(' · ')
  }, [t])
}

type Category = 'all' | 'language' | 'theme' | 'tool'
const CATEGORIES: Category[] = ['all', 'language', 'theme', 'tool']
const INSTALLED_FILTERS = ['all', 'language', 'theme', 'tool', 'extension', 'user']

export function ExtensionsDialog() {
  const t = useT()
  const open = useStore((s) => s.dialog === 'extensions')
  const requested = useStore((s) => s.dialogSection)
  const servers = useStore((s) => s.extensionServers)
  const notify = useStore((s) => s.notify)
  const openForm = useStore((s) => s.openForm)
  const setServer = useStore((s) => s.setExtensionServer)
  const removeServer = useStore((s) => s.removeExtensionServer)
  const addServer = useStore((s) => s.addExtensionServer)

  const [section, setSection] = useState('explore')
  const [installedFilter, setInstalledFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<Category>('all')
  const [busy, setBusy] = useState<string | null>(null)

  useSyncExternalStore(installedExtensions.subscribe, installedExtensions.getVersion)
  useSyncExternalStore(catalog.subscribe, catalog.getVersion)
  const providesText = useProvidesText()

  const activeServers = useMemo(() => servers.filter((server) => !server.disabled), [servers])
  const serverKey = activeServers.map((server) => server.url).join('\n')

  const offered = catalog.explore(activeServers)
  const updates = catalog.updates(activeServers)

  /** `openDialog('extensions', 'servers')` and the like pick the section. */
  useEffect(() => {
    if (!open || !requested) return
    if (INSTALLED_FILTERS.includes(requested)) {
      setSection('installed')
      setInstalledFilter(requested)
      return
    }
    setSection(requested)
  }, [open, requested])

  /** Ask every enabled server whenever the dialog opens or the list changes. */
  useEffect(() => {
    if (!open) return
    void catalog.refresh(activeServers)
  }, [open, serverKey])

  const sections = useMemo<DialogSection[]>(() => [
    { id: 'explore', label: t('extensions.explore'), icon: Compass, badge: offered.length ? String(offered.length) : undefined },
    { id: 'installed', label: t('extensions.installed'), icon: Blocks },
    { id: 'updates', label: t('extensions.updates'), icon: RefreshCw, badge: updates.length ? String(updates.length) : undefined },
    { id: 'servers', label: t('extensions.servers'), icon: Globe, badge: String(servers.length) },
  ], [t, offered.length, updates.length, servers.length])

  /** Install or update — asking first for unverified servers. */
  const install = useCallback(async (server: ExtensionServer, entry: ExtensionSummary, version?: string) => {
    const run = async () => {
      setBusy(entry.id)
      try {
        await installExtension(server.url, entry.id, version, (manifest) => {
          notify(t('extensions.installedNotice', { name: entry.name }), 'success')
          void offerServers(manifest)
        })
      } catch (err) {
        notify(t('extensions.installFailed', { error: (err as Error).message }), 'error')
      } finally {
        setBusy(null)
      }
    }

    if (isTrusted(server.url, servers)) {
      await run()
      return
    }
    const host = hostOf(server.url) ?? server.url
    openForm({
      title: t('extensions.untrustedTitle'),
      description: t('extensions.untrustedBody', { name: entry.name, host }),
      submitLabel: t('extensions.install'),
      fields: [{ id: 'trust', label: t('extensions.untrustedTrustAlways', { host }), type: 'toggle', default: '' }],
      onSubmit: async (values) => {
        if (values.trust === 'true') setServer(server.url, { trusted: true })
        await run()
      },
    })
  }, [servers, notify, openForm, setServer, t])

  const updateAll = useCallback(async () => {
    setBusy('*')
    try {
      const names = await installedExtensions.updateAll()
      notify(names.length ? t('extensions.updated', { names: names.join(', ') }) : t('extensions.updatesNone'), names.length ? 'success' : 'info')
      await catalog.refresh(activeServers)
    } finally {
      setBusy(null)
    }
  }, [notify, t, activeServers])

  const needle = search.trim().toLowerCase()
  const matches = (entry: ExtensionSummary) => {
    if (!needle) return true
    return [entry.name, entry.id, entry.description, ...(entry.keywords ?? [])].join(' ').toLowerCase().includes(needle)
  }
  const explored = offered.filter(({ summary }) => matches(summary) && (category === 'all' || summary.category === category))
  const shownUpdates = updates.filter((update) => offered.some(({ summary }) => summary.id === update.id && matches(summary)))

  return (
    <DialogShell
      id="extensions"
      wide
      title={t('extensions.title')}
      icon={Blocks}
      sections={sections}
      section={section}
      onSection={setSection}
      search={section === 'servers' ? undefined : search}
      onSearch={section === 'servers' ? undefined : setSearch}
      searchPlaceholder={t('extensions.search')}
      headerExtra={section === 'servers' ? undefined : (
        <Button size="sm" variant="outline" title={t('extensions.refresh')} onClick={() => void catalog.refresh(activeServers)} disabled={catalog.loading()}>
          <RefreshCw size={12} className={catalog.loading() ? 'lm-anim-spin' : ''} />
          {t('extensions.refresh')}
        </Button>
      )}
    >
      {section === 'servers' && (
        <div className="p-4">
          <ServerList servers={servers} onAdd={addServer} onRemove={removeServer} onPatch={setServer} />
        </div>
      )}

      {section === 'installed' && <InstalledView query={search} initialFilter={installedFilter} updates={updates} />}

      {section === 'explore' && (
        <ExploreList
          entries={explored}
          servers={activeServers}
          category={category}
          onCategory={setCategory}
          busy={busy}
          providesText={providesText}
          onInstall={install}
        />
      )}

      {section === 'updates' && (
        <UpdateList
          updates={shownUpdates}
          servers={activeServers}
          busy={busy}
          onUpdate={(update) => {
            const entry = offered.find(({ summary }) => summary.id === update.id)
            if (entry) void install(update.server, entry.summary, update.to)
          }}
          onUpdateAll={() => void updateAll()}
        />
      )}
    </DialogShell>
  )
}

/** Why a server's catalogue is missing, one line per failing server. */
function ServerProblems({ servers }: { servers: ExtensionServer[] }) {
  const t = useT()
  const failing = servers.filter((server) => catalog.of(server.url)?.error)
  if (!failing.length) return null
  return (
    <div className="mb-3 flex flex-col gap-1">
      {failing.map((server) => (
        <div key={server.url} className="flex items-center gap-2 rounded-lumen-sm border border-dashed border-edge px-2.5 py-1.5 text-[11.5px] text-bad">
          <ShieldAlert size={12} className="shrink-0" />
          <span className="min-w-0 truncate">{t('extensions.loadFailed', { server: hostOf(server.url) ?? server.url, error: catalog.of(server.url)?.error ?? '' })}</span>
        </div>
      ))}
    </div>
  )
}

function ExploreList({ entries, servers, category, onCategory, busy, providesText, onInstall }: {
  entries: CatalogEntry[]
  servers: ExtensionServer[]
  category: Category
  onCategory: (category: Category) => void
  busy: string | null
  providesText: (provides: Record<string, number> | undefined) => string
  onInstall: (server: ExtensionServer, entry: ExtensionSummary) => void
}) {
  const t = useT()
  useSyncExternalStore(installedExtensions.subscribe, installedExtensions.getVersion)
  const loading = catalog.loading()

  const body = () => {
    if (!servers.length) return <Empty icon={<Globe size={22} />} title={t('extensions.noServers')} hint={t('extensions.subtitle')} />
    if (loading && !entries.length) return <Empty icon={<RefreshCw size={22} className="lm-anim-spin" />} title={t('extensions.loading')} />
    if (!entries.length) return <Empty icon={<Blocks size={22} />} title={t('extensions.noResults')} />
    return (
      <div className="flex flex-col gap-2">
        {entries.map(({ summary, server }) => {
          const current = installedExtensions.get(summary.id)
          const outdated = Boolean(current) && isNewer(summary.version, current?.manifest.version ?? '')
          const fits = fitsApp(summary.minAppVersion, appVersion())
          const label = () => {
            if (!fits) return t('extensions.requiresApp', { required: summary.minAppVersion ?? '' })
            if (outdated) return t('extensions.update')
            if (current) return t('extensions.installed')
            return t('extensions.install')
          }
          return (
            <div key={summary.id} className="flex items-start gap-3 rounded-lumen border border-edge bg-elevated p-3">
              <Badge icon={summary.icon} color={summary.color} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] text-fg">{summary.name}</span>
                  {current && !outdated && <CheckCircle2 size={12} className="shrink-0 text-good" />}
                </div>
                <div className="text-[12px] text-muted">{summary.description}</div>
                <div className="mt-1 truncate text-[11.5px] text-subtle">
                  {t('extensions.versionLabel', { version: summary.version })}
                  {summary.author ? ` · ${t('extensions.byAuthor', { author: summary.author })}` : ''}
                  {providesText(summary.provides) ? ` · ${providesText(summary.provides)}` : ''}
                  {` · ${server.name ?? hostOf(server.url) ?? server.url}`}
                </div>
              </div>
              <Button
                size="sm"
                variant={outdated ? 'solid' : undefined}
                disabled={!fits || busy === summary.id || (Boolean(current) && !outdated)}
                onClick={() => onInstall(server, summary)}
              >
                {busy === summary.id && <RefreshCw size={12} className="lm-anim-spin" />}
                {label()}
              </Button>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {CATEGORIES.map((id) => (
          <button
            key={id}
            onClick={() => onCategory(id)}
            className={[
              'lm-transition rounded-full border px-2.5 py-0.5 text-[11.5px]',
              id === category ? 'border-accent bg-active text-fg' : 'border-edge text-muted hover:border-edge-strong',
            ].join(' ')}
          >
            {t(`addonStudio.dialog.nav.${id}`)}
          </button>
        ))}
      </div>
      <ServerProblems servers={servers} />
      {body()}
    </div>
  )
}

function UpdateList({ updates, servers, busy, onUpdate, onUpdateAll }: {
  updates: AvailableUpdate[]
  servers: ExtensionServer[]
  busy: string | null
  onUpdate: (update: AvailableUpdate) => void
  onUpdateAll: () => void
}) {
  const t = useT()
  const loading = catalog.loading()

  const body = () => {
    if (loading && !updates.length) return <Empty icon={<RefreshCw size={22} className="lm-anim-spin" />} title={t('extensions.loading')} />
    if (!updates.length) return <Empty icon={<CheckCircle2 size={22} />} title={t('extensions.updatesNone')} />
    return (
      <div className="flex flex-col gap-2">
        {updates.map((update) => {
          const manifest = installedExtensions.get(update.id)?.manifest
          return (
            <div key={update.id} className="flex items-center gap-3 rounded-lumen border border-edge bg-elevated p-3">
              <Badge icon={manifest?.icon} color={manifest?.color} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-fg">{update.name}</div>
                <div className="truncate font-mono text-[11.5px] text-subtle">
                  {update.from} → {update.to} · {update.server.name ?? hostOf(update.server.url) ?? update.server.url}
                </div>
              </div>
              <Button size="sm" variant="solid" disabled={busy === update.id || busy === '*'} onClick={() => onUpdate(update)}>
                {busy === update.id && <RefreshCw size={12} className="lm-anim-spin" />}
                {t('extensions.update')}
              </Button>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="p-4">
      {updates.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[12px] text-muted">{t('extensions.updatesFound', { count: updates.length })}</span>
          <span className="flex-1" />
          <Button size="sm" variant="solid" disabled={busy === '*'} onClick={onUpdateAll}>
            <RefreshCw size={12} className={busy === '*' ? 'lm-anim-spin' : ''} />
            {t('extensions.updateAll')}
          </Button>
        </div>
      )}
      <ServerProblems servers={servers} />
      {body()}
    </div>
  )
}

function ServerList({ servers, onAdd, onRemove, onPatch }: {
  servers: ExtensionServer[]
  onAdd: (url: string) => Promise<string | null>
  onRemove: (url: string) => void
  onPatch: (url: string, patch: Partial<ExtensionServer>) => void
}) {
  const t = useT()
  const notify = useStore((s) => s.notify)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const submit = async () => {
    if (!draft.trim() || adding) return
    setAdding(true)
    setError(null)
    const message = await onAdd(draft)
    setAdding(false)
    if (message) {
      setError(message)
      return
    }
    notify(t('extensions.serverAdded', { name: draft.trim() }), 'success')
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1.5 flex gap-2">
          <input
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
            placeholder={t('extensions.serverPlaceholder')}
            spellCheck={false}
            className="lm-transition w-full rounded-lumen-sm border border-edge bg-input px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-accent"
          />
          <Button size="sm" onClick={() => void submit()} disabled={adding || !draft.trim()}>
            <Plus size={12} />
            {t('extensions.addServer')}
          </Button>
        </div>
        {error && <span className="text-[11.5px] text-bad">{error}</span>}
      </div>

      <div className="flex flex-col gap-2">
        {servers.map((server) => {
          const official = isOfficial(server.url)
          const trusted = isTrusted(server.url, servers)
          return (
            <div key={server.url} className="flex items-center gap-3 rounded-lumen border border-edge bg-elevated p-3">
              {trusted ? <ShieldCheck size={15} className="shrink-0 text-good" /> : <ShieldAlert size={15} className="shrink-0 text-warn" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-fg">{server.name ?? hostOf(server.url)}</div>
                <div className="truncate font-mono text-[11.5px] text-subtle">{server.url}</div>
                <div className="text-[11.5px] text-muted">{t(trustLabel(official, trusted))}</div>
              </div>
              {!official && (
                <>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-muted" title={t('extensions.trustHint')}>
                    <input
                      type="checkbox"
                      className="accent-[var(--c-accent)]"
                      checked={server.trusted === true}
                      onChange={(e) => onPatch(server.url, { trusted: e.target.checked })}
                    />
                    {t('extensions.trustServer')}
                  </label>
                  <Button size="sm" variant="danger" onClick={() => onRemove(server.url)} title={t('extensions.removeServer')}>
                    <Trash2 size={12} />
                  </Button>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
