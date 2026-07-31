# JOBOPS — Job Definition Execution Platform V1 (Static Console)

A static, cyberpunk-styled operations console for JobOps, built from the
specifications in `docs/`. All data is **mocked client-side** (in-memory +
`localStorage`) — no backend required. The default demo roster includes
`INV-SYNC` and `PRC-CRAWL`. Job definition codes are stable, human-readable
identifiers.

## Features

- **Dashboard** — live counters (job definitions, task templates, active/succeeded/failed task runs, enabled schedules) and recent TaskRun list.
- **Job Definitions** (`/job-definitions`) — manage `draft | enabled | disabled | archived` lifecycle, executable defaults, numeric Job Definition Versions, atomic publication/current-version promotion, rollback, and one-shot runs via Task templates. Individual definitions use `/job-definitions/:jobDefinitionId`.
- **Task Templates** (`/tasks`) — reusable run templates under a Job Definition. Save name, optional version pin, input/config/requirements/priority, and enable/disable without dispatching. Detail view runs the template, lists bound Schedules, and recent TaskRuns.
- **Task Runs** (`/task-runs`) — live executions of a Task template. Status machine
  `pending → dispatching → running → success | partial_success | failed | canceled | timeout`,
  with progress, cancel, retry-all, retry-failed-items, re-run, TaskItem detail, and terminal logs.
- **Schedule Control** (`/schedules`) — binds a **Task** (not a Job Definition). Timing, policies, and **placement** (auto dispatch / worker pool / worker node): cron/timezone, `skip | run_once` missed-run policy, jitter, initial status. Every decision is a ScheduleRun (`task_created | skipped | failed`) with optional TaskRun drilldown.
- **Workers** (`/workers`) — individual nodes: online/offline and enabled state, capacity use,
  **system tags** (registration, read-only) and **user tags** (operator-editable on the detail page),
  pool membership, **runtimes** (e.g. `python3.12`, system-reported) vs agent **version** (`workerd/…`),
  session and heartbeat metadata, assigned TaskRun drilldown,
  capacity-aware mock dispatch, live per-node telemetry sparklines (CPU / memory / throughput /
  heartbeat RTT with hover scrubbing), and a streaming worker log (session, dispatch, heartbeat, and runtime events).
- **Worker Pools** (`/worker-pools`) — named placement groups with shared tags and explicit member workers. Schedules and manual runs can target a pool; dispatch stays among online, enabled members with free capacity. Node capacity remains authoritative.
- **Full-page detail views** — Job Definitions, tasks, task runs, schedules, schedule runs, workers, and worker pools open dedicated routes
  with a corner-bracketed HUD hero, terminal-style `cd ..` back link, live stat strip, and
  cross-linked related records.
- **Mock execution engine** — a 1.5 s heartbeat advances active TaskRuns through the real lifecycle,
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

## Hierarchy (static mock)

```text
Job Definition → Task (template) → Schedule → ScheduleRun → TaskRun
               └─────────────────→ TaskRun (manual / api / retry / rerun)

Placement (on Schedule and TaskRun):
  auto dispatch | Worker Pool | Worker node pin
  worker pin > pool membership > all eligible online workers
```

- **Task** binds a Job Definition (optional version pin + input/config/priority template).
- **Schedule** binds a Task; it does not own execution input fields. It stores durable placement (`target_pool_id` / `target_worker_id`).
- **TaskRun** is one live execution (status machine, placement freeze, assigned worker, items, logs) with frozen `bot_snapshot`.
- **Worker Pool** is a first-class placement target (explicit members + tags), not a nested pool-of-pools.

> The static mock (`src/store`, pages, i18n, tests) models Task templates + TaskRuns + Worker Pools.
> `docs/` now document Worker Pool / placement alongside the V1 Worker contract.
> `server-rs/` may still lag until a backend contract pass.

## Execution Provenance

The console preserves the resolved execution chain instead of inferring it from current state:

- `Job Definition → Task → TaskRun` — every TaskRun freezes the published Job Definition Version snapshot resolved at materialize time. Later publication or rollback does not rewrite an existing TaskRun.
- `Job Definition → Task → Schedule → ScheduleRun → TaskRun` — a Schedule belongs to one Task template. Every manual or due cron attempt creates a ScheduleRun. A TaskRun is linked only when that decision materializes one (`task_run_id`).
- Automatic decisions for enabled schedules record `task_created`, `skipped`, or `failed`, plus trigger type, planned/scheduled/triggered times, persisted jitter, policy values, reason, and error details. Disabled Tasks, disabled Job Definitions, unresolved versions, overlap skips, and missed-run skips therefore remain auditable without creating a TaskRun; disabling a Schedule clears its pending timing rather than creating future decisions.

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

The static mock is designed for a single browser tab. It has lightweight in-memory duplicate protection for cron decisions, but it does not coordinate `localStorage` state or schedule ownership across tabs. Pre-v6 stored databases are reseeded on load; v6–v8 storage migrates to schema version 9 (Worker Pools, placement, system/user tags, and system-reported `runtimes`).

## Performance

The bundle is split for fast first paint and long-term caching:

- `vendor` chunk — React runtime + router, stable across app-code deploys.
- Console pages (except the Dashboard landing route) are lazy-loaded on first navigation.
- `cron-parser`/`luxon` (~32 KB gzip) live in a lazy chunk fetched only when a schedule's
  next-run pair actually needs recomputing — never on the render path.
- `localStorage` writes are debounced (flushed on tab hide) and task-run logs are capped,
  so long simulation sessions don't bloat storage.

## Structure

```text
src/
  i18n/            en/zh dictionaries + provider
  store/           db.ts (mock data + pub/sub), api.ts (simulated Master REST ops),
                   engine.ts (TaskRun lifecycle ticks), scheduleTime.ts (lazy cron/timezone math)
  components/      Layout (sidebar/topbar), ui.tsx (design system), console.tsx (badges/progress/detail hero)
  pages/           Dashboard + entity views: JobDefinitionsConsole/JobDefinitionDetail,
                   TasksConsole/TaskDetail, TaskRunsConsole/TaskRunDetail,
                   SchedulesConsole/ScheduleDetail/ScheduleRunDetail,
                   WorkersConsole/WorkerDetail, WorkerPoolsConsole/WorkerPoolDetail
  components/      … + PlacementSelect (auto | pool | worker)
```

See `docs/作业定义规范.md` for the Job Definition specification.
