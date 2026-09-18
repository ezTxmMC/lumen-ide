import { useEffect, useRef } from 'react'
import { useStore, rememberOpenFiles } from '@/state/store'
import { t } from '@/i18n'
import { useKeymap } from '@/hooks/useKeymap'
import { useEditorRefocus } from '@/hooks/useEditorRefocus'
import { initRunBridge } from '@/lib/run'
import { lsp } from '@/core/lsp/manager'
import { registry } from '@/core/registry'
import { applyWorkspaceEdit } from '@/lib/workspace-edit'
import { TitleBar } from '@/components/TitleBar'
import { ActivityBar } from '@/components/ActivityBar'
import { Sidebar } from '@/components/Sidebar'
import { EditorArea } from '@/components/EditorArea'
import { OutputPanel } from '@/components/OutputPanel'
import { StatusBar } from '@/components/StatusBar'
import { CommandPalette } from '@/components/CommandPalette'
import { NewProjectDialog } from '@/components/NewProjectDialog'
import { FormDialog } from '@/components/FormDialog'
import { SearchEverywhere } from '@/components/SearchEverywhere'
import { terminals } from '@/lib/terminals'
import { Toasts } from '@/components/Toasts'
import { ThemeStudio } from '@/components/ThemeStudio'
import { IconStudio } from '@/components/icon-studio/IconStudio'
import { SettingsDialog } from '@/components/dialogs/SettingsDialog'
import { KeybindingsDialog } from '@/components/dialogs/KeybindingsDialog'
import { ThemesDialog } from '@/components/dialogs/ThemesDialog'
import { ExtensionsDialog } from '@/components/dialogs/ExtensionsDialog'
import { SdkDialog } from '@/components/dialogs/SdkDialog'
import { WorkspacesDialog } from '@/components/dialogs/WorkspacesDialog'
import { AddonStudio } from '@/components/AddonStudio'
import { DebugToolbar } from '@/components/DebugToolbar'
import { initFeatures } from '@/features'

export default function App() {
  const booted = useRef(false)
  const init = useStore((s) => s.init)
  const ready = useStore((s) => s.ready)
  const panelOpen = useStore((s) => s.panelOpen)

  useKeymap()
  useEditorRefocus()

  useEffect(() => {
    // A ref rather than state: in StrictMode this would otherwise run twice.
    if (booted.current) return
    booted.current = true
    lsp.applyEdit = applyWorkspaceEdit
    terminals.openLocation = (path, line, character) => void useStore.getState().openAt(path, line, character)
    void init().then(() => {
      initRunBridge()
      initFeatures()
      void terminals.start()
    })
  }, [init])

  // File changes: tell the language servers, and re-detect the project on build files.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    return window.lumen.fs.onChanged((changes) => {
      const list = Array.isArray(changes) ? changes : []
      lsp.notifyFsChanges(list)
      void useStore.getState().handleFsChanges(list)
      const markers = new Set(registry.projectKinds().flatMap((k) => k.markers))
      markers.add('project.json')
      const touched = list.some((c) => markers.has(c.path.split(/[\\/]/).pop() ?? ''))
      if (!touched) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void useStore.getState().refreshProject(), 600)
    })
  }, [])

  // Window focus: compare open files with the disk, for changes from other programs.
  useEffect(() => {
    const onFocus = () => void useStore.getState().syncTabsWithDisk()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  // On closing: warn about unsaved changes, and remember the open files.
  useEffect(() =>
    window.lumen.window.onCloseRequest(() => {
      const state = useStore.getState()
      const dirty = state.tabs.filter((t) => t.content !== t.saved && !t.readonly)
      if (dirty.length > 0) {
        const names = dirty.map((t) => `• ${t.name}`).join('\n')
        const proceed = confirm(
          t('notify.closeUnsaved', { count: dirty.length, names }),
        )
        if (!proceed) return
      }
      let done = false
      const finish = () => {
        if (done) return
        done = true
        void window.lumen.window.forceClose()
      }
      if (!state.workspace) {
        finish()
        return
      }
      void rememberOpenFiles(state.workspace).finally(finish)
      setTimeout(finish, 1500)
    }),
  [])

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-bg">
        <span className="lm-anim-pulse text-[13px] tracking-wide text-subtle">{t('notify.starting')}</span>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      <TitleBar />

      <div className="flex min-h-0 flex-1">
        <ActivityBar />
        <Sidebar />

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <EditorArea />
          </div>
          {panelOpen && <OutputPanel />}
        </main>
      </div>

      <StatusBar />
      <DebugToolbar />
      <CommandPalette />
      <SearchEverywhere />
      <NewProjectDialog />
      <FormDialog />
      <SettingsDialog />
      <KeybindingsDialog />
      <ThemesDialog />
      <ExtensionsDialog />
      <SdkDialog />
      <WorkspacesDialog />
      <ThemeStudio />
      <IconStudio />
      <AddonStudio />
      <Toasts />
    </div>
  )
}
