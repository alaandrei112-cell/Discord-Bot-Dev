---
name: Artifact production environment scope
description: Production artifact services may not inherit the shared environment block when their run command starts.
---

Required variables for a production artifact service must be declared explicitly in the matching `services.production.build.env` and/or `services.production.run.env`; do not rely on the shared `services.env` block.

**Why:** Vite validates `PORT` and `BASE_PATH` during both build and startup. A published Status VM can fail before serving HTTP when either variable exists only in the shared environment block.

**How to apply:** Mirror build-time variables in `services.production.build.env`, startup variables in `services.production.run.env`, and test the actual production build/serve commands.