/**
 * Updates: mirror the updater's state from the main process, register the
 * commands and announce finished updates. Checking and downloading in the
 * background is driven by the main process (`electron/features/updater.ts`).
 */

import { create } from 'zustand'
import { useStore, rememberOpenFiles } from '@/state/store'
import { registerCommandProvider } from '@/core/commands'
import { t } from '@/i18n'
import type { Command } from '@/core/types'
import type { UpdateState } from '../../electron/features/updater'

export type { UpdateState }

export const useUpdater = create<UpdateState>(() => ({ status: 'idle', current: '', installable: false }))

let started = false
/** Versions a notice has already gone out for. */
const announced = new Set<string>()

export function init() {
  if (started) return
  started = true
  window.lumen.updater.onState(apply)
  void window.lumen.updater.state().then(apply).catch(() => {})
  registerCommandProvider(updaterCommands)
}

function apply(next: UpdateState) {
  const previous = useUpdater.getState()
  useUpdater.setState(next, true)
  if (!next.version || next.status === previous.status) return
  const key = `${next.status}:${next.version}`
  if (announced.has(key)) return
  if (next.status === 'ready') {
    announced.add(key)
    useStore.getState().notify(t('updater.toast.ready', { version: next.version }), 'success')
    return
  }
  if (next.status === 'available' && !next.installable) {
    announced.add(key)
    useStore.getState().notify(t('updater.toast.available', { version: next.version }), 'info')
  }
}

/** Check by hand and always report the result; download installable updates straight away. */
export async function checkForUpdates() {
  const notify = useStore.getState().notify
  const result = await window.lumen.updater.check().catch((err: Error) => ({ ...useUpdater.getState(), status: 'error' as const, error: err.message }))
  if (result.status === 'current') {
    notify(t('updater.toast.current', { version: result.current }), 'success')
    return
  }
  if (result.status === 'error') {
    notify(t('updater.toast.failed', { error: result.error ?? '' }), 'error')
    return
  }
  if (result.status === 'unsupported') {
    notify(t('updater.status.unsupported'), 'warning')
    return
  }
  if (result.status !== 'available' || !result.installable) return
  await downloadUpdate()
}

export async function downloadUpdate() {
  const result = await window.lumen.updater.download().catch(() => null)
  if (result?.status !== 'error') return
  useStore.getState().notify(t('updater.toast.failed', { error: result.error ?? '' }), 'error')
}

/** After asking about unsaved changes: quit, apply, restart. */
export async function installUpdate() {
  const state = useStore.getState()
  const dirty = state.tabs.filter((tab) => tab.content !== tab.saved && !tab.readonly)
  if (dirty.length > 0) {
    const names = dirty.map((tab) => `• ${tab.name}`).join('\n')
    if (!confirm(t('notify.closeUnsaved', { count: dirty.length, names }))) return
  }
  if (state.workspace) await rememberOpenFiles(state.workspace).catch(() => {})
  state.persist()
  const started = await window.lumen.updater.install().catch(() => false)
  if (started) return
  state.notify(t('updater.toast.failed', { error: useUpdater.getState().error ?? '' }), 'error')
}

function updaterCommands(): Command[] {
  const category = t('updater.category')
  const status = () => useUpdater.getState().status
  return [
    { id: 'updater.check', title: t('updater.command.check'), category, run: checkForUpdates },
    {
      id: 'updater.install', title: t('updater.command.install'), category,
      run: installUpdate, when: () => status() === 'ready',
    },
    {
      id: 'updater.openDownload', title: t('updater.command.openDownload'), category,
      run: () => window.lumen.updater.openDownload(),
      when: () => status() === 'available' && !useUpdater.getState().installable,
    },
  ]
}
