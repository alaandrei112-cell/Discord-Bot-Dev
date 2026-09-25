# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- Moderation operator guide: [docs/moderation.md](docs/moderation.md). The protected panel is `/moderare`; login uses Discord OAuth2, followed by selection of a permitted server containing the bot. `/moderare login` links to the website, not a code.

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Optional ops env: `DISCORD_ALERT_WEBHOOK_URL` — Discord webhook URL for an operator channel. When set, the bot pushes an alert when it goes offline (shard/fatal disconnect or a failing reconnect loop) and a recovery alert when it comes back. **If unset, all offline/recovery alerts are silently suppressed** (a warning is logged), so set this to actually get notified.
- Optional ops env: `DISCONNECT_ALERT_THRESHOLD_MS` — grace period before a transient disconnect (or stalled reconnect loop) escalates to an offline alert. Defaults to 5 minutes; debounces routine self-healing shard blips so the ops channel isn't spammed.
- Optional ops env: `ORACLE_REASONING_EFFORT` — internal "thinking" budget for the Oracle's AI replies (`minimal`/`low`/`medium`/`high`). Default `minimal` so replies land fast; higher tiers add latency and can exhaust the token budget (empty reply → fallback line). Only applies to gpt-5-family models. **Requires a bot restart to take effect.**
- Optional ops env: `ORACLE_JUSTICE_WINDOW_MINUTES` — how far back (in minutes) the justice scan looks for toxic messages. Default 30, max 1440. Invalid values fall back to default with a warning. **Requires a bot restart to take effect** (read once at startup).
- Optional ops env: `ORACLE_JUSTICE_SCAN_LIMIT` — max number of channel messages inspected per justice scan. Default 100, max 500. Invalid values fall back to default with a warning. **Requires a bot restart to take effect** (read once at startup).
- Optional ops env: `ACTIVITY_WINDOW_MINUTES` — minutes of chat silence after which chest and key-chest timers skip their spawn. Default 20, max 120. Invalid values fall back to default with a warning. **Requires a bot restart to take effect** (read once at startup).
- Optional ops env: `CHEST_MSG_MILESTONE` — number of non-bot messages per guild between bonus chest rolls (30% chance each). Default 25, max 200. Invalid values fall back to default with a warning. **Requires a bot restart to take effect** (read once at startup).
- Optional ops env: `KEY_CHEST_MSG_MILESTONE` — number of non-bot messages per guild between bonus key-chest rolls (15% chance each; independent of chest milestone). Default 50, max 400. Invalid values fall back to default with a warning. **Requires a bot restart to take effect** (read once at startup).

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

- Scutul de Cenușă are viață proprie (200 HP + 100/nivel), setată la activare (activare: 350 mană). Efortul scutului consumă și mană: procentul de consum = apărarea scutului −10 puncte procentuale (ex. 98% apărare → 88% din daunele absorbite se scad din mană; mana coboară până la 0, dar mana goală NU sparge scutul — doar viața lui proprie). Valabil și la Dragonul final.
- Magazin → Abilități: „Regenerare de Mană" 💠 (nivel infinit) — regen per atac = 10% + 2%/nivel din mana maximă.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- **Always run `pnpm --filter @workspace/db run push-force` (dev DB sync) after any schema change, BEFORE publishing.** Replit's Publish flow diffs the development *database* against production and drops prod columns that are missing in dev — this is what wiped player prestige. The bot only runs in production, so its startup migrations never update the dev DB; schema files alone are not enough.
- **Duplicate bot instance after publish** ("merge greu", 40060 errors at the first deferUpdate): a zombie VM from the previous revision holds a second gateway session. Code defends itself (SIGTERM fast-exit + `bot_instance` DB leadership marker, old instance yields with an ops alert "Instanță duplicată detectată" and healthz `shardStatus: "yielded"`). If that alert fires unexpectedly or the fresh deploy shows `yielded`, fully stop the deployment in the Publishing pane, wait ~1 min, then Publish again.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
