import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  Blocks, Bug, Files, FolderKanban, Keyboard, ListTree, Package, Palette, Search, Settings, Sparkles,
} from 'lucide-react'
import { useStore, type DialogId, type SidebarView } from '@/state/store'
import { extensions } from '@/core/extensions/manager'
import { agentChat } from '@/core/agent/chat'
import { formatBindingsFor, keybindings } from '@/core/keybindings'
import { useT } from '@/i18n'

const VIEWS: { id: SidebarView; icon: typeof Files; label: string; command: string }[] = [
  { id: 'explorer', icon: Files, label: 'shell.view.explorer', command: 'view.explorer' },
  { id: 'search', icon: Search, label: 'shell.view.search', command: 'view.search' },
  { id: 'project', icon: FolderKanban, label: 'shell.view.project', command: 'project.panel' },
  { id: 'outline', icon: ListTree, label: 'shell.view.outline', command: 'view.outline' },
  { id: 'debug', icon: Bug, label: 'shell.view.debug', command: 'view.debug' },
]

/** The lower icons: these open large dialogs rather than the sidebar. */
const DIALOGS: { id: DialogId; icon: typeof Files; label: string; command: string }[] = [
  { id: 'extensions', icon: Package, label: 'extensions.title', command: 'view.extensions' },
  { id: 'settings', icon: Settings, label: 'shell.dialog.settings', command: 'view.settings' },
  { id: 'keybindings', icon: Keyboard, label: 'shell.dialog.keybindings', command: 'view.keybindings' },
  { id: 'themes', icon: Palette, label: 'shell.dialog.themes', command: 'view.themes' },
]

function withHint(label: string, command: string) {
  const hint = formatBindingsFor(command)
  return hint ? `${label} (${hint})` : label
}

export function ActivityBar() {
  const t = useT()
  const view = useStore((s) => s.sidebarView)
  const dialog = useStore((s) => s.dialog)
  const setView = useStore((s) => s.setSidebarView)
  const openDialog = useStore((s) => s.openDialog)
  const closeDialog = useStore((s) => s.closeDialog)
  const hasProject = useStore((s) => Boolean(s.project?.primary))
  const debugging = useStore((s) => s.debugActive)
  useSyncExternalStore(keybindings.subscribe, keybindings.getVersion)
  useSyncExternalStore(extensions.subscribe, extensions.getVersion)

  // Extension pages that belong in the sidebar. They sit below the built-in
  // views, in the order of the extensions.
  const extensionViews = extensions.pages()
    .filter(({ page }) => page.location === 'sidebar')
    .map(({ extensionId, extensionName, page }) => ({
      id: `ext:${extensionId}:${page.id}` as SidebarView,
      label: page.title,
      hint: extensionName,
    }))

  // Chat agents the extensions register: one icon each, after the pages.
  const agentViews = agentChat.agents().map(({ key, extensionId, agent }) => ({
    id: `agent:${key}` as SidebarView,
    label: agent.name,
    hint: extensions.get(extensionId)?.manifest.name ?? extensionId,
  }))

  // A sliding active-item bar rather than hard jumps.
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const [indicator, setIndicator] = useState<{ top: number; visible: boolean }>({ top: 0, visible: false })
  useLayoutEffect(() => {
    const el = view ? buttons.current.get(view) : null
    if (!el) {
      setIndicator((i) => ({ ...i, visible: false }))
      return
    }
    setIndicator({ top: el.offsetTop + el.offsetHeight / 2 - 8, visible: true })
  }, [view])

  const button = (
    id: string, Icon: typeof Files, label: string, active: boolean, onClick: () => void, badge?: boolean,
  ) => (
    <button
      key={id}
      ref={(el) => { if (el) buttons.current.set(id, el) }}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={[
        'lm-transition lm-press relative flex size-9 items-center justify-center rounded-lumen',
        active ? 'text-accent' : 'text-subtle hover:bg-hover hover:text-fg',
      ].join(' ')}
    >
      <Icon size={17} strokeWidth={active ? 2.1 : 1.8} className="lm-icon-pop" />
      {badge && !active && (
        <span className="lm-anim-pop absolute top-1.5 right-1.5 size-1.5 rounded-full bg-accent" />
      )}
    </button>
  )

  return (
    <nav className="relative flex w-11 shrink-0 flex-col items-center gap-0.5 border-r border-edge bg-surface py-2">
      <span
        aria-hidden
        className="lm-indicator absolute left-0 h-4 w-[2px] rounded-full bg-accent"
        style={{ top: indicator.top, opacity: indicator.visible ? 1 : 0 }}
      />
      {VIEWS.map(({ id, icon, label, command }) => button(
        id, icon, withHint(t(label), command), view === id, () => setView(id),
        (id === 'project' && hasProject) || (id === 'debug' && debugging),
      ))}

      {extensionViews.map(({ id, label, hint }) => button(
        id, Blocks, `${label} — ${hint}`, view === id, () => setView(id),
      ))}

      {agentViews.map(({ id, label, hint }) => button(
        id, Sparkles, `${label} — ${hint}`, view === id, () => setView(id),
      ))}

      <div className="flex-1" />

      {DIALOGS.map(({ id, icon, label, command }) => button(
        id, icon, withHint(t(label), command), dialog === id,
        () => (dialog === id ? closeDialog() : openDialog(id)),
      ))}
    </nav>
  )
}
