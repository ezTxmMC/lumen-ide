/**
 * Everything the Git views and commands can do. Each operation asks what it
 * needs to ask, runs git, reports failures as a notice and refreshes the
 * repository afterwards.
 */

import path from 'node:path'
import { splitPath } from './parse.js'

const PULL_ARGS = {
  merge: ['--no-rebase'],
  rebase: ['--rebase'],
  'ff-only': ['--ff-only'],
}

/** How an operation in progress is continued and aborted. */
const OPERATION_COMMANDS = {
  merge: { continue: ['commit', '--no-edit'], abort: ['merge', '--abort'] },
  rebase: { continue: ['rebase', '--continue'], abort: ['rebase', '--abort'] },
  cherryPick: { continue: ['cherry-pick', '--continue'], abort: ['cherry-pick', '--abort'] },
  revert: { continue: ['revert', '--continue'], abort: ['revert', '--abort'] },
}

export function createActions({ ctx, repo, t }) {
  const setting = (key) => ctx.settings.get(key)
  const flag = (key, fallback) => {
    const value = setting(key)
    if (value === undefined || value === '') return fallback
    return value === 'true'
  }
  const notify = (message, tone = 'info') => ctx.ui.notify(message, tone)
  const status = () => repo.state.status
  const branchName = () => status().branch.head

  /** Run `task`, show what went wrong, refresh either way. */
  async function attempt(task, { full = true } = {}) {
    try {
      return await task()
    } catch (err) {
      notify(err.message, 'error')
      return undefined
    } finally {
      await (full ? repo.refresh() : repo.refreshStatus())
    }
  }

  const requireRepo = () => {
    if (repo.state.isRepo) return true
    notify(t('error.noRepo'), 'warning')
    return false
  }

  /* ---------------------------------------------------------------- *
   * Files
   * ---------------------------------------------------------------- */

  const openFile = (file) => ctx.ui.openFile(repo.absolute(file))

  async function openDiff(file, staged) {
    const entry = [...status().untracked, ...status().conflicts].find((candidate) => candidate.path === file)
    if (entry && !staged) {
      openFile(file)
      return
    }
    const args = staged ? ['diff', '--cached', '--', file] : ['diff', '--', file]
    const result = await repo.run(args, { readOnly: true }).catch((err) => ({ stdout: '', error: err }))
    if (result.error) {
      notify(result.error.message, 'error')
      return
    }
    if (!result.stdout.trim()) {
      openFile(file)
      return
    }
    const label = staged ? t('diff.staged') : t('diff.worktree')
    ctx.ui.openDocument(`${splitPath(file).name} (${label}).diff`, result.stdout, 'diff')
  }

  const stage = (files) => attempt(() => repo.run(['add', '-A', '--', ...files]), { full: false })

  function unstage(files) {
    // Before the first commit there is no HEAD to reset to.
    if (status().branch.initial) return attempt(() => repo.run(['rm', '--cached', '-r', '-q', '--', ...files]), { full: false })
    return attempt(() => repo.run(['restore', '--staged', '--', ...files]), { full: false })
  }

  async function confirmDiscard(count) {
    if (!flag('confirmDiscard', true)) return true
    return ctx.ui.confirm(t('discard.title'), t('discard.body', { count: String(count) }), { confirmLabel: t('discard.confirm'), danger: true })
  }

  async function discard(files) {
    if (!files.length || !(await confirmDiscard(files.length))) return
    const untracked = new Set(status().untracked.map((entry) => entry.path))
    const tracked = files.filter((file) => !untracked.has(file))
    const loose = files.filter((file) => untracked.has(file))
    await attempt(async () => {
      if (tracked.length) await repo.run(['restore', '--worktree', '--', ...tracked])
      if (loose.length) await repo.run(['clean', '-f', '-q', '--', ...loose])
    }, { full: false })
  }

  const stageAll = () => attempt(() => repo.run(['add', '-A']), { full: false })
  const unstageAll = () => unstage(status().staged.map((entry) => entry.path))
  const discardAll = () => discard([...status().unstaged.map((entry) => entry.path), ...status().untracked.map((entry) => entry.path)])
  /** Stage conflicted files — after asking, when markers are still in them. */
  async function markResolved(files) {
    const pending = status().conflicts.filter((entry) => files.includes(entry.path) && entry.blocks > 0)
    if (pending.length) {
      const names = pending.map((entry) => splitPath(entry.path).name).join(', ')
      const sure = await ctx.ui.confirm(t('file.stillConflictedTitle'), t('file.stillConflictedBody', { files: names }), { confirmLabel: t('file.markResolved'), danger: true })
      if (!sure) return undefined
    }
    return stage(files)
  }

  /* ---------------------------------------------------------------- *
   * Committing
   * ---------------------------------------------------------------- */

  /** Commit what is staged — or, after asking, everything. Returns true on success. */
  async function commit(message, { amend = false, push: andPush = false } = {}) {
    if (!requireRepo()) return false
    let text = String(message ?? '').trim()
    if (!text && !amend) {
      const answer = await ctx.ui.input(t('commit.title'), [
        { id: 'message', label: t('commit.message'), type: 'textarea', required: true },
      ], { submitLabel: t('commit.submit') })
      text = answer?.message?.trim() ?? ''
      if (!text) return false
    }
    if (amend && !(await ctx.ui.confirm(t('commit.amendTitle'), t('commit.amendBody'), { confirmLabel: t('commit.amend') }))) return false

    const current = status()
    const pending = current.unstaged.length + current.untracked.length
    if (!current.staged.length && !amend) {
      if (!pending) {
        notify(t('commit.nothing'), 'info')
        return false
      }
      const all = await ctx.ui.confirm(t('commit.stageAllTitle'), t('commit.stageAllBody', { count: String(pending) }), { confirmLabel: t('commit.stageAllConfirm') })
      if (!all) return false
      const staged = await attempt(() => repo.run(['add', '-A']).then(() => true), { full: false })
      if (!staged) return false
    }

    const args = ['commit']
    if (amend) args.push('--amend')
    if (amend && !text) args.push('--no-edit')
    if (text) args.push('-F', '-')
    if (flag('signOff', false)) args.push('--signoff')
    const done = await attempt(() => repo.busy(t('busy.commit'), () => repo.run(args, { input: text ? `${text}\n` : undefined, timeoutMs: 180_000 })).then(() => true))
    if (!done) return false
    notify(t(amend ? 'commit.amended' : 'commit.done'), 'success')
    if (andPush) await push()
    return true
  }

  /* ---------------------------------------------------------------- *
   * Remotes
   * ---------------------------------------------------------------- */

  /** `origin` when there is one, else the only remote, else a choice. */
  async function pickRemote() {
    const remotes = repo.state.remotes
    if (!remotes.length) {
      notify(t('push.noRemote'), 'warning')
      return null
    }
    const origin = remotes.find((remote) => remote.name === 'origin')
    if (origin) return origin.name
    if (remotes.length === 1) return remotes[0].name
    return ctx.ui.pick(t('push.pickRemote'), remotes.map((remote) => ({ value: remote.name, label: remote.name, detail: remote.push || remote.fetch })))
  }

  async function push({ force = false } = {}) {
    if (!requireRepo()) return
    const { branch } = status()
    if (branch.detached || !branch.head) {
      notify(t('push.detached'), 'warning')
      return
    }
    const args = ['push']
    if (force) args.push('--force-with-lease')
    if (flag('followTags', false)) args.push('--follow-tags')
    if (!branch.upstream) {
      const remote = await pickRemote()
      if (!remote) return
      const publish = await ctx.ui.confirm(t('push.publishTitle'), t('push.publishBody', { branch: branch.head, remote }), { confirmLabel: t('push.publish') })
      if (!publish) return
      args.push('-u', remote, branch.head)
    }
    if (force && !(await ctx.ui.confirm(t('push.forceTitle'), t('push.forceBody', { branch: branch.head }), { confirmLabel: t('push.force'), danger: true }))) return
    const done = await attempt(() => repo.busy(t('busy.push'), () => repo.run(args, { timeoutMs: 300_000 })).then(() => true))
    if (done) notify(t('push.done', { branch: branch.head }), 'success')
  }

  async function pull() {
    if (!requireRepo()) return false
    if (!status().branch.upstream) {
      notify(t('pull.noUpstream'), 'warning')
      return false
    }
    const mode = PULL_ARGS[setting('pullMode')] ? setting('pullMode') : 'merge'
    const done = await attempt(() => repo.busy(t('busy.pull'), () => repo.run(['pull', ...PULL_ARGS[mode]], { timeoutMs: 300_000 })).then(() => true))
    if (done) notify(t('pull.done'), 'success')
    return Boolean(done)
  }

  async function fetch({ quiet = false } = {}) {
    if (!repo.state.isRepo) return
    if (quiet) {
      await repo.run(['fetch', '--all', '--prune', '--quiet'], { timeoutMs: 120_000, allowFail: true }).catch(() => {})
      await repo.refresh()
      return
    }
    const done = await attempt(() => repo.busy(t('busy.fetch'), () => repo.run(['fetch', '--all', '--prune'], { timeoutMs: 300_000 })).then(() => true))
    if (done) notify(t('fetch.done'), 'success')
  }

  async function sync() {
    if (!requireRepo()) return
    if (!status().branch.upstream) {
      await push()
      return
    }
    const pulled = await pull()
    if (!pulled) return
    if (status().branch.ahead > 0) await push()
  }

  /* ---------------------------------------------------------------- *
   * Branches, tags, stashes
   * ---------------------------------------------------------------- */

  async function validBranchName(name) {
    const result = await repo.run(['check-ref-format', '--branch', name], { allowFail: true, readOnly: true })
    return result.code === 0
  }

  async function createBranch(startPoint) {
    if (!requireRepo()) return
    const answer = await ctx.ui.input(t('branch.createTitle'), [
      { id: 'name', label: t('branch.name'), required: true, mono: true, placeholder: 'feature/…' },
      { id: 'from', label: t('branch.from'), value: startPoint ?? '', placeholder: 'HEAD', mono: true },
      { id: 'checkout', label: t('branch.checkoutAfter'), type: 'toggle', value: 'true' },
    ], { submitLabel: t('branch.create') })
    const name = answer?.name?.trim()
    if (!name) return
    if (!(await validBranchName(name))) {
      notify(t('branch.invalidName', { name }), 'error')
      return
    }
    const from = answer.from?.trim()
    const args = answer.checkout === 'false' ? ['branch', name] : ['switch', '-c', name]
    if (from) args.push(from)
    await attempt(() => repo.run(args))
  }

  async function checkoutRef(name, remote = false) {
    if (!remote) return attempt(() => repo.busy(t('busy.checkout'), () => repo.run(['switch', name])))
    const local = name.slice(name.indexOf('/') + 1)
    const exists = repo.state.refs.local.some((branch) => branch.name === local)
    if (exists) return attempt(() => repo.busy(t('busy.checkout'), () => repo.run(['switch', local])))
    return attempt(() => repo.busy(t('busy.checkout'), () => repo.run(['switch', '--track', name])))
  }

  async function checkout() {
    if (!requireRepo()) return
    const { local, remote } = repo.state.refs
    const localNames = new Set(local.map((branch) => branch.name))
    const items = [
      { value: '\0new', label: t('branch.createItem'), detail: '' },
      ...local.filter((branch) => !branch.current).map((branch) => ({ value: `l:${branch.name}`, label: branch.name, detail: branch.subject })),
      ...remote.filter((branch) => !localNames.has(branch.branch)).map((branch) => ({ value: `r:${branch.name}`, label: branch.name, detail: t('branch.remoteDetail') })),
    ]
    const picked = await ctx.ui.pick(t('branch.checkoutTitle'), items, { placeholder: t('branch.checkoutPlaceholder') })
    if (!picked) return
    if (picked === '\0new') {
      await createBranch()
      return
    }
    await checkoutRef(picked.slice(2), picked.startsWith('r:'))
  }

  async function pickOtherBranch(title) {
    const items = [
      ...repo.state.refs.local.filter((branch) => !branch.current).map((branch) => ({ value: branch.name, label: branch.name, detail: branch.subject })),
      ...repo.state.refs.remote.map((branch) => ({ value: branch.name, label: branch.name, detail: t('branch.remoteDetail') })),
    ]
    if (!items.length) {
      notify(t('branch.noOther'), 'info')
      return null
    }
    return ctx.ui.pick(title, items)
  }

  async function merge(name) {
    if (!requireRepo()) return
    const target = name ?? await pickOtherBranch(t('branch.mergeTitle', { branch: branchName() ?? 'HEAD' }))
    if (!target) return
    const done = await attempt(() => repo.busy(t('busy.merge'), () => repo.run(['merge', '--no-edit', target], { timeoutMs: 300_000 })).then(() => true))
    if (done) notify(t('branch.merged', { branch: target }), 'success')
    if (!done && repo.state.status.conflicts.length) ctx.ui.showView('changes')
  }

  async function rebase(name) {
    if (!requireRepo()) return
    const target = name ?? await pickOtherBranch(t('branch.rebaseTitle', { branch: branchName() ?? 'HEAD' }))
    if (!target) return
    const done = await attempt(() => repo.busy(t('busy.rebase'), () => repo.run(['rebase', target], { timeoutMs: 300_000 })).then(() => true))
    if (done) notify(t('branch.rebased', { branch: target }), 'success')
    if (!done && repo.state.operation) ctx.ui.showView('changes')
  }

  async function renameBranch(name) {
    const answer = await ctx.ui.input(t('branch.renameTitle', { branch: name }), [
      { id: 'name', label: t('branch.newName'), value: name, required: true, mono: true },
    ], { submitLabel: t('branch.rename') })
    const next = answer?.name?.trim()
    if (!next || next === name) return
    if (!(await validBranchName(next))) {
      notify(t('branch.invalidName', { name: next }), 'error')
      return
    }
    await attempt(() => repo.run(['branch', '-m', name, next]))
  }

  async function deleteBranch(name) {
    const sure = await ctx.ui.confirm(t('branch.deleteTitle'), t('branch.deleteBody', { branch: name }), { confirmLabel: t('branch.delete'), danger: true })
    if (!sure) return
    const result = await repo.run(['branch', '-d', name], { allowFail: true }).catch((err) => ({ code: 1, stderr: err.message }))
    if (result.code === 0) {
      await repo.refresh()
      return
    }
    // Not merged: git refuses `-d`; ask once more before forcing.
    const force = await ctx.ui.confirm(t('branch.forceDeleteTitle'), t('branch.forceDeleteBody', { branch: name }), { confirmLabel: t('branch.forceDelete'), danger: true })
    if (!force) return
    await attempt(() => repo.run(['branch', '-D', name]))
  }

  async function createTag(target) {
    if (!requireRepo()) return
    const answer = await ctx.ui.input(t('tag.createTitle'), [
      { id: 'name', label: t('tag.name'), required: true, mono: true, placeholder: 'v1.0.0' },
      { id: 'message', label: t('tag.message'), type: 'textarea', hint: t('tag.messageHint') },
    ], { submitLabel: t('tag.create') })
    const name = answer?.name?.trim()
    if (!name) return
    const message = answer.message?.trim()
    const args = message ? ['tag', '-a', name, '-m', message] : ['tag', name]
    if (target) args.push(target)
    await attempt(() => repo.run(args))
  }

  async function deleteTag(name) {
    if (!(await ctx.ui.confirm(t('tag.deleteTitle'), t('tag.deleteBody', { tag: name }), { confirmLabel: t('tag.delete'), danger: true }))) return
    await attempt(() => repo.run(['tag', '-d', name]))
  }

  async function pushTag(name) {
    const remote = await pickRemote()
    if (!remote) return
    await attempt(() => repo.busy(t('busy.push'), () => repo.run(['push', remote, `refs/tags/${name}`], { timeoutMs: 300_000 })))
  }

  async function stash() {
    if (!requireRepo()) return
    const answer = await ctx.ui.input(t('stash.title'), [
      { id: 'message', label: t('stash.message'), placeholder: t('stash.messagePlaceholder') },
      { id: 'untracked', label: t('stash.includeUntracked'), type: 'toggle', value: 'true' },
    ], { submitLabel: t('stash.submit') })
    if (!answer) return
    const args = ['stash', 'push']
    if (answer.untracked !== 'false') args.push('--include-untracked')
    if (answer.message?.trim()) args.push('-m', answer.message.trim())
    const done = await attempt(() => repo.run(args).then(() => true))
    if (done) notify(t('stash.done'), 'success')
  }

  const stashPop = (ref = 'stash@{0}') => attempt(() => repo.run(['stash', 'pop', ref]))
  const stashApply = (ref) => attempt(() => repo.run(['stash', 'apply', ref]))

  async function stashDrop(ref) {
    if (!(await ctx.ui.confirm(t('stash.dropTitle'), t('stash.dropBody', { stash: ref }), { confirmLabel: t('stash.drop'), danger: true }))) return
    await attempt(() => repo.run(['stash', 'drop', ref]))
  }

  async function stashShow(ref) {
    const result = await repo.run(['stash', 'show', '--include-untracked', '--stat', '--patch', ref], { readOnly: true }).catch((err) => ({ error: err }))
    if (result.error) {
      notify(result.error.message, 'error')
      return
    }
    ctx.ui.openDocument(`${ref}.diff`, result.stdout, 'diff')
  }

  /* ---------------------------------------------------------------- *
   * History
   * ---------------------------------------------------------------- */

  async function showCommit(hash) {
    const result = await repo.run(['show', '--stat', '--patch', '--format=fuller', hash], { readOnly: true, timeoutMs: 60_000 }).catch((err) => ({ error: err }))
    if (result.error) {
      notify(result.error.message, 'error')
      return
    }
    ctx.ui.openDocument(`${hash.slice(0, 8)}.diff`, result.stdout, 'diff')
  }

  async function checkoutCommit(hash) {
    if (!(await ctx.ui.confirm(t('history.checkoutTitle'), t('history.checkoutBody', { hash: hash.slice(0, 8) }), { confirmLabel: t('history.checkout') }))) return
    await attempt(() => repo.run(['switch', '--detach', hash]))
  }

  const cherryPick = (hash) => attempt(() => repo.run(['cherry-pick', hash]))
  const revert = (hash) => attempt(() => repo.run(['revert', '--no-edit', hash]))

  async function reset(hash, mode) {
    const danger = mode === 'hard'
    const sure = await ctx.ui.confirm(t('history.resetTitle', { mode }), t(danger ? 'history.resetHardBody' : 'history.resetBody', { hash: hash.slice(0, 8), branch: branchName() ?? 'HEAD' }), { confirmLabel: t('history.reset'), danger })
    if (!sure) return
    await attempt(() => repo.run(['reset', `--${mode}`, hash]))
  }

  /* ---------------------------------------------------------------- *
   * Operations in progress
   * ---------------------------------------------------------------- */

  async function continueOperation() {
    const commands = OPERATION_COMMANDS[repo.state.operation]
    if (!commands) return
    if (status().conflicts.length) {
      notify(t('operation.unresolved', { count: String(status().conflicts.length) }), 'warning')
      return
    }
    await attempt(() => repo.run(commands.continue, { timeoutMs: 300_000 }))
  }

  async function abortOperation() {
    const commands = OPERATION_COMMANDS[repo.state.operation]
    if (!commands) return
    if (!(await ctx.ui.confirm(t('operation.abortTitle'), t('operation.abortBody'), { confirmLabel: t('operation.abort'), danger: true }))) return
    await attempt(() => repo.run(commands.abort))
  }

  /* ---------------------------------------------------------------- *
   * Repositories
   * ---------------------------------------------------------------- */

  async function init() {
    const folder = ctx.workspace.root()
    if (!folder) {
      notify(t('error.noFolder'), 'warning')
      return
    }
    const done = await attempt(() => repo.run(['init'], { cwd: folder }).then(() => true))
    if (done) notify(t('repo.initialized'), 'success')
  }

  async function clone() {
    const parent = ctx.workspace.root() ? path.dirname(ctx.workspace.root()) : ''
    const answer = await ctx.ui.input(t('clone.title'), [
      { id: 'url', label: t('clone.url'), required: true, mono: true, placeholder: 'https://github.com/owner/repo.git' },
      { id: 'parent', label: t('clone.parent'), required: true, mono: true, value: parent, hint: t('clone.parentHint') },
      { id: 'name', label: t('clone.name'), mono: true, placeholder: t('clone.namePlaceholder') },
    ], { submitLabel: t('clone.submit') })
    const url = answer?.url?.trim()
    const target = answer?.parent?.trim()
    if (!url || !target) return
    if (!path.isAbsolute(target)) {
      notify(t('clone.absolute'), 'error')
      return
    }
    const args = ['clone', '--progress', url]
    if (answer.name?.trim()) args.push(answer.name.trim())
    try {
      await repo.busy(t('busy.clone'), () => repo.run(args, { cwd: target, timeoutMs: 1_800_000 }))
      notify(t('clone.done', { folder: path.join(target, answer.name?.trim() || path.basename(url).replace(/\.git$/, '')) }), 'success')
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  /* ---------------------------------------------------------------- *
   * The active file
   * ---------------------------------------------------------------- */

  async function fileDocument(file, args, suffix) {
    const relative = file ? repo.relative(file) : null
    if (!relative) {
      notify(t('file.none'), 'warning')
      return
    }
    const result = await repo.run([...args, '--', relative], { readOnly: true, timeoutMs: 120_000 }).catch((err) => ({ error: err }))
    if (result.error) {
      notify(result.error.message, 'error')
      return
    }
    if (!result.stdout.trim()) {
      notify(t('file.noHistory'), 'info')
      return
    }
    ctx.ui.openDocument(`${splitPath(relative).name} (${suffix})`, result.stdout, args[0] === 'blame' ? undefined : 'diff')
  }

  const fileHistory = (file) => fileDocument(file, ['log', '--follow', '--patch', '--max-count=100', '--format=fuller'], t('file.historySuffix'))
  const blame = (file) => fileDocument(file, ['blame', '--date=short'], t('file.blameSuffix'))

  return {
    openFile, openDiff, stage, unstage, discard, stageAll, unstageAll, discardAll, markResolved,
    commit, push, pull, fetch, sync,
    createBranch, checkout, checkoutRef, merge, rebase, renameBranch, deleteBranch,
    createTag, deleteTag, pushTag, stash, stashPop, stashApply, stashDrop, stashShow,
    showCommit, checkoutCommit, cherryPick, revert, reset,
    continueOperation, abortOperation, init, clone, fileHistory, blame,
  }
}
