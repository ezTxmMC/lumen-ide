/**
 * What the GitHub views show: the repository of the open folder, the signed-in
 * account, and per view the list it loaded — with a filter, a loading flag and
 * the last error.
 */

const CHECK_LIMIT = 25

/** Several check runs → one tone: failed beats running beats passed. */
export function summarizeChecks(runs) {
  if (!runs.length) return null
  if (runs.some((run) => ['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure'].includes(run.conclusion))) return 'failure'
  if (runs.some((run) => run.status !== 'completed')) return 'pending'
  return 'success'
}

export function createState(ctx, api, remote) {
  const state = {
    context: null,
    user: null,
    authError: null,
    pulls: { filter: 'all', items: [], checks: {}, loading: false, error: null, loaded: false },
    issues: { filter: 'all', items: [], loading: false, error: null, loaded: false },
    runs: { filter: 'branch', items: [], loading: false, error: null, loaded: false },
  }
  const listeners = new Set()
  const emit = () => {
    for (const fn of listeners) fn(state)
  }

  const repoPath = () => {
    const repo = state.context?.repo
    if (!repo) return null
    return `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`
  }

  async function readContext() {
    state.context = await remote.detect(api.hosts().host).catch((err) => ({ reason: 'error', message: err.message }))
    state.authError = null
    state.user = await api.user().catch((err) => {
      state.authError = err
      return null
    })
  }

  /** Load a list into `slot`, keeping the previous items while it loads. */
  async function load(slot, fetchItems) {
    const entry = state[slot]
    if (!repoPath()) {
      entry.loaded = true
      emit()
      return
    }
    entry.loading = true
    emit()
    try {
      entry.items = await fetchItems(repoPath())
      entry.error = null
    } catch (err) {
      entry.error = err
    } finally {
      entry.loading = false
      entry.loaded = true
      emit()
    }
  }

  async function loadChecks(base, pulls) {
    const next = {}
    await Promise.all(pulls.slice(0, CHECK_LIMIT).map(async (pull) => {
      const data = await api.get(`${base}/commits/${pull.head.sha}/check-runs?per_page=100`).catch(() => null)
      next[pull.number] = summarizeChecks(data?.check_runs ?? [])
    }))
    state.pulls.checks = next
    emit()
  }

  function pullFilter(pulls) {
    const me = state.user?.login
    const filters = {
      all: () => pulls,
      mine: () => pulls.filter((pull) => pull.user?.login === me),
      review: () => pulls.filter((pull) => (pull.requested_reviewers ?? []).some((reviewer) => reviewer.login === me)),
    }
    return (filters[state.pulls.filter] ?? filters.all)()
  }

  const issueQuery = () => {
    const me = state.user?.login
    if (state.issues.filter === 'assigned' && me) return `&assignee=${encodeURIComponent(me)}`
    if (state.issues.filter === 'created' && me) return `&creator=${encodeURIComponent(me)}`
    return ''
  }

  const runQuery = () => {
    const branch = state.context?.branch
    if (state.runs.filter === 'branch' && branch) return `&branch=${encodeURIComponent(branch)}`
    return ''
  }

  const loaders = {
    pulls: () => load('pulls', async (base) => {
      const pulls = await api.get(`${base}/pulls?state=open&per_page=50&sort=updated&direction=desc`)
      void loadChecks(base, pulls)
      return pulls
    }),
    issues: () => load('issues', async (base) => {
      const issues = await api.get(`${base}/issues?state=open&per_page=50&sort=updated${issueQuery()}`)
      return issues.filter((issue) => !issue.pull_request)
    }),
    runs: () => load('runs', async (base) => {
      const data = await api.get(`${base}/actions/runs?per_page=30${runQuery()}`)
      return data?.workflow_runs ?? []
    }),
  }

  return {
    state,
    repoPath,
    onChange(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    emit,
    readContext,
    load: (slot) => loaders[slot](),
    async refreshAll() {
      await readContext()
      emit()
      await Promise.all(Object.keys(loaders).map((slot) => loaders[slot]()))
    },
    visiblePulls: () => pullFilter(state.pulls.items),
    setFilter(slot, value) {
      if (state[slot].filter === value) return Promise.resolve()
      state[slot].filter = value
      return loaders[slot]()
    },
  }
}
