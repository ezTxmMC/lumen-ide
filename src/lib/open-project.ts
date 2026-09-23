/**
 * Opening a project from the title bar: in this window or in a new one.
 *
 * `effects.openProjectsIn` decides; on `ask` the choice dialog comes up
 * (`OpenProjectChoice`), and “remember my choice” writes the answer back
 * there. A window without a project simply takes the project — there is
 * nothing to replace.
 */

import { create } from 'zustand'
import { useStore } from '@/state/store'
import { t } from '@/i18n'

export type OpenTarget = 'this' | 'new'

interface PendingChoice {
  path: string
  name: string
}

/** The project waiting for “this window or a new one?”. */
export const useOpenChoice = create<{ pending: PendingChoice | null }>(() => ({ pending: null }))

/** Whether the project switcher's dropdown is open — the command `project.switch` opens it too. */
export const useProjectSwitcher = create<{ open: boolean }>(() => ({ open: false }))

const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path

function openIn(target: OpenTarget, path: string) {
  if (target === 'new') return window.lumen.window.openProject(path).then(() => {})
  return useStore.getState().setWorkspace(path)
}

export async function openProject(path: string) {
  const state = useStore.getState()
  if (!path || state.workspace === path) return
  const exists = await window.lumen.fs.exists(path).catch(() => false)
  if (!exists) {
    state.notify(t('notify.projectMissing', { path }), 'warning')
    state.removeRecent(path)
    return
  }
  if (!state.workspace) {
    await state.setWorkspace(path)
    return
  }
  const where = state.effects.openProjectsIn
  if (where === 'this' || where === 'new') {
    await openIn(where, path)
    return
  }
  const known = state.recentProjects.find((project) => project.path === path)
  useOpenChoice.setState({ pending: { path, name: known?.name ?? baseName(path) } })
}

export function resolveOpenChoice(target: OpenTarget | null, remember: boolean) {
  const pending = useOpenChoice.getState().pending
  useOpenChoice.setState({ pending: null })
  if (!pending || !target) return
  if (remember) useStore.getState().setEffects({ openProjectsIn: target })
  void openIn(target, pending.path)
}

/** Pick a folder and open it the same way as a recent project. */
export async function openFolderAsProject() {
  const folder = await window.lumen.dialog.chooseFolder(t('projectSwitcher.chooseFolder'))
  if (!folder) return
  await openProject(folder)
}
