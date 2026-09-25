---
name: Discord ticket modal flow
description: Why staff applications use two ordered modal pages and lock their public contract button.
---

Staff applications use a public contract button that opens a five-field first modal page. After it is submitted, a continuation button opens the second page containing the final three fields.

**Why:** Discord modals allow at most five text-input rows, so all eight staff questions cannot be displayed in one native modal. Two fixed pages show every answer field without letting users choose or skip questions.

**How to apply:** “Deschide contractul” opens questions 1–5 together; after submission, “Continuă aplicația” opens questions 6–8 together. The public contract explains the two-page flow without duplicating the question list. Staff asks name without timezone and ends with tag acceptance; a clear refusal posts automatic rejection.
On bot reconnect, active ticket panels are refreshed without overwriting completed or rejected contracts.
When the second staff page is submitted, the first response message is edited into one complete embed and its continuation button is removed.
Completion also posts a deterministic in-character Oracle review and explicitly mentions the configured staff-review role; modal submission does not rely on the normal message-based Oracle trigger.
After completion or rejection, replace the public start button with a disabled status button so the contract cannot be restarted in the same ticket.
For one-question-at-a-time flows (including custom flows), send the next-step button on the channel answer message, persist its message ID, and validate the clicking applicant, current step, and exact message/button before opening the next modal. Ephemeral deferred modal replies should be deleted best-effort on success; they are not durable navigation. Keep all configured answers in private summaries regardless of public-posting selections; split long answers into continuation fields and long summaries across messages within Discord embed limits, attaching action buttons only to the final message. Incomplete-ticket timers must query persisted progress by channel after reconnect: in-memory state and scanning only the latest 100 messages can miss a completed keep-open ticket. Discord permissionOverwrites.cache is a Collection whose iteration yields [id, overwrite] entries, not overwrite values; use cache.values() only as a fallback for identifying an applicant.