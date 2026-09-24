# GitHub

GitHub right inside Lumen, for the repository of the open folder.

## Contents

- **Pull Requests** (right sidebar): open pull requests, filtered by all, your
  own or those with a requested review; check status, labels and drafts.
  Details with description, reviews and changed files, check out locally,
  approve, request changes, comment, merge (merge, squash, rebase) and create
  new pull requests from the current branch, optionally pushing the branch
  first.
- **Issues** (right sidebar): open issues (all, assigned to me, created by me),
  details with comments, commenting, closing, new issues with labels.
- **GitHub Actions** (bottom panel): the latest workflow runs of the current
  branch or all branches: re-run (also only failed jobs), cancel, open in the
  browser.
- **Status bar**: CI status of the latest run on the current branch.
- **Commands**: open the repository or active file in the browser, create a
  pull request or issue, sign in and out.

## Signing in

Either a personal access token (*GitHub: Sign In…* or *Settings → Extensions →
GitHub*), which is stored encrypted in the system keychain, or the sign-in of
the [GitHub CLI](https://cli.github.com) (`gh auth login`). GitHub Enterprise
works with the API address filled in.

The extension ships program code, which must be confirmed on install. It talks
to the GitHub API directly and only calls `git` or `gh` for checking out and
pushing.
