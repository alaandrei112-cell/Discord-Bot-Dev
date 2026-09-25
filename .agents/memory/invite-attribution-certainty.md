---
name: Invite attribution certainty
description: Rules for accurate per-member join logging from Discord invite-use counts.
---

Discord exposes invite-use deltas, not the exact invite used by each individual member-add event. For a debounced join batch, attribute members only when exactly one invite code changed and its use count increased by the full batch size. Otherwise, keep the member log but label the inviter unknown or ambiguous instead of assigning aggregate counts arbitrarily.

**Why:** Using aggregate counts to guess which specific member used which invite creates false moderation and audit data when joins use different codes at the same time.

**How to apply:** Keep per-member invite logs conservative. Do not use count sorting to assign joiners when multiple codes changed in the same batch; explain uncertainty in the log message.