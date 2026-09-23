import { useEffect, useRef, useState } from 'react'
import { useStore, rememberOpenFiles } from '@/state/store'
import { t } from '@/i18n'
import { useKeymap } from '@/hooks/useKeymap'
import { useEditorRefocus } from '@/hooks/useEditorRefocus'
import { initRunBridge } from '@/lib/run'
import { lsp } from '@/core/lsp/manager'
import { registry } from '@/core/registry'
import { applyWorkspaceEdit } from '@/lib/workspace-edit'
import { onFsChanged } from '@/lib/fs-events'
import { TitleBar } from '@/components/shell/TitleBar'
import { Workbench } from '@/components/workbench/Workbench'
import { ProjectScreen } from '@/components/shell/ProjectScreen'
import { StatusBar } from '@/components/shell/StatusBar'
import { CommandPalette } from '@/components/overlays/CommandPalette'
import { NewProjectDialog } from '@/components/dialogs/NewProjectDialog'
import { FormDialog } from '@/components/overlays/FormDialog'
import { LspInstallDialog } from '@/components/dialogs/LspInstallDialog'
import { SearchEverywhere } from '@/components/overlays/SearchEverywhere'
import { terminals } from '@/lib/terminals'
import { Toasts } from '@/components/shell/Toasts'
import { PopoutHost } from '@/components/popout/PopoutHost'
import { ThemeStudio } from '@/components/theme-studio/ThemeStudio'
import { IconStudio } from '@/components/icon-studio/IconStudio'
import { SettingsDialog } from '@/components/dialogs/SettingsDialog'
import { KeybindingsDialog } from '@/components/dialogs/KeybindingsDialog'
import { ThemesDialog } from '@/components/dialogs/ThemesDialog'
import { ExtensionsDialog } from '@/components/dialogs/ExtensionsDialog'
import { SdkDialog } from '@/components/dialogs/SdkDialog'
import { WorkspacesDialog } from '@/components/dialogs/WorkspacesDialog'
import { MergeEditor } from '@/components/merge/MergeEditor'
import { AddonStudio } from '@/components/addon-studio/AddonStudio'
import { DebugToolbar } from '@/components/debug/DebugToolbar'
import { initFeatures } from '@/features'

export default function App() {
  const booted = useRef(false)
  const init = useStore((s) => s.init)
  const ready = useStore((s) => s.ready)
  const workspace = useStore((s) => s.workspace)
  const hasTabs = useStore((s) => s.tabs.length > 0)
  // “Continue without a project” — until a project opens and closes again.
  const [withoutProject, setWithoutProject] = useState(false)
  useEffect(() => { if (workspace) setWithoutProject(false) }, [workspace])
  // A window opened for a project (`?project=…`) skips the project screen while that project loads.
  const [openingProject, setOpeningProject] = useState(() => new URLSearchParams(window.location.search).has('project'))
  const showProjects = !workspace && !hasTabs && !withoutProject && !openingProject

  useKeymap()
  useEditorRefocus()

  useEffect(() => {
    // A ref rather than state: in StrictMode this would otherwise run twice.
    if (booted.current) return
    booted.current = true
    lsp.applyEdit = applyWorkspaceEdit
    terminals.openLocation = (path, line, character) => void useStore.getState().openAt(path, line, character)
    void init().then(() => {
      setOpeningProject(false)
      initRunBridge()
      initFeatures()
      void terminals.start()
    })
  }, [init])

  // File changes: tell the language servers, and re-detect the project on build files.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    return onFsChanged((list) => {
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

  // Open files are watched one by one as well — the workspace watcher skips
  // build and dot folders, and files from outside the project.
  useEffect(() => {
    let last = ''
    let timer: ReturnType<typeof setTimeout> | null = null
    const push = () => {
      timer = null
      const paths = [...new Set(useStore.getState().tabs.filter((tab) => tab.path && !tab.virtual).map((tab) => tab.path as string))]
      const key = paths.join('\n')
      if (key === last) return
      last = key
      void window.lumen.fs.watchOpenFiles(paths).catch(() => {})
    }
    push()
    const off = useStore.subscribe((state, previous) => {
      if (state.tabs === previous.tabs || timer) return
      timer = setTimeout(push, 250)
    })
    return () => {
      off()
      if (timer) clearTimeout(timer)
    }
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

      {showProjects ? <ProjectScreen onContinue={() => setWithoutProject(true)} /> : <Workbench />}

      <StatusBar />
      <DebugToolbar />
      <CommandPalette />
      <SearchEverywhere />
      <NewProjectDialog />
      <FormDialog />
      <LspInstallDialog />
      <SettingsDialog />
      <KeybindingsDialog />
      <ThemesDialog />
      <ExtensionsDialog />
      <SdkDialog />
      <WorkspacesDialog />
      <MergeEditor />
      <ThemeStudio />
      <IconStudio />
      <AddonStudio />
      <Toasts />
      <PopoutHost />
    </div>
  )
}
