---
name: Strict Vitest module mocks
description: Vitest module mocks fail at runtime when production code statically imports a newly added named export that the mock does not provide.
---

When extending a module used by scheduler tests, a static named import—or direct property access through a namespace import—can make old partial mocks fail before the feature code runs. Prefer a local compatibility implementation or a lazy optional lookup when the dependency is non-essential to the tested path.

**Why:** Vitest's mocked module proxy throws for missing named exports and for direct access to omitted namespace properties; this appeared while adding the chest scheduler's new button builder and persistent server-meter helper.

**How to apply:** Preserve existing test doubles when adding optional scheduler behavior, and add focused mocks/tests separately for the new path.