import { useMemo, useSyncExternalStore } from 'react'
import { Coffee, FolderOpen, Loader2, Star, Trash2, FolderGit2 } from 'lucide-react'
import { useStore } from '@/state/store'
import { useT } from '@/i18n'
import {
  activeSdk, distributionInfo, getSdkEnvironmentVersion, removeInstalled, resolveSdk, sdkLabel, setDefaultSdk, setProjectSdk,
  subscribeSdkEnvironment, useSdk, type InstalledSdk,
} from '@/core/sdk'
import { Button, Empty } from '../ui'
import { Badge, DistributionMark } from './parts'

const EMPTY: InstalledSdk[] = []

function matches(sdk: InstalledSdk, needle: string) {
  if (!needle) return true
  const text = `${sdkLabel(sdk)} ${sdk.vendor} ${sdk.home} ${sdk.sources.join(' ')} java ${sdk.major}`.toLowerCase()
  return needle.split(/\s+/).every((part) => text.includes(part))
}

/** The “installed” section: JDKs found on the machine and installed by Lumen. */
export function InstalledList({ search, onDownload }: { search: string; onDownload: () => void }) {
  const t = useT()
  useSyncExternalStore(subscribeSdkEnvironment, getSdkEnvironmentVersion)
  const installed = useSdk((s) => s.installed.java ?? EMPTY)
  const detecting = useSdk((s) => s.detecting)
  const defaultValue = useSdk((s) => s.settings.defaults.java)
  const workspace = useStore((s) => s.workspace)
  const projectValue = useStore((s) => s.projectConfig.jdk)

  const defaultHome = resolveSdk(defaultValue, installed)?.home
  const projectHome = workspace ? resolveSdk(projectValue, installed)?.home : undefined
  const active = activeSdk('java')
  const needle = search.trim().toLowerCase()
  const visible = useMemo(() => installed.filter((sdk) => matches(sdk, needle)), [installed, needle])

  const remove = (sdk: InstalledSdk) => {
    if (!confirm(t('sdk.list.confirmRemove', { name: sdkLabel(sdk) }))) return
    void removeInstalled(sdk)
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <ActiveSummary label={active ? activeLabel(active.home, installed) : null} origin={active?.origin} />

      {detecting && installed.length === 0 && (
        <div className="lm-anim-fade flex items-center gap-2 px-1 text-[12px] text-muted">
          <Loader2 size={13} className="lm-anim-spin" /> {t('sdk.list.detecting')}
        </div>
      )}

      {!detecting && visible.length === 0 && (
        <Empty
          icon={<Coffee size={26} strokeWidth={1.4} />}
          title={needle ? t('common.nothingFound') : t('sdk.list.empty')}
          hint={needle ? undefined : t('sdk.list.emptyHint')}
        />
      )}
      {!detecting && visible.length === 0 && !needle && (
        <div className="flex justify-center">
          <Button variant="solid" onClick={onDownload}>{t('sdk.command.download')}</Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {visible.map((sdk, index) => {
          const distribution = distributionInfo('java', sdk.distribution)
          const color = distribution?.color ?? 'var(--c-accent)'
          const isDefault = sdk.home === defaultHome
          const isProject = sdk.home === projectHome
          const isActive = sdk.home === active?.home
          return (
            <div
              key={sdk.home}
              style={{ animationDelay: `calc(var(--duration) * ${Math.min(index, 12) * 0.12})` }}
              className={[
                'lm-anim-up lm-transition group relative flex items-start gap-3 overflow-hidden rounded-lumen border bg-surface p-3 pl-4',
                isActive ? 'border-accent/50' : 'border-edge hover:border-edge-strong',
              ].join(' ')}
            >
              <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
              <DistributionMark name={distribution?.name ?? 'Java'} color={color} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] font-medium text-fg">{distribution?.name ?? 'Java'}</span>
                  <span className="font-mono text-[12px] text-muted">{sdk.version || '?'}</span>
                  {isDefault && <Badge tone="accent">{t('sdk.badge.default')}</Badge>}
                  {isProject && <Badge tone="ok">{t('sdk.badge.project')}</Badge>}
                  {sdk.managed && <Badge>{t('sdk.badge.lumen')}</Badge>}
                  {sdk.runtimeOnly && <Badge tone="warn">{t('sdk.badge.jre')}</Badge>}
                </div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-subtle" title={sdk.home}>{sdk.home}</div>
                <div className="mt-0.5 truncate text-[11px] text-subtle">
                  {[sdk.vendor, t('sdk.list.sources', { sources: sdk.sources.join(', ') })].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                <Button
                  size="sm"
                  variant={isDefault ? 'ghost' : 'outline'}
                  title={isDefault ? t('sdk.action.unsetDefault') : t('sdk.action.setDefault')}
                  onClick={() => void setDefaultSdk('java', isDefault ? null : sdk.home)}
                >
                  <Star size={11} className={isDefault ? 'fill-current text-accent' : ''} />
                  <span className="hidden sm:inline">{isDefault ? t('sdk.action.unsetDefault') : t('sdk.action.setDefault')}</span>
                </Button>
                {workspace && (
                  <Button
                    size="sm"
                    variant={isProject ? 'ghost' : 'outline'}
                    title={isProject ? t('sdk.action.unsetProject') : t('sdk.action.useForProject')}
                    onClick={() => void setProjectSdk(isProject ? null : sdk.home)}
                  >
                    <FolderGit2 size={11} className={isProject ? 'text-ok' : ''} />
                    <span className="hidden sm:inline">{isProject ? t('sdk.action.unsetProject') : t('sdk.action.useForProject')}</span>
                  </Button>
                )}
                <Button size="sm" title={t('sdk.action.reveal')} onClick={() => void window.lumen.shell.showItemInFolder(sdk.home)}>
                  <FolderOpen size={12} />
                </Button>
                {sdk.managed && (
                  <Button size="sm" variant="danger" title={t('common.remove')} onClick={() => remove(sdk)}>
                    <Trash2 size={12} />
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function activeLabel(home: string, installed: InstalledSdk[]) {
  const hit = installed.find((sdk) => sdk.home === home)
  return hit ? `${sdkLabel(hit)} — ${home}` : home
}

function ActiveSummary({ label, origin }: { label: string | null; origin?: 'project' | 'default' }) {
  const t = useT()
  return (
    <div className="lm-anim-fade flex items-center gap-3 rounded-lumen border border-edge bg-overlay/60 px-3 py-2.5">
      <Coffee size={16} className={label ? 'text-accent' : 'text-subtle'} />
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">{t('sdk.active.title')}</div>
        <div className="truncate text-[12.5px] text-fg" title={label ?? undefined}>{label ?? t('sdk.active.system')}</div>
      </div>
      {origin && <Badge tone={origin === 'project' ? 'ok' : 'accent'}>{t(`sdk.active.${origin}`)}</Badge>}
    </div>
  )
}
