---
name: AOS animation ownership
description: Constraint for the local scroll-reveal animation system.
---

Elements marked with `data-aos` must not also have a separate CSS animation that controls `opacity` or `transform`.

**Why:** A competing animation with `animation-fill-mode: both` can make the element visible immediately and override the scroll-reveal transition, making the requested effect appear absent.

**How to apply:** Let the `data-aos` rule own opacity and transform for reveal elements; use separate animations only on child decorations or properties that do not conflict.