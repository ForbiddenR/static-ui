# BOTOPS — Bot Automation Task Platform V1 (Static Console)

A static, cyberpunk-styled operations console for the Bot Automation Task Platform,
built from the specifications in `docs/`. All data is **mocked client-side**
(in-memory + `localStorage`) — no backend required.

## Features

- **Dashboard** — live counters (bots, active/succeeded/failed tasks, enabled schedules) and recent task list.
- **Bot Registry** (`/bots`) — register bots, enable/disable, create versions (`draft`), publish (atomic single current version), run a bot.
- **Task Console** (`/tasks`) — create/dispatch tasks with JSON input params, live status machine
  (`pending → dispatching → running → success | partial_success | failed | canceled | timeout`),
  progress bars, cancel / retry / re-run, TaskItem detail and a live terminal log view.
- **Schedule Control** (`/schedules`) — create schedules (cron, timezone, overlap / missed-run policies, jitter),
  enable/disable, manual trigger (honors `overlap_policy=skip`), ScheduleRun history.
- **Worker Pool** (`/workers`) — online/offline and enabled state, capacity use, tags, runtime version,
  session and heartbeat metadata, assigned-task drilldown, and capacity-aware mock dispatch.
- **Full-page detail views** — every entity (bot, task, schedule, worker) opens a dedicated route
  with a corner-bracketed HUD hero, terminal-style `cd ..` back link, live stat strip, and
  cross-linked related records.
- **Mock execution engine** — a 1.5 s heartbeat advances active tasks through the real lifecycle,
  including terminal-state arbitration from TaskItem statistics per `docs/Task执行规范.md`.
- **i18n** — English / 中文 toggle. **Theme** — dark / light cyberpunk palettes. Both persisted.

## Develop

```bash
npm install
npm run dev
```

## Build (static output in `dist/`)

```bash
npm run build      # typecheck + bundle
npm run preview    # serve dist locally
```

The build uses hash routing and relative asset paths, so `dist/` can be hosted from any static path.

## Performance

The bundle is split for fast first paint and long-term caching:

- `vendor` chunk — React runtime + router, stable across app-code deploys.
- Console pages (except the Dashboard landing route) are lazy-loaded on first navigation.
- `cron-parser`/`luxon` (~32 KB gzip) live in a lazy chunk fetched only when a schedule's
  next-run pair actually needs recomputing — never on the render path.
- `localStorage` writes are debounced (flushed on tab hide) and task logs are capped,
  so long simulation sessions don't bloat storage.

## Structure

```
src/
  i18n/            en/zh dictionaries + provider
  store/           db.ts (mock data + pub/sub), api.ts (simulated Master REST ops),
                   engine.ts (task lifecycle ticks), scheduleTime.ts (lazy cron/timezone math)
  components/      Layout (sidebar/topbar), ui.tsx (design system), console.tsx (badges/progress/detail hero)
  pages/           Dashboard + per-entity console/detail pairs: BotsConsole/BotDetail,
                   TasksConsole/TaskDetail, SchedulesConsole/ScheduleDetail, WorkersConsole/WorkerDetail
```
