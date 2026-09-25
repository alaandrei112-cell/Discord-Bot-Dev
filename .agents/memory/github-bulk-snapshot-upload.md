---
name: GitHub bulk snapshot uploads
description: Upload large workspace snapshots through the Replit GitHub connector when Git CLI authentication is unavailable.
---

When Git CLI push cannot authenticate but the GitHub connector is authorized and has repository write permission, the Git Database API can import a tracked workspace snapshot without exposing credentials.

**Why:** A roughly 680 MiB, 961-file snapshot uploaded successfully as Git blobs, but one large tree request returned HTTP 502. Creating trees sequentially in batches of 50, using each returned tree SHA as the next `base_tree`, succeeded.

For a snapshot repo that is unrelated to the local branch history, first verify that the file trees match, retain the old branch under a backup ref, and create the new working branch from the snapshot commit. Never merge unrelated histories just to connect them.

**Why:** The snapshot commit is the only common starting point available on GitHub. Making it the parent of future changes allows normal fetch/fast-forward behavior without discarding the previous local history.

**How to apply:** Confirm repository ownership, visibility, and write permission first. Upload exact tracked blobs, create tree batches sequentially, create a commit, update the branch ref without force, and verify the final file count. Then fetch the resulting commit and continue on a branch descended from it.