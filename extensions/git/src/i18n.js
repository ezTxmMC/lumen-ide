/**
 * The texts of the Git extension in German and English. The interface
 * language comes from `ctx.locale()`; anything else falls back to English.
 */

const MESSAGES = {
  de: {
    view: { changes: 'Quellcodeverwaltung', history: 'Verlauf', branches: 'Branches' },
    toolbar: {
      refresh: 'Aktualisieren', fetch: 'Abrufen (fetch)', pull: 'Pull', push: 'Push', sync: 'Synchronisieren',
      checkout: 'Branch wechseln…', stash: 'Stash anlegen…',
    },
    busy: {
      loading: 'Repository wird gelesen …', commit: 'Commit läuft …', push: 'Push läuft …', pull: 'Pull läuft …',
      fetch: 'Fetch läuft …', checkout: 'Wechsle Branch …', merge: 'Merge läuft …', rebase: 'Rebase läuft …',
      clone: 'Klone Repository …',
    },
    error: {
      noFolder: 'Kein Ordner geöffnet.', noRepo: 'Der Ordner ist kein Git-Repository.',
      noGit: 'git wurde nicht gefunden ({path}). Installiere Git oder setze den Pfad in den Einstellungen.',
      timeout: '{command} hat zu lange gebraucht und wurde abgebrochen.',
      failed: '{command} ist fehlgeschlagen (Code {code}).',
    },
    empty: {
      noFolder: 'Kein Ordner geöffnet', noFolderHint: 'Öffne einen Ordner, um seine Änderungen zu sehen.',
      noRepo: 'Kein Git-Repository', noRepoHint: 'Lege hier ein Repository an oder klone eines.',
      clean: 'Keine Änderungen', cleanHint: 'Alles auf {branch} ist committet.',
      noCommits: 'Noch keine Commits', noCommitsHint: 'Der erste Commit erscheint hier.',
    },
    repo: { init: 'Repository anlegen', initialized: 'Git-Repository angelegt.' },
    clone: {
      title: 'Repository klonen…', url: 'Adresse', parent: 'Zielordner', parentHint: 'Absoluter Pfad des Ordners, in dem der Klon angelegt wird.',
      name: 'Ordnername', namePlaceholder: 'aus der Adresse', submit: 'Klonen',
      absolute: 'Der Zielordner muss ein absoluter Pfad sein.', done: 'Geklont nach {folder}.',
    },
    commit: {
      title: 'Commit', message: 'Commit-Nachricht', submit: 'Commit', andPush: 'Commit & Push', amend: 'Amend',
      placeholder: 'Nachricht (Strg+Enter für Commit auf {branch})',
      amendTitle: 'Letzten Commit ändern?', amendBody: 'Der letzte Commit wird durch einen neuen ersetzt. Ist er schon gepusht, ist danach ein Force-Push nötig.',
      nothing: 'Nichts zu committen.',
      stageAllTitle: 'Nichts vorgemerkt', stageAllBody: 'Es ist nichts vorgemerkt. Alle {count} Änderungen vormerken und committen?',
      stageAllConfirm: 'Alle committen', done: 'Commit angelegt.', amended: 'Commit geändert.',
    },
    diff: { staged: 'vorgemerkt', worktree: 'Arbeitskopie' },
    discard: {
      title: 'Änderungen verwerfen?', body: '{count} Datei(en) werden auf den letzten Commit zurückgesetzt bzw. gelöscht. Das lässt sich nicht rückgängig machen.',
      confirm: 'Verwerfen',
    },
    file: {
      open: 'Datei öffnen', diff: 'Änderungen anzeigen', stage: 'Vormerken', unstage: 'Nicht mehr vormerken',
      discard: 'Änderungen verwerfen', delete: 'Datei löschen', markResolved: 'Als gelöst markieren', history: 'Dateiverlauf',
      conflictCount: '{count} Konflikt(e)',
      stillConflictedTitle: 'Noch Konfliktmarker',
      stillConflictedBody: '{files} enthält noch Konfliktmarker (<<<<<<<). Trotzdem als gelöst vormerken?',
      none: 'Keine Datei aus dem Repository aktiv.', noHistory: 'Kein Verlauf für diese Datei.',
      historySuffix: 'Verlauf', blameSuffix: 'Blame',
    },
    group: {
      conflicts: 'Merge-Änderungen', staged: 'Vorgemerkt', changes: 'Änderungen', untracked: 'Nicht verfolgt',
      stageAll: 'Alle vormerken', unstageAll: 'Alle zurücknehmen', discardAll: 'Alle verwerfen', markAllResolved: 'Alle als gelöst markieren',
      local: 'Lokal', remote: 'Remote', tags: 'Tags', stashes: 'Stashes', remotes: 'Remotes',
    },
    kind: {
      modified: 'geändert', added: 'hinzugefügt', deleted: 'gelöscht', renamed: 'umbenannt', untracked: 'nicht verfolgt',
      conflict: 'Konflikt', bothDeleted: 'Konflikt: beidseitig gelöscht', addedByUs: 'Konflikt: von uns hinzugefügt',
      deletedByThem: 'Konflikt: von ihnen gelöscht', addedByThem: 'Konflikt: von ihnen hinzugefügt',
      deletedByUs: 'Konflikt: von uns gelöscht', bothAdded: 'Konflikt: beidseitig hinzugefügt', bothModified: 'Konflikt: beidseitig geändert',
    },
    operation: {
      merge: 'Ein Merge läuft. Löse die Konflikte, merke sie vor und setze fort.',
      rebase: 'Ein Rebase läuft. Löse die Konflikte, merke sie vor und setze fort.',
      cherryPick: 'Ein Cherry-Pick läuft.', revert: 'Ein Revert läuft.',
      continue: 'Fortsetzen', abort: 'Abbrechen',
      abortTitle: 'Vorgang abbrechen?', abortBody: 'Der Stand vor dem Vorgang wird wiederhergestellt.',
      unresolved: 'Noch {count} ungelöste Konflikte.',
    },
    push: {
      detached: 'Kein Branch ausgecheckt (detached HEAD) — nichts zu pushen.', noRemote: 'Kein Remote eingerichtet.',
      pickRemote: 'Remote wählen', publishTitle: 'Branch veröffentlichen?', publishBody: '{branch} hat noch keinen Upstream. Nach {remote} pushen und verknüpfen?',
      publish: 'Veröffentlichen', forceTitle: 'Force-Push?', forceBody: 'Die Historie von {branch} auf dem Server wird überschrieben (--force-with-lease).',
      force: 'Force-Push', done: '{branch} gepusht.',
    },
    pull: { noUpstream: 'Der Branch hat keinen Upstream.', done: 'Pull abgeschlossen.' },
    fetch: { done: 'Fetch abgeschlossen.' },
    branch: {
      none: 'kein Branch', current: 'aktuell', checkout: 'Auschecken', checkoutTitle: 'Branch wechseln',
      checkoutPlaceholder: 'Branch suchen …', createItem: '+ Neuer Branch…', remoteDetail: 'Remote-Branch',
      createTitle: 'Neuer Branch', name: 'Name', from: 'Ausgangspunkt', checkoutAfter: 'Danach auschecken', create: 'Anlegen',
      invalidName: '„{name}“ ist kein gültiger Branch-Name.', noOther: 'Kein anderer Branch vorhanden.',
      mergeTitle: 'In {branch} mergen', mergeInto: 'In aktuellen Branch mergen', merged: '{branch} gemergt.',
      rebaseTitle: '{branch} rebasen auf', rebaseOnto: 'Aktuellen Branch darauf rebasen', rebased: 'Auf {branch} rebased.',
      createFrom: 'Branch von hier anlegen…', rename: 'Umbenennen…', renameTitle: '{branch} umbenennen', newName: 'Neuer Name',
      delete: 'Löschen', deleteTitle: 'Branch löschen?', deleteBody: 'Branch {branch} löschen?',
      forceDeleteTitle: 'Nicht gemergt', forceDeleteBody: '{branch} ist nicht vollständig gemergt. Trotzdem löschen? Die Commits gehen verloren.',
      forceDelete: 'Trotzdem löschen', gone: 'Upstream gelöscht', noUpstream: 'kein Upstream',
    },
    tag: {
      createTitle: 'Neuer Tag', name: 'Name', message: 'Nachricht', messageHint: 'Mit Nachricht wird ein annotierter Tag angelegt.',
      create: 'Anlegen', delete: 'Tag löschen', deleteTitle: 'Tag löschen?', deleteBody: 'Tag {tag} lokal löschen?', push: 'Tag pushen',
    },
    stash: {
      title: 'Stash anlegen', message: 'Nachricht', messagePlaceholder: 'optional', includeUntracked: 'Nicht verfolgte Dateien einbeziehen',
      submit: 'Stash anlegen', done: 'Änderungen gestasht.', show: 'Anzeigen', apply: 'Anwenden', pop: 'Anwenden und entfernen',
      drop: 'Verwerfen', dropTitle: 'Stash verwerfen?', dropBody: '{stash} endgültig verwerfen?',
    },
    history: {
      show: 'Commit anzeigen', branchHere: 'Branch hier anlegen…', tagHere: 'Tag hier anlegen…', checkout: 'Auschecken (detached)',
      cherryPick: 'Cherry-Pick', revert: 'Revert', resetSoft: 'Reset (soft) hierher', resetMixed: 'Reset (mixed) hierher',
      resetHard: 'Reset (hard) hierher', reset: 'Zurücksetzen', resetTitle: 'Reset --{mode}?',
      resetBody: '{branch} wird auf {hash} gesetzt; die Änderungen bleiben in der Arbeitskopie.',
      resetHardBody: '{branch} wird auf {hash} gesetzt. Alle nicht committeten Änderungen gehen verloren!',
      checkoutTitle: 'Commit auschecken?', checkoutBody: '{hash} wird ohne Branch ausgecheckt (detached HEAD).',
      more: 'Mehr laden',
    },
    ref: { head: 'HEAD', branch: 'Branch', remote: 'Remote', tag: 'Tag' },
    status: {
      branchTooltip: 'Branch {branch} — klicken zum Wechseln', detached: 'Detached HEAD bei {branch}',
      publishTooltip: 'Branch veröffentlichen', syncTooltip: '{upstream}: {ahead} voraus, {behind} zurück — klicken zum Synchronisieren',
    },
  },
  en: {
    view: { changes: 'Source Control', history: 'History', branches: 'Branches' },
    toolbar: {
      refresh: 'Refresh', fetch: 'Fetch', pull: 'Pull', push: 'Push', sync: 'Sync',
      checkout: 'Switch Branch…', stash: 'Stash…',
    },
    busy: {
      loading: 'Reading the repository …', commit: 'Committing …', push: 'Pushing …', pull: 'Pulling …',
      fetch: 'Fetching …', checkout: 'Switching branch …', merge: 'Merging …', rebase: 'Rebasing …',
      clone: 'Cloning repository …',
    },
    error: {
      noFolder: 'No folder is open.', noRepo: 'This folder is not a Git repository.',
      noGit: 'git was not found ({path}). Install Git or set its path in the settings.',
      timeout: '{command} took too long and was stopped.',
      failed: '{command} failed (code {code}).',
    },
    empty: {
      noFolder: 'No folder open', noFolderHint: 'Open a folder to see its changes.',
      noRepo: 'Not a Git repository', noRepoHint: 'Create a repository here, or clone one.',
      clean: 'No changes', cleanHint: 'Everything on {branch} is committed.',
      noCommits: 'No commits yet', noCommitsHint: 'The first commit will appear here.',
    },
    repo: { init: 'Initialize Repository', initialized: 'Git repository created.' },
    clone: {
      title: 'Clone Repository…', url: 'URL', parent: 'Parent folder', parentHint: 'Absolute path of the folder the clone goes into.',
      name: 'Folder name', namePlaceholder: 'from the URL', submit: 'Clone',
      absolute: 'The parent folder must be an absolute path.', done: 'Cloned into {folder}.',
    },
    commit: {
      title: 'Commit', message: 'Commit message', submit: 'Commit', andPush: 'Commit & Push', amend: 'Amend',
      placeholder: 'Message (Ctrl+Enter to commit on {branch})',
      amendTitle: 'Amend the last commit?', amendBody: 'The last commit is replaced by a new one. If it was pushed already, you will have to force-push.',
      nothing: 'Nothing to commit.',
      stageAllTitle: 'Nothing staged', stageAllBody: 'Nothing is staged. Stage and commit all {count} changes?',
      stageAllConfirm: 'Commit All', done: 'Committed.', amended: 'Commit amended.',
    },
    diff: { staged: 'staged', worktree: 'working tree' },
    discard: {
      title: 'Discard changes?', body: '{count} file(s) will be reset to the last commit or deleted. This cannot be undone.',
      confirm: 'Discard',
    },
    file: {
      open: 'Open File', diff: 'Show Changes', stage: 'Stage', unstage: 'Unstage',
      discard: 'Discard Changes', delete: 'Delete File', markResolved: 'Mark as Resolved', history: 'File History',
      conflictCount: '{count} conflict(s)',
      stillConflictedTitle: 'Conflict markers left',
      stillConflictedBody: '{files} still contains conflict markers (<<<<<<<). Stage it as resolved anyway?',
      none: 'No file of the repository is active.', noHistory: 'No history for this file.',
      historySuffix: 'history', blameSuffix: 'blame',
    },
    group: {
      conflicts: 'Merge Changes', staged: 'Staged', changes: 'Changes', untracked: 'Untracked',
      stageAll: 'Stage All', unstageAll: 'Unstage All', discardAll: 'Discard All', markAllResolved: 'Mark All as Resolved',
      local: 'Local', remote: 'Remote', tags: 'Tags', stashes: 'Stashes', remotes: 'Remotes',
    },
    kind: {
      modified: 'modified', added: 'added', deleted: 'deleted', renamed: 'renamed', untracked: 'untracked',
      conflict: 'conflict', bothDeleted: 'conflict: deleted by both', addedByUs: 'conflict: added by us',
      deletedByThem: 'conflict: deleted by them', addedByThem: 'conflict: added by them',
      deletedByUs: 'conflict: deleted by us', bothAdded: 'conflict: added by both', bothModified: 'conflict: modified by both',
    },
    operation: {
      merge: 'A merge is in progress. Resolve the conflicts, stage them and continue.',
      rebase: 'A rebase is in progress. Resolve the conflicts, stage them and continue.',
      cherryPick: 'A cherry-pick is in progress.', revert: 'A revert is in progress.',
      continue: 'Continue', abort: 'Abort',
      abortTitle: 'Abort the operation?', abortBody: 'The state before the operation is restored.',
      unresolved: '{count} conflicts are still unresolved.',
    },
    push: {
      detached: 'No branch is checked out (detached HEAD) — nothing to push.', noRemote: 'No remote is set up.',
      pickRemote: 'Choose a remote', publishTitle: 'Publish branch?', publishBody: '{branch} has no upstream yet. Push it to {remote} and track it?',
      publish: 'Publish', forceTitle: 'Force push?', forceBody: 'The history of {branch} on the server will be overwritten (--force-with-lease).',
      force: 'Force Push', done: 'Pushed {branch}.',
    },
    pull: { noUpstream: 'The branch has no upstream.', done: 'Pull finished.' },
    fetch: { done: 'Fetch finished.' },
    branch: {
      none: 'no branch', current: 'current', checkout: 'Checkout', checkoutTitle: 'Switch branch',
      checkoutPlaceholder: 'Search branches …', createItem: '+ New branch…', remoteDetail: 'remote branch',
      createTitle: 'New Branch', name: 'Name', from: 'Start point', checkoutAfter: 'Check it out', create: 'Create',
      invalidName: '“{name}” is not a valid branch name.', noOther: 'There is no other branch.',
      mergeTitle: 'Merge into {branch}', mergeInto: 'Merge into Current Branch', merged: 'Merged {branch}.',
      rebaseTitle: 'Rebase {branch} onto', rebaseOnto: 'Rebase Current Branch onto This', rebased: 'Rebased onto {branch}.',
      createFrom: 'Create Branch from Here…', rename: 'Rename…', renameTitle: 'Rename {branch}', newName: 'New name',
      delete: 'Delete', deleteTitle: 'Delete branch?', deleteBody: 'Delete branch {branch}?',
      forceDeleteTitle: 'Not merged', forceDeleteBody: '{branch} is not fully merged. Delete it anyway? Its commits will be lost.',
      forceDelete: 'Delete Anyway', gone: 'upstream gone', noUpstream: 'no upstream',
    },
    tag: {
      createTitle: 'New Tag', name: 'Name', message: 'Message', messageHint: 'With a message an annotated tag is created.',
      create: 'Create', delete: 'Delete Tag', deleteTitle: 'Delete tag?', deleteBody: 'Delete tag {tag} locally?', push: 'Push Tag',
    },
    stash: {
      title: 'Stash', message: 'Message', messagePlaceholder: 'optional', includeUntracked: 'Include untracked files',
      submit: 'Stash', done: 'Changes stashed.', show: 'Show', apply: 'Apply', pop: 'Pop',
      drop: 'Drop', dropTitle: 'Drop stash?', dropBody: 'Drop {stash} for good?',
    },
    history: {
      show: 'Show Commit', branchHere: 'Create Branch Here…', tagHere: 'Create Tag Here…', checkout: 'Checkout (Detached)',
      cherryPick: 'Cherry-Pick', revert: 'Revert', resetSoft: 'Reset (Soft) to Here', resetMixed: 'Reset (Mixed) to Here',
      resetHard: 'Reset (Hard) to Here', reset: 'Reset', resetTitle: 'Reset --{mode}?',
      resetBody: '{branch} will point at {hash}; the changes stay in the working tree.',
      resetHardBody: '{branch} will point at {hash}. All uncommitted changes will be lost!',
      checkoutTitle: 'Check out commit?', checkoutBody: '{hash} will be checked out without a branch (detached HEAD).',
      more: 'Load More',
    },
    ref: { head: 'HEAD', branch: 'branch', remote: 'remote', tag: 'tag' },
    status: {
      branchTooltip: 'Branch {branch} — click to switch', detached: 'Detached HEAD at {branch}',
      publishTooltip: 'Publish branch', syncTooltip: '{upstream}: {ahead} ahead, {behind} behind — click to sync',
    },
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
