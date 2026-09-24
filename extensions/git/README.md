# Git

Source control with Git, right inside Lumen.

## Contents

- **Source Control** (sidebar): commit message with *Commit*, *Commit & Push*
  and *Amend*; merge conflicts, staged, changed and untracked files with diff,
  stage, unstage and discard, one by one or for the whole group. Running
  merges, rebases and cherry-picks can be continued or aborted.
- **Branches**: local and remote branches with upstream and ↑/↓, tags, stashes
  and remotes: check out, merge, rebase, rename, delete, apply.
- **Git History** (bottom panel): the latest commits with branches and tags;
  a click shows the diff, the context menu offers create branch/tag, checkout,
  cherry-pick, revert and reset.
- **Status bar**: the current branch (with `*` when there are changes) and ↓/↑
  for syncing.
- **Commands** in the command palette (`Git: …`), including history and blame
  of the active file, clone and initialize repository.

The view refreshes on save, when the window gains focus and every few seconds
while you work with it. Optionally it fetches automatically at an interval
(*Settings → Extensions → Git*).

## Requirement

Git must be installed. The extension ships program code, which must be
confirmed on install; it only calls the installed `git`, without a shell and
without interactive prompts.
