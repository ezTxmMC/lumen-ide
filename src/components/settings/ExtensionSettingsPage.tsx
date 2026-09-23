/**
 * *Settings → Extensions*: one page per installed extension.
 *
 * On the left the extensions that bring settings, with how many of them
 * differ from their defaults; on the right the chosen one — its particulars,
 * its settings grouped by `section` into cards, a mark beside each changed
 * value that resets it, and a reset for the whole extension. The dialog's
 * search still lists matching settings of every extension together; this
 * page is what the section shows without a search.
 */

import { useMemo, useState, useSyncExternalStore } from 'react'
import { Blocks, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useStore } from '@/state/store'
import { useLanguage, useT } from '@/i18n'
import { extensions as installedExtensions } from '@/core/extensions/manager'
import { localizeSetting } from '@/core/extensions/localize'
import type { ExtensionManifest, ExtensionSetting } from '@/core/extensions/types'
import { Button, Empty } from '../ui'
import { ExtensionSettingRow, settingChanged, settingDefault, settingVisible } from './ExtensionSettingRow'

type Manifest = Omit<ExtensionManifest, 'code'>

/** Settings in their sections, in the order the sections first appear. */
function bySection(settings: ExtensionSetting[]): [string, ExtensionSetting[]][] {
  const groups = new Map<string, ExtensionSetting[]>()
  for (const setting of settings) {
    const key = setting.section ?? ''
    groups.set(key, [...(groups.get(key) ?? []), setting])
  }
  return [...groups.entries()]
}

function ExtensionBadge({ manifest, size = 'md' }: { manifest: Manifest; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'size-7 text-[10px]' : 'size-10 text-[12px]'
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lumen-sm border border-edge font-mono font-bold ${box}`}
      style={{ color: manifest.color, background: manifest.color ? `${manifest.color}1f` : undefined }}
    >
      {manifest.icon ?? <Blocks size={size === 'sm' ? 13 : 17} />}
    </span>
  )
}

export function ExtensionSettingsPage() {
  const t = useT()
  const language = useLanguage()
  const values = useStore((s) => s.extensionSettings)
  const setSetting = useStore((s) => s.setExtensionSetting)
  const openDialog = useStore((s) => s.openDialog)
  useSyncExternalStore(installedExtensions.subscribe, installedExtensions.getVersion)

  const withSettings = useMemo(
    () => installedExtensions.list()
      .map(({ manifest }) => manifest)
      .filter((manifest) => manifest.settings?.length)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [installedExtensions.getVersion()],
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = withSettings.find((manifest) => manifest.id === selectedId) ?? withSettings[0]

  if (!selected) {
    return (
      <Empty
        icon={<Blocks size={22} />}
        title={t('settings.ext.none')}
        hint={t('settings.ext.noneHint')}
        action={<Button variant="outline" size="sm" onClick={() => openDialog('extensions')}>{t('settings.ext.browse')}</Button>}
      />
    )
  }

  const changedCount = (manifest: Manifest) =>
    (manifest.settings ?? []).filter((setting) => settingChanged(values[manifest.id], setting)).length
  const settings = (selected.settings ?? []).map((setting) => localizeSetting(setting, language))
  const visible = settings.filter((setting) => settingVisible(setting, settings, values[selected.id]))
  const changed = changedCount(selected)
  const resetAll = () => {
    for (const setting of selected.settings ?? []) {
      if (setting.type === 'secret') continue
      setSetting(selected.id, setting.key, settingDefault(setting))
    }
  }

  return (
    <div className="flex min-h-[420px] gap-4">
      <nav className="flex w-[200px] shrink-0 flex-col gap-0.5" aria-label={t('settings.sections.extensions')}>
        {withSettings.map((manifest) => {
          const count = changedCount(manifest)
          const active = manifest.id === selected.id
          return (
            <button
              key={manifest.id}
              type="button"
              onClick={() => setSelectedId(manifest.id)}
              className={[
                'lm-transition flex items-center gap-2 rounded-lumen-sm px-2 py-1.5 text-left',
                active ? 'bg-active text-fg' : 'text-muted hover:bg-hover hover:text-fg',
              ].join(' ')}
            >
              <ExtensionBadge manifest={manifest} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px]">{manifest.name}</span>
                <span className="block truncate text-[10.5px] text-subtle">
                  {t('settings.ext.count', { count: manifest.settings?.length ?? 0 })}
                  {count > 0 && <span className="text-accent"> · {t('settings.ext.changed', { count })}</span>}
                </span>
              </span>
            </button>
          )
        })}
      </nav>

      <div className="min-w-0 flex-1">
        <header className="mb-3 flex items-start gap-3 rounded-lumen border border-edge bg-surface/60 p-3">
          <ExtensionBadge manifest={selected} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-[14px] font-medium text-fg">{selected.name}</span>
              <span className="font-mono text-[11px] text-subtle">{selected.version}</span>
            </div>
            {selected.author && <div className="text-[11px] text-subtle">{selected.author}</div>}
            {selected.description && <p className="mt-1 text-[12px] leading-snug text-muted">{selected.description}</p>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Button size="sm" variant="outline" disabled={!changed} onClick={resetAll} title={t('settings.ext.resetAllHint')}>
              <RotateCcw size={12} /> {t('settings.ext.resetAll')}
            </Button>
            <Button size="sm" onClick={() => openDialog('extensions')}>
              <SlidersHorizontal size={12} /> {t('settings.ext.manage')}
            </Button>
          </div>
        </header>

        <div className="flex flex-col gap-3">
          {bySection(visible).map(([section, list]) => (
            <section key={section || '-'} className="rounded-lumen border border-edge py-1 pl-6 pr-3">
              {section && (
                <h4 className="-ml-3 mt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">{section}</h4>
              )}
              <div className="divide-y divide-edge/60">
                {list.map((setting) => (
                  <ExtensionSettingRow key={setting.key} extensionId={selected.id} setting={setting} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
