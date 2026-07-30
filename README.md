# JOBOPS — Job Definition Execution Platform V1 (Static Console)

A static, cyberpunk-styled operations console for JobOps, built from the
specifications in `docs/`. All data is **mocked client-side** (in-memory +
`localStorage`) — no backend required. The default demo roster includes
`INV-SYNC` and `PRC-CRAWL`. Job definition codes are stable, human-readable
identifiers.

## Features

- **Dashboard** — live counters (job definitions, active/succeeded/failed tasks, enabled schedules) and recent task list.
- **Job Definitions** (`/job-definitions`) — manage `draft | enabled | disabled | archived` lifecycle, executable defaults, numeric Job Definition Versions, atomic publication/current-version promotion, rollback, and direct manual runs. Individual definitions use `/job-definitions/:jobDefinitionId`.
- **Task Console** (`/tasks`) — resolve the current or an explicit published version at creation time; capture `none`, `params`, or `file` input plus config, requirements, and priority; then preserve an immutable execution snapshot. The live status machine is
  `pending → dispatching → running → success | partial_success | failed | canceled | timeout`,
  with progress, cancel, retry-all, retry-failed-items, re-run, TaskItem detail, and terminal logs.
- **Schedule Control** (`/schedules`) — save a complete execution template independently of current runnability, choose a pinned version or trigger-time current-version resolution, configure cron/timezone, `skip | run_once` missed-run policy, jitter, and initial status, then inspect every ScheduleRun decision (`task_created | skipped | failed`) with optional Task drilldown.
- **Worker Pool** (`/workers`) — online/offline and enabled state, capacity use, tags, runtime version,
  session and heartbeat metadata, assigned-task drilldown, capacity-aware mock dispatch, live per-node
  telemetry sparklines (CPU / memory / throughput / heartbeat RTT with hover scrubbing), and a
  streaming worker log (session, dispatch, heartbeat, and runtime events).
- **Full-page detail views** — Job Definitions, tasks, schedules, schedule runs, and workers open dedicated routes
  with a corner-bracketed HUD hero, terminal-style `cd ..` back link, live stat strip, and
  cross-linked related records.
- **Mock execution engine** — a 1.5 s heartbeat advances active tasks through the real lifecycle,
  including terminal-state arbitration from TaskItem statistics per `docs/Task执行规范.md`.
- **i18n** — English / 中文 toggle. **Theme** — dark / light cyberpunk palettes. Both persisted.

## Terminology and V1 compatibility

JobOps is the canonical product name. The canonical frontend resource names are
**Job Definition** and **Job Definition Version**, with routes
`/job-definitions` and `/job-definitions/:jobDefinitionId`. The former `/bots`
and `/bots/:botId` frontend routes are legacy redirects only.

V1 compatibility literals remain unchanged: API routes under `/api/bots`,
`bots`/`bot_versions` collections, `bot_*` JSON fields and IDs, `BOT_*` error
codes and environment variables, `bot_sdk`, `bot_script`, `botops-theme`,
`botops-lang`, `botops-db-v2`, `botops-server`, `BOTOPS_DATA_DIR`, and
`botops_server`.

## Execution Provenance

The console preserves the resolved execution chain instead of inferring it from current state:

- `Job Definition → Job Definition Version → Task` — every Task records the exact published Job Definition Version and immutable Job Definition snapshot it resolved when created. Later publication or rollback does not rewrite an existing Task.
- `Job Definition → Schedule → ScheduleRun → Task` — a Schedule belongs to one Job Definition and may pin a published version; otherwise the published current version is resolved when a run decision is made. Every manual or due cron attempt creates a ScheduleRun. A Task is linked only when that decision materializes one.
- Automatic decisions for enabled schedules record `task_created`, `skipped`, or `failed`, plus trigger type, planned/scheduled/triggered times, persisted jitter, policy values, reason, and error details. Disabled Job Definitions, unresolved versions, overlap skips, and missed-run skips therefore remain auditable without creating a Task; disabling a Schedule clears its pending timing rather than creating future decisions.

## Develop

```bash
npm install
npm run dev
```

## Build (static output in `dist/`)

```bash
npm test           # store/API contract tests
npm run build      # typecheck + bundle
npm run preview    # serve dist locally
```

The build uses hash routing and relative asset paths, so `dist/` can be hosted from any static path.

## Mock limitation

The static mock is designed for a single browser tab. It has lightweight in-memory duplicate protection for cron decisions, but it does not coordinate `localStorage` state or schedule ownership across tabs.

## Performance

The bundle is split for fast first paint and long-term caching:

- `vendor` chunk — React runtime + router, stable across app-code deploys.
- Console pages (except the Dashboard landing route) are lazy-loaded on first navigation.
- `cron-parser`/`luxon` (~32 KB gzip) live in a lazy chunk fetched only when a schedule's
  next-run pair actually needs recomputing — never on the render path.
- `localStorage` writes are debounced (flushed on tab hide) and task logs are capped,
  so long simulation sessions don't bloat storage.

## Structure

```text
src/
  i18n/            en/zh dictionaries + provider
  store/           db.ts (mock data + pub/sub), api.ts (simulated Master REST ops),
                   engine.ts (task lifecycle ticks), scheduleTime.ts (lazy cron/timezone math)
  components/      Layout (sidebar/topbar), ui.tsx (design system), console.tsx (badges/progress/detail hero)
  pages/           Dashboard + entity views: JobDefinitionsConsole/JobDefinitionDetail,
                   TasksConsole/TaskDetail, SchedulesConsole/ScheduleDetail/ScheduleRunDetail,
                   WorkersConsole/WorkerDetail
```

See `docs/作业定义规范.md` for the Job Definition specification.
