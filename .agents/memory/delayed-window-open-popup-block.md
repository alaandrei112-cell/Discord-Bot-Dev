---
name: Delayed window.open is popup-blocked
description: Why opening a new tab after an animation delay fails, and the synchronous-open workaround.
---

# Delayed `window.open` gets popup-blocked

Calling `window.open(url, "_blank", ...)` inside a `setTimeout` (e.g. after a
click triggers an animation, then opens a link a second later) is treated by
browsers as a non-user-initiated popup and is commonly blocked. The animation
plays but the tab never opens.

**Why:** browsers only allow `window.open` while the call stack is still tied to
a user activation (the click). Once the event handler returns and a timer fires,
that activation is gone.

**How to apply (click → animate → open pattern):**
- Open the tab *synchronously* during the click: `const tab = window.open("about:blank", "_blank")`.
  Do NOT pass `noopener` in the feature string — it makes `window.open` return
  `null`, so you lose the reference. Instead set `tab.opener = null` afterwards
  to mitigate reverse-tabnabbing.
- After the animation delay, navigate it: `tab.location.href = url`.
- Fallback if blocked anyway: `if (!tab || tab.closed) window.location.href = url`.

Used in `artifacts/status` MapPage click-to-zoom (zoom plays ~1.1s, then the
Discord channel opens in the pre-opened tab).
