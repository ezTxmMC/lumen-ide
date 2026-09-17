import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, Check, CloudDownload, Download, Loader2 } from 'lucide-react'
import { locale, useT } from '@/i18n'
import {
  JAVA_DISTRIBUTIONS, cancelInstall, compareVersions, installPackage, isFinished, loadCatalog, normalizeJavaVersion, setEarlyAccess,
  useSdk, type InstallJob, type InstalledSdk, type SdkPackage,
} from '@/core/sdk'
import { Button, Empty } from '../ui'
import { Badge, DistributionMark, InstallProgressBar, formatBytes } from './parts'

const EMPTY_PACKAGES: SdkPackage[] = []
const EMPTY_INSTALLED: InstalledSdk[] = []
const DOWNLOADABLE = JAVA_DISTRIBUTIONS.filter((d) => d.downloadable)
const OS_LABELS: Record<string, string> = { linux: 'Linux', darwin: 'macOS', win32: 'Windows' }

function matches(pkg: SdkPackage, needle: string) {
  if (!needle) return true
  const distribution = DOWNLOADABLE.find((d) => d.id === pkg.distribution)
  const text = `${distribution?.name ?? ''} ${distribution?.vendor ?? ''} ${pkg.version} java ${pkg.major} ${pkg.filename}`.toLowerCase()
  return needle.split(/\s+/).every((part) => text.includes(part))
}

/** Has Lumen already installed this package — same distribution and version? */
function installedMatch(pkg: SdkPackage, installed: InstalledSdk[]) {
  return installed.some((sdk) =>
    sdk.distribution === pkg.distribution && sdk.major === pkg.major && compareVersions(normalizeJavaVersion(sdk.version), normalizeJavaVersion(pkg.version)) === 0)
}

/** The “download” section: the foojay Disco API catalogue, with filters. */
export function DownloadCatalog({ search }: { search: string }) {
  const t = useT()
  const catalog = useSdk((s) => s.catalogs.java)
  const loading = useSdk((s) => s.catalogLoading)
  const error = useSdk((s) => s.catalogError)
  const jobs = useSdk((s) => s.jobs)
  const earlyAccess = useSdk((s) => s.settings.earlyAccess)
  const installed = useSdk((s) => s.installed.java ?? EMPTY_INSTALLED)
  const environment = useSdk((s) => s.environment)

  const [distribution, setDistribution] = useState<string>('all')
  const [major, setMajor] = useState<string>('all')
  const [ltsOnly, setLtsOnly] = useState(false)
  const [javafx, setJavafx] = useState(false)

  useEffect(() => { void loadCatalog('java') }, [earlyAccess])

  const packages = catalog?.packages ?? EMPTY_PACKAGES
  const majors = useMemo(() => [...new Set(packages.map((p) => p.major))].sort((a, b) => b - a), [packages])
  const needle = search.trim().toLowerCase()

  const visible = useMemo(() => packages.filter((pkg) => {
    if (distribution !== 'all' && pkg.distribution !== distribution) return false
    if (major !== 'all' && pkg.major !== Number(major)) return false
    if (ltsOnly && !pkg.lts) return false
    if (!earlyAccess && pkg.earlyAccess) return false
    if (pkg.bundled !== javafx) return false
    return matches(pkg, needle)
  }), [packages, distribution, major, ltsOnly, earlyAccess, javafx, needle])

  const groups = useMemo(() => {
    const byMajor = new Map<number, SdkPackage[]>()
    for (const pkg of visible) byMajor.set(pkg.major, [...(byMajor.get(pkg.major) ?? []), pkg])
    return [...byMajor.entries()].sort((a, b) => b[0] - a[0])
  }, [visible])

  const countFor = (id: string) => packages.filter((p) => p.distribution === id && p.bundled === javafx && (earlyAccess || !p.earlyAccess)).length

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-edge bg-overlay/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap gap-1">
          <Chip active={distribution === 'all'} onClick={() => setDistribution('all')}>{t('sdk.download.filterAll')}</Chip>
          {DOWNLOADABLE.map((d) => (
            <Chip key={d.id} active={distribution === d.id} color={d.color} onClick={() => setDistribution(d.id)} count={countFor(d.id)}>
              {d.name}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[12px]">
          <label className="flex items-center gap-1.5 text-muted">
            {t('sdk.download.version')}
            <select
              value={major}
              onChange={(e) => setMajor(e.target.value)}
              className="lm-transition rounded-lumen-sm border border-edge bg-input px-2 py-0.5 text-[12px] text-fg hover:border-edge-strong"
            >
              <option value="all">{t('sdk.download.allVersions')}</option>
              {majors.map((m) => <option key={m} value={m}>{t('sdk.download.major', { major: m })}</option>)}
            </select>
          </label>
          <Checkbox checked={ltsOnly} onChange={setLtsOnly} label={t('sdk.download.ltsOnly')} />
          <Checkbox checked={earlyAccess} onChange={setEarlyAccess} label={t('sdk.download.earlyAccess')} />
          <Checkbox checked={javafx} onChange={setJavafx} label={t('sdk.download.javafx')} />
          <span className="flex-1" />
          <span className="text-[11px] text-subtle">
            {environment && `${OS_LABELS[environment.platform] ?? environment.platform} · ${environment.arch}`}
            {catalog && ` · ${t('sdk.download.updated', { time: new Date(catalog.loadedAt).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) })}`}
          </span>
        </div>
      </div>

      {error && (
        <div className="lm-anim-fade mx-4 mt-3 flex items-center gap-2 rounded-lumen border border-bad/40 bg-bad/10 px-3 py-2 text-[12px] text-bad">
          <AlertTriangle size={13} className="shrink-0" />
          <span className="min-w-0 flex-1">{t('sdk.download.error', { message: error })}</span>
          <Button size="sm" variant="outline" onClick={() => void loadCatalog('java', true)}>{t('sdk.action.retry')}</Button>
        </div>
      )}

      {loading && !packages.length && (
        <div className="lm-anim-fade flex items-center justify-center gap-2 py-16 text-[12.5px] text-muted">
          <Loader2 size={14} className="lm-anim-spin" /> {t('sdk.download.loading')}
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <Empty icon={<CloudDownload size={26} strokeWidth={1.4} />} title={t('sdk.download.empty')} />
      )}

      <div className="flex flex-col gap-4 p-4">
        {groups.map(([groupMajor, list], groupIndex) => (
          <section key={groupMajor} className="lm-anim-up" style={{ animationDelay: `calc(var(--duration) * ${Math.min(groupIndex, 8) * 0.15})` }}>
            <h3 className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-fg">
              {t('sdk.download.major', { major: groupMajor })}
              {list[0]?.lts && <Badge tone="accent">{t('sdk.badge.lts')}</Badge>}
              <span className="h-px flex-1 bg-edge" />
            </h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2">
              {list.map((pkg) => (
                <PackageCard key={pkg.id} pkg={pkg} job={jobs[pkg.id]} installed={installedMatch(pkg, installed)} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="px-4 pb-4 text-center text-[10.5px] text-subtle">{t('sdk.download.source')}</div>
    </div>
  )
}

function PackageCard({ pkg, job, installed }: { pkg: SdkPackage; job?: InstallJob; installed: boolean }) {
  const t = useT()
  const distribution = DOWNLOADABLE.find((d) => d.id === pkg.distribution)
  const color = distribution?.color ?? 'var(--c-accent)'
  const busy = Boolean(job && !isFinished(job.progress.phase))
  return (
    <div
      className={[
        'lm-transition relative flex flex-col gap-2 overflow-hidden rounded-lumen border bg-surface p-3',
        busy ? 'border-accent/50' : 'border-edge hover:border-edge-strong hover:bg-hover/40',
      ].join(' ')}
    >
      <span className="absolute inset-x-0 top-0 h-[2px]" style={{ background: color, opacity: 0.8 }} />
      <div className="flex items-start gap-2.5">
        <DistributionMark name={distribution?.name ?? pkg.distribution} color={color} size={30} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-medium text-fg" title={distribution?.vendor}>{distribution?.name ?? pkg.distribution}</div>
          <div className="truncate font-mono text-[11.5px] text-muted" title={pkg.filename}>{pkg.version}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {pkg.earlyAccess && <Badge tone="warn">{t('sdk.badge.ea')}</Badge>}
          {pkg.bundled && <Badge>{t('sdk.badge.fx')}</Badge>}
        </div>
      </div>
      <div className="flex min-h-7 items-center gap-2">
        {job && <InstallProgressBar progress={job.progress} onCancel={() => cancelInstall(pkg.id)} />}
        {!job && (
          <>
            <span className="flex-1 font-mono text-[11px] text-subtle">{formatBytes(pkg.size)}</span>
            {installed && (
              <span className="flex items-center gap-1 text-[11.5px] text-ok"><Check size={12} /> {t('sdk.badge.installed')}</span>
            )}
            {!installed && (
              <Button size="sm" variant="outline" onClick={() => void installPackage(pkg)}>
                <Download size={11} /> {t('common.install')}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Chip({ active, color, count, onClick, children }: {
  active: boolean; color?: string; count?: number; onClick: () => void; children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'lm-transition inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px]',
        active ? 'border-accent/60 bg-accent/12 text-fg' : 'border-edge text-muted hover:border-edge-strong hover:text-fg',
      ].join(' ')}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}
      {children}
      {count !== undefined && <span className="font-mono text-[10px] text-subtle">{count}</span>}
    </button>
  )
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-1.5 text-muted hover:text-fg">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--c-accent)]" />
      {label}
    </label>
  )
}
