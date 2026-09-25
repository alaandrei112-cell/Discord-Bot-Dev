---
name: Discord overwrite preservation
description: Safe rules for applying configurable role access to existing Discord categories and channels.
---

When provisioning channel permissions, edit only the specific managed role targets and the ViewChannel, ReadMessageHistory, and SendMessages bits owned by this panel. Preserve other role overwrites and permission bits. When a previously managed role is removed, clear only those three managed bits rather than deleting its entire overwrite.

**Why:** Replacing the overwrite set can silently remove unrelated server access rules, while deleting a whole role overwrite can also erase permissions maintained outside the control panel.

**How to apply:** Any future changes to Discord category/channel ACL provisioning should retain per-target edits, track the previously managed roles, and confirm the affected categories and role-level results before applying.