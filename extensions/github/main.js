/**
 * GitHub for Lumen: pull requests, issues and workflow runs of the
 * repository in the open folder, the CI state of the current branch in the
 * status bar, and commands to open things in the browser.
 *
 * Signing in uses a personal access token kept in the system's key store, or
 * the GitHub CLI's login when `gh` is installed. Requests go straight to the
 * REST API from Lumen's main process.
 */

import { createT } from './src/i18n.js'
import { createApi } from './src/api.js'
import { createRemote } from './src/remote.js'
import { createState } from './src/state.js'
import { createActions } from './src/actions.js'
import { createPullsView } from './src/views/pulls.js'
import { createIssuesView } from './src/views/issues.js'
import { createRunsView, RUN_LOOK, runState } from './src/views/runs.js'

/** View id → the list it shows. */
const VIEW_SLOTS = { pulls: 'pulls', issues: 'issues', actions: 'runs' }
const POLL_MS = 60_000
const BRANCH_POLL_MS = 15_000
const ACTIVE_MS = 10 * 60_000
const FOCUS_REFRESH_MS = 60_000

export function activate(ctx) {
  const t = createT(ctx)
  const api = createApi(ctx, t)
  const remote = createRemote(ctx)
  const store = createState(ctx, api, remote)
  const actions = createActions({ ctx, api, store, t })
  const deps = { ctx, store, actions, t }
  const views = {
    pulls: createPullsView(deps),
    issues: createIssuesView(deps),
    actions: createRunsView(deps),
  }

  let activeFile = null
  let lastActive = Date.now()
  let lastFull = 0
  let lastBranch = null
  const touch = () => { lastActive = Date.now() }

  for (const [id, view] of Object.entries(views)) {
    ctx.views.register(id, {
      render: () => view.render(),
      onAction: (event) => {
        touch()
        return view.onAction(event)
      },
      onShow: () => {
        touch()
        void store.load(VIEW_SLOTS[id])
      },
    })
  }

  /* Status bar ---------------------------------------------------------- */

  async function updateCiStatus() {
    const context = store.state.context
    const base = store.repoPath()
    if (!base || !context?.branch || !store.state.user) {
      ctx.statusBar.set('ci', null)
      return
    }
    const data = await api.get(`${base}/actions/runs?per_page=1&branch=${encodeURIComponent(context.branch)}`).catch(() => null)
    const run = data?.workflow_runs?.[0]
    if (!run) {
      ctx.statusBar.set('ci', null)
      return
    }
    const state = runState(run)
    const look = RUN_LOOK[state]
    ctx.statusBar.set('ci', {
      text: `${look.symbol} CI`,
      icon: 'github',
      tone: look.tone,
      tooltip: t('status.ci', { name: run.name ?? '', state: t(`run.state.${state}`), branch: context.branch }),
      command: 'github.open-actions',
      side: 'right',
      priority: 50,
    })
  }

  store.onChange(() => {
    for (const id of Object.keys(views)) ctx.views.refresh(id)
  })

  async function refreshAll() {
    lastFull = Date.now()
    await store.refreshAll()
    lastBranch = store.state.context?.branch ?? null
    await updateCiStatus()
  }

  /** The branch changed outside (a checkout in the terminal, the Git view): reload what depends on it. */
  async function checkBranch() {
    await store.readContext()
    const branch = store.state.context?.branch ?? null
    if (branch === lastBranch) return
    lastBranch = branch
    store.emit()
    await Promise.all([store.load('runs'), updateCiStatus()])
  }

  /* Commands ------------------------------------------------------------ */

  const commands = {
    'github.refresh': () => refreshAll(),
    'github.open-repo': () => actions.openRepo(),
    'github.open-file': () => actions.openFile(activeFile),
    'github.create-pr': () => actions.createPull(),
    'github.create-issue': () => actions.createIssue(),
    'github.sign-in': () => actions.signIn(),
    'github.sign-out': () => actions.signOut(),
    'github.open-pulls': () => ctx.ui.showView('pulls'),
    'github.open-issues': () => ctx.ui.showView('issues'),
    'github.open-actions': () => ctx.ui.showView('actions'),
  }
  for (const [id, run] of Object.entries(commands)) {
    ctx.commands.register(id, () => {
      touch()
      return run()
    })
  }

  /* Refreshing ---------------------------------------------------------- */

  ctx.events.on('activeFile', (event) => { activeFile = event.path })
  ctx.events.on('windowFocus', () => {
    touch()
    if (Date.now() - lastFull > FOCUS_REFRESH_MS) {
      void refreshAll()
      return
    }
    void checkBranch()
  })
  ctx.events.on('viewVisible', (event) => {
    if (event.extensionId !== ctx.id) return
    touch()
    const slot = VIEW_SLOTS[event.viewId]
    if (slot) void store.load(slot)
  })
  ctx.events.on('locale', () => {
    for (const id of Object.keys(views)) ctx.views.refresh(id)
    void updateCiStatus()
  })
  ctx.workspace.onDidChange(() => void refreshAll())
  ctx.settings.onDidChange(() => {
    api.reset()
    void refreshAll()
  })

  const branchTimer = setInterval(() => {
    if (Date.now() - lastActive > ACTIVE_MS) return
    void checkBranch()
  }, BRANCH_POLL_MS)
  const pollTimer = setInterval(() => {
    if (Date.now() - lastActive > ACTIVE_MS) return
    void Promise.all([store.load('runs'), updateCiStatus()])
  }, POLL_MS)

  void refreshAll()

  return () => {
    clearInterval(branchTimer)
    clearInterval(pollTimer)
  }
}
