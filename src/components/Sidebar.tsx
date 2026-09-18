import { useSyncExternalStore } from 'react'
import { parseExtensionView, useStore, type SidebarView } from '@/state/store'
import { useT } from '@/i18n'
import { extensions } from '@/core/extensions/manager'
import { Explorer } from './panels/Explorer'
import { SearchPanel } from './panels/SearchPanel'
import { ProjectPanel } from './panels/ProjectPanel'
import { OutlinePanel } from './panels/OutlinePanel'
import { DebugSidebar } from './panels/DebugSidebar'
import { AgentPanel } from './panels/AgentPanel'
import { agentChat } from '@/core/agent/chat'
import { ExtensionPageView } from './panels/ExtensionPageView'

const TITLES: Partial<Record<SidebarView, string>> = {
  explorer: 'shell.view.explorer',
  search: 'shell.view.search',
  project: 'shell.view.project',
  outline: 'shell.view.outline',
  debug: 'shell.view.debug',
}

/** The page of an extension for the chosen view, if that is what it is. */
function extensionPage(view: SidebarView | null) {
  const parsed = parseExtensionView(view)
  if (!parsed) return null
  const entry = extensions.get(parsed.extensionId)
  const page = entry?.manifest.pages?.find((candidate) => candidate.id === parsed.pageId)
  if (!entry || !page) return null
  return { entry, page }
}

export function Sidebar() {
  const t = useT()
  const view = useStore((s) => s.sidebarView)
  const width = useStore((s) => s.sidebarWidth)
  const setWidth = useStore((s) => s.setSidebarWidth)
  useSyncExternalStore(extensions.subscribe, extensions.getVersion)

  if (!view) return null

  const startDrag = (event: React.PointerEvent) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = width
    document.body.classList.add('lm-resizing')
    const move = (e: PointerEvent) => setWidth(startWidth + (e.clientX - startX))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.classList.remove('lm-resizing')
      useStore.getState().persist()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const fromExtension = extensionPage(view)
  const agent = view?.startsWith('agent:') ? agentChat.find(view.slice('agent:'.length)) : undefined
  const builtin = TITLES[view]
  const title = builtin ? t(builtin) : fromExtension?.page.title ?? agent?.agent.name ?? ''

  return (
    <aside
      className="lm-anim-right flex shrink-0 border-r border-edge bg-surface"
      style={{ width }}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div
          className="flex h-8 shrink-0 items-center px-3 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle"
          title={fromExtension ? fromExtension.entry.manifest.name : undefined}
        >
          {title}
        </div>
        <div key={view} className="lm-anim-fade min-h-0 flex-1">
          {view === 'explorer' && <Explorer />}
          {view === 'search' && <SearchPanel />}
          {view === 'project' && <ProjectPanel />}
          {view === 'outline' && <OutlinePanel />}
          {view === 'debug' && <DebugSidebar />}
          {agent && <AgentPanel agentKey={agent.key} />}
          {fromExtension && <ExtensionPageView page={fromExtension.page} />}
        </div>
      </div>

      <div
        onPointerDown={startDrag}
        className="lm-transition w-[3px] shrink-0 cursor-col-resize hover:bg-accent"
      />
    </aside>
  )
}
