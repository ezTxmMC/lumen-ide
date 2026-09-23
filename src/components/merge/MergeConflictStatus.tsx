import { useMemo } from 'react'
import { GitMerge } from 'lucide-react'
import { useStore } from '@/state/store'
import { useT } from '@/i18n'
import { parseConflicts } from '@/core/merge/conflicts'
import { gotoNextConflict } from '@/core/merge/commands'

/** “2 conflicts” in the status bar while the active file has conflict blocks; a click jumps to the next. */
export function MergeConflictStatus() {
  const t = useT()
  const content = useStore((s) => {
    const tab = s.tabs.find((open) => open.id === s.activeTabId)
    if (!tab || tab.virtual) return null
    return tab.content
  })
  const count = useMemo(() => (content ? parseConflicts(content).length : 0), [content])
  if (!count) return null
  return (
    <button
      onClick={gotoNextConflict}
      className="lm-transition flex items-center gap-1 rounded px-1 text-warn hover:bg-hover"
      title={t('merge.status.title')}
      data-merge-status
    >
      <GitMerge size={10} /> {t('merge.status.count', { count })}
    </button>
  )
}
