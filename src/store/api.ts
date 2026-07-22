// Simulated Master API — operations mirror the REST contracts in docs/.
// All data is mocked and held client-side only (see db.ts).

import { db, emitHelpers, now, uid, type Bot, type BotVersion, type Schedule, type ScheduleRun, type Task, type TaskItemStatus } from './db';
import { tickTask, releaseWorker } from './engine';

export { tickTask };

// ---------- Bots ----------
export function createBot(input: { code: string; name: string; description: string }): Bot {
  const bot: Bot = {
    id: uid('bot'),
    code: input.code,
    name: input.name,
    description: input.description,
    enabled: true,
    current_version_id: null,
    created_at: now(),
  };
  db.bots.unshift(bot);
  emitHelpers.emit();
  return bot;
}

export function toggleBot(botId: string): void {
  const bot = db.bots.find((b) => b.id === botId);
  if (bot) {
    bot.enabled = !bot.enabled;
    emitHelpers.emit();
  }
}

export function createBotVersion(botId: string, version: string, scriptFile: string): BotVersion {
  const bv: BotVersion = {
    id: uid('bv'),
    bot_id: botId,
    version,
    status: 'draft',
    script_file: scriptFile,
    created_at: now(),
  };
  db.versions.unshift(bv);
  emitHelpers.emit();
  return bv;
}

export function publishBotVersion(botId: string, versionId: string): void {
  const bot = db.bots.find((b) => b.id === botId);
  const bv = db.versions.find((v) => v.id === versionId && v.bot_id === botId);
  if (!bot || !bv) return;
  // atomic promotion: demote all others, promote this one
  db.versions.forEach((v) => {
    if (v.bot_id === botId) v.status = v.id === versionId ? 'published' : v.status === 'published' ? 'draft' : v.status;
  });
  bot.current_version_id = versionId;
  emitHelpers.emit();
}

// ---------- Tasks ----------
const TERMINAL = new Set(['success', 'partial_success', 'failed', 'canceled', 'timeout']);

export function createTask(input: { bot_id: string; input_params: Record<string, string>; run_type?: Task['run_type']; source_task_id?: string | null }): Task | null {
  const bot = db.bots.find((b) => b.id === input.bot_id);
  if (!bot || !bot.enabled || !bot.current_version_id) return null;
  const itemCount = 3 + Math.floor(Math.random() * 8);
  const task: Task = {
    id: uid('task'),
    bot_id: bot.id,
    bot_name: bot.name,
    status: 'pending',
    run_type: input.run_type ?? 'manual',
    source_task_id: input.source_task_id ?? null,
    input_params: input.input_params,
    statistics: { total: itemCount, success: 0, failed: 0, skipped: 0 },
    items: Array.from({ length: itemCount }, (_, i) => ({
      id: uid('ti'),
      key: `item-${String(i + 1).padStart(3, '0')}`,
      status: 'pending' as TaskItemStatus,
    })),
    error_code: null,
    worker_id: null,
    created_at: now(),
    finished_at: null,
  };
  db.tasks.unshift(task);
  emitHelpers.log(task.id, 'info', 'master', `task created, queued for dispatch (bot=${bot.code})`);
  emitHelpers.emit();
  return task;
}

export function cancelTask(taskId: string): void {
  const task = db.tasks.find((t) => t.id === taskId);
  if (!task || TERMINAL.has(task.status)) return;
  if (task.status === 'pending') {
    task.status = 'canceled';
  } else {
    // dispatching/running -> canceling -> canceled (user cancel wins arbitration)
    task.status = 'canceled';
  }
  task.items.forEach((it) => {
    if (it.status === 'pending' || it.status === 'running') it.status = 'canceled';
  });
  task.finished_at = now();
  releaseWorker(task);
  emitHelpers.log(task.id, 'warning', 'master', 'cancel requested by user; terminal state = canceled');
  emitHelpers.emit();
}

export function retryTask(taskId: string): Task | null {
  const src = db.tasks.find((t) => t.id === taskId);
  if (!src || !TERMINAL.has(src.status)) return null;
  return createTask({ bot_id: src.bot_id, input_params: src.input_params, run_type: 'retry', source_task_id: src.id });
}

export function rerunTask(taskId: string): Task | null {
  const src = db.tasks.find((t) => t.id === taskId);
  if (!src) return null;
  return createTask({ bot_id: src.bot_id, input_params: src.input_params, run_type: 'rerun', source_task_id: src.id });
}

// ---------- Schedules ----------
export function createSchedule(input: {
  bot_id: string; name: string; cron: string; timezone: string;
  overlap_policy: Schedule['overlap_policy']; missed_run_policy: Schedule['missed_run_policy'];
  jitter_seconds: number;
}): Schedule | null {
  const bot = db.bots.find((b) => b.id === input.bot_id);
  if (!bot) return null;
  const sch: Schedule = {
    id: uid('sch'),
    bot_name: bot.name,
    ...input,
    enabled: true,
    created_at: now(),
  };
  db.schedules.unshift(sch);
  emitHelpers.emit();
  return sch;
}

export function toggleSchedule(scheduleId: string): void {
  const sch = db.schedules.find((s) => s.id === scheduleId);
  if (sch) {
    sch.enabled = !sch.enabled;
    emitHelpers.emit();
  }
}

export function triggerSchedule(scheduleId: string): ScheduleRun | null {
  const sch = db.schedules.find((s) => s.id === scheduleId);
  if (!sch) return null;
  const jitter = sch.jitter_seconds > 0 ? Math.floor(Math.random() * (sch.jitter_seconds + 1)) : 0;

  // overlap_policy=skip: previous active Task suppresses this round
  const hasActive = db.tasks.some((t) => t.bot_id === sch.bot_id && !TERMINAL.has(t.status));
  let taskId: string | null = null;
  if (!(sch.overlap_policy === 'skip' && hasActive)) {
    const task = createTask({ bot_id: sch.bot_id, input_params: { schedule_id: sch.id }, run_type: 'scheduled' });
    taskId = task ? task.id : null;
  }
  const run: ScheduleRun = {
    id: uid('srun'),
    schedule_id: sch.id,
    task_id: taskId,
    trigger_reason: 'manual',
    planned_at: now(),
    jitter_applied_seconds: jitter,
    created_at: now(),
  };
  db.runs.unshift(run);
  if (taskId) {
    emitHelpers.log(taskId, 'info', 'master', `materialized from schedule ${sch.name} (jitter=${jitter}s)`);
  }
  emitHelpers.emit();
  return run;
}

// ---------- Workers ----------
export function toggleWorker(workerId: string): void {
  const worker = db.workers.find((item) => item.id === workerId);
  if (!worker) return;

  worker.enabled = !worker.enabled;
  if (worker.enabled && worker.status === 'offline') {
    worker.status = 'online';
    worker.session_id = uid('sess');
    worker.last_heartbeat_at = now();
  }
  emitHelpers.emit();
}

// ---------- Logs ----------
export function logsForTask(taskId: string) {
  return db.logs.filter((l) => l.task_id === taskId).sort((a, b) => a.seq - b.seq);
}

// ---------- Reset ----------
export function resetMockData(): void {
  emitHelpers.reset();
}
