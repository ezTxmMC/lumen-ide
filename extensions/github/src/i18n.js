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
 * The texts of the GitHub extension in English. The interface
 * language comes from `ctx.locale()`; anything else falls back to English.
 */

const MESSAGES = {
  en: {
    view: { pulls: 'Pull Requests', issues: 'Issues', runs: 'GitHub Actions' },
    busy: { loading: 'Loading from GitHub …' },
    action: { refresh: 'Refresh', retry: 'Try Again', openInBrowser: 'Open in Browser', openRepo: 'Open Repository in Browser' },
    error: {
      network: 'GitHub cannot be reached: {message}',
      timeout: 'timed out',
      rateLimit: "GitHub's rate limit is reached — possible again from {time}.",
      noRepo: 'This folder does not belong to a GitHub repository.',
      noFile: 'No file of the repository is active.',
    },
    empty: {
      noFolder: 'No folder open',
      noFolderHint: 'Open a folder that holds a GitHub repository.',
      noRepo: 'Not a Git repository',
      noRepoHint: 'The open folder is not a Git repository.',
      noGitHub: 'No GitHub remote',
      noGitHubHint: 'None of the remotes points at GitHub. For GitHub Enterprise, enter the API address in the settings.',
      signIn: 'Not signed in',
      signInHint: 'Sign in with a personal access token — or with “gh auth login” when the GitHub CLI is installed.',
      authFailed: 'Sign-in rejected',
      rateLimit: 'Rate limit reached',
      error: 'GitHub reported an error',
      noPulls: 'No open pull requests',
      noIssues: 'No open issues',
      noRuns: 'No workflow runs',
    },
    auth: {
      title: 'Sign in to GitHub',
      token: 'Personal access token',
      tokenHint:
        'Needs the “repo” and “workflow” scopes (or, for fine-grained tokens, read and write access to pull requests, issues and actions).',
      description: "Create a token at {url}. It is stored encrypted in the system's key store.",
      submit: 'Sign In',
      invalid: 'The token was rejected: {message}',
      signedIn: 'Signed in as {login}.',
      signOut: 'Sign Out',
      signOutTitle: 'Sign out of GitHub?',
      signOutBody: 'The stored token is deleted. A GitHub CLI login stays as it is.',
      signedOut: 'Signed out.',
      as: 'signed in as {login}',
    },
    filter: {
      label: 'Filter',
      allPulls: 'All open pull requests',
      minePulls: 'Created by me',
      reviewRequested: 'Review requested from me',
      allIssues: 'All open issues',
      assigned: 'Assigned to me',
      created: 'Created by me',
      currentBranch: 'Branch {branch}',
      allRuns: 'All branches',
    },
    checks: { success: 'Checks passed', failure: 'Checks failed', pending: 'Checks running', none: 'No checks' },
    pull: {
      show: 'Show Details',
      checkout: 'Check Out Locally',
      checkoutTitle: 'Check out pull request #{number}?',
      checkoutBody: 'The state of #{number} is checked out as a local branch.',
      checkedOut: 'Checked out pull request #{number}.',
      by: 'by {author}',
      draft: 'draft',
      noDescription: 'No description.',
      reviews: 'Reviews',
      noReviews: 'No reviews yet.',
      files: 'Changed files ({count})',
      approve: 'Approve…',
      requestChanges: 'Request Changes…',
      commentAction: 'Comment…',
      approveTitle: 'Approve #{number}',
      requestChangesTitle: 'Request changes on #{number}',
      commentTitle: 'Comment on #{number}',
      comment: 'Comment',
      reviewed: 'Review of #{number} submitted.',
      merge: 'Merge…',
      mergeTitle: 'Merge pull request #{number}',
      mergeBody: '#{number} will be merged into its base branch using “{method}”.',
      mergeMethod: 'Method',
      methodMerge: 'Merge commit',
      methodSquash: 'Squash',
      methodRebase: 'Rebase',
      merged: 'Merged pull request #{number}.',
      createTitle: 'Create Pull Request…',
      createDescription: 'From the current branch {branch}.',
      title: 'Title',
      body: 'Description',
      base: 'Base branch',
      asDraft: 'As draft',
      create: 'Create',
      created: 'Created pull request #{number}.',
      detached: 'No branch is checked out — a pull request needs one.',
      pushTitle: 'Publish branch?',
      pushBody: '{branch} is not on {remote} yet. Push it now?',
      push: 'Push',
      openTitle: 'Pull request created',
      openBody: 'Open #{number} in the browser?',
    },
    issue: {
      show: 'Show Details',
      by: 'by {author}',
      noDescription: 'No description.',
      comments: 'Comments ({count})',
      assignees: 'Assigned: {names}',
      commentAction: 'Comment…',
      commentTitle: 'Comment on #{number}',
      commentSubmit: 'Comment',
      commented: 'Commented on #{number}.',
      createTitle: 'Create Issue…',
      title: 'Title',
      body: 'Description',
      labels: 'Labels',
      labelsHint: 'Separated by commas.',
      create: 'Create',
      created: 'Created issue #{number}.',
      close: 'Close',
      closeTitle: 'Close issue #{number}?',
      closeBody: '#{number} will be closed as completed.',
      reopen: 'Reopen',
      reopenTitle: 'Reopen issue #{number}?',
      reopenBody: '#{number} will be opened again.',
    },
    run: {
      open: 'Open in Browser',
      logs: 'Logs in Browser',
      rerun: 'Re-run',
      rerunFailed: 'Re-run Failed Jobs',
      restarted: 'Workflow restarted.',
      cancel: 'Cancel',
      cancelTitle: 'Cancel workflow?',
      cancelBody: 'The running workflow will be cancelled.',
      state: {
        success: 'success',
        failure: 'failed',
        cancelled: 'cancelled',
        skipped: 'skipped',
        waiting: 'waiting',
        queued: 'queued',
        running: 'running',
      },
    },
    status: { ci: '{name}: {state} on {branch} — click for GitHub Actions' },
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
