---
name: Discord mobile embed layout
description: Why compact multiline values work better than desktop-style inline fields and block charts in Discord reports.
---

Use a small number of embed fields with compact multiline values for mobile-facing reports. Avoid fixed-width Unicode or code-block bar charts; use plain dates, counts, and ranked lists. Keep the web preview shaped like the mobile Discord result.

**Why:** On Android Discord, six inline metric fields stacked as separate name/value pairs and consumed most of the screen. The Unicode bars in code fences rendered as large white blocks. A desktop-style preview did not reveal either problem.

**How to apply:** When designing or changing Discord reports, group related metrics into field values, leave field names as plain text, and check narrow-screen wrapping. Keep each field value within Discord's 1024-character limit.