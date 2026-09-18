/**
 * Extensions from the network: managing servers, searching the catalogue,
 * installing, updating and removing.
 *
 * On the left sit the configured servers and the installed extensions, on the
 * right the list for whichever is selected. A server Lumen has not verified
 * raises a prompt before installing — which is also where it can be marked
 * trusted for good.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  Blocks, CheckCircle2, Globe, Plus, RefreshCw, ShieldCheck, ShieldAlert, Trash2,
} from 'lucide-react'
import { useStore } from '@/state/store'
import { useT } from '@/i18n'
import { fetchIndex } from '@/core/extensions/client'
import { extensions as installedExtensions } from '@/core/extensions/manager'
import { offerServers } from '@/core/extensions/lsp'
import { hostOf, isOfficial, isTrusted } from '@/core/extensions/trust'
import type { ExtensionServer, ExtensionSummary } from '@/core/extensions/types'
import { Button, Empty } from '../ui'
import { DialogShell, type DialogSection } from './DialogShell'

/** How a server's standing reads in the list. */
function trustLabel(official: boolean, trusted: boolean): string {
  if (official) return 'extensions.serverOfficial'
  if (trusted) return 'extensions.serverTrusted'
  return 'extensions.serverUnverified'
}

/** A server's catalogue, for as long as the dialog is open. */
interface CatalogState {
  loading: boolean
  error: string | null
  entries: ExtensionSummary[]
}

const EMPTY_CATALOG: CatalogState = { loading: true, error: null, entries: [] }

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

  const [section, setSection] = useState('installed')
  const [search, setSearch] = useState('')
  const [catalogs, setCatalogs] = useState<Record<string, CatalogState>>({})
  const [busy, setBusy] = useState<string | null>(null)

  useSyncExternalStore(installedExtensions.subscribe, installedExtensions.getVersion)
  const installed = installedExtensions.list()
  const providesText = useProvidesText()

  const active = servers.find((server) => server.url === section) ?? null

  /** `openDialog('extensions', 'servers')` and the like pick the section. */
  useEffect(() => {
    if (!open || !requested) return
    setSection(requested)
  }, [open, requested])

  /** Load the selected server's catalogue as soon as it becomes visible. */
  useEffect(() => {
    if (!open || !active || active.disabled) return
    let cancelled = false
    setCatalogs((current) => ({ ...current, [active.url]: { ...EMPTY_CATALOG } }))
    fetchIndex(active.url)
      .then((index) => {
        if (cancelled) return
        setCatalogs((current) => ({ ...current, [active.url]: { loading: false, error: null, entries: index.extensions } }))
      })
      .catch((err: Error) => {
        if (cancelled) return
        setCatalogs((current) => ({ ...current, [active.url]: { loading: false, error: err.message, entries: [] } }))
      })
    return () => { cancelled = true }
  }, [open, active?.url, active?.disabled])

  const sections = useMemo<DialogSection[]>(() => [
    { id: 'installed', label: t('extensions.installed'), icon: Blocks, badge: installed.length ? String(installed.length) : undefined },
    { id: 'servers', label: t('extensions.servers'), icon: Globe },
    ...servers.filter((server) => !server.disabled).map((server) => ({
      id: server.url,
      label: server.name ?? hostOf(server.url) ?? server.url,
      icon: isTrusted(server.url, servers) ? ShieldCheck : ShieldAlert,
    })),
  ], [t, servers, installed.length])

  /** Install — asking first for unverified servers. */
  const install = useCallback(async (server: ExtensionServer, entry: ExtensionSummary, version?: string) => {
    const run = async () => {
      setBusy(entry.id)
      try {
        const manifest = await installedExtensions.installFrom(server.url, entry.id, version)
        notify(t('extensions.installedNotice', { name: entry.name }), 'success')
        void offerServers(manifest)
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

  const uninstall = useCallback(async (id: string, name: string) => {
    setBusy(id)
    try {
      await installedExtensions.uninstall(id)
      notify(t('extensions.removedNotice', { name }), 'info')
    } finally {
      setBusy(null)
    }
  }, [notify, t])

  const updateAll = useCallback(async () => {
    setBusy('*')
    try {
      const names = await installedExtensions.updateAll()
      notify(names.length ? t('extensions.updated', { names: names.join(', ') }) : t('extensions.updatesNone'), names.length ? 'success' : 'info')
    } finally {
      setBusy(null)
    }
  }, [notify, t])

  const catalog = active ? catalogs[active.url] ?? EMPTY_CATALOG : null
  const filtered = catalog?.entries.filter((entry) => {
    const needle = search.trim().toLowerCase()
    if (!needle) return true
    return [entry.name, entry.id, entry.description, ...(entry.keywords ?? [])].join(' ').toLowerCase().includes(needle)
  }) ?? []

  return (
    <DialogShell
      id="extensions"
      title={t('extensions.title')}
      icon={Blocks}
      sections={sections}
      section={section}
      onSection={setSection}
      search={section === 'servers' ? undefined : search}
      onSearch={section === 'servers' ? undefined : setSearch}
      searchPlaceholder={t('extensions.search')}
      headerExtra={installed.length > 0 && (
        <Button size="sm" onClick={() => void updateAll()} disabled={busy === '*'}>
          <RefreshCw size={12} className={busy === '*' ? 'lm-anim-spin' : ''} />
          {t('extensions.updateAll')}
        </Button>
      )}
    >
      {section === 'servers' && (
        <ServerList
          servers={servers}
          onAdd={addServer}
          onRemove={removeServer}
          onPatch={setServer}
        />
      )}

      {section === 'installed' && (
        installed.length === 0
          ? <Empty icon={<Blocks size={22} />} title={t('extensions.noServers')} hint={t('extensions.subtitle')} />
          : (
            <div className="flex flex-col gap-2">
              {installed.map(({ manifest, server }) => (
                <div key={manifest.id} className="flex items-center gap-3 rounded-lumen border border-edge bg-elevated p-3">
                  <Badge icon={manifest.icon} color={manifest.color} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-fg">{manifest.name}</div>
                    <div className="truncate text-[11.5px] text-subtle">
                      {t('extensions.versionLabel', { version: manifest.version })}
                      {server ? ` · ${t('extensions.fromServer', { server: hostOf(server) ?? server })}` : ''}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy === manifest.id}
                    onClick={() => void uninstall(manifest.id, manifest.name)}
                  >
                    <Trash2 size={12} />
                    {t('extensions.uninstall')}
                  </Button>
                </div>
              ))}
            </div>
          )
      )}

      {active && catalog && (
        <CatalogList
          catalog={catalog}
          entries={filtered}
          server={active}
          busy={busy}
          providesText={providesText}
          onInstall={install}
        />
      )}
    </DialogShell>
  )
}

function CatalogList({ catalog, entries, server, busy, providesText, onInstall }: {
  catalog: CatalogState
  entries: ExtensionSummary[]
  server: ExtensionServer
  busy: string | null
  providesText: (provides: Record<string, number> | undefined) => string
  onInstall: (server: ExtensionServer, entry: ExtensionSummary) => void
}) {
  const t = useT()
  useSyncExternalStore(installedExtensions.subscribe, installedExtensions.getVersion)

  if (catalog.loading) return <Empty icon={<RefreshCw size={22} className="lm-anim-spin" />} title={t('extensions.loading')} />
  if (catalog.error) {
    return <Empty icon={<ShieldAlert size={22} />} title={t('extensions.loadFailed', { server: hostOf(server.url) ?? server.url, error: catalog.error })} />
  }
  if (!catalog.entries.length) return <Empty icon={<Blocks size={22} />} title={t('extensions.empty')} />
  if (!entries.length) return <Empty icon={<Blocks size={22} />} title={t('extensions.noResults')} />

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry) => {
        const current = installedExtensions.get(entry.id)
        const outdated = current && current.manifest.version !== entry.version
        return (
          <div key={entry.id} className="flex items-start gap-3 rounded-lumen border border-edge bg-elevated p-3">
            <Badge icon={entry.icon} color={entry.color} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[13px] text-fg">{entry.name}</span>
                {current && !outdated && <CheckCircle2 size={12} className="shrink-0 text-good" />}
              </div>
              <div className="text-[12px] text-muted">{entry.description}</div>
              <div className="mt-1 truncate text-[11.5px] text-subtle">
                {t('extensions.versionLabel', { version: entry.version })}
                {entry.author ? ` · ${t('extensions.byAuthor', { author: entry.author })}` : ''}
                {providesText(entry.provides) ? ` · ${providesText(entry.provides)}` : ''}
              </div>
            </div>
            <Button
              size="sm"
              variant={outdated ? 'solid' : undefined}
              disabled={busy === entry.id || (Boolean(current) && !outdated)}
              onClick={() => onInstall(server, entry)}
            >
              {busy === entry.id && <RefreshCw size={12} className="lm-anim-spin" />}
              {outdated ? t('extensions.update') : current ? t('extensions.installed') : t('extensions.install')}
            </Button>
          </div>
        )
      })}
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
