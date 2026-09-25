# Keeping Replit and GitHub in sync

The canonical repository is [alaandrei112-cell/Discord-Bot-Dev](https://github.com/alaandrei112-cell/Discord-Bot-Dev), on `main`. In this workspace it is available as the `github-snapshot` remote, and the `github-sync` branch tracks `github-snapshot/main`.

## Why the old branch is not merged

The repository on GitHub was created from a file snapshot, so it does not share commit history with the older Replit branch. The old branch is retained locally as `archive/replit-legacy-history`. Do not merge the old branch into `main` with `--allow-unrelated-histories`, force-push it, or use the old `origin` as the sync target.

## Bring GitHub changes into Replit

Commit the GitHub edit to `main`, then run:

```sh
git fetch github-snapshot main
git pull --ff-only github-snapshot main
```

The fast-forward-only pull either brings in the GitHub commit or stops without overwriting local commits. Commit or stash uncommitted Replit work first. If the pull stops because both sides have commits, preserve the local commit and reconcile it with the fetched `github-snapshot/main`; do not reset or force-push.

## Publish Replit changes to GitHub

Git CLI pushes are not authenticated in this workspace. Do not add a token to a remote URL, credential file, script, or repository file. Ask Replit Agent to publish the committed Replit changes using the connected GitHub integration. The safe publish sequence is:

1. Read the current `main` commit and use it as the new commit's parent.
2. Apply only the intended changed paths on top of that commit; do not replace the branch with an unrelated workspace history or blindly upload a stale full snapshot.
3. Update `main` without force. If its head moved, fetch the new head and reconcile before retrying.
4. Fetch `github-snapshot/main` and verify the published tree. If it exactly matches the workspace, align the local branch to the fetched commit with `git reset --mixed github-snapshot/main`; this changes the branch and index, not the files on disk. Keep any local commits that were not included under a backup branch before moving the branch. If the trees differ, do not reset—preserve and reconcile the remaining local work first.

For simultaneous edits to the same file, stop and resolve the file-level conflict explicitly. Keep the GitHub integration responsible for authentication; its credentials must never be copied into project files or chat.