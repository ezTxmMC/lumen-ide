/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/**
 * The texts of the Git extension in English. The interface
 * language comes from `ctx.locale()`; anything else falls back to English.
 */

const MESSAGES = {
  en: {
    view: { changes: 'Source Control', history: 'History', branches: 'Branches' },
    toolbar: {
      refresh: 'Refresh',
      fetch: 'Fetch',
      pull: 'Pull',
      push: 'Push',
      sync: 'Sync',
      checkout: 'Switch Branch…',
      stash: 'Stash…',
    },
    busy: {
      loading: 'Reading the repository …',
      commit: 'Committing …',
      push: 'Pushing …',
      pull: 'Pulling …',
      fetch: 'Fetching …',
      checkout: 'Switching branch …',
      merge: 'Merging …',
      rebase: 'Rebasing …',
      clone: 'Cloning repository …',
    },
    error: {
      noFolder: 'No folder is open.',
      noRepo: 'This folder is not a Git repository.',
      noGit: 'git was not found ({path}). Install Git or set its path in the settings.',
      timeout: '{command} took too long and was stopped.',
      failed: '{command} failed (code {code}).',
    },
    empty: {
      noFolder: 'No folder open',
      noFolderHint: 'Open a folder to see its changes.',
      noRepo: 'Not a Git repository',
      noRepoHint: 'Create a repository here, or clone one.',
      clean: 'No changes',
      cleanHint: 'Everything on {branch} is committed.',
      noCommits: 'No commits yet',
      noCommitsHint: 'The first commit will appear here.',
    },
    repo: { init: 'Initialize Repository', initialized: 'Git repository created.' },
    clone: {
      title: 'Clone Repository…',
      url: 'URL',
      parent: 'Parent folder',
      parentHint: 'Absolute path of the folder the clone goes into.',
      name: 'Folder name',
      namePlaceholder: 'from the URL',
      submit: 'Clone',
      absolute: 'The parent folder must be an absolute path.',
      done: 'Cloned into {folder}.',
    },
    commit: {
      title: 'Commit',
      message: 'Commit message',
      submit: 'Commit',
      andPush: 'Commit & Push',
      amend: 'Amend',
      placeholder: 'Message (Ctrl+Enter to commit on {branch})',
      amendTitle: 'Amend the last commit?',
      amendBody: 'The last commit is replaced by a new one. If it was pushed already, you will have to force-push.',
      nothing: 'Nothing to commit.',
      stageAllTitle: 'Nothing staged',
      stageAllBody: 'Nothing is staged. Stage and commit all {count} changes?',
      stageAllConfirm: 'Commit All',
      done: 'Committed.',
      amended: 'Commit amended.',
    },
    diff: { staged: 'staged', worktree: 'working tree' },
    discard: {
      title: 'Discard changes?',
      body: '{count} file(s) will be reset to the last commit or deleted. This cannot be undone.',
      confirm: 'Discard',
    },
    file: {
      open: 'Open File',
      diff: 'Show Changes',
      stage: 'Stage',
      unstage: 'Unstage',
      discard: 'Discard Changes',
      delete: 'Delete File',
      markResolved: 'Mark as Resolved',
      history: 'File History',
      conflictCount: '{count} conflict(s)',
      stillConflictedTitle: 'Conflict markers left',
      stillConflictedBody: '{files} still contains conflict markers (<<<<<<<). Stage it as resolved anyway?',
      none: 'No file of the repository is active.',
      noHistory: 'No history for this file.',
      historySuffix: 'history',
      blameSuffix: 'blame',
    },
    group: {
      conflicts: 'Merge Changes',
      staged: 'Staged',
      changes: 'Changes',
      untracked: 'Untracked',
      stageAll: 'Stage All',
      unstageAll: 'Unstage All',
      discardAll: 'Discard All',
      markAllResolved: 'Mark All as Resolved',
      local: 'Local',
      remote: 'Remote',
      tags: 'Tags',
      stashes: 'Stashes',
      remotes: 'Remotes',
    },
    kind: {
      modified: 'modified',
      added: 'added',
      deleted: 'deleted',
      renamed: 'renamed',
      untracked: 'untracked',
      conflict: 'conflict',
      bothDeleted: 'conflict: deleted by both',
      addedByUs: 'conflict: added by us',
      deletedByThem: 'conflict: deleted by them',
      addedByThem: 'conflict: added by them',
      deletedByUs: 'conflict: deleted by us',
      bothAdded: 'conflict: added by both',
      bothModified: 'conflict: modified by both',
    },
    operation: {
      merge: 'A merge is in progress. Resolve the conflicts, stage them and continue.',
      rebase: 'A rebase is in progress. Resolve the conflicts, stage them and continue.',
      cherryPick: 'A cherry-pick is in progress.',
      revert: 'A revert is in progress.',
      continue: 'Continue',
      abort: 'Abort',
      abortTitle: 'Abort the operation?',
      abortBody: 'The state before the operation is restored.',
      unresolved: '{count} conflicts are still unresolved.',
    },
    push: {
      detached: 'No branch is checked out (detached HEAD) — nothing to push.',
      noRemote: 'No remote is set up.',
      pickRemote: 'Choose a remote',
      publishTitle: 'Publish branch?',
      publishBody: '{branch} has no upstream yet. Push it to {remote} and track it?',
      publish: 'Publish',
      forceTitle: 'Force push?',
      forceBody: 'The history of {branch} on the server will be overwritten (--force-with-lease).',
      force: 'Force Push',
      done: 'Pushed {branch}.',
    },
    pull: { noUpstream: 'The branch has no upstream.', done: 'Pull finished.' },
    fetch: { done: 'Fetch finished.' },
    branch: {
      none: 'no branch',
      current: 'current',
      checkout: 'Checkout',
      checkoutTitle: 'Switch branch',
      checkoutPlaceholder: 'Search branches …',
      createItem: '+ New branch…',
      remoteDetail: 'remote branch',
      createTitle: 'New Branch',
      name: 'Name',
      from: 'Start point',
      checkoutAfter: 'Check it out',
      create: 'Create',
      invalidName: '“{name}” is not a valid branch name.',
      noOther: 'There is no other branch.',
      mergeTitle: 'Merge into {branch}',
      mergeInto: 'Merge into Current Branch',
      merged: 'Merged {branch}.',
      rebaseTitle: 'Rebase {branch} onto',
      rebaseOnto: 'Rebase Current Branch onto This',
      rebased: 'Rebased onto {branch}.',
      createFrom: 'Create Branch from Here…',
      rename: 'Rename…',
      renameTitle: 'Rename {branch}',
      newName: 'New name',
      delete: 'Delete',
      deleteTitle: 'Delete branch?',
      deleteBody: 'Delete branch {branch}?',
      forceDeleteTitle: 'Not merged',
      forceDeleteBody: '{branch} is not fully merged. Delete it anyway? Its commits will be lost.',
      forceDelete: 'Delete Anyway',
      gone: 'upstream gone',
      noUpstream: 'no upstream',
    },
    tag: {
      createTitle: 'New Tag',
      name: 'Name',
      message: 'Message',
      messageHint: 'With a message an annotated tag is created.',
      create: 'Create',
      delete: 'Delete Tag',
      deleteTitle: 'Delete tag?',
      deleteBody: 'Delete tag {tag} locally?',
      push: 'Push Tag',
    },
    stash: {
      title: 'Stash',
      message: 'Message',
      messagePlaceholder: 'optional',
      includeUntracked: 'Include untracked files',
      submit: 'Stash',
      done: 'Changes stashed.',
      show: 'Show',
      apply: 'Apply',
      pop: 'Pop',
      drop: 'Drop',
      dropTitle: 'Drop stash?',
      dropBody: 'Drop {stash} for good?',
    },
    history: {
      show: 'Show Commit',
      branchHere: 'Create Branch Here…',
      tagHere: 'Create Tag Here…',
      checkout: 'Checkout (Detached)',
      cherryPick: 'Cherry-Pick',
      revert: 'Revert',
      resetSoft: 'Reset (Soft) to Here',
      resetMixed: 'Reset (Mixed) to Here',
      resetHard: 'Reset (Hard) to Here',
      reset: 'Reset',
      resetTitle: 'Reset --{mode}?',
      resetBody: '{branch} will point at {hash}; the changes stay in the working tree.',
      resetHardBody: '{branch} will point at {hash}. All uncommitted changes will be lost!',
      checkoutTitle: 'Check out commit?',
      checkoutBody: '{hash} will be checked out without a branch (detached HEAD).',
      more: 'Load More',
    },
    ref: { head: 'HEAD', branch: 'branch', remote: 'remote', tag: 'tag' },
    status: {
      branchTooltip: 'Branch {branch} — click to switch',
      detached: 'Detached HEAD at {branch}',
      publishTooltip: 'Publish branch',
      syncTooltip: '{upstream}: {ahead} ahead, {behind} behind — click to sync',
    },
  },
};

function lookup(table, key) {
  return key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), table);
}

/** Language code of the interface, reduced to one this extension has texts for. */
function languageOf(ctx) {
  const code = String(ctx.locale?.() ?? 'en').slice(0, 2);
  if (MESSAGES[code]) {
    return code;
  }
  return 'en';
}

/** `t(key, params)` in the interface language, with English as the fallback. */
export function createT(ctx) {
  return (key, params = {}) => {
    const text = lookup(MESSAGES[languageOf(ctx)], key) ?? lookup(MESSAGES.en, key) ?? key;
    return String(text).replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
  };
}

const UNITS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** “3 hours ago” in the interface language. */
export function relativeTime(ctx, time) {
  if (!time) {
    return '';
  }
  const seconds = Math.round((time - Date.now()) / 1000);
  const format = new Intl.RelativeTimeFormat(ctx.locale?.() ?? 'en', { numeric: 'auto' });
  const unit = UNITS.find(([, size]) => Math.abs(seconds) >= size);
  if (!unit) {
    return format.format(0, 'minute');
  }
  return format.format(Math.round(seconds / unit[1]), unit[0]);
}

/** For the tests: every key of a language, flattened. */
export function keysOf(language) {
  const out = [];
  const walk = (node, prefix) => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'string') {
        out.push(path);
      }
      if (typeof value !== 'string') {
        walk(value, path);
      }
    }
  };
  walk(MESSAGES[language] ?? {}, '');
  return out;
}
