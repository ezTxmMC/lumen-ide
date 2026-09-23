/**
 * Lumen's own views. They register like any extension's — the docks do not
 * know them by name, and each can be dragged anywhere.
 */

import {
  Bug, CircleAlert, Files, FolderKanban, Link2, ListTree, Search, SquareTerminal, TerminalSquare, Zap,
} from 'lucide-react'
import { useStore } from '@/state/store'
import { lsp } from '@/core/lsp/manager'
import { viewRegistry, type ViewDef } from '@/core/views'
import { terminals } from '@/lib/terminals'
import { t } from '@/i18n'
import { Explorer } from '../panels/Explorer'
import { SearchPanel } from '../panels/SearchPanel'
import { ProjectPanel } from '../panels/ProjectPanel'
import { OutlinePanel } from '../panels/OutlinePanel'
import { DebugSidebar } from '../panels/DebugSidebar'
import { OutputBody, OutputToolbar } from '../panels/OutputView'
import { TerminalPanel, TerminalToolbar } from '../panels/TerminalPanel'
import { ProblemsPanel } from '../panels/ProblemsPanel'
import { ReferencesPanel } from '../panels/ReferencesPanel'
import { LspPanel } from '../panels/LspPanel'
import { DebugPanel } from '../panels/DebugPanel'

/** A dot rather than a number — “something is going on here”. */
export const DOT = '•'

const state = () => useStore.getState()

const VIEWS: ViewDef[] = [
  {
    id: 'explorer', defaultDock: 'left', order: 10, icon: Files, command: 'view.explorer',
    title: () => t('shell.view.explorer'), render: () => <Explorer />,
  },
  {
    id: 'search', defaultDock: 'left', order: 20, icon: Search, command: 'view.search',
    title: () => t('shell.view.search'), render: () => <SearchPanel />,
  },
  {
    id: 'project', defaultDock: 'left', order: 30, icon: FolderKanban, command: 'project.panel',
    title: () => t('shell.view.project'), render: () => <ProjectPanel />,
    badge: () => (state().project?.primary ? { text: DOT, tone: 'text-accent' } : null),
  },
  {
    id: 'outline', defaultDock: 'left', order: 40, icon: ListTree, command: 'view.outline',
    title: () => t('shell.view.outline'), render: () => <OutlinePanel />,
  },
  {
    id: 'debug', defaultDock: 'left', order: 50, icon: Bug, command: 'view.debug',
    title: () => t('shell.view.debug'), render: () => <DebugSidebar />,
    badge: () => (state().debugActive ? { text: DOT, tone: 'text-warn' } : null),
  },
  {
    id: 'output', defaultDock: 'bottom', order: 10, icon: TerminalSquare, command: 'view.output',
    title: () => t('panels.tabs.output'), render: () => <OutputBody />, toolbar: () => <OutputToolbar />,
    badge: () => (state().runningId ? { text: DOT, tone: 'text-accent' } : null),
  },
  {
    id: 'terminal', defaultDock: 'bottom', order: 20, icon: SquareTerminal, command: 'terminal.toggle',
    title: () => t('panels.tabs.terminal'), render: () => <TerminalPanel />, toolbar: () => <TerminalToolbar />,
    badge: () => {
      const count = terminals.list().length
      return count ? { text: String(count), tone: 'text-ok' } : null
    },
  },
  {
    id: 'problems', defaultDock: 'bottom', order: 30, icon: CircleAlert, command: 'view.problems',
    title: () => t('panels.tabs.problems'), render: () => <ProblemsPanel />,
    badge: () => {
      const counts = lsp.diagnosticCounts()
      const total = counts.errors + counts.warnings
      if (!total) return null
      return { text: String(total), tone: counts.errors > 0 ? 'text-bad' : 'text-warn' }
    },
  },
  {
    id: 'references', defaultDock: 'bottom', order: 40, icon: Link2, command: 'view.references',
    title: () => t('panels.tabs.references'), render: () => <ReferencesPanel />,
    badge: () => {
      const hits = state().references?.hits.length
      return hits ? { text: String(hits) } : null
    },
  },
  {
    id: 'debug-console', defaultDock: 'bottom', order: 50, icon: Bug,
    title: () => t('panels.tabs.debug'), render: () => <DebugPanel />,
    badge: () => (state().debugActive ? { text: DOT, tone: 'text-warn' } : null),
  },
  {
    id: 'lsp', defaultDock: 'bottom', order: 60, icon: Zap, command: 'view.lsp',
    title: () => t('panels.tabs.lsp'), render: () => <LspPanel />,
    badge: () => {
      const ready = lsp.list().filter((server) => server.status === 'ready').length
      return ready ? { text: String(ready), tone: 'text-ok' } : null
    },
  },
]

let registered = false

/** Once, before the first dock renders. */
export function registerBuiltinViews() {
  if (registered) return
  registered = true
  for (const view of VIEWS) viewRegistry.register(view)
}
