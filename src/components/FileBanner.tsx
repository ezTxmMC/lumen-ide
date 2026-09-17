import { AlertTriangle, RotateCcw, Save, Trash2, X } from 'lucide-react'
import { useStore } from '@/state/store'
import { useT } from '@/i18n'
import { Button } from './ui'

/** A notice above the editor when the file changed or was deleted outside. */
export function FileBanner({ tabId }: { tabId?: string | null }) {
  const t = useT()
  const tab = useStore((s) => s.tabs.find((t) => t.id === (tabId ?? s.activeTabId)) ?? null)
  const reloadTab = useStore((s) => s.reloadTab)
  const saveTab = useStore((s) => s.saveTab)
  const closeTab = useStore((s) => s.closeTab)

  if (!tab || (!tab.missing && !tab.diskChanged)) return null

  const dismiss = () => {
    useStore.setState((s) => ({
      tabs: s.tabs.map((t) => (t.id === tab.id ? { ...t, diskChanged: false } : t)),
    }))
  }

  if (tab.missing) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-b border-edge bg-bad/10 px-3 py-1.5 text-[12px] text-fg">
        <Trash2 size={13} className="shrink-0 text-bad" />
        <span className="flex-1 truncate">{t('statusbar.banner.deleted', { name: tab.name })}</span>
        <Button size="sm" variant="outline" onClick={() => void saveTab(tab.id)}><Save size={11} /> {t('statusbar.banner.restore')}</Button>
        <Button size="sm" onClick={() => closeTab(tab.id)}><X size={11} /> {t('common.close')}</Button>
      </div>
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-edge bg-warn/10 px-3 py-1.5 text-[12px] text-fg">
      <AlertTriangle size={13} className="shrink-0 text-warn" />
      <span className="flex-1 truncate">{t('statusbar.banner.changed', { name: tab.name })}</span>
      <Button size="sm" variant="outline" onClick={() => void reloadTab(tab.id)}><RotateCcw size={11} /> {t('statusbar.banner.reload')}</Button>
      <Button size="sm" onClick={() => void saveTab(tab.id)}><Save size={11} /> {t('statusbar.banner.keepMine')}</Button>
      <Button size="sm" onClick={dismiss} title={t('statusbar.banner.hide')}><X size={11} /></Button>
    </div>
  )
}
