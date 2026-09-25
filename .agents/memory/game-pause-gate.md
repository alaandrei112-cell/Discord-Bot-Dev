---
name: Game pause gate
description: Durable rule for pausing and resuming all guild gameplay safely.
---

Stopping a guild's game must be enforced at two boundaries: scheduled producers must refuse to spawn or settle gameplay, and interaction dispatch must reject existing combat, chest, boss, and reward buttons while paused. Independent gameplay schedulers need their own pause check rather than relying only on the main scheduler. Oracle AI is a separate control plane: `/stopjoc` must not stop Oracle chat, check-ins, or Council votes; only `/stopai` may stop those.

**Why:** Existing timers and already-posted Discord buttons continue to exist after a scheduler is stopped; pausing only the main scheduler lets old interactions or separate systems such as Tribute keep mutating gameplay.

**How to apply:** Any new gameplay producer, timer callback, reward settlement, or interactive handler must check the guild pause state. Keep Oracle's manual enable/disable state independent from gameplay pause, including Oracle chat, `/profetie`, help questions, Council lifecycle, Council buttons, and verification buttons. Administrative start/stop and non-game support flows must remain available while paused.