---
name: Multi-artifact deployment startup
description: Startup behavior and verification for deployments containing both the web and API artifacts.
---

Multi-artifact VM deployments can report repeated 500 healthchecks while the web and API processes are still starting; treat the deployment as unresolved until both configured ports open, then recheck the public root and API health route.

**Why:** The deployment sidecar probes the combined public router before all artifact processes are ready, so early 500s can look like an application crash even when the services later become healthy.

**How to apply:** When logs show “all artifact ports are open,” curl the public `/` and `/api/healthz` endpoints again before changing artifact commands or rolling back.