---
name: Oracle relationship bounds
description: The intended long-term behavior of the Oracle relationship score.
---

## Rule
The Oracle relationship has no lower bound: repeated hostile interactions may move it below any previous negative threshold. The positive side remains capped at `+100`.

**Why:** The user wants sustained hostility to keep worsening the relationship and make the Oracle increasingly aggressive, rather than stopping at an arbitrary minimum.

**How to apply:** Keep negative title thresholds (`-4` and `-10`) and tone escalation active, but never reintroduce a lower clamp; use `+100` as the positive persistence cap.