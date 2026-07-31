// Client-side mock persistence. V1 machine names and botops-db-v2 are deliberate compatibility contracts.
// Hierarchy: Job Definition → Task (template) → Schedule / TaskRun.
import { calculateNextScheduleTimes, validateTimezone } from './scheduleTime';

export type TaskStatus = 'pending' | 'dispatching' | 'running' | 'canceling' | 'success' | 'partial_success' | 'failed' | 'canceled' | 'timeout';
export type TaskItemStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'canceled' | 'timeout';
export type InputSource = 'file' | 'params' | 'task_items' | 'none';
export type TaskRunType = 'manual' | 'api' | 'schedule' | 'retry_all' | 'retry_failed_items' | 'rerun';
export type JsonObject = Record<string, unknown>;

export interface Bot {
  id: string; code: string; description: string; category: string | null; tags: string[];
  status: 'draft' | 'enabled' | 'disabled' | 'archived';
  /** Compatibility flag for older views. Status is authoritative. */ enabled: boolean;
  entrypoint: string; script_source: string; current_version_id: string | null;
  default_input_source: InputSource; input_params_schema: JsonObject; default_config: JsonObject; default_requirements: JsonObject;
  created_by: string; created_at: string; updated_at: string; archived_at: string | null;
}
export interface BotVersion {
  id: string; bot_id: string; version: number; status: 'draft' | 'published'; is_current: boolean;
  script_source: string; source_file_id: string | null; /** Legacy display alias. */ script_file: string;
  entrypoint: string; input_params_schema: JsonObject; default_input_source: InputSource; default_config: JsonObject; default_requirements: JsonObject;
  change_note: string | null; created_by: string; created_at: string; published_at: string | null; published_by: string | null;
}
export interface BotSnapshot {
  bot_id: string; bot_code: string; bot_version_id: string; /** Number for v5+ records; legacy snapshots retain their original label. */ version: number | string;
  script_source: string; source_file_id: string | null; script_file: string; entrypoint: string;
  input_params_schema: JsonObject; default_input_source: InputSource; default_config: JsonObject; default_requirements: JsonObject;
}
export type JobDefinition = Bot; export type JobDefinitionVersion = BotVersion; export type JobDefinitionSnapshot = BotSnapshot;

/** Reusable run template under a Job Definition. */
export interface Task {
  id: string; bot_id: string; bot_code: string; name: string; description: string | null;
  bot_version_id: string | null;
  input_source: InputSource; input_file_id: string | null; input_params: JsonObject;
  config: JsonObject; requirements: JsonObject; priority: number;
  status: 'enabled' | 'disabled' | 'archived'; enabled: boolean;
  created_by: string; created_at: string; updated_at: string;
}

export interface TaskItem { id: string; key: string; status: TaskItemStatus; input_data?: JsonObject; }
export interface TaskStatistics { total: number; success: number; failed: number; skipped: number; timeout?: number; canceled?: number; pending?: number; running?: number; completed?: number; }

/** One live execution of a Task template. */
export interface TaskRun {
  id: string; task_id: string; bot_id: string; bot_code: string; bot_version_id: string | null; bot_snapshot: BotSnapshot | null;
  schedule_id: string | null; schedule_run_id: string | null; source_task_run_id: string | null;
  status: TaskStatus; run_type: TaskRunType; input_source: InputSource; input_file_id: string | null; input_params: JsonObject;
  config: JsonObject; requirements: JsonObject; priority: number; entrypoint: string; statistics: TaskStatistics; items: TaskItem[];
  /**
   * Placement frozen at materialize.
   * worker pin wins over pool; both null = auto dispatch among all eligible nodes.
   */
  target_pool_id: string | null;
  target_worker_id: string | null;
  worker_id: string | null; error_code: string | null; created_at: string; updated_at: string; finished_at: string | null;
}

export type ScheduleOverlapPolicy = 'skip'; export type ScheduleMissedRunPolicy = 'skip' | 'run_once';
/** Cron trigger bound to a Task template. Timing/policies only — inputs live on the Task. */
export interface Schedule {
  id: string; task_id: string; bot_id: string; bot_code: string; name: string; description: string | null;
  cron: string; timezone: string;
  /**
   * Durable placement for every fire.
   * target_worker_id pin wins; else target_pool_id scopes candidates; both null = auto dispatch.
   */
  target_pool_id: string | null;
  target_worker_id: string | null;
  /** status is authoritative; enabled remains for old screens. */ status: 'enabled' | 'disabled' | 'archived'; enabled: boolean;
  overlap_policy: ScheduleOverlapPolicy; missed_run_policy: ScheduleMissedRunPolicy; jitter_seconds: number; max_parallel_runs: number;
  last_run_at: string | null; last_task_run_id: string | null; next_planned_at: string | null; next_run_at: string | null;
  created_by: string; created_at: string; updated_at: string; archived_at: string | null;
}
export type ScheduleRunStatus = 'task_created' | 'skipped' | 'failed'; export type ScheduleRunTriggerType = 'cron' | 'manual' | 'missed_run_catchup';
export interface ScheduleRun {
  id: string; schedule_id: string; task_id: string; bot_id: string; task_run_id: string | null; trigger_type: ScheduleRunTriggerType;
  planned_at: string; scheduled_at: string; jitter_seconds: number; jitter_applied_seconds: number; triggered_at: string;
  status: ScheduleRunStatus; reason: string | null; overlap_policy: ScheduleOverlapPolicy; missed_run_policy: ScheduleMissedRunPolicy;
  error_code: string | null; error_message: string | null; created_at: string;
}
export interface LogEntry { id: string; task_run_id: string; seq: number; level: 'debug' | 'info' | 'warning' | 'error'; source: 'script' | 'worker' | 'runtime' | 'master' | 'system'; message: string; created_at: string; }
/**
 * Worker node tags:
 * - system_tags: reported at registration / Hello (immutable from the console)
 * - user_tags: operator-managed labels editable on the website
 * Combined display helpers use both; matching / grouping may use either.
 */
export interface Worker {
  id: string;
  name: string;
  status: 'online' | 'offline';
  enabled: boolean;
  capacity_max: number;
  capacity_used: number;
  /**
   * Supported script runtimes reported at Hello, e.g. ["python3.12"].
   * System-owned (not editable in the console). Used for requirements.runtime matching.
   */
  runtimes: string[];
  system_tags: string[];
  user_tags: string[];
  /** Worker process version (workerd), not the Python interpreter version. */
  version: string;
  session_id: string | null;
  current_task_run_ids: string[];
  last_heartbeat_at: string;
  created_at: string;
}

/** Combined tag list for display (system first, then user). */
export function workerAllTags(worker: { system_tags?: string[]; user_tags?: string[]; tags?: string[] }): string[] {
  if (Array.isArray(worker.system_tags) || Array.isArray(worker.user_tags)) {
    return [...(worker.system_tags ?? []), ...(worker.user_tags ?? [])];
  }
  // Legacy single-list rows before schema 8.
  return Array.isArray(worker.tags) ? worker.tags : [];
}
/**
 * Named placement group of interchangeable worker nodes.
 * tags = optional operator intent labels (filter / suggest / display only).
 * Membership is always worker_ids — tags never auto-join or auto-leave workers.
 */
export interface WorkerPool {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  worker_ids: string[];
  status: 'enabled' | 'disabled' | 'archived';
  enabled: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Normalize free-form pool/operator tags: trim, drop empties, dedupe (first wins). */
export function normalizeTags(tags: string[] | undefined | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags ?? []) {
    const tag = String(raw).trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

/** True when worker system/user tags share at least one value with poolTags. */
export function workerMatchesPoolTags(worker: Worker, poolTags: string[]): boolean {
  if (poolTags.length === 0) return false;
  const pool = new Set(poolTags);
  return workerAllTags(worker).some((tag) => pool.has(tag));
}
export interface WorkerMetricPoint { ts: string; cpu_pct: number; mem_pct: number; items_per_min: number; rtt_ms: number; }
export interface WorkerLogEntry { id: string; worker_id: string; seq: number; level: 'debug' | 'info' | 'warning' | 'error'; source: 'heartbeat' | 'dispatch' | 'runtime' | 'session' | 'master'; message: string; created_at: string; }
export interface DB {
  schema_version: number;
  bots: Bot[];
  versions: BotVersion[];
  tasks: Task[];
  taskRuns: TaskRun[];
  schedules: Schedule[];
  runs: ScheduleRun[];
  logs: LogEntry[];
  workers: Worker[];
  workerPools: WorkerPool[];
  workerMetrics: Record<string, WorkerMetricPoint[]>;
  workerLogs: WorkerLogEntry[];
}

const KEY = 'botops-db-v2'; const SCHEMA_VERSION = 9; let counter = 0;
export const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(++counter).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const now = () => new Date().toISOString();
const stats = (items: TaskItem[]): TaskStatistics => {
  const count = (status: TaskItemStatus) => items.filter((item) => item.status === status).length;
  const success = count('success'), failed = count('failed'), skipped = count('skipped'), timeout = count('timeout'), canceled = count('canceled');
  return { total: items.length, success, failed, skipped, timeout, canceled, pending: count('pending'), running: count('running'), completed: success + failed + skipped + timeout + canceled };
};

function reconcileLinks(database: Pick<DB, 'tasks' | 'schedules' | 'runs' | 'taskRuns'>): boolean {
  let changed = false;
  database.schedules.forEach((schedule) => {
    const task = database.tasks.find((candidate) => candidate.id === schedule.task_id);
    if (!task) {
      if (schedule.status === 'enabled') {
        schedule.status = 'disabled';
        schedule.enabled = false;
        schedule.next_planned_at = schedule.next_run_at = null;
        changed = true;
      }
      return;
    }
    if (schedule.bot_id !== task.bot_id || schedule.bot_code !== task.bot_code) {
      schedule.bot_id = task.bot_id;
      schedule.bot_code = task.bot_code;
      changed = true;
    }
  });

  database.runs.forEach((run) => {
    const schedule = database.schedules.find((candidate) => candidate.id === run.schedule_id);
    const task = database.tasks.find((candidate) => candidate.id === run.task_id)
      ?? (schedule ? database.tasks.find((candidate) => candidate.id === schedule.task_id) : undefined);
    const taskRun = run.task_run_id ? database.taskRuns.find((candidate) => candidate.id === run.task_run_id) : undefined;
    if (!schedule || !task) {
      if (run.status === 'task_created') {
        run.status = 'failed';
        run.reason = 'create_task_failed';
        changed = true;
      }
      if (run.task_run_id !== null) changed = true;
      run.task_run_id = null;
      return;
    }
    if (run.task_id !== task.id || run.bot_id !== task.bot_id) {
      run.task_id = task.id;
      run.bot_id = task.bot_id;
      changed = true;
    }
    const relationshipValid = Boolean(
      taskRun
      && taskRun.task_id === task.id
      && taskRun.bot_id === task.bot_id
      && (taskRun.schedule_id === null || taskRun.schedule_id === run.schedule_id)
      && (taskRun.schedule_run_id === null || taskRun.schedule_run_id === run.id),
    );
    if (!relationshipValid || !taskRun) {
      if (run.status === 'task_created') {
        run.status = 'failed';
        run.reason = 'create_task_failed';
        changed = true;
      }
      if (run.task_run_id !== null) changed = true;
      run.task_run_id = null;
      return;
    }
    if (taskRun.schedule_id !== run.schedule_id || taskRun.schedule_run_id !== run.id) {
      taskRun.schedule_id = run.schedule_id;
      taskRun.schedule_run_id = run.id;
      changed = true;
    }
    if (run.status !== 'task_created' || run.reason !== null) {
      run.status = 'task_created';
      run.reason = null;
      changed = true;
    }
  });

  database.taskRuns.forEach((taskRun) => {
    if (taskRun.schedule_id === null && taskRun.schedule_run_id === null) return;
    const run = database.runs.find((candidate) => candidate.id === taskRun.schedule_run_id);
    const valid = Boolean(
      run
      && run.status === 'task_created'
      && run.task_run_id === taskRun.id
      && run.schedule_id === taskRun.schedule_id
      && run.task_id === taskRun.task_id
      && run.bot_id === taskRun.bot_id,
    );
    if (!valid) {
      taskRun.schedule_id = null;
      taskRun.schedule_run_id = null;
      changed = true;
    }
  });
  return changed;
}

const defaultVersion = (bot: Bot, id: string, version: number, file: string): BotVersion => ({
  id, bot_id: bot.id, version, status: 'published', is_current: true, script_source: 'upload', source_file_id: `file_${file}`, script_file: file, entrypoint: 'main.py',
  input_params_schema: {}, default_input_source: 'params', default_config: {}, default_requirements: {}, change_note: null, created_by: 'user_demo', created_at: bot.created_at, published_at: bot.created_at, published_by: 'user_demo',
});

function seed(): DB {
  const ts = now();
  const botA: Bot = {
    id: 'bot_invoice_sync', code: 'INV-SYNC', description: 'Syncs invoices from the ERP into the finance data warehouse.', category: 'sync', tags: ['finance'],
    status: 'enabled', enabled: true, entrypoint: 'main.py', script_source: 'upload', current_version_id: 'bv_inv_3',
    default_input_source: 'params', input_params_schema: {}, default_config: {}, default_requirements: {}, created_by: 'user_demo', created_at: ts, updated_at: ts, archived_at: null,
  };
  const botB: Bot = { ...botA, id: 'bot_price_crawl', code: 'PRC-CRAWL', description: 'Reads competitor price pages and reports structured crawl records.', category: 'crawler', tags: ['pricing'], current_version_id: 'bv_prc_2' };
  const versions = [
    defaultVersion(botA, 'bv_inv_3', 3, 'inv_sync_v1_2.zip'),
    defaultVersion(botB, 'bv_prc_2', 2, 'price_crawl_092.zip'),
    { ...defaultVersion(botA, 'bv_inv_4', 4, 'inv_sync_v1_3rc1.zip'), status: 'draft' as const, is_current: false, published_at: null, published_by: null },
  ];
  const snapshot = (bot: Bot, versionId: string): BotSnapshot => {
    const version = versions.find((v) => v.id === versionId)!;
    return {
      bot_id: bot.id, bot_code: bot.code, bot_version_id: version.id, version: version.version,
      script_source: version.script_source, source_file_id: version.source_file_id, script_file: version.script_file, entrypoint: version.entrypoint,
      input_params_schema: {}, default_input_source: version.default_input_source, default_config: {}, default_requirements: {},
    };
  };

  const tasks: Task[] = [
    {
      id: 'task_nightly_inv', bot_id: botA.id, bot_code: botA.code, name: 'Nightly invoice window', description: 'ERP → warehouse for the daily window.',
      bot_version_id: 'bv_inv_3', input_source: 'params', input_file_id: null, input_params: { window: 'today' },
      config: {}, requirements: {}, priority: 50, status: 'enabled', enabled: true, created_by: 'user_demo', created_at: ts, updated_at: ts,
    },
    {
      id: 'task_price_gpu', bot_id: botB.id, bot_code: botB.code, name: 'GPU price crawl', description: null,
      bot_version_id: 'bv_prc_2', input_source: 'params', input_file_id: null, input_params: { category: 'gpu' },
      config: {}, requirements: {}, priority: 50, status: 'enabled', enabled: true, created_by: 'user_demo', created_at: ts, updated_at: ts,
    },
    {
      id: 'task_price_cpu', bot_id: botB.id, bot_code: botB.code, name: 'CPU price crawl', description: null,
      bot_version_id: 'bv_prc_2', input_source: 'params', input_file_id: null, input_params: { category: 'cpu' },
      config: {}, requirements: {}, priority: 50, status: 'enabled', enabled: true, created_by: 'user_demo', created_at: ts, updated_at: ts,
    },
    {
      id: 'task_price_all', bot_id: botB.id, bot_code: botB.code, name: 'Hourly price sweep', description: 'All categories, current version at fire time.',
      bot_version_id: null, input_source: 'params', input_file_id: null, input_params: { category: 'all' },
      config: {}, requirements: {}, priority: 40, status: 'enabled', enabled: true, created_by: 'user_demo', created_at: ts, updated_at: ts,
    },
  ];

  const successful: TaskItem[] = [
    { id: 'ti_1', key: 'INV-2026-0701', status: 'success' },
    { id: 'ti_2', key: 'INV-2026-0702', status: 'success' },
    { id: 'ti_3', key: 'INV-2026-0703', status: 'success' },
  ];
  const partial: TaskItem[] = [
    { id: 'ti_9', key: 'https://shop.example/gpu/rtx5090', status: 'success' },
    { id: 'ti_10', key: 'https://shop.example/gpu/rx8900', status: 'failed' },
    { id: 'ti_11', key: 'https://shop.example/gpu/arc-b880', status: 'skipped' },
  ];
  const active: TaskItem[] = [
    { id: 'ti_21', key: 'https://shop.example/cpu/i9-15900k', status: 'success' },
    { id: 'ti_22', key: 'https://shop.example/cpu/r9-9950x', status: 'running' },
    { id: 'ti_23', key: 'https://shop.example/cpu/u9-285k', status: 'pending' },
  ];

  const taskRun = (
    id: string,
    task: Task,
    bot: Bot,
    version: string,
    items: TaskItem[],
    status: TaskStatus,
    extra: Partial<TaskRun>,
  ): TaskRun => ({
    id, task_id: task.id, bot_id: bot.id, bot_code: bot.code, bot_version_id: version, bot_snapshot: snapshot(bot, version),
    schedule_id: null, schedule_run_id: null, source_task_run_id: null, status, run_type: 'manual',
    input_source: task.input_source, input_file_id: task.input_file_id, input_params: { ...task.input_params },
    config: { ...task.config }, requirements: { ...task.requirements }, priority: task.priority, entrypoint: 'main.py',
    statistics: stats(items), items, target_pool_id: null, target_worker_id: null, worker_id: null, error_code: null, created_at: ts, updated_at: ts,
    finished_at: status === 'running' ? null : ts, ...extra,
  });

  const taskRuns: TaskRun[] = [
    taskRun('trun_9f2c01', tasks[0], botA, 'bv_inv_3', successful, 'success', {
      run_type: 'schedule', schedule_id: 'sch_nightly_inv', schedule_run_id: 'srun_1',
      input_params: { window: '2026-07-20' }, target_pool_id: null, target_worker_id: 'worker_edge_01', worker_id: 'worker_edge_01',
    }),
    taskRun('trun_7ab3d4', tasks[1], botB, 'bv_prc_2', partial, 'partial_success', {
      input_params: { category: 'gpu' }, target_pool_id: 'wpool_edge', worker_id: 'worker_edge_02',
    }),
    taskRun('trun_55e8aa', tasks[2], botB, 'bv_prc_2', active, 'running', {
      input_params: { category: 'cpu' }, target_pool_id: 'wpool_edge', worker_id: 'worker_edge_01',
    }),
  ];

  const schedules: Schedule[] = [
    {
      id: 'sch_nightly_inv', task_id: 'task_nightly_inv', bot_id: botA.id, bot_code: botA.code, name: 'Nightly invoice sync', description: null,
      cron: '0 2 * * *', timezone: 'Asia/Shanghai', target_pool_id: null, target_worker_id: 'worker_edge_01',
      status: 'enabled', enabled: true, overlap_policy: 'skip', missed_run_policy: 'skip',
      jitter_seconds: 300, max_parallel_runs: 1, last_run_at: ts, last_task_run_id: 'trun_9f2c01', next_planned_at: null, next_run_at: null,
      created_by: 'user_demo', created_at: ts, updated_at: ts, archived_at: null,
    },
    {
      id: 'sch_hourly_price', task_id: 'task_price_all', bot_id: botB.id, bot_code: botB.code, name: 'Hourly price sweep', description: null,
      cron: '7 * * * *', timezone: 'UTC', target_pool_id: 'wpool_edge', target_worker_id: null,
      status: 'disabled', enabled: false, overlap_policy: 'skip', missed_run_policy: 'run_once',
      jitter_seconds: 60, max_parallel_runs: 1, last_run_at: null, last_task_run_id: null, next_planned_at: null, next_run_at: null,
      created_by: 'user_demo', created_at: ts, updated_at: ts, archived_at: null,
    },
  ];

  const runs: ScheduleRun[] = [{
    id: 'srun_1', schedule_id: 'sch_nightly_inv', task_id: 'task_nightly_inv', bot_id: botA.id, task_run_id: 'trun_9f2c01',
    trigger_type: 'cron', planned_at: ts, scheduled_at: ts, jitter_seconds: 300, jitter_applied_seconds: 0, triggered_at: ts,
    status: 'task_created', reason: null, overlap_policy: 'skip', missed_run_policy: 'skip', error_code: null, error_message: null, created_at: ts,
  }];

  const workers: Worker[] = [
    {
      id: 'worker_edge_01', name: 'edge-01', status: 'online', enabled: true,
      capacity_max: 4, capacity_used: 1,
      runtimes: ['python3.12'],
      system_tags: ['gpu', 'cn-shanghai'], user_tags: ['finance-edge'],
      version: 'workerd/1.4.2', session_id: 'sess_a91f', current_task_run_ids: ['trun_55e8aa'],
      last_heartbeat_at: ts, created_at: ts,
    },
    {
      id: 'worker_edge_02', name: 'edge-02', status: 'online', enabled: true,
      capacity_max: 2, capacity_used: 0,
      runtimes: ['python3.11', 'python3.12'],
      system_tags: ['cn-beijing'], user_tags: [],
      version: 'workerd/1.4.2', session_id: 'sess_b207', current_task_run_ids: [],
      last_heartbeat_at: ts, created_at: ts,
    },
    {
      id: 'worker_batch_01', name: 'batch-01', status: 'offline', enabled: false,
      capacity_max: 8, capacity_used: 0,
      runtimes: ['python3.10'],
      system_tags: ['batch', 'high-mem'], user_tags: ['nightly'],
      version: 'workerd/1.3.9', session_id: null, current_task_run_ids: [],
      last_heartbeat_at: ts, created_at: ts,
    },
  ];

  const workerPools: WorkerPool[] = [
    {
      id: 'wpool_edge', name: 'Edge fleet', description: 'Online edge nodes for interactive crawls and syncs.',
      tags: ['edge', 'online'], worker_ids: ['worker_edge_01', 'worker_edge_02'],
      status: 'enabled', enabled: true, created_by: 'user_demo', created_at: ts, updated_at: ts,
    },
    {
      id: 'wpool_batch', name: 'Batch high-mem', description: 'Offline-capable batch capacity class.',
      tags: ['batch', 'high-mem'], worker_ids: ['worker_batch_01'],
      status: 'enabled', enabled: true, created_by: 'user_demo', created_at: ts, updated_at: ts,
    },
  ];

  const logs: LogEntry[] = [
    { id: 'log_1', task_run_id: 'trun_9f2c01', seq: 1, level: 'info', source: 'master', message: 'task run dispatched to worker_edge-01', created_at: ts },
    { id: 'log_2', task_run_id: 'trun_9f2c01', seq: 2, level: 'info', source: 'worker', message: 'script process started, assignment accepted', created_at: ts },
    { id: 'log_3', task_run_id: 'trun_9f2c01', seq: 3, level: 'info', source: 'script', message: 'loaded invoices from ERP window 2026-07-20', created_at: ts },
    { id: 'log_4', task_run_id: 'trun_9f2c01', seq: 4, level: 'info', source: 'script', message: 'all task items finalized', created_at: ts },
    { id: 'log_5', task_run_id: 'trun_7ab3d4', seq: 1, level: 'warning', source: 'script', message: 'one page returned HTTP 503, marked failed', created_at: ts },
    { id: 'log_6', task_run_id: 'trun_7ab3d4', seq: 2, level: 'info', source: 'master', message: 'terminal state arbitrated: partial_success', created_at: ts },
    { id: 'log_7', task_run_id: 'trun_55e8aa', seq: 1, level: 'info', source: 'worker', message: 'script process started, assignment accepted', created_at: ts },
    { id: 'log_8', task_run_id: 'trun_55e8aa', seq: 2, level: 'debug', source: 'runtime', message: 'runtime report batch flushed', created_at: ts },
  ];

  const telemetry = (load: number): WorkerMetricPoint[] => Array.from({ length: 24 }, (_, index) => ({
    ts: new Date(Date.now() - (23 - index) * 1_500).toISOString(),
    cpu_pct: Math.round((8 + load * 55 + (index % 5) * 1.3) * 10) / 10,
    mem_pct: Math.round((30 + load * 32 + (index % 4) * 0.8) * 10) / 10,
    items_per_min: Math.round((load * 14 + (index % 3)) * 10) / 10,
    rtt_ms: 20 + (index % 7) * 3,
  }));
  const workerMetrics: Record<string, WorkerMetricPoint[]> = {
    worker_edge_01: telemetry(0.25),
    worker_edge_02: telemetry(0),
  };
  const workerLogs: WorkerLogEntry[] = [
    { id: 'wlog_1', worker_id: 'worker_edge_01', seq: 1, level: 'info', source: 'session', message: 'session registered (sess_a91f); capacity advertised 4 slots', created_at: ts },
    { id: 'wlog_2', worker_id: 'worker_edge_01', seq: 2, level: 'info', source: 'dispatch', message: 'assignment trun_55e8aa accepted; slot 1/4', created_at: ts },
    { id: 'wlog_3', worker_id: 'worker_edge_01', seq: 3, level: 'debug', source: 'runtime', message: 'runtime report batch flushed', created_at: ts },
    { id: 'wlog_4', worker_id: 'worker_edge_02', seq: 4, level: 'info', source: 'session', message: 'session registered (sess_b207); capacity advertised 2 slots', created_at: ts },
    { id: 'wlog_5', worker_id: 'worker_edge_02', seq: 5, level: 'debug', source: 'heartbeat', message: 'heartbeat ok rtt=28ms cap=0/2', created_at: ts },
    { id: 'wlog_6', worker_id: 'worker_batch_01', seq: 6, level: 'warning', source: 'heartbeat', message: 'heartbeat missed (3 consecutive); grace window entered', created_at: ts },
    { id: 'wlog_7', worker_id: 'worker_batch_01', seq: 7, level: 'error', source: 'session', message: 'session expired; node marked offline', created_at: ts },
    { id: 'wlog_8', worker_id: 'worker_batch_01', seq: 8, level: 'warning', source: 'master', message: 'admission disabled by operator', created_at: ts },
  ];

  return { schema_version: SCHEMA_VERSION, bots: [botA, botB], versions, tasks, taskRuns, schedules, runs, logs, workers, workerPools, workerMetrics, workerLogs };
}

/** Prefer a clean seed when older schemas cannot be reliably upgraded in the mock. */
function migratePersistedDB(value: unknown): { db: DB; changed: boolean } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const parsed = value as Partial<DB> & Record<string, unknown>;
  const isRecord = (candidate: unknown): candidate is Record<string, unknown> => (
    Boolean(candidate) && typeof candidate === 'object' && !Array.isArray(candidate)
  );
  const hasRecords = (candidate: unknown): boolean => (
    Array.isArray(candidate) && candidate.every(isRecord)
  );

  // v6–v9 (and repaired intermediates) receive relationship reconciliation so a
  // partial browser write cannot leave one-sided ScheduleRun ↔ TaskRun provenance.
  const schemaOk = parsed.schema_version === SCHEMA_VERSION
    || parsed.schema_version === 8
    || parsed.schema_version === 7
    || parsed.schema_version === 6;
  if (schemaOk
    && hasRecords(parsed.bots)
    && hasRecords(parsed.versions)
    && hasRecords(parsed.tasks)
    && hasRecords(parsed.taskRuns)
    && hasRecords(parsed.schedules)
    && hasRecords(parsed.runs)
    && hasRecords(parsed.logs)
    && hasRecords(parsed.workers)
    && hasRecords(parsed.workerLogs)
    && isRecord(parsed.workerMetrics)
    && Object.values(parsed.workerMetrics).every(hasRecords)
  ) {
    const database = parsed as DB;
    let changed = false;
    if (parsed.schema_version !== SCHEMA_VERSION) {
      database.schema_version = SCHEMA_VERSION;
      changed = true;
    }
    if (!Array.isArray(database.workerPools)) {
      database.workerPools = [];
      changed = true;
    }
    // Normalize worker assignment field name + system/user tag split.
    database.workers.forEach((worker) => {
      const raw = worker as unknown as Record<string, unknown>;
      if (!Array.isArray(worker.current_task_run_ids)) {
        worker.current_task_run_ids = Array.isArray(raw.current_task_ids)
          ? (raw.current_task_ids as string[])
          : [];
        changed = true;
      }
      // Schema ≤7 used a single `tags` list (registration-origin). Promote to system_tags.
      if (!Array.isArray(worker.system_tags)) {
        worker.system_tags = Array.isArray(raw.tags)
          ? (raw.tags as string[]).map((tag) => String(tag).trim()).filter(Boolean)
          : [];
        changed = true;
      }
      if (!Array.isArray(worker.user_tags)) {
        worker.user_tags = [];
        changed = true;
      }
      // Schema ≤8 lacked runtimes; default to a common Python runtime for mock continuity.
      if (!Array.isArray(worker.runtimes)) {
        worker.runtimes = ['python3.12'];
        changed = true;
      }
      // Drop legacy combined field if present so callers don't prefer the stale list.
      if ('tags' in raw) {
        delete raw.tags;
        changed = true;
      }
    });
    database.logs.forEach((entry) => {
      const raw = entry as unknown as Record<string, unknown>;
      if (typeof entry.task_run_id !== 'string' && typeof raw.task_id === 'string') {
        entry.task_run_id = raw.task_id as string;
        changed = true;
      }
    });
    // Normalize placement: worker pin, pool scope, or null for auto dispatch.
    const normalizePlacement = (row: { target_pool_id?: string | null; target_worker_id?: string | null }, raw: Record<string, unknown>) => {
      let rowChanged = false;
      const rawWorker = raw.target_worker_id;
      if (rawWorker === null || rawWorker === '' || rawWorker === 'auto' || rawWorker === 'random') {
        if (row.target_worker_id !== null) {
          row.target_worker_id = null;
          rowChanged = true;
        }
      } else if (typeof rawWorker === 'string') {
        if (row.target_worker_id !== rawWorker) {
          row.target_worker_id = rawWorker;
          rowChanged = true;
        }
      } else if (typeof row.target_worker_id !== 'string' && row.target_worker_id !== null) {
        row.target_worker_id = null;
        rowChanged = true;
      }
      const rawPool = raw.target_pool_id;
      if (rawPool === null || rawPool === '' || rawPool === undefined) {
        if (row.target_pool_id !== null && row.target_pool_id !== undefined) {
          row.target_pool_id = null;
          rowChanged = true;
        } else if (row.target_pool_id === undefined) {
          row.target_pool_id = null;
          rowChanged = true;
        }
      } else if (typeof rawPool === 'string') {
        if (row.target_pool_id !== rawPool) {
          row.target_pool_id = rawPool;
          rowChanged = true;
        }
      } else if (typeof row.target_pool_id !== 'string') {
        row.target_pool_id = null;
        rowChanged = true;
      }
      // Worker pin and pool are mutually exclusive; pin wins.
      if (row.target_worker_id && row.target_pool_id) {
        row.target_pool_id = null;
        rowChanged = true;
      }
      return rowChanged;
    };
    database.schedules.forEach((schedule) => {
      if (normalizePlacement(schedule, schedule as unknown as Record<string, unknown>)) changed = true;
    });
    database.taskRuns.forEach((taskRun) => {
      if (normalizePlacement(taskRun, taskRun as unknown as Record<string, unknown>)) changed = true;
    });
    database.workerPools.forEach((pool) => {
      if (!Array.isArray(pool.worker_ids)) {
        pool.worker_ids = [];
        changed = true;
      }
      if (!Array.isArray(pool.tags)) {
        pool.tags = [];
        changed = true;
      }
      if (pool.enabled === undefined) {
        pool.enabled = pool.status === 'enabled';
        changed = true;
      }
    });
    return { db: database, changed: reconcileLinks(database) || changed };
  }

  // Older mock schemas are reseeds — the hierarchy rewrite is not lossless.
  return null;
}

function tryPersist(value: DB) { try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* memory-only */ } }
function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const migrated = migratePersistedDB(JSON.parse(raw));
      if (migrated) {
        if (migrated.changed) tryPersist(migrated.db);
        return migrated.db;
      }
    }
  } catch { /* seed */ }
  const fresh = seed();
  tryPersist(fresh);
  return fresh;
}

export const db: DB = load();

export async function refreshScheduleTimes(reference = new Date()): Promise<void> {
  let changed = false;
  for (const schedule of db.schedules) {
    if (schedule.status !== 'enabled') {
      if (schedule.next_planned_at || schedule.next_run_at) {
        schedule.next_planned_at = schedule.next_run_at = null;
        changed = true;
      }
      continue;
    }
    const timezone = validateTimezone(schedule.timezone);
    if (!timezone) continue;
    const valid = schedule.next_planned_at && schedule.next_run_at && Date.parse(schedule.next_run_at) >= Date.parse(schedule.next_planned_at);
    if (!valid) {
      const timing = await calculateNextScheduleTimes({ cron: schedule.cron, timezone, jitterSeconds: schedule.jitter_seconds, after: reference });
      if (timing) {
        schedule.next_planned_at = timing.next_planned_at;
        schedule.next_run_at = timing.next_run_at;
        changed = true;
      }
    }
  }
  if (changed) emit();
}

type Listener = () => void;
const listeners = new Set<Listener>();
let revision = 0;
let timer: number | null = null;
function persist() {
  timer ??= window.setTimeout(() => {
    timer = null;
    tryPersist(db);
  }, 200);
}
export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getRevision() { return revision; }
function emit() {
  persist();
  revision++;
  listeners.forEach((fn) => fn());
}

let logSeq = 0;
let workerLogSeq = 0;
export const emitHelpers = {
  emit,
  log(task_run_id: string, level: LogEntry['level'], source: LogEntry['source'], message: string) {
    db.logs.push({ id: uid('log'), task_run_id, seq: ++logSeq, level, source, message, created_at: now() });
  },
  workerLog(worker_id: string, level: WorkerLogEntry['level'], source: WorkerLogEntry['source'], message: string) {
    db.workerLogs.push({ id: uid('wlog'), worker_id, seq: ++workerLogSeq, level, source, message, created_at: now() });
  },
  workerMetric(workerId: string, point: WorkerMetricPoint) {
    (db.workerMetrics[workerId] ??= []).push(point);
  },
  reset() {
    const fresh = seed();
    Object.assign(db, fresh);
    emit();
    void refreshScheduleTimes();
  },
};
void refreshScheduleTimes();
