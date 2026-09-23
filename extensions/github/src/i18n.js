/**
 * The texts of the GitHub extension in German and English. The interface
 * language comes from `ctx.locale()`; anything else falls back to English.
 */

const MESSAGES = {
  de: {
    view: { pulls: 'Pull Requests', issues: 'Issues', runs: 'GitHub Actions' },
    busy: { loading: 'Lade von GitHub …' },
    action: { refresh: 'Aktualisieren', retry: 'Erneut versuchen', openInBrowser: 'Im Browser öffnen', openRepo: 'Repository im Browser öffnen' },
    error: {
      network: 'GitHub ist nicht erreichbar: {message}', timeout: 'Zeitüberschreitung',
      rateLimit: 'Das Anfragelimit von GitHub ist erreicht — wieder möglich ab {time}.',
      noRepo: 'Der Ordner gehört zu keinem GitHub-Repository.', noFile: 'Keine Datei aus dem Repository aktiv.',
    },
    empty: {
      noFolder: 'Kein Ordner geöffnet', noFolderHint: 'Öffne einen Ordner mit einem GitHub-Repository.',
      noRepo: 'Kein Git-Repository', noRepoHint: 'Der geöffnete Ordner ist kein Git-Repository.',
      noGitHub: 'Kein GitHub-Remote', noGitHubHint: 'Keines der Remotes zeigt auf GitHub. Für GitHub Enterprise trage die API-Adresse in den Einstellungen ein.',
      signIn: 'Nicht angemeldet', signInHint: 'Melde dich mit einem Personal Access Token an — oder mit „gh auth login“, wenn die GitHub CLI installiert ist.',
      authFailed: 'Anmeldung abgelehnt', rateLimit: 'Anfragelimit erreicht', error: 'GitHub hat einen Fehler gemeldet',
      noPulls: 'Keine offenen Pull Requests', noIssues: 'Keine offenen Issues', noRuns: 'Keine Workflow-Läufe',
    },
    auth: {
      title: 'Bei GitHub anmelden', token: 'Personal Access Token', tokenHint: 'Benötigt die Rechte „repo“ und „workflow“ (bzw. bei feingranularen Tokens Lese- und Schreibrechte für Pull Requests, Issues und Actions).',
      description: 'Ein Token erstellst du unter {url}. Er wird verschlüsselt im Schlüsselbund des Systems gespeichert.',
      submit: 'Anmelden', invalid: 'Der Token wurde abgelehnt: {message}', signedIn: 'Angemeldet als {login}.',
      signOut: 'Abmelden', signOutTitle: 'Von GitHub abmelden?', signOutBody: 'Der gespeicherte Token wird gelöscht. Eine Anmeldung der GitHub CLI bleibt bestehen.',
      signedOut: 'Abgemeldet.', as: 'angemeldet als {login}',
    },
    filter: {
      label: 'Filter', allPulls: 'Alle offenen Pull Requests', minePulls: 'Von mir', reviewRequested: 'Review von mir angefragt',
      allIssues: 'Alle offenen Issues', assigned: 'Mir zugewiesen', created: 'Von mir erstellt',
      currentBranch: 'Branch {branch}', allRuns: 'Alle Branches',
    },
    checks: { success: 'Checks erfolgreich', failure: 'Checks fehlgeschlagen', pending: 'Checks laufen', none: 'Keine Checks' },
    pull: {
      show: 'Details anzeigen', checkout: 'Lokal auschecken', checkoutTitle: 'Pull Request #{number} auschecken?',
      checkoutBody: 'Der Stand von #{number} wird als lokaler Branch ausgecheckt.', checkedOut: 'Pull Request #{number} ausgecheckt.',
      by: 'von {author}', draft: 'Entwurf', noDescription: 'Keine Beschreibung.', reviews: 'Reviews', noReviews: 'Noch keine Reviews.',
      files: 'Geänderte Dateien ({count})', approve: 'Genehmigen…', requestChanges: 'Änderungen anfordern…', commentAction: 'Kommentieren…',
      approveTitle: '#{number} genehmigen', requestChangesTitle: 'Änderungen an #{number} anfordern', commentTitle: '#{number} kommentieren',
      comment: 'Kommentar', reviewed: 'Review zu #{number} abgeschickt.',
      merge: 'Mergen…', mergeTitle: 'Pull Request #{number} mergen', mergeBody: '#{number} wird per „{method}“ in den Ziel-Branch übernommen.',
      mergeMethod: 'Methode', methodMerge: 'Merge-Commit', methodSquash: 'Squash', methodRebase: 'Rebase', merged: 'Pull Request #{number} gemergt.',
      createTitle: 'Pull Request erstellen…', createDescription: 'Aus dem aktuellen Branch {branch}.', title: 'Titel', body: 'Beschreibung',
      base: 'Ziel-Branch', asDraft: 'Als Entwurf', create: 'Erstellen', created: 'Pull Request #{number} erstellt.',
      detached: 'Kein Branch ausgecheckt — ein Pull Request braucht einen Branch.',
      pushTitle: 'Branch veröffentlichen?', pushBody: '{branch} ist noch nicht auf {remote}. Jetzt pushen?', push: 'Pushen',
      openTitle: 'Pull Request erstellt', openBody: '#{number} im Browser öffnen?',
    },
    issue: {
      show: 'Details anzeigen', by: 'von {author}', noDescription: 'Keine Beschreibung.', comments: 'Kommentare ({count})',
      assignees: 'Zugewiesen: {names}', commentAction: 'Kommentieren…', commentTitle: '#{number} kommentieren', commentSubmit: 'Kommentieren',
      commented: 'Kommentar zu #{number} gespeichert.',
      createTitle: 'Issue erstellen…', title: 'Titel', body: 'Beschreibung', labels: 'Labels', labelsHint: 'Durch Kommas getrennt.',
      create: 'Erstellen', created: 'Issue #{number} erstellt.',
      close: 'Schließen', closeTitle: 'Issue #{number} schließen?', closeBody: '#{number} wird als erledigt geschlossen.',
      reopen: 'Wieder öffnen', reopenTitle: 'Issue #{number} wieder öffnen?', reopenBody: '#{number} wird wieder geöffnet.',
    },
    run: {
      open: 'Im Browser öffnen', logs: 'Logs im Browser', rerun: 'Erneut ausführen', rerunFailed: 'Fehlgeschlagene Jobs erneut ausführen',
      restarted: 'Workflow neu gestartet.', cancel: 'Abbrechen', cancelTitle: 'Workflow abbrechen?', cancelBody: 'Der laufende Workflow wird abgebrochen.',
      state: { success: 'erfolgreich', failure: 'fehlgeschlagen', cancelled: 'abgebrochen', skipped: 'übersprungen', waiting: 'wartet', queued: 'in Warteschlange', running: 'läuft' },
    },
    status: { ci: '{name}: {state} auf {branch} — klicken für GitHub Actions' },
  },
  en: {
    view: { pulls: 'Pull Requests', issues: 'Issues', runs: 'GitHub Actions' },
    busy: { loading: 'Loading from GitHub …' },
    action: { refresh: 'Refresh', retry: 'Try Again', openInBrowser: 'Open in Browser', openRepo: 'Open Repository in Browser' },
    error: {
      network: 'GitHub cannot be reached: {message}', timeout: 'timed out',
      rateLimit: 'GitHub\'s rate limit is reached — possible again from {time}.',
      noRepo: 'This folder does not belong to a GitHub repository.', noFile: 'No file of the repository is active.',
    },
    empty: {
      noFolder: 'No folder open', noFolderHint: 'Open a folder that holds a GitHub repository.',
      noRepo: 'Not a Git repository', noRepoHint: 'The open folder is not a Git repository.',
      noGitHub: 'No GitHub remote', noGitHubHint: 'None of the remotes points at GitHub. For GitHub Enterprise, enter the API address in the settings.',
      signIn: 'Not signed in', signInHint: 'Sign in with a personal access token — or with “gh auth login” when the GitHub CLI is installed.',
      authFailed: 'Sign-in rejected', rateLimit: 'Rate limit reached', error: 'GitHub reported an error',
      noPulls: 'No open pull requests', noIssues: 'No open issues', noRuns: 'No workflow runs',
    },
    auth: {
      title: 'Sign in to GitHub', token: 'Personal access token', tokenHint: 'Needs the “repo” and “workflow” scopes (or, for fine-grained tokens, read and write access to pull requests, issues and actions).',
      description: 'Create a token at {url}. It is stored encrypted in the system\'s key store.',
      submit: 'Sign In', invalid: 'The token was rejected: {message}', signedIn: 'Signed in as {login}.',
      signOut: 'Sign Out', signOutTitle: 'Sign out of GitHub?', signOutBody: 'The stored token is deleted. A GitHub CLI login stays as it is.',
      signedOut: 'Signed out.', as: 'signed in as {login}',
    },
    filter: {
      label: 'Filter', allPulls: 'All open pull requests', minePulls: 'Created by me', reviewRequested: 'Review requested from me',
      allIssues: 'All open issues', assigned: 'Assigned to me', created: 'Created by me',
      currentBranch: 'Branch {branch}', allRuns: 'All branches',
    },
    checks: { success: 'Checks passed', failure: 'Checks failed', pending: 'Checks running', none: 'No checks' },
    pull: {
      show: 'Show Details', checkout: 'Check Out Locally', checkoutTitle: 'Check out pull request #{number}?',
      checkoutBody: 'The state of #{number} is checked out as a local branch.', checkedOut: 'Checked out pull request #{number}.',
      by: 'by {author}', draft: 'draft', noDescription: 'No description.', reviews: 'Reviews', noReviews: 'No reviews yet.',
      files: 'Changed files ({count})', approve: 'Approve…', requestChanges: 'Request Changes…', commentAction: 'Comment…',
      approveTitle: 'Approve #{number}', requestChangesTitle: 'Request changes on #{number}', commentTitle: 'Comment on #{number}',
      comment: 'Comment', reviewed: 'Review of #{number} submitted.',
      merge: 'Merge…', mergeTitle: 'Merge pull request #{number}', mergeBody: '#{number} will be merged into its base branch using “{method}”.',
      mergeMethod: 'Method', methodMerge: 'Merge commit', methodSquash: 'Squash', methodRebase: 'Rebase', merged: 'Merged pull request #{number}.',
      createTitle: 'Create Pull Request…', createDescription: 'From the current branch {branch}.', title: 'Title', body: 'Description',
      base: 'Base branch', asDraft: 'As draft', create: 'Create', created: 'Created pull request #{number}.',
      detached: 'No branch is checked out — a pull request needs one.',
      pushTitle: 'Publish branch?', pushBody: '{branch} is not on {remote} yet. Push it now?', push: 'Push',
      openTitle: 'Pull request created', openBody: 'Open #{number} in the browser?',
    },
    issue: {
      show: 'Show Details', by: 'by {author}', noDescription: 'No description.', comments: 'Comments ({count})',
      assignees: 'Assigned: {names}', commentAction: 'Comment…', commentTitle: 'Comment on #{number}', commentSubmit: 'Comment',
      commented: 'Commented on #{number}.',
      createTitle: 'Create Issue…', title: 'Title', body: 'Description', labels: 'Labels', labelsHint: 'Separated by commas.',
      create: 'Create', created: 'Created issue #{number}.',
      close: 'Close', closeTitle: 'Close issue #{number}?', closeBody: '#{number} will be closed as completed.',
      reopen: 'Reopen', reopenTitle: 'Reopen issue #{number}?', reopenBody: '#{number} will be opened again.',
    },
    run: {
      open: 'Open in Browser', logs: 'Logs in Browser', rerun: 'Re-run', rerunFailed: 'Re-run Failed Jobs',
      restarted: 'Workflow restarted.', cancel: 'Cancel', cancelTitle: 'Cancel workflow?', cancelBody: 'The running workflow will be cancelled.',
      state: { success: 'success', failure: 'failed', cancelled: 'cancelled', skipped: 'skipped', waiting: 'waiting', queued: 'queued', running: 'running' },
    },
    status: { ci: '{name}: {state} on {branch} — click for GitHub Actions' },
  },
}

function lookup(table, key) {
  return key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), table)
}

/** Language code of the interface, reduced to one this extension has texts for. */
function languageOf(ctx) {
  const code = String(ctx.locale?.() ?? 'en').slice(0, 2)
  if (MESSAGES[code]) return code
  return 'en'
}

/** `t(key, params)` in the interface language, with English as the fallback. */
export function createT(ctx) {
  return (key, params = {}) => {
    const text = lookup(MESSAGES[languageOf(ctx)], key) ?? lookup(MESSAGES.en, key) ?? key
    return String(text).replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
  }
}

const UNITS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

/** “3 hours ago” in the interface language. */
export function relativeTime(ctx, time) {
  if (!time) return ''
  const seconds = Math.round((time - Date.now()) / 1000)
  const format = new Intl.RelativeTimeFormat(ctx.locale?.() ?? 'en', { numeric: 'auto' })
  const unit = UNITS.find(([, size]) => Math.abs(seconds) >= size)
  if (!unit) return format.format(0, 'minute')
  return format.format(Math.round(seconds / unit[1]), unit[0])
}

/** For the tests: every key of a language, flattened. */
export function keysOf(language) {
  const out = []
  const walk = (node, prefix) => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key
      if (typeof value === 'string') out.push(path)
      if (typeof value !== 'string') walk(value, path)
    }
  }
  walk(MESSAGES[language] ?? {}, '')
  return out
}
