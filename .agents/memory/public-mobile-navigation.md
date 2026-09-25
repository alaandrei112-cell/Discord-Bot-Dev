---
name: Public mobile navigation verification
description: Why public navigation needs real click and document-width checks beyond screenshots.
---

Verify mobile navigation by opening the actual menu and clicking its links, not only by asserting that link elements are visible.

**Why:** Browser automation can consider an opacity-hidden link visible even while it cannot receive clicks. Decorative layers can also enlarge the document beyond the viewport without an obvious problem in a static screenshot.

**How to apply:** Test menu open → route change → menu closed, and compare document scroll width with viewport width. Keep these checks when reorganizing the public site, alongside protected-panel regression coverage.