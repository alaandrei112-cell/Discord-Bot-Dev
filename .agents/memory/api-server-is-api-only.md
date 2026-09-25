---
name: api-server is /api-only
description: Don't serve the status SPA from the api-server artifact; status is a separate web artifact on /.
---

# api-server must only handle /api

The `api-server` artifact is `kind = "api"` with `paths = ["/api"]`. It must NOT
serve the status website / SPA.

**Why:** `status` is a separate `web` artifact (`paths = ["/"]`) with its own
production build + serve + `/` healthcheck. The shared proxy routes `/` to the
status service, not to api-server. A leftover production catch-all in
`app.ts` did `res.sendFile(.../status/dist/public/index.html)` — a file that is
NOT built into the api-server deployment — so `GET /api` (and any non-`/api`
path that reached api-server) fell through the router into that catch-all and
returned **500**, failing platform healthchecks ("healthcheck /api returned
status 500"). That was half of an "aplicația nu răspunde" report.

**How to apply:** keep `app.ts` mounting only `app.use("/api", router)`. Do not
re-add `express.static` / SPA `sendFile` fallbacks to api-server. After removal,
`GET /api` returns 404 (fine) and `/api/healthz` stays 200.
