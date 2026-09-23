/**
 * What every GitHub view shows before it can show its list: no folder, no
 * repository, no GitHub remote, not signed in, rate limit reached.
 */

/** Empty-state nodes when the view cannot show its list yet, else `null`. */
export function gate(store, slot, t) {
  const { context, user, authError } = store.state
  const entry = store.state[slot]
  if (!context) return [{ type: 'progress', label: t('busy.loading') }]
  const reasons = {
    noFolder: { title: t('empty.noFolder'), hint: t('empty.noFolderHint'), icon: 'folder' },
    noRepo: { title: t('empty.noRepo'), hint: t('empty.noRepoHint'), icon: 'git-branch' },
    noGitHub: { title: t('empty.noGitHub'), hint: t('empty.noGitHubHint'), icon: 'github' },
    error: { title: t('empty.error'), hint: context.message, icon: 'circle-alert' },
  }
  const reason = reasons[context.reason]
  if (reason) return [{ type: 'empty', ...reason }]
  const signIn = { action: 'signIn', title: t('auth.submit'), icon: 'log-in', variant: 'primary' }
  if (!user && authError?.kind !== 'network') {
    return [{ type: 'empty', title: t('empty.signIn'), hint: t('empty.signInHint'), icon: 'github', action: signIn }]
  }
  const error = entry.error ?? authError
  if (!error) return null
  if (error.kind === 'auth') return [{ type: 'empty', title: t('empty.authFailed'), hint: error.message, icon: 'shield-alert', action: signIn }]
  if (error.kind === 'rateLimit') return [{ type: 'empty', title: t('empty.rateLimit'), hint: error.message, icon: 'timer' }]
  return [{
    type: 'empty',
    title: t('empty.error'),
    hint: error.message,
    icon: 'circle-alert',
    action: { action: 'refresh', title: t('action.retry'), icon: 'refresh-cw', variant: 'secondary' },
  }]
}

/** The repository as a heading line with the account. */
export function repoLine(store, t) {
  const { context, user } = store.state
  if (!context?.repo) return []
  const account = user ? ` · ${t('auth.as', { login: user.login })}` : ''
  return [{ type: 'text', text: `${context.repo.owner}/${context.repo.name}${account}`, tone: 'muted', small: true }]
}

/** Labels as a short badge text. */
export function labelText(labels) {
  const names = (labels ?? []).map((label) => label.name).filter(Boolean)
  if (!names.length) return undefined
  if (names.length === 1) return names[0]
  return `${names[0]} +${names.length - 1}`
}
