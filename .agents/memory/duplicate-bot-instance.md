---
name: Duplicate bot instance / zombie VM after publish
description: How to recognize and handle two concurrent bot gateway sessions with the same token (post-publish "merge greu" lag complaints)
---

**Symptom:** right after a publish, users report the bot is laggy/flaky. Prod logs show `40060 Interaction has already been acknowledged` (and some `10062`) thrown by the FIRST `deferUpdate` in handlers at interaction age ~80–200ms, for distinct interaction ids, with NO "Duplicate interaction delivery" warnings from the in-process dedup.

**Diagnosis rule:** that signature = a SECOND bot process (zombie VM from the previous revision, or another deploy) holds a parallel gateway session with the same token. Both processes race to ack every interaction AND both run schedulers against the same DB (double spawns/writes). It is NOT an in-process bug — the module-level `seenInteractionIds` dedup would have logged duplicates.

**Defenses in code (protect future publishes only):**
1. SIGTERM/SIGINT handler in `src/index.ts` destroys the Discord client and exits fast (3s hard deadline) — primary fix; old VM disconnects on redeploy.
2. `bot_instance` marker in `bot_state` (last writer wins): each instance claims a random UUID at ClientReady; a 60s watchdog yields (stops schedulers, destroys client, resolves the supervisor loop, healthz shows `yielded`, ops alert "Instanță duplicată detectată") when a foreign id appears. Claim failure disables the watchdog (fail-open, never wrongly yields).

**How to kill a CURRENT zombie (old code, no guard):** the user must fully stop the deployment in the Publishing pane, wait ~1 min, then Publish again. Republishing alone doesn't kill an orphaned VM.

**Residual risk:** if a zombie's supervisor re-logs-in later, it re-claims the marker and the legitimate instance yields (visible via the ops alert + healthz `yielded`). Fix in that case: restart/republish the deployment.
