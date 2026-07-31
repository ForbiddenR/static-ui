// Simulated Master API.
// Task = reusable template under a Job Definition.
// TaskRun = live execution; Schedule binds a Task and materializes TaskRuns.
import {
  db, emitHelpers, normalizeTags, now, refreshScheduleTimes, uid,
  type Bot, type BotSnapshot, type BotVersion, type InputSource, type JsonObject,
  type Schedule, type ScheduleRun, type ScheduleRunTriggerType,
  type Task, type TaskRun, type TaskRunType, type TaskItemStatus,
  type WorkerPool,
} from './db';
import { tickTaskRun, tickWorkers, releaseWorker } from './engine';
import { calculateNextScheduleTimes, scheduleJitterSeconds, validateCron, validateTimezone } from './scheduleTime';
export { tickTaskRun as tickTask, tickWorkers };

const TERMINAL = new Set<TaskRun['status']>(['success', 'partial_success', 'failed', 'canceled', 'timeout']);
const RETRYABLE = new Set<TaskRun['status']>(['failed', 'partial_success', 'timeout', 'canceled']);
const MISSED_RUN_GRACE_MS = 5_000;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isObject = (value: unknown): value is JsonObject => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export type VersionResolutionErrorCode = 'BOT_NOT_FOUND' | 'BOT_VERSION_REQUIRED' | 'BOT_VERSION_NOT_FOUND' | 'BOT_VERSION_MISMATCH' | 'BOT_VERSION_NOT_PUBLISHED';
export type PublishedVersionResolution =
  | { ok: true; bot: Bot; version: BotVersion; snapshot: BotSnapshot }
  | { ok: false; bot: Bot | null; code: VersionResolutionErrorCode; message: string };

export function buildBotSnapshot(bot: Bot, version: BotVersion): BotSnapshot {
  return {
    bot_id: bot.id, bot_code: bot.code, bot_version_id: version.id, version: version.version,
    script_source: version.script_source, source_file_id: version.source_file_id, script_file: version.script_file, entrypoint: version.entrypoint,
    input_params_schema: clone(version.input_params_schema), default_input_source: version.default_input_source,
    default_config: clone(version.default_config), default_requirements: clone(version.default_requirements),
  };
}

export function resolvePublishedBotVersion(botId: string, requestedVersionId?: string | null): PublishedVersionResolution {
  const bot = db.bots.find((item) => item.id === botId) ?? null;
  if (!bot) return { ok: false, bot, code: 'BOT_NOT_FOUND', message: `Job Definition ${botId} was not found.` };
  const id = requestedVersionId ?? bot.current_version_id;
  if (!id) return { ok: false, bot, code: 'BOT_VERSION_REQUIRED', message: `Job Definition ${bot.code} has no current published version.` };
  const version = db.versions.find((item) => item.id === id);
  if (!version) return { ok: false, bot, code: 'BOT_VERSION_NOT_FOUND', message: `Job Definition Version ${id} was not found.` };
  if (version.bot_id !== bot.id) return { ok: false, bot, code: 'BOT_VERSION_MISMATCH', message: `Job Definition Version ${id} does not belong to ${bot.code}.` };
  if (version.status !== 'published') return { ok: false, bot, code: 'BOT_VERSION_NOT_PUBLISHED', message: `Job Definition Version ${version.version} is not published.` };
  return { ok: true, bot, version, snapshot: buildBotSnapshot(bot, version) };
}

export type InputValidation =
  | { ok: true; input_source: InputSource; input_file_id: string | null; input_params: JsonObject }
  | { ok: false; message: string };

/** Shared source validation for Task templates and TaskRun materialization. */
export function validateTaskInput(input: {
  input_source?: InputSource;
  input_file_id?: string | null;
  input_params?: JsonObject;
  source_task_run_id?: string | null;
  run_type?: TaskRunType;
}): InputValidation {
  const source = input.input_source;
  if (!source || !['file', 'params', 'task_items', 'none'].includes(source)) {
    return { ok: false, message: 'input_source must be file, params, task_items, or none.' };
  }
  if (source === 'file') {
    return typeof input.input_file_id === 'string' && input.input_file_id.trim()
      ? { ok: true, input_source: source, input_file_id: input.input_file_id, input_params: {} }
      : { ok: false, message: 'input_file_id is required when input_source=file.' };
  }
  if (source === 'params') {
    return input.input_params === undefined || isObject(input.input_params)
      ? { ok: true, input_source: source, input_file_id: null, input_params: clone(input.input_params ?? {}) }
      : { ok: false, message: 'input_params must be an object.' };
  }
  if (source === 'task_items') {
    const items = input.input_params?.task_items;
    const validItems = Array.isArray(items)
      && items.length > 0
      && items.every((item) => isObject(item) && typeof item.key === 'string');
    return ['retry_failed_items', 'retry_all', 'rerun'].includes(String(input.run_type))
      && typeof input.source_task_run_id === 'string'
      && validItems
      ? { ok: true, input_source: source, input_file_id: null, input_params: clone(input.input_params ?? {}) }
      : { ok: false, message: 'task_items input requires a lineage-based retry or rerun and a non-empty item snapshot.' };
  }
  return input.input_file_id == null
    ? { ok: true, input_source: source, input_file_id: null, input_params: {} }
    : { ok: false, message: 'input_file_id is not allowed when input_source=none.' };
}

export interface CreateBotInput {
  code: string; description?: string; category?: string | null; tags?: string[]; entrypoint?: string; script_source?: string;
  source_file_id?: string | null; default_input_source?: InputSource; input_params_schema?: JsonObject;
  default_config?: JsonObject; default_requirements?: JsonObject; publish?: boolean;
}

export function createBot(input: CreateBotInput): Bot | null {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9]+(?:[-_][A-Z0-9]+)*$/.test(code) || db.bots.some((bot) => bot.code === code)) return null;
  const ts = now();
  const bot: Bot = {
    id: uid('bot'), code, description: input.description ?? '', category: input.category ?? null, tags: input.tags ?? [],
    status: 'draft', enabled: false, entrypoint: input.entrypoint ?? 'main.py', script_source: input.script_source ?? 'upload',
    current_version_id: null, default_input_source: input.default_input_source ?? 'params',
    input_params_schema: clone(input.input_params_schema ?? {}), default_config: clone(input.default_config ?? {}),
    default_requirements: clone(input.default_requirements ?? {}), created_by: 'user_demo', created_at: ts, updated_at: ts, archived_at: null,
  };
  db.bots.unshift(bot);
  if (input.source_file_id) {
    createBotVersion(bot.id, {
      source_file_id: input.source_file_id, entrypoint: bot.entrypoint, script_source: bot.script_source,
      default_input_source: bot.default_input_source, input_params_schema: bot.input_params_schema,
      default_config: bot.default_config, default_requirements: bot.default_requirements, publish: input.publish ?? true,
    });
  }
  emitHelpers.emit();
  return bot;
}

export type ToggleBotResult =
  | { ok: true; bot: Bot; enabled: boolean }
  | { ok: false; bot: Bot | null; enabled: false; code: 'BOT_NOT_FOUND' | VersionResolutionErrorCode };

export function toggleBot(botId: string): ToggleBotResult {
  const bot = db.bots.find((item) => item.id === botId) ?? null;
  if (!bot) return { ok: false, bot, enabled: false, code: 'BOT_NOT_FOUND' };
  if (bot.status !== 'enabled') {
    const resolved = resolvePublishedBotVersion(bot.id);
    if (!resolved.ok) return { ok: false, bot, enabled: false, code: resolved.code };
    bot.status = 'enabled';
  } else bot.status = 'disabled';
  bot.enabled = bot.status === 'enabled';
  bot.updated_at = now();
  emitHelpers.emit();
  return { ok: true, bot, enabled: bot.enabled };
}

export type CreateVersionInput = {
  source_file_id?: string | null; script_file?: string; entrypoint?: string; script_source?: string;
  input_params_schema?: JsonObject; default_input_source?: InputSource; default_config?: JsonObject;
  default_requirements?: JsonObject; change_note?: string | null; publish?: boolean;
};

export function createBotVersion(botId: string, inputOrLegacy: CreateVersionInput | string, legacyScriptFile?: string): BotVersion | null {
  const bot = db.bots.find((item) => item.id === botId);
  if (!bot || bot.status === 'archived') return null;
  const input: CreateVersionInput = typeof inputOrLegacy === 'string'
    ? { script_file: legacyScriptFile ?? inputOrLegacy, source_file_id: legacyScriptFile ?? inputOrLegacy }
    : inputOrLegacy;
  if (!input.source_file_id && !input.script_file) return null;
  const ts = now();
  const version: BotVersion = {
    id: uid('bv'), bot_id: bot.id,
    version: Math.max(0, ...db.versions.filter((item) => item.bot_id === bot.id).map((item) => item.version)) + 1,
    status: 'draft', is_current: false, script_source: input.script_source ?? bot.script_source,
    source_file_id: input.source_file_id ?? null, script_file: input.script_file ?? input.source_file_id!,
    entrypoint: input.entrypoint ?? bot.entrypoint,
    input_params_schema: clone(input.input_params_schema ?? bot.input_params_schema),
    default_input_source: input.default_input_source ?? bot.default_input_source,
    default_config: clone(input.default_config ?? bot.default_config),
    default_requirements: clone(input.default_requirements ?? bot.default_requirements),
    change_note: input.change_note ?? null, created_by: 'user_demo', created_at: ts, published_at: null, published_by: null,
  };
  db.versions.unshift(version);
  if (input.publish) publishBotVersion(bot.id, version.id);
  else emitHelpers.emit();
  return version;
}

export function publishBotVersion(botId: string, versionId: string): boolean {
  const bot = db.bots.find((item) => item.id === botId);
  const version = db.versions.find((item) => item.id === versionId && item.bot_id === botId);
  if (!bot || !version || bot.status === 'archived' || !version.source_file_id) return false;
  if (version.is_current) return true;
  const ts = now();
  db.versions.filter((item) => item.bot_id === bot.id).forEach((item) => { item.is_current = false; });
  Object.assign(version, { status: 'published', is_current: true, published_at: ts, published_by: 'user_demo' });
  Object.assign(bot, {
    current_version_id: version.id, entrypoint: version.entrypoint, script_source: version.script_source,
    default_input_source: version.default_input_source, input_params_schema: clone(version.input_params_schema),
    default_config: clone(version.default_config), default_requirements: clone(version.default_requirements), updated_at: ts,
  });
  emitHelpers.emit();
  return true;
}

export const createJobDefinition = createBot;
export const toggleJobDefinition = toggleBot;
export const createJobDefinitionVersion = createBotVersion;
export const publishJobDefinitionVersion = publishBotVersion;
export const resolvePublishedJobDefinitionVersion = resolvePublishedBotVersion;

// ---- Task templates ----

export interface CreateTaskInput {
  bot_id: string;
  name: string;
  description?: string | null;
  bot_version_id?: string | null;
  input_source?: InputSource;
  input_file_id?: string | null;
  input_params?: JsonObject;
  config?: JsonObject;
  requirements?: JsonObject;
  priority?: number;
  enabled?: boolean;
}

export function createTask(input: CreateTaskInput): Task | null {
  const bot = db.bots.find((item) => item.id === input.bot_id);
  if (!bot || bot.status === 'archived') return null;
  if (input.bot_version_id && !resolvePublishedBotVersion(bot.id, input.bot_version_id).ok) return null;
  const source = input.input_source ?? bot.default_input_source;
  const validated = validateTaskInput({
    input_source: source,
    input_file_id: input.input_file_id,
    input_params: input.input_params ?? (source === 'params' ? {} : undefined),
  });
  if (!validated.ok) return null;
  if (!input.name.trim()) return null;
  const enabled = input.enabled ?? true;
  const ts = now();
  const task: Task = {
    id: uid('task'), bot_id: bot.id, bot_code: bot.code, name: input.name.trim(), description: input.description ?? null,
    bot_version_id: input.bot_version_id ?? null,
    input_source: validated.input_source, input_file_id: validated.input_file_id, input_params: validated.input_params,
    config: clone(input.config ?? {}), requirements: clone(input.requirements ?? {}),
    priority: Math.max(0, Math.min(100, Math.floor(input.priority ?? 50))),
    status: enabled ? 'enabled' : 'disabled', enabled, created_by: 'user_demo', created_at: ts, updated_at: ts,
  };
  db.tasks.unshift(task);
  emitHelpers.emit();
  return task;
}

export function toggleTask(taskId: string): void {
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task || task.status === 'archived') return;
  task.status = task.status === 'enabled' ? 'disabled' : 'enabled';
  task.enabled = task.status === 'enabled';
  task.updated_at = now();
  emitHelpers.emit();
}

// ---- TaskRun materialization ----

export type PlacementMode = 'auto' | 'pool' | 'worker';

/** Resolved placement for Schedule / TaskRun (worker pin wins over pool). */
export interface Placement {
  mode: PlacementMode;
  target_pool_id: string | null;
  target_worker_id: string | null;
}

interface MaterializeInput {
  task: Task;
  resolution: Extract<PublishedVersionResolution, { ok: true }>;
  run_type: TaskRunType;
  source_task_run_id?: string | null;
  schedule_id?: string | null;
  schedule_run_id?: string | null;
  target_pool_id?: string | null;
  target_worker_id?: string | null;
  input_source: InputSource;
  input_file_id?: string | null;
  input_params?: JsonObject;
  config?: JsonObject;
  requirements?: JsonObject;
  priority?: number;
}

function materializeTaskRun(input: MaterializeInput): TaskRun | null {
  const validated = validateTaskInput({
    ...input,
    source_task_run_id: input.source_task_run_id ?? null,
    run_type: input.run_type,
  });
  if (!validated.ok) return null;
  const itemSnapshots = validated.input_source === 'task_items'
    && Array.isArray(validated.input_params.task_items)
    ? validated.input_params.task_items.filter(isObject)
    : null;
  const count = itemSnapshots?.length ?? (3 + Math.floor(Math.random() * 8));
  const items = itemSnapshots
    ? itemSnapshots.map((item) => ({
        id: uid('ti'),
        key: String(item.key),
        status: 'pending' as TaskItemStatus,
        input_data: isObject(item.input_data) ? clone(item.input_data) : {},
      }))
    : Array.from({ length: count }, (_, index) => ({
        id: uid('ti'),
        key: `item-${String(index + 1).padStart(3, '0')}`,
        status: 'pending' as TaskItemStatus,
      }));
  const ts = now();
  return {
    id: uid('trun'),
    task_id: input.task.id,
    bot_id: input.resolution.bot.id,
    bot_code: input.resolution.bot.code,
    bot_version_id: input.resolution.version.id,
    bot_snapshot: clone(input.resolution.snapshot),
    schedule_id: input.schedule_id ?? null,
    schedule_run_id: input.schedule_run_id ?? null,
    source_task_run_id: input.source_task_run_id ?? null,
    status: 'pending',
    run_type: input.run_type,
    input_source: validated.input_source,
    input_file_id: validated.input_file_id,
    input_params: validated.input_params,
    config: { ...clone(input.resolution.version.default_config), ...clone(input.config ?? {}) },
    requirements: { ...clone(input.resolution.version.default_requirements), ...clone(input.requirements ?? {}) },
    priority: Math.max(0, Math.min(100, Math.floor(input.priority ?? input.task.priority))),
    entrypoint: input.resolution.snapshot.entrypoint,
    statistics: {
      total: count, success: 0, failed: 0, skipped: 0, timeout: 0, canceled: 0, pending: count, running: 0, completed: 0,
    },
    items,
    target_pool_id: input.target_pool_id ?? null,
    target_worker_id: input.target_worker_id ?? null,
    worker_id: null,
    error_code: null,
    created_at: ts,
    updated_at: ts,
    finished_at: null,
  };
}

function commitTaskRun(taskRun: TaskRun, message: string): TaskRun {
  db.taskRuns.unshift(taskRun);
  emitHelpers.log(taskRun.id, 'info', 'master', message);
  emitHelpers.emit();
  return taskRun;
}

export interface RunTaskInput {
  input_params?: JsonObject;
  config?: JsonObject;
  requirements?: JsonObject;
  priority?: number;
  run_type?: 'manual' | 'api';
  /** Placement for this manual/api run: auto | pool | worker. */
  target_pool_id?: string | null;
  target_worker_id?: string | null;
}

function placementNote(placement: Placement): string {
  if (placement.mode === 'worker') return `target worker ${placement.target_worker_id}`;
  if (placement.mode === 'pool') return `target pool ${placement.target_pool_id}`;
  return 'auto dispatch';
}

export function runTask(taskId: string, overrides?: RunTaskInput): TaskRun | null {
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task || task.status !== 'enabled') return null;
  const resolved = resolvePublishedBotVersion(task.bot_id, task.bot_version_id);
  if (!resolved.ok || resolved.bot.status !== 'enabled') return null;
  const placement = resolvePlacement({
    target_pool_id: overrides?.target_pool_id,
    target_worker_id: overrides?.target_worker_id,
  });
  if (!placement) return null;
  const taskRun = materializeTaskRun({
    task,
    resolution: resolved,
    run_type: overrides?.run_type ?? 'manual',
    target_pool_id: placement.target_pool_id,
    target_worker_id: placement.target_worker_id,
    input_source: task.input_source,
    input_file_id: task.input_file_id,
    input_params: overrides?.input_params ?? task.input_params,
    config: overrides?.config ?? task.config,
    requirements: overrides?.requirements ?? task.requirements,
    priority: overrides?.priority ?? task.priority,
  });
  return taskRun
    ? commitTaskRun(
      taskRun,
      `task run created from template ${task.name}; ${placementNote(placement)}; frozen Job Definition Version ${resolved.version.version}`,
    )
    : null;
}

export function cancelTaskRun(taskRunId: string): void {
  const taskRun = db.taskRuns.find((item) => item.id === taskRunId);
  if (!taskRun || TERMINAL.has(taskRun.status)) return;
  taskRun.status = 'canceled';
  taskRun.items.forEach((item) => {
    if (item.status === 'pending' || item.status === 'running') item.status = 'canceled';
  });
  taskRun.statistics = summarize(taskRun);
  taskRun.finished_at = taskRun.updated_at = now();
  releaseWorker(taskRun);
  emitHelpers.log(taskRun.id, 'warning', 'master', 'cancel requested by user; terminal state = canceled');
  emitHelpers.emit();
}

function summarize(taskRun: TaskRun) {
  const count = (status: TaskItemStatus) => taskRun.items.filter((item) => item.status === status).length;
  const success = count('success'), failed = count('failed'), skipped = count('skipped'), timeout = count('timeout'), canceled = count('canceled');
  return {
    total: taskRun.items.length, success, failed, skipped, timeout, canceled,
    pending: count('pending'), running: count('running'),
    completed: success + failed + skipped + timeout + canceled,
  };
}

function frozenResolution(src: TaskRun): Extract<PublishedVersionResolution, { ok: true }> | null {
  const snapshot = src.bot_snapshot;
  const bot = db.bots.find((item) => item.id === src.bot_id);
  if (!snapshot || !bot || snapshot.bot_id !== bot.id) return null;
  const version = db.versions.find((item) => item.id === src.bot_version_id && item.bot_id === bot.id) ?? {
    id: snapshot.bot_version_id, bot_id: bot.id,
    version: typeof snapshot.version === 'number' ? snapshot.version : 0,
    status: 'published' as const, is_current: false, script_source: snapshot.script_source,
    source_file_id: snapshot.source_file_id, script_file: snapshot.script_file, entrypoint: snapshot.entrypoint,
    input_params_schema: snapshot.input_params_schema, default_input_source: snapshot.default_input_source,
    default_config: snapshot.default_config, default_requirements: snapshot.default_requirements,
    change_note: null, created_by: 'historical', created_at: src.created_at, published_at: null, published_by: null,
  };
  return { ok: true, bot, version, snapshot: clone(snapshot) };
}

export function retryTaskRun(taskRunId: string, mode: 'all' | 'failed_items' = 'all'): TaskRun | null {
  const src = db.taskRuns.find((item) => item.id === taskRunId);
  if (!src || !RETRYABLE.has(src.status)) return null;
  const task = db.tasks.find((item) => item.id === src.task_id);
  if (!task) return null;
  const resolution = frozenResolution(src);
  if (!resolution) return null;
  const failed = src.items.filter((item) => item.status === 'failed' || item.status === 'timeout');
  if (mode === 'failed_items' && failed.length === 0) return null;
  const placement = placementOf(src);
  const taskRun = materializeTaskRun({
    task,
    resolution,
    run_type: mode === 'all' ? 'retry_all' : 'retry_failed_items',
    source_task_run_id: src.id,
    target_pool_id: placement.target_pool_id,
    target_worker_id: placement.target_worker_id,
    input_source: mode === 'all' ? src.input_source : 'task_items',
    input_file_id: src.input_file_id,
    input_params: mode === 'all'
      ? src.input_params
      : { task_items: failed.map((item) => ({ id: item.id, key: item.key, input_data: item.input_data ?? {} })) },
    config: src.config,
    requirements: src.requirements,
    priority: src.priority,
  });
  return taskRun
    ? commitTaskRun(taskRun, `${mode === 'all' ? 'full retry' : 'failed-item retry'} created from ${src.id} using frozen provenance`)
    : null;
}

export function rerunTaskRun(taskRunId: string): TaskRun | null {
  const src = db.taskRuns.find((item) => item.id === taskRunId);
  if (!src || !TERMINAL.has(src.status)) return null;
  const task = db.tasks.find((item) => item.id === src.task_id);
  if (!task) return null;
  const resolution = frozenResolution(src);
  if (!resolution) return null;
  const placement = placementOf(src);
  const taskRun = materializeTaskRun({
    task,
    resolution,
    run_type: 'rerun',
    source_task_run_id: src.id,
    target_pool_id: placement.target_pool_id,
    target_worker_id: placement.target_worker_id,
    input_source: src.input_source,
    input_file_id: src.input_file_id,
    input_params: src.input_params,
    config: src.config,
    requirements: src.requirements,
    priority: src.priority,
  });
  return taskRun
    ? commitTaskRun(taskRun, `rerun created from ${src.id} using its full frozen input`)
    : null;
}

// Compatibility aliases used by older call sites during the remodel.
export const cancelTask = cancelTaskRun;
export const retryTask = retryTaskRun;
export const rerunTask = rerunTaskRun;

// ---- Schedules ----

export interface CreateScheduleInput {
  task_id: string;
  name: string;
  description?: string | null;
  cron: string;
  timezone?: string;
  /**
   * Placement for every fire: worker pin, pool scope, or auto (both null / 'auto').
   */
  target_pool_id?: string | null;
  target_worker_id?: string | null;
  overlap_policy?: Schedule['overlap_policy'];
  missed_run_policy?: Schedule['missed_run_policy'];
  jitter_seconds?: number;
  enabled?: boolean;
}

/**
 * Resolve placement tokens.
 * - worker id wins over pool
 * - null / '' / 'auto' / 'random' → no pin
 * - returns null when an unknown id is supplied
 */
export function resolvePlacement(input: {
  target_pool_id?: string | null;
  target_worker_id?: string | null;
}): Placement | null {
  const rawWorker = input.target_worker_id;
  const rawPool = input.target_pool_id;

  let target_worker_id: string | null = null;
  if (rawWorker != null && rawWorker !== '' && rawWorker !== 'auto' && rawWorker !== 'random') {
    if (!db.workers.some((item) => item.id === rawWorker)) return null;
    target_worker_id = rawWorker;
  }

  let target_pool_id: string | null = null;
  if (!target_worker_id && rawPool != null && rawPool !== '' && rawPool !== 'auto') {
    const pool = db.workerPools.find((item) => item.id === rawPool);
    if (!pool || pool.status === 'archived') return null;
    target_pool_id = rawPool;
  }

  if (target_worker_id) {
    return { mode: 'worker', target_pool_id: null, target_worker_id };
  }
  if (target_pool_id) {
    return { mode: 'pool', target_pool_id, target_worker_id: null };
  }
  return { mode: 'auto', target_pool_id: null, target_worker_id: null };
}

export function placementOf(row: { target_pool_id?: string | null; target_worker_id?: string | null }): Placement {
  if (row.target_worker_id) {
    return { mode: 'worker', target_pool_id: null, target_worker_id: row.target_worker_id };
  }
  if (row.target_pool_id) {
    return { mode: 'pool', target_pool_id: row.target_pool_id, target_worker_id: null };
  }
  return { mode: 'auto', target_pool_id: null, target_worker_id: null };
}

export async function createSchedule(input: CreateScheduleInput): Promise<Schedule | null> {
  const task = db.tasks.find((item) => item.id === input.task_id);
  if (!task || task.status === 'archived') return null;
  const bot = db.bots.find((item) => item.id === task.bot_id);
  if (!bot || bot.status === 'archived') return null;
  const placement = resolvePlacement({
    target_pool_id: input.target_pool_id,
    target_worker_id: input.target_worker_id,
  });
  if (!placement) return null;
  const timezone = validateTimezone(input.timezone ?? 'Asia/Shanghai');
  if (!timezone || !await validateCron(input.cron, timezone)) return null;
  if (!input.name.trim()) return null;
  const enabled = input.enabled ?? true;
  const jitter = Math.max(0, Math.floor(input.jitter_seconds ?? 0));
  const timing = enabled ? await calculateNextScheduleTimes({ cron: input.cron, timezone, jitterSeconds: jitter }) : null;
  const ts = now();
  const schedule: Schedule = {
    id: uid('sch'),
    task_id: task.id,
    bot_id: task.bot_id,
    bot_code: task.bot_code,
    name: input.name.trim(),
    description: input.description ?? null,
    cron: input.cron.trim(),
    timezone,
    target_pool_id: placement.target_pool_id,
    target_worker_id: placement.target_worker_id,
    status: enabled ? 'enabled' : 'disabled',
    enabled,
    overlap_policy: 'skip',
    missed_run_policy: input.missed_run_policy === 'run_once' ? 'run_once' : 'skip',
    jitter_seconds: jitter,
    max_parallel_runs: 1,
    last_run_at: null,
    last_task_run_id: null,
    next_planned_at: timing?.next_planned_at ?? null,
    next_run_at: timing?.next_run_at ?? null,
    created_by: 'user_demo',
    created_at: ts,
    updated_at: ts,
    archived_at: null,
  };
  db.schedules.unshift(schedule);
  emitHelpers.emit();
  return schedule;
}

/** @deprecated Prefer setSchedulePlacement. */
export function setScheduleTargetWorker(scheduleId: string, workerId: string | null): boolean {
  return setSchedulePlacement(scheduleId, { target_worker_id: workerId, target_pool_id: null });
}

export function setSchedulePlacement(
  scheduleId: string,
  input: { target_pool_id?: string | null; target_worker_id?: string | null },
): boolean {
  const schedule = db.schedules.find((item) => item.id === scheduleId);
  if (!schedule || schedule.status === 'archived') return false;
  const placement = resolvePlacement(input);
  if (!placement) return false;
  if (
    schedule.target_worker_id === placement.target_worker_id
    && schedule.target_pool_id === placement.target_pool_id
  ) {
    return true;
  }
  schedule.target_pool_id = placement.target_pool_id;
  schedule.target_worker_id = placement.target_worker_id;
  schedule.updated_at = now();
  emitHelpers.emit();
  return true;
}

export function toggleSchedule(scheduleId: string): void {
  const schedule = db.schedules.find((item) => item.id === scheduleId);
  if (!schedule || schedule.status === 'archived') return;
  schedule.status = schedule.status === 'enabled' ? 'disabled' : 'enabled';
  schedule.enabled = schedule.status === 'enabled';
  schedule.updated_at = now();
  if (!schedule.enabled) schedule.next_planned_at = schedule.next_run_at = null;
  emitHelpers.emit();
  if (schedule.enabled) void refreshScheduleTimes();
}

export const refreshScheduleNextRuns = (reference = new Date()) => refreshScheduleTimes(reference);

interface Decision {
  schedule: Schedule;
  triggerType: ScheduleRunTriggerType;
  plannedAt: string;
  scheduledAt: string;
  jitterSeconds: number;
  jitterAppliedSeconds: number;
  triggeredAt: string;
  forcedSkipReason?: string;
  forcedFailure?: { reason: string; code: string; message: string };
  emit?: boolean;
}

function commitScheduleDecision(input: Decision): ScheduleRun | null {
  const { schedule } = input;
  if (input.triggerType === 'cron' && db.runs.some((run) => run.schedule_id === schedule.id && run.planned_at === input.plannedAt && run.trigger_type === 'cron')) {
    return null;
  }
  const runId = uid('srun');
  let status: ScheduleRun['status'] = 'failed';
  let reason: string | null = 'create_task_failed';
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  let taskRun: TaskRun | null = null;
  const task = db.tasks.find((item) => item.id === schedule.task_id) ?? null;

if (input.forcedFailure) {
    ({ reason, errorCode, errorMessage } = {
      reason: input.forcedFailure.reason,
      errorCode: input.forcedFailure.code,
      errorMessage: input.forcedFailure.message,
    });
  } else if (input.forcedSkipReason) {
    status = 'skipped';
    reason = input.forcedSkipReason;
  } else if (schedule.status !== 'enabled') {
    status = 'skipped';
    reason = 'schedule_disabled';
  } else if (!task) {
    errorCode = 'TASK_NOT_FOUND';
    errorMessage = `Task template ${schedule.task_id} was not found.`;
  } else if (task.status !== 'enabled') {
    status = 'skipped';
    reason = 'task_disabled';
  } else if (schedule.target_worker_id && !db.workers.some((item) => item.id === schedule.target_worker_id)) {
    status = 'skipped';
    reason = 'target_worker_missing';
  } else if (schedule.target_pool_id && !schedule.target_worker_id) {
    const pool = db.workerPools.find((item) => item.id === schedule.target_pool_id);
    if (!pool || pool.status === 'archived') {
      status = 'skipped';
      reason = 'target_pool_missing';
    } else if (pool.status !== 'enabled') {
      status = 'skipped';
      reason = 'target_pool_disabled';
    } else if (pool.worker_ids.length === 0) {
      status = 'skipped';
      reason = 'target_pool_empty';
    }
  }

  if (status !== 'skipped' && reason === 'create_task_failed' && !errorCode && task) {
    const resolved = resolvePublishedBotVersion(task.bot_id, task.bot_version_id);
    if (!resolved.ok) {
      errorCode = resolved.code;
      errorMessage = resolved.message;
    } else if (resolved.bot.status !== 'enabled') {
      status = 'skipped';
      reason = 'bot_disabled';
    } else if (db.taskRuns.some((item) => item.schedule_id === schedule.id && !TERMINAL.has(item.status))) {
      status = 'skipped';
      reason = 'previous_task_running';
    } else {
      const placement = placementOf(schedule);
      taskRun = materializeTaskRun({
        task,
        resolution: resolved,
        run_type: 'schedule',
        schedule_id: schedule.id,
        schedule_run_id: runId,
        target_pool_id: placement.target_pool_id,
        target_worker_id: placement.target_worker_id,
        input_source: task.input_source,
        input_file_id: task.input_file_id,
        input_params: task.input_params,
        config: task.config,
        requirements: task.requirements,
        priority: task.priority,
      });
      if (taskRun) {
        status = 'task_created';
        reason = input.triggerType === 'manual'
          ? 'manual_trigger'
          : input.triggerType === 'missed_run_catchup'
            ? 'missed_run_catchup'
            : null;
      } else {
        reason = 'invalid_input';
        errorCode = 'INVALID_INPUT';
        errorMessage = 'Task template failed validation at fire time.';
      }
    }
  }

  const run: ScheduleRun = {
    id: runId,
    schedule_id: schedule.id,
    task_id: task?.id ?? schedule.task_id,
    bot_id: task?.bot_id ?? schedule.bot_id,
    task_run_id: status === 'task_created' ? taskRun!.id : null,
    trigger_type: input.triggerType,
    planned_at: input.plannedAt,
    scheduled_at: input.scheduledAt,
    jitter_seconds: input.jitterSeconds,
    jitter_applied_seconds: input.jitterAppliedSeconds,
    triggered_at: input.triggeredAt,
    status,
    reason,
    overlap_policy: schedule.overlap_policy,
    missed_run_policy: schedule.missed_run_policy,
    error_code: errorCode,
    error_message: errorMessage,
    created_at: input.triggeredAt,
  };

  db.runs.unshift(run);
  if (taskRun) {
    db.taskRuns.unshift(taskRun);
    emitHelpers.log(taskRun.id, 'info', 'master', `materialized from Schedule ${schedule.name} via Task ${task?.name ?? schedule.task_id}`);
  }
  schedule.last_run_at = input.triggeredAt;
  if (taskRun) schedule.last_task_run_id = taskRun.id;
  schedule.updated_at = input.triggeredAt;
  if (input.emit !== false) emitHelpers.emit();
  return run;
}

export function triggerSchedule(scheduleId: string): ScheduleRun | null {
  const schedule = db.schedules.find((item) => item.id === scheduleId);
  if (!schedule) return null;
  const ts = now();
  return commitScheduleDecision({
    schedule,
    triggerType: 'manual',
    plannedAt: ts,
    scheduledAt: ts,
    jitterSeconds: 0,
    jitterAppliedSeconds: 0,
    triggeredAt: ts,
  });
}

let scheduleTick: Promise<void> | null = null;

async function runScheduleTick(reference: Date): Promise<void> {
  const due = db.schedules
    .filter((schedule) => schedule.status === 'enabled' && schedule.next_planned_at && schedule.next_run_at)
    .map((schedule) => ({ id: schedule.id, plannedAt: schedule.next_planned_at!, scheduledAt: schedule.next_run_at! }))
    .filter(({ scheduledAt }) => Date.parse(scheduledAt) <= reference.getTime());

  for (const candidate of due) {
    const scheduledMs = Date.parse(candidate.scheduledAt);
    if (!Number.isFinite(scheduledMs)) continue;

    const schedule = db.schedules.find((item) => item.id === candidate.id);
    if (!schedule || schedule.status !== 'enabled'
      || schedule.next_planned_at !== candidate.plannedAt
      || schedule.next_run_at !== candidate.scheduledAt) continue;

    const missed = reference.getTime() - scheduledMs > MISSED_RUN_GRACE_MS;
    const next = await calculateNextScheduleTimes({
      cron: schedule.cron,
      timezone: schedule.timezone,
      jitterSeconds: schedule.jitter_seconds,
      after: missed ? reference : new Date(Date.parse(candidate.plannedAt)),
    });

    if (schedule.status !== 'enabled'
      || schedule.next_planned_at !== candidate.plannedAt
      || schedule.next_run_at !== candidate.scheduledAt) continue;

    if (!next) {
      commitScheduleDecision({
        schedule,
        triggerType: 'cron',
        plannedAt: candidate.plannedAt,
        scheduledAt: candidate.scheduledAt,
        jitterSeconds: schedule.jitter_seconds,
        jitterAppliedSeconds: scheduleJitterSeconds(candidate.plannedAt, candidate.scheduledAt),
        triggeredAt: now(),
        forcedFailure: {
          reason: 'timing_calculation_failed',
          code: 'SCHEDULE_TIMING_INVALID',
          message: 'Unable to calculate the next schedule occurrence.',
        },
        emit: false,
      });
      schedule.status = 'disabled';
      schedule.enabled = false;
      schedule.next_planned_at = null;
      schedule.next_run_at = null;
      schedule.updated_at = now();
      emitHelpers.emit();
      continue;
    }

    const decision = commitScheduleDecision({
      schedule,
      triggerType: missed && schedule.missed_run_policy === 'run_once' ? 'missed_run_catchup' : 'cron',
      plannedAt: candidate.plannedAt,
      scheduledAt: candidate.scheduledAt,
      jitterSeconds: schedule.jitter_seconds,
      jitterAppliedSeconds: scheduleJitterSeconds(candidate.plannedAt, candidate.scheduledAt),
      triggeredAt: now(),
      forcedSkipReason: missed && schedule.missed_run_policy === 'skip' ? 'missed_run_skipped' : undefined,
      emit: false,
    });
    if (!decision) continue;

    schedule.next_planned_at = next.next_planned_at;
    schedule.next_run_at = next.next_run_at;
    emitHelpers.emit();
  }
}

export function tickSchedules(reference = new Date()) {
  if (scheduleTick) return scheduleTick;
  scheduleTick = runScheduleTick(reference).finally(() => { scheduleTick = null; });
  return scheduleTick;
}

export function toggleWorker(workerId: string): void {
  const worker = db.workers.find((item) => item.id === workerId);
  if (!worker) return;
  worker.enabled = !worker.enabled;
  if (worker.enabled && worker.status === 'offline') {
    worker.status = 'online';
    worker.session_id = uid('sess');
  }
  emitHelpers.emit();
}

/**
 * Replace operator-managed user tags on a Worker.
 * System tags are never writable from the console.
 */
export function setWorkerUserTags(workerId: string, tags: string[]): boolean {
  const worker = db.workers.find((item) => item.id === workerId);
  if (!worker) return false;
  const next = Array.from(
    new Set(
      tags
        .map((tag) => tag.trim())
        .filter(Boolean)
        // User tags must not collide with system tags (system wins identity).
        .filter((tag) => !worker.system_tags.includes(tag)),
    ),
  );
  worker.user_tags = next;
  emitHelpers.emit();
  return true;
}

// ---- Worker Pools ----

export interface CreateWorkerPoolInput {
  name: string;
  description?: string | null;
  tags?: string[];
  worker_ids?: string[];
  enabled?: boolean;
}

export function createWorkerPool(input: CreateWorkerPoolInput): WorkerPool | null {
  const name = input.name.trim();
  if (!name) return null;
  const workerIds = Array.from(new Set((input.worker_ids ?? []).filter((id) => db.workers.some((w) => w.id === id))));
  const ts = now();
  const enabled = input.enabled ?? true;
  const pool: WorkerPool = {
    id: uid('wpool'),
    name,
    description: input.description?.trim() || null,
    tags: normalizeTags(input.tags),
    worker_ids: workerIds,
    status: enabled ? 'enabled' : 'disabled',
    enabled,
    created_by: 'user_demo',
    created_at: ts,
    updated_at: ts,
  };
  db.workerPools.unshift(pool);
  emitHelpers.emit();
  return pool;
}

export function toggleWorkerPool(poolId: string): boolean {
  const pool = db.workerPools.find((item) => item.id === poolId);
  if (!pool || pool.status === 'archived') return false;
  pool.status = pool.status === 'enabled' ? 'disabled' : 'enabled';
  pool.enabled = pool.status === 'enabled';
  pool.updated_at = now();
  emitHelpers.emit();
  return true;
}

export function setWorkerPoolMembers(poolId: string, workerIds: string[]): boolean {
  const pool = db.workerPools.find((item) => item.id === poolId);
  if (!pool || pool.status === 'archived') return false;
  pool.worker_ids = Array.from(new Set(workerIds.filter((id) => db.workers.some((w) => w.id === id))));
  pool.updated_at = now();
  emitHelpers.emit();
  return true;
}

export function updateWorkerPool(
  poolId: string,
  patch: { name?: string; description?: string | null; tags?: string[] },
): boolean {
  const pool = db.workerPools.find((item) => item.id === poolId);
  if (!pool || pool.status === 'archived') return false;
  if (typeof patch.name === 'string') {
    const name = patch.name.trim();
    if (!name) return false;
    pool.name = name;
  }
  if (patch.description !== undefined) {
    pool.description = patch.description?.trim() || null;
  }
  // Allow clearing tags with [] — membership is never derived from tags.
  if (patch.tags !== undefined) {
    pool.tags = normalizeTags(patch.tags);
  }
  pool.updated_at = now();
  emitHelpers.emit();
  return true;
}

export const logsForTaskRun = (taskRunId: string) => db.logs.filter((entry) => entry.task_run_id === taskRunId).sort((a, b) => a.seq - b.seq);
export const logsForTask = logsForTaskRun;
export const logsForWorker = (workerId: string) => db.workerLogs.filter((entry) => entry.worker_id === workerId).sort((a, b) => a.seq - b.seq);
export const resetMockData = () => emitHelpers.reset();
