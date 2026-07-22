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

## Structure

```
src/
  i18n/            en/zh dictionaries + provider
  store/           db.ts (mock data + pub/sub), api.ts (simulated Master REST ops), engine.ts (task lifecycle ticks)
  components/      Layout (sidebar/topbar), ui.tsx (design system), console.tsx (badges/progress)
  pages/           Dashboard, BotsConsole, TasksConsole, SchedulesConsole
```
