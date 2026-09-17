import { useEffect, useState } from 'react'
import { Coffee, Download, HardDrive, RefreshCw } from 'lucide-react'
import { useStore } from '@/state/store'
import { useT } from '@/i18n'
import { detectInstalled, isFinished, loadCatalog, useSdk } from '@/core/sdk'
import { Button } from '../ui'
import { InstalledList } from '../sdk/InstalledList'
import { DownloadCatalog } from '../sdk/DownloadCatalog'
import { DialogShell } from './DialogShell'

const SECTIONS = ['installed', 'download'] as const
type SectionId = (typeof SECTIONS)[number]

const asSection = (value: string | null | undefined): SectionId =>
  SECTIONS.includes(value as SectionId) ? value as SectionId : 'installed'

/** SDKs & JDKs: installierte verwalten, neue herunterladen. */
export function SdkDialog() {
  const t = useT()
  const open = useStore((s) => s.dialog === 'sdks')
  const requested = useStore((s) => s.dialogSection)
  const [section, setSection] = useState<SectionId>('installed')
  const [search, setSearch] = useState('')
  const installedCount = useSdk((s) => s.installed.java?.length ?? 0)
  const running = useSdk((s) => Object.values(s.jobs).filter((job) => !isFinished(job.progress.phase)).length)
  const busy = useSdk((s) => (section === 'installed' ? s.detecting : s.catalogLoading))

  useEffect(() => {
    if (!open) return
    setSection(asSection(requested))
    setSearch('')
    void detectInstalled('java')
  }, [open, requested])

  const refresh = () => {
    if (section === 'installed') {
      void detectInstalled('java')
      return
    }
    void loadCatalog('java', true)
  }

  return (
    <DialogShell
      id="sdks"
      title={t('sdk.title')}
      icon={Coffee}
      wide
      sections={[
        { id: 'installed', label: t('sdk.section.installed'), icon: HardDrive, badge: installedCount ? String(installedCount) : undefined },
        { id: 'download', label: t('sdk.section.download'), icon: Download, badge: running ? `↓${running}` : undefined },
      ]}
      section={section}
      onSection={(id) => setSection(asSection(id))}
      search={search}
      onSearch={setSearch}
      searchPlaceholder={t('sdk.searchPlaceholder')}
      headerExtra={(
        <Button size="sm" title={section === 'installed' ? t('sdk.command.detect') : t('sdk.refresh')} onClick={refresh} disabled={busy}>
          <RefreshCw size={12} className={busy ? 'lm-anim-spin' : ''} />
          <span>{section === 'installed' ? t('sdk.detect') : t('sdk.refresh')}</span>
        </Button>
      )}
    >
      {section === 'installed' && <InstalledList search={search} onDownload={() => setSection('download')} />}
      {section === 'download' && <DownloadCatalog search={search} />}
    </DialogShell>
  )
}
