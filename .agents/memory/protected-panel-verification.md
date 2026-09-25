---
name: Protected panel verification
description: Why moderation verification must exercise authenticated navigation and multi-guild state.
---

A screenshot of the login gate is not verification of the administration panel behind it. Exercise real navigation, shared server selection, configuration saving, and command submission in browser tests with test-only network fixtures.

**Why:** Login screenshots and shape-only tests passed while nested links led to unfinished-page fallbacks and individual forms retained a different guild from the visible selector.

**How to apply:** Use two guilds in a test-only authenticated session and click the actual menu links. Check request guild IDs and persisted values after switching and reloading. Keep these fixtures in the test harness; never add a shipped authentication bypass or perform test sanctions on a live community.

Visual redesign checks must wait for the real page controls, not just navigation or network idle, before taking a fixture screenshot.

**Why:** An authenticated Bot Control capture showed only a spinner because its API was not mocked; that capture provided no evidence about the edited layout.

**How to apply:** Supply complete, contract-correct fixture responses and assert the expected editor is visible. Treat a loading-only screenshot as blocked verification, not a successful visual check.

Mocked browser persistence does not prove that the real database accepts repeated saves.

**Why:** A successful mocked PUT concealed an SQL write that inserted the first configuration but could never update an existing one. This led to wrongly treating a real persistence complaint as a missing Save click.

**How to apply:** Pair browser save/reload checks with real PostgreSQL tests of first, repeated, and stale-version writes using isolated temporary tables. Do not infer user error from an unsaved indicator alone; failed saves leave the same indicator visible.