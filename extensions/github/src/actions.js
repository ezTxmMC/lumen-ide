/**
 * What the GitHub views and commands can do: signing in, pull requests,
 * issues and workflow runs. Every write asks first; every failure becomes a
 * notice.
 */

import path from 'node:path'

export function createActions({ ctx, api, store, t }) {
  const notify = (message, tone = 'info') => ctx.ui.notify(message, tone)
  const context = () => store.state.context

  async function attempt(task) {
    try {
      return await task()
    } catch (err) {
      notify(err.message, 'error')
      return undefined
    }
  }

  function requireRepo() {
    if (store.repoPath()) return true
    notify(t('error.noRepo'), 'warning')
    return false
  }

  const openUrl = (url) => {
    if (!url) return
    void ctx.openExternal(url)
  }

  /* ---------------------------------------------------------------- *
   * Account
   * ---------------------------------------------------------------- */

  async function signIn() {
    const answer = await ctx.ui.input(t('auth.title'), [
      { id: 'token', label: t('auth.token'), type: 'password', required: true, mono: true, hint: t('auth.tokenHint') },
    ], { description: t('auth.description', { url: `${api.hosts().web}/settings/tokens` }), submitLabel: t('auth.submit') })
    const value = answer?.token?.trim()
    if (!value) return
    const user = await api.verify(value).catch((err) => {
      notify(t('auth.invalid', { message: err.message }), 'error')
      return null
    })
    if (!user) return
    await ctx.secrets.set('token', value)
    api.reset()
    notify(t('auth.signedIn', { login: user.login }), 'success')
    await store.refreshAll()
  }

  async function signOut() {
    const sure = await ctx.ui.confirm(t('auth.signOutTitle'), t('auth.signOutBody'), { confirmLabel: t('auth.signOut') })
    if (!sure) return
    await ctx.secrets.delete('token')
    api.reset()
    notify(t('auth.signedOut'), 'info')
    await store.refreshAll()
  }

  /* ---------------------------------------------------------------- *
   * Browser
   * ---------------------------------------------------------------- */

  function repoUrl() {
    const repo = context()?.repo
    if (!repo) return null
    return `${api.hosts().web}/${repo.owner}/${repo.name}`
  }

  function openRepo() {
    if (!requireRepo()) return
    openUrl(repoUrl())
  }

  function openFile(file) {
    const ctxInfo = context()
    if (!requireRepo()) return
    if (!file) {
      notify(t('error.noFile'), 'warning')
      return
    }
    const relative = path.relative(ctxInfo.root, file)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      notify(t('error.noFile'), 'warning')
      return
    }
    const ref = ctxInfo.hasUpstream && ctxInfo.branch ? ctxInfo.branch : ctxInfo.sha
    const repo = ctxInfo.fork ?? ctxInfo.repo
    const route = relative.split(path.sep).map(encodeURIComponent).join('/')
    openUrl(`${api.hosts().web}/${repo.owner}/${repo.name}/blob/${encodeURIComponent(ref ?? 'HEAD')}/${route}`)
  }

  /* ---------------------------------------------------------------- *
   * Pull requests
   * ---------------------------------------------------------------- */

  async function hasGh() {
    const result = await ctx.exec('gh', ['--version'], { timeoutMs: 5000 }).catch(() => null)
    return result?.code === 0
  }

  async function checkoutPull(number) {
    const ctxInfo = context()
    if (!requireRepo()) return
    const sure = await ctx.ui.confirm(t('pull.checkoutTitle', { number: String(number) }), t('pull.checkoutBody', { number: String(number) }), { confirmLabel: t('pull.checkout') })
    if (!sure) return
    const run = async (command, args) => {
      const result = await ctx.exec(command, args, { cwd: ctxInfo.root, timeoutMs: 180_000, env: { GIT_TERMINAL_PROMPT: '0' } })
      if (result.code !== 0) throw new Error((result.stderr || result.stdout).trim() || `${command} ${args[0]} failed`)
    }
    const done = await attempt(async () => {
      if (await hasGh()) {
        await run('gh', ['pr', 'checkout', String(number)])
        return true
      }
      const branch = `pr-${number}`
      await run('git', ['fetch', ctxInfo.remote, `+pull/${number}/head:${branch}`])
      await run('git', ['switch', branch])
      return true
    })
    if (!done) return
    notify(t('pull.checkedOut', { number: String(number) }), 'success')
    await store.readContext()
    store.emit()
  }

  async function showPull(number) {
    if (!requireRepo()) return
    const base = store.repoPath()
    const data = await attempt(() => Promise.all([
      api.get(`${base}/pulls/${number}`),
      api.get(`${base}/pulls/${number}/reviews?per_page=100`),
      api.get(`${base}/pulls/${number}/files?per_page=100`),
    ]))
    if (!data) return
    const [pull, reviews, files] = data
    const lines = [
      `# #${pull.number} ${pull.title}`,
      '',
      `${t('pull.by', { author: pull.user?.login ?? '?' })} · \`${pull.head.label}\` → \`${pull.base.ref}\`${pull.draft ? ` · ${t('pull.draft')}` : ''}`,
      `${pull.html_url}`,
      '',
      pull.body?.trim() || `_${t('pull.noDescription')}_`,
      '',
      `## ${t('pull.reviews')}`,
      '',
      ...(reviews.length ? reviews.map((review) => `- **${review.user?.login}**: ${review.state}${review.body ? ` — ${review.body.split('\n')[0]}` : ''}`) : [`_${t('pull.noReviews')}_`]),
      '',
      `## ${t('pull.files', { count: String(files.length) })}`,
      '',
      ...files.map((file) => `- \`${file.filename}\` (+${file.additions} −${file.deletions}) ${file.status}`),
      '',
    ]
    ctx.ui.openDocument(`PR #${pull.number}.md`, lines.join('\n'), 'markdown')
  }

  async function reviewPull(number, event) {
    if (!requireRepo()) return
    const titles = { APPROVE: 'pull.approveTitle', REQUEST_CHANGES: 'pull.requestChangesTitle', COMMENT: 'pull.commentTitle' }
    const answer = await ctx.ui.input(t(titles[event], { number: String(number) }), [
      { id: 'body', label: t('pull.comment'), type: 'textarea', required: event !== 'APPROVE' },
    ], { submitLabel: t(titles[event], { number: String(number) }) })
    if (!answer) return
    const done = await attempt(() => api.post(`${store.repoPath()}/pulls/${number}/reviews`, { event, body: answer.body?.trim() || undefined }).then(() => true))
    if (done) notify(t('pull.reviewed', { number: String(number) }), 'success')
    await store.load('pulls')
  }

  async function mergePull(number) {
    if (!requireRepo()) return
    const answer = await ctx.ui.input(t('pull.mergeTitle', { number: String(number) }), [
      {
        id: 'method',
        label: t('pull.mergeMethod'),
        type: 'select',
        value: 'merge',
        choices: [
          { value: 'merge', label: t('pull.methodMerge') },
          { value: 'squash', label: t('pull.methodSquash') },
          { value: 'rebase', label: t('pull.methodRebase') },
        ],
      },
    ], { submitLabel: t('pull.merge') })
    if (!answer) return
    const sure = await ctx.ui.confirm(t('pull.mergeTitle', { number: String(number) }), t('pull.mergeBody', { number: String(number), method: answer.method }), { confirmLabel: t('pull.merge') })
    if (!sure) return
    const done = await attempt(() => api.put(`${store.repoPath()}/pulls/${number}/merge`, { merge_method: answer.method }).then(() => true))
    if (done) notify(t('pull.merged', { number: String(number) }), 'success')
    await store.load('pulls')
  }

  async function createPull() {
    if (!requireRepo()) return
    const ctxInfo = context()
    if (!ctxInfo.branch) {
      notify(t('pull.detached'), 'warning')
      return
    }
    const base = store.repoPath()
    const [repo, branches] = await Promise.all([
      api.get(base).catch(() => null),
      api.get(`${base}/branches?per_page=100`).catch(() => []),
    ])
    const defaultBranch = repo?.default_branch ?? 'main'
    const choices = [...new Set([defaultBranch, ...branches.map((branch) => branch.name)])]
      .filter((name) => name !== ctxInfo.branch)
      .map((name) => ({ value: name, label: name }))
    const last = await ctx.exec('git', ['log', '-1', '--format=%s%n%n%b'], { cwd: ctxInfo.root }).catch(() => null)
    const [subject, ...rest] = (last?.stdout ?? '').split('\n')
    const answer = await ctx.ui.input(t('pull.createTitle'), [
      { id: 'title', label: t('pull.title'), value: subject?.trim() ?? '', required: true },
      { id: 'body', label: t('pull.body'), type: 'textarea', value: rest.join('\n').trim() },
      { id: 'base', label: t('pull.base'), type: 'select', value: defaultBranch, choices },
      { id: 'draft', label: t('pull.asDraft'), type: 'toggle', value: 'false' },
    ], { description: t('pull.createDescription', { branch: ctxInfo.branch }), submitLabel: t('pull.create') })
    if (!answer) return

    if (!ctxInfo.hasUpstream) {
      const push = await ctx.ui.confirm(t('pull.pushTitle'), t('pull.pushBody', { branch: ctxInfo.branch, remote: ctxInfo.remote }), { confirmLabel: t('pull.push') })
      if (!push) return
      const pushed = await ctx.exec('git', ['push', '-u', ctxInfo.remote, ctxInfo.branch], { cwd: ctxInfo.root, timeoutMs: 300_000, env: { GIT_TERMINAL_PROMPT: '0' } })
      if (pushed.code !== 0) {
        notify((pushed.stderr || pushed.stdout).trim(), 'error')
        return
      }
    }
    const fork = ctxInfo.fork
    const head = fork && fork.owner !== ctxInfo.repo.owner ? `${fork.owner}:${ctxInfo.branch}` : ctxInfo.branch
    const pull = await attempt(() => api.post(`${base}/pulls`, {
      title: answer.title.trim(),
      body: answer.body?.trim() || undefined,
      head,
      base: answer.base || defaultBranch,
      draft: answer.draft === 'true',
    }))
    if (!pull) return
    notify(t('pull.created', { number: String(pull.number) }), 'success')
    await store.load('pulls')
    const open = await ctx.ui.confirm(t('pull.openTitle'), t('pull.openBody', { number: String(pull.number) }), { confirmLabel: t('action.openInBrowser') })
    if (open) openUrl(pull.html_url)
  }

  /* ---------------------------------------------------------------- *
   * Issues
   * ---------------------------------------------------------------- */

  async function showIssue(number) {
    if (!requireRepo()) return
    const base = store.repoPath()
    const data = await attempt(() => Promise.all([
      api.get(`${base}/issues/${number}`),
      api.get(`${base}/issues/${number}/comments?per_page=100`),
    ]))
    if (!data) return
    const [issue, comments] = data
    const labels = (issue.labels ?? []).map((label) => `\`${label.name}\``).join(' ')
    const lines = [
      `# #${issue.number} ${issue.title}`,
      '',
      `${t('issue.by', { author: issue.user?.login ?? '?' })} · ${issue.state}${labels ? ` · ${labels}` : ''}`,
      `${issue.html_url}`,
      '',
      issue.body?.trim() || `_${t('issue.noDescription')}_`,
      '',
      `## ${t('issue.comments', { count: String(comments.length) })}`,
      '',
      ...comments.flatMap((comment) => [`### ${comment.user?.login} · ${new Date(comment.created_at).toLocaleString(ctx.locale())}`, '', comment.body ?? '', '']),
    ]
    ctx.ui.openDocument(`Issue #${issue.number}.md`, lines.join('\n'), 'markdown')
  }

  async function createIssue() {
    if (!requireRepo()) return
    const answer = await ctx.ui.input(t('issue.createTitle'), [
      { id: 'title', label: t('issue.title'), required: true },
      { id: 'body', label: t('issue.body'), type: 'textarea' },
      { id: 'labels', label: t('issue.labels'), placeholder: 'bug, enhancement', hint: t('issue.labelsHint') },
    ], { submitLabel: t('issue.create') })
    if (!answer) return
    const labels = (answer.labels ?? '').split(',').map((label) => label.trim()).filter(Boolean)
    const issue = await attempt(() => api.post(`${store.repoPath()}/issues`, {
      title: answer.title.trim(),
      body: answer.body?.trim() || undefined,
      labels: labels.length ? labels : undefined,
    }))
    if (!issue) return
    notify(t('issue.created', { number: String(issue.number) }), 'success')
    await store.load('issues')
  }

  async function setIssueState(number, state) {
    if (!requireRepo()) return
    const key = state === 'closed' ? 'issue.close' : 'issue.reopen'
    const sure = await ctx.ui.confirm(t(`${key}Title`, { number: String(number) }), t(`${key}Body`, { number: String(number) }), { confirmLabel: t(key), danger: state === 'closed' })
    if (!sure) return
    await attempt(() => api.patch(`${store.repoPath()}/issues/${number}`, { state }))
    await store.load('issues')
  }

  async function comment(number) {
    if (!requireRepo()) return
    const answer = await ctx.ui.input(t('issue.commentTitle', { number: String(number) }), [
      { id: 'body', label: t('pull.comment'), type: 'textarea', required: true },
    ], { submitLabel: t('issue.commentSubmit') })
    const body = answer?.body?.trim()
    if (!body) return
    const done = await attempt(() => api.post(`${store.repoPath()}/issues/${number}/comments`, { body }).then(() => true))
    if (done) notify(t('issue.commented', { number: String(number) }), 'success')
  }

  /* ---------------------------------------------------------------- *
   * Workflow runs
   * ---------------------------------------------------------------- */

  async function rerun(id, failedOnly) {
    if (!requireRepo()) return
    const route = failedOnly ? 'rerun-failed-jobs' : 'rerun'
    const done = await attempt(() => api.post(`${store.repoPath()}/actions/runs/${id}/${route}`).then(() => true))
    if (done) notify(t('run.restarted'), 'success')
    await store.load('runs')
  }

  async function cancelRun(id) {
    if (!requireRepo()) return
    const sure = await ctx.ui.confirm(t('run.cancelTitle'), t('run.cancelBody'), { confirmLabel: t('run.cancel'), danger: true })
    if (!sure) return
    await attempt(() => api.post(`${store.repoPath()}/actions/runs/${id}/cancel`))
    await store.load('runs')
  }

  return {
    openUrl, signIn, signOut, openRepo, openFile, repoUrl,
    checkoutPull, showPull, reviewPull, mergePull, createPull,
    showIssue, createIssue, setIssueState, comment,
    rerun, cancelRun,
  }
}
