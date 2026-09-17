/**
 * Recent projects on the taskbar or dock icon.
 *
 * The renderer holds the list and the translations; the main process knows
 * each platform's way of showing them
 * (`electron/features/recent-projects.ts`). This file keeps the two in step
 * and opens the folder an entry names.
 */

import { useStore } from '@/state/store'
import { subscribeLanguage, t } from '@/i18n'
import type { RecentProject } from '@/state/store'

let started = false
/** The list last sent — which avoids needless system calls. */
let sent = ''

function push() {
  const state = useStore.getState()
  const list = state.recentProjects.map((project) => ({ path: project.path, name: project.name }))
  const payload = JSON.stringify(list)
  if (payload === sent) return
  sent = payload
  void window.lumen.app.setRecentProjects(list, { category: t('explorer.recent') }).catch(() => {})
}

async function open(folder: string) {
  const state = useStore.getState()
  if (!folder || state.workspace === folder) return
  const exists = await window.lumen.fs.exists(folder).catch(() => false)
  if (!exists) {
    state.notify(t('notify.projectMissing', { path: folder }), 'warning')
    state.removeRecent(folder)
    return
  }
  await state.setWorkspace(folder)
}

export function init() {
  if (started) return
  started = true

  window.lumen.app.onOpenFolder((folder) => void open(folder))
  void window.lumen.app.startupFolder().then((folder) => {
    if (!folder) return
    return open(folder)
  }).catch(() => {})

  push()
  useStore.subscribe(push)
  // Language change: the jump list's heading is translated.
  subscribeLanguage(() => { sent = ''; push() })
}

export type { RecentProject }
