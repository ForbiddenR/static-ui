// Client-side mock persistence. V1 machine names and botops-db-v2 are deliberate compatibility contracts.
import { calculateNextScheduleTimes, validateTimezone } from './scheduleTime';

export type TaskStatus = 'pending' | 'dispatching' | 'running' | 'canceling' | 'success' | 'partial_success' | 'failed' | 'canceled' | 'timeout';
export type TaskItemStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'canceled' | 'timeout';
export type InputSource = 'file' | 'params' | 'task_items' | 'none';
export type TaskRunType = 'manual' | 'api' | 'schedule' | 'retry_all' | 'retry_failed_items' | 'rerun';
export type JsonObject = Record<string, unknown>;

export interface Bot {
  id: string; code: string; description: string; category: string | null; tags: string[];
  status: 'draft' | 'enabled' | 'disabled' | 'archived';
  /** Compatibility projection for older views. Status is authoritative. */ enabled: boolean;
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
  bot_id: string; bot_code: string; bot_version_id: string; /** Number for v5 records; legacy snapshots retain their original label. */ version: number | string;
  script_source: string; source_file_id: string | null; script_file: string; entrypoint: string;
  input_params_schema: JsonObject; default_input_source: InputSource; default_config: JsonObject; default_requirements: JsonObject;
}
export type JobDefinition = Bot; export type JobDefinitionVersion = BotVersion; export type JobDefinitionSnapshot = BotSnapshot;
export interface TaskItem { id: string; key: string; status: TaskItemStatus; input_data?: JsonObject; }
export interface TaskStatistics { total: number; success: number; failed: number; skipped: number; timeout?: number; canceled?: number; pending?: number; running?: number; completed?: number; }
export interface Task {
  id: string; bot_id: string; bot_code: string; bot_version_id: string | null; bot_snapshot: BotSnapshot | null;
  schedule_id: string | null; schedule_run_id: string | null; source_task_id: string | null;
  status: TaskStatus; run_type: TaskRunType; input_source: InputSource; input_file_id: string | null; input_params: JsonObject;
  config: JsonObject; requirements: JsonObject; priority: number; entrypoint: string; statistics: TaskStatistics; items: TaskItem[];
  worker_id: string | null; error_code: string | null; created_at: string; updated_at: string; finished_at: string | null;
}
export type ScheduleOverlapPolicy = 'skip'; export type ScheduleMissedRunPolicy = 'skip' | 'run_once';
export interface Schedule {
  id: string; bot_id: string; bot_version_id: string | null; bot_code: string; name: string; description: string | null;
  cron: string; timezone: string; input_source: InputSource; input_file_id: string | null; input_params: JsonObject; config: JsonObject; requirements: JsonObject;
  /** status is authoritative; enabled remains for old screens. */ status: 'enabled' | 'disabled' | 'archived'; enabled: boolean;
  overlap_policy: ScheduleOverlapPolicy; missed_run_policy: ScheduleMissedRunPolicy; jitter_seconds: number; max_parallel_runs: number;
  last_run_at: string | null; last_task_id: string | null; next_planned_at: string | null; next_run_at: string | null;
  created_by: string; created_at: string; updated_at: string; archived_at: string | null;
}
export type ScheduleRunStatus = 'task_created' | 'skipped' | 'failed'; export type ScheduleRunTriggerType = 'cron' | 'manual' | 'missed_run_catchup';
export interface ScheduleRun {
  id: string; schedule_id: string; bot_id: string; task_id: string | null; trigger_type: ScheduleRunTriggerType;
  planned_at: string; scheduled_at: string; jitter_seconds: number; jitter_applied_seconds: number; triggered_at: string;
  status: ScheduleRunStatus; reason: string | null; overlap_policy: ScheduleOverlapPolicy; missed_run_policy: ScheduleMissedRunPolicy;
  error_code: string | null; error_message: string | null; created_at: string;
}
export interface LogEntry { id: string; task_id: string; seq: number; level: 'debug' | 'info' | 'warning' | 'error'; source: 'script' | 'worker' | 'runtime' | 'master' | 'system'; message: string; created_at: string; }
export interface Worker { id: string; name: string; status: 'online' | 'offline'; enabled: boolean; capacity_max: number; capacity_used: number; tags: string[]; version: string; session_id: string | null; current_task_ids: string[]; last_heartbeat_at: string; created_at: string; }
export interface WorkerMetricPoint { ts: string; cpu_pct: number; mem_pct: number; items_per_min: number; rtt_ms: number; }
export interface WorkerLogEntry { id: string; worker_id: string; seq: number; level: 'debug' | 'info' | 'warning' | 'error'; source: 'heartbeat' | 'dispatch' | 'runtime' | 'session' | 'master'; message: string; created_at: string; }
export interface DB { schema_version: number; bots: Bot[]; versions: BotVersion[]; tasks: Task[]; schedules: Schedule[]; runs: ScheduleRun[]; logs: LogEntry[]; workers: Worker[]; workerMetrics: Record<string, WorkerMetricPoint[]>; workerLogs: WorkerLogEntry[]; }

const KEY = 'botops-db-v2'; const SCHEMA_VERSION = 5; let counter = 0;
export const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(++counter).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const now = () => new Date().toISOString();
const object = (value: unknown): JsonObject => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
const inputSource = (value: unknown): InputSource => ['file', 'params', 'task_items', 'none'].includes(String(value)) ? value as InputSource : 'params';
const stats = (items: TaskItem[]): TaskStatistics => {
  const count = (status: TaskItemStatus) => items.filter((item) => item.status === status).length;
  const success = count('success'), failed = count('failed'), skipped = count('skipped'), timeout = count('timeout'), canceled = count('canceled');
  return { total: items.length, success, failed, skipped, timeout, canceled, pending: count('pending'), running: count('running'), completed: success + failed + skipped + timeout + canceled };
};
function reconcileScheduleTaskLinks(database: Pick<DB, 'schedules' | 'runs' | 'tasks'>): boolean {
  let changed = false;
  database.runs.forEach((run) => {
    const schedule = database.schedules.find((candidate) => candidate.id === run.schedule_id);
    const task = run.task_id ? database.tasks.find((candidate) => candidate.id === run.task_id) : undefined;
    const relationshipValid = Boolean(
      schedule
      && task
      && schedule.bot_id === run.bot_id
      && task.bot_id === run.bot_id
      && (task.schedule_id === null || task.schedule_id === run.schedule_id)
      && (task.schedule_run_id === null || task.schedule_run_id === run.id),
    );
    if (!relationshipValid || !task) {
      if (run.status === 'task_created') {
        run.status = 'failed';
        run.reason = 'create_task_failed';
        changed = true;
      }
      if (run.task_id !== null) changed = true;
      run.task_id = null;
      return;
    }
    if (task.schedule_id !== run.schedule_id || task.schedule_run_id !== run.id) {
      task.schedule_id = run.schedule_id;
      task.schedule_run_id = run.id;
      changed = true;
    }
    if (run.status !== 'task_created' || run.reason !== null) {
      run.status = 'task_created';
      run.reason = null;
      changed = true;
    }
  });
  database.tasks.forEach((task) => {
    if (task.schedule_id === null && task.schedule_run_id === null) return;
    const run = database.runs.find((candidate) => candidate.id === task.schedule_run_id);
    const valid = Boolean(
      run
      && run.status === 'task_created'
      && run.task_id === task.id
      && run.schedule_id === task.schedule_id
      && run.bot_id === task.bot_id,
    );
    if (!valid) {
      task.schedule_id = null;
      task.schedule_run_id = null;
      changed = true;
    }
  });
  return changed;
}
const defaultVersion = (bot: Bot, id: string, version: number, file: string): BotVersion => ({ id, bot_id: bot.id, version, status: 'published', is_current: true, script_source: 'upload', source_file_id: `file_${file}`, script_file: file, entrypoint: 'main.py', input_params_schema: {}, default_input_source: 'params', default_config: {}, default_requirements: {}, change_note: null, created_by: 'user_demo', created_at: bot.created_at, published_at: bot.created_at, published_by: 'user_demo' });
function seed(): DB {
  const ts = now();
  const botA: Bot = { id: 'bot_invoice_sync', code: 'INV-SYNC', description: 'Syncs invoices from the ERP into the finance data warehouse.', category: 'sync', tags: ['finance'], status: 'enabled', enabled: true, entrypoint: 'main.py', script_source: 'upload', current_version_id: 'bv_inv_3', default_input_source: 'params', input_params_schema: {}, default_config: {}, default_requirements: {}, created_by: 'user_demo', created_at: ts, updated_at: ts, archived_at: null };
  const botB: Bot = { ...botA, id: 'bot_price_crawl', code: 'PRC-CRAWL', description: 'Reads competitor price pages and reports structured crawl records.', category: 'crawler', tags: ['pricing'], current_version_id: 'bv_prc_2' };
  const versions = [defaultVersion(botA, 'bv_inv_3', 3, 'inv_sync_v1_2.zip'), defaultVersion(botB, 'bv_prc_2', 2, 'price_crawl_092.zip'), { ...defaultVersion(botA, 'bv_inv_4', 4, 'inv_sync_v1_3rc1.zip'), status: 'draft' as const, is_current: false, published_at: null, published_by: null }];
  const snapshot = (bot: Bot, versionId: string): BotSnapshot => { const version = versions.find((v) => v.id === versionId)!; return { bot_id: bot.id, bot_code: bot.code, bot_version_id: version.id, version: version.version, script_source: version.script_source, source_file_id: version.source_file_id, script_file: version.script_file, entrypoint: version.entrypoint, input_params_schema: {}, default_input_source: version.default_input_source, default_config: {}, default_requirements: {} }; };
  const successful: TaskItem[] = [{ id: 'ti_1', key: 'INV-2026-0701', status: 'success' }, { id: 'ti_2', key: 'INV-2026-0702', status: 'success' }, { id: 'ti_3', key: 'INV-2026-0703', status: 'success' }];
  const partial: TaskItem[] = [{ id: 'ti_9', key: 'https://shop.example/gpu/rtx5090', status: 'success' }, { id: 'ti_10', key: 'https://shop.example/gpu/rx8900', status: 'failed' }, { id: 'ti_11', key: 'https://shop.example/gpu/arc-b880', status: 'skipped' }];
  const active: TaskItem[] = [{ id: 'ti_21', key: 'https://shop.example/cpu/i9-15900k', status: 'success' }, { id: 'ti_22', key: 'https://shop.example/cpu/r9-9950x', status: 'running' }, { id: 'ti_23', key: 'https://shop.example/cpu/u9-285k', status: 'pending' }];
  const task = (id: string, bot: Bot, version: string, items: TaskItem[], status: TaskStatus, extra: Partial<Task>): Task => ({ id, bot_id: bot.id, bot_code: bot.code, bot_version_id: version, bot_snapshot: snapshot(bot, version), schedule_id: null, schedule_run_id: null, source_task_id: null, status, run_type: 'manual', input_source: 'params', input_file_id: null, input_params: {}, config: {}, requirements: {}, priority: 50, entrypoint: 'main.py', statistics: stats(items), items, worker_id: null, error_code: null, created_at: ts, updated_at: ts, finished_at: status === 'running' ? null : ts, ...extra });
  const tasks = [task('task_9f2c01', botA, 'bv_inv_3', successful, 'success', { run_type: 'schedule', schedule_id: 'sch_nightly_inv', schedule_run_id: 'srun_1', input_params: { window: '2026-07-20' }, worker_id: 'worker_edge_01' }), task('task_7ab3d4', botB, 'bv_prc_2', partial, 'partial_success', { input_params: { category: 'gpu' }, worker_id: 'worker_edge_02' }), task('task_55e8aa', botB, 'bv_prc_2', active, 'running', { input_params: { category: 'cpu' }, worker_id: 'worker_edge_01' })];
  const schedules: Schedule[] = [{ id: 'sch_nightly_inv', bot_id: botA.id, bot_version_id: 'bv_inv_3', bot_code: botA.code, name: 'Nightly invoice sync', description: null, cron: '0 2 * * *', timezone: 'Asia/Shanghai', input_source: 'params', input_file_id: null, input_params: { window: 'today' }, config: {}, requirements: {}, status: 'enabled', enabled: true, overlap_policy: 'skip', missed_run_policy: 'skip', jitter_seconds: 300, max_parallel_runs: 1, last_run_at: ts, last_task_id: 'task_9f2c01', next_planned_at: null, next_run_at: null, created_by: 'user_demo', created_at: ts, updated_at: ts, archived_at: null }, { id: 'sch_hourly_price', bot_id: botB.id, bot_version_id: null, bot_code: botB.code, name: 'Hourly price sweep', description: null, cron: '7 * * * *', timezone: 'UTC', input_source: 'params', input_file_id: null, input_params: { category: 'all' }, config: {}, requirements: {}, status: 'disabled', enabled: false, overlap_policy: 'skip', missed_run_policy: 'run_once', jitter_seconds: 60, max_parallel_runs: 1, last_run_at: null, last_task_id: null, next_planned_at: null, next_run_at: null, created_by: 'user_demo', created_at: ts, updated_at: ts, archived_at: null }];
  const runs: ScheduleRun[] = [{ id: 'srun_1', schedule_id: 'sch_nightly_inv', bot_id: botA.id, task_id: 'task_9f2c01', trigger_type: 'cron', planned_at: ts, scheduled_at: ts, jitter_seconds: 300, jitter_applied_seconds: 0, triggered_at: ts, status: 'task_created', reason: null, overlap_policy: 'skip', missed_run_policy: 'skip', error_code: null, error_message: null, created_at: ts }];
  const workers: Worker[] = [
    { id: 'worker_edge_01', name: 'edge-01', status: 'online', enabled: true, capacity_max: 4, capacity_used: 1, tags: ['gpu', 'cn-shanghai'], version: 'workerd/1.4.2', session_id: 'sess_a91f', current_task_ids: ['task_55e8aa'], last_heartbeat_at: ts, created_at: ts },
    { id: 'worker_edge_02', name: 'edge-02', status: 'online', enabled: true, capacity_max: 2, capacity_used: 0, tags: ['cn-beijing'], version: 'workerd/1.4.2', session_id: 'sess_b207', current_task_ids: [], last_heartbeat_at: ts, created_at: ts },
    { id: 'worker_batch_01', name: 'batch-01', status: 'offline', enabled: false, capacity_max: 8, capacity_used: 0, tags: ['batch', 'high-mem'], version: 'workerd/1.3.9', session_id: null, current_task_ids: [], last_heartbeat_at: ts, created_at: ts },
  ];
  const logs: LogEntry[] = [
    { id: 'log_1', task_id: 'task_9f2c01', seq: 1, level: 'info', source: 'master', message: 'task dispatched to worker_edge-01', created_at: ts },
    { id: 'log_2', task_id: 'task_9f2c01', seq: 2, level: 'info', source: 'worker', message: 'script process started, assignment accepted', created_at: ts },
    { id: 'log_3', task_id: 'task_9f2c01', seq: 3, level: 'info', source: 'script', message: 'loaded invoices from ERP window 2026-07-20', created_at: ts },
    { id: 'log_4', task_id: 'task_9f2c01', seq: 4, level: 'info', source: 'script', message: 'all task items finalized', created_at: ts },
    { id: 'log_5', task_id: 'task_7ab3d4', seq: 1, level: 'warning', source: 'script', message: 'one page returned HTTP 503, marked failed', created_at: ts },
    { id: 'log_6', task_id: 'task_7ab3d4', seq: 2, level: 'info', source: 'master', message: 'terminal state arbitrated: partial_success', created_at: ts },
    { id: 'log_7', task_id: 'task_55e8aa', seq: 1, level: 'info', source: 'worker', message: 'script process started, assignment accepted', created_at: ts },
    { id: 'log_8', task_id: 'task_55e8aa', seq: 2, level: 'debug', source: 'runtime', message: 'runtime report batch flushed', created_at: ts },
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
    { id: 'wlog_2', worker_id: 'worker_edge_01', seq: 2, level: 'info', source: 'dispatch', message: 'assignment task_55e8aa accepted; slot 1/4', created_at: ts },
    { id: 'wlog_3', worker_id: 'worker_edge_01', seq: 3, level: 'debug', source: 'runtime', message: 'runtime report batch flushed', created_at: ts },
    { id: 'wlog_4', worker_id: 'worker_edge_02', seq: 4, level: 'info', source: 'session', message: 'session registered (sess_b207); capacity advertised 2 slots', created_at: ts },
    { id: 'wlog_5', worker_id: 'worker_edge_02', seq: 5, level: 'debug', source: 'heartbeat', message: 'heartbeat ok rtt=28ms cap=0/2', created_at: ts },
    { id: 'wlog_6', worker_id: 'worker_batch_01', seq: 6, level: 'warning', source: 'heartbeat', message: 'heartbeat missed (3 consecutive); grace window entered', created_at: ts },
    { id: 'wlog_7', worker_id: 'worker_batch_01', seq: 7, level: 'error', source: 'session', message: 'session expired; node marked offline', created_at: ts },
    { id: 'wlog_8', worker_id: 'worker_batch_01', seq: 8, level: 'warning', source: 'master', message: 'admission disabled by operator', created_at: ts },
  ];
  return { schema_version: SCHEMA_VERSION, bots: [botA, botB], versions, tasks, schedules, runs, logs, workers, workerMetrics, workerLogs };
}

// Idempotent v4 -> v5 conversion. Valid pre-existing frozen snapshots are never rebuilt.
function migratePersistedDB(value: unknown): { db: DB; changed: boolean } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const parsed = value as Partial<DB> & Record<string, unknown>;
  const isRecord = (candidate: unknown): candidate is Record<string, unknown> => (
    Boolean(candidate) && typeof candidate === 'object' && !Array.isArray(candidate)
  );
  const hasRecords = (candidate: unknown): boolean => (
    Array.isArray(candidate) && candidate.every(isRecord)
  );
  const requiredCollections = ['bots', 'tasks', 'versions', 'schedules', 'runs', 'logs', 'workers', 'workerLogs'] as const;
  if (!requiredCollections.every((key) => hasRecords(parsed[key]))) return null;
  if (!isRecord(parsed.workerMetrics) || !Object.values(parsed.workerMetrics).every(hasRecords)) return null;
  // Completed v5 data still receives relationship reconciliation so a partial
  // browser write cannot leave one-sided ScheduleRun ↔ Task provenance.
  if (parsed.schema_version === SCHEMA_VERSION) {
    const database = parsed as DB;
    return { db: database, changed: reconcileScheduleTaskLinks(database) };
  }
  const schemaChanged = true; let changed = false; const ts = now();
  const collection = <T>(key: keyof DB): T[] => Array.isArray(parsed[key]) ? parsed[key] as T[] : (changed = true, (parsed[key] = [] as never), parsed[key] as T[]);
  const bots = collection<Bot>('bots'), versions = collection<BotVersion>('versions'), tasks = collection<Task>('tasks'), schedules = collection<Schedule>('schedules'), runs = collection<ScheduleRun>('runs'); collection<LogEntry>('logs'); collection<Worker>('workers'); collection<WorkerLogEntry>('workerLogs'); if (!parsed.workerMetrics || typeof parsed.workerMetrics !== 'object') { parsed.workerMetrics = {}; changed = true; }
  bots.forEach((bot) => { const raw = bot as unknown as Record<string, unknown>; const status = ['draft', 'enabled', 'disabled', 'archived'].includes(String(raw.status)) ? raw.status as Bot['status'] : raw.enabled ? 'enabled' : 'disabled'; Object.assign(bot, { category: typeof raw.category === 'string' ? raw.category : null, tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string') : [], status, enabled: status === 'enabled', entrypoint: typeof raw.entrypoint === 'string' ? raw.entrypoint : 'main.py', script_source: typeof raw.script_source === 'string' ? raw.script_source : 'upload', default_input_source: inputSource(raw.default_input_source), input_params_schema: object(raw.input_params_schema), default_config: object(raw.default_config), default_requirements: object(raw.default_requirements), created_by: typeof raw.created_by === 'string' ? raw.created_by : 'user_demo', updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : (bot.created_at ?? ts), archived_at: typeof raw.archived_at === 'string' ? raw.archived_at : null }); changed = true; });
  // V4 used semver labels. Allocate a stable, unique numeric sequence per
  // definition rather than coercing labels such as v1.2.0 to a duplicate 1.
  const versionNumbers = new Map<string, number>();
  const byBot = new Map<string, Array<{ version: BotVersion; originalIndex: number }>>();
  versions.forEach((version, originalIndex) => {
    const group = byBot.get(version.bot_id) ?? [];
    group.push({ version, originalIndex });
    byBot.set(version.bot_id, group);
  });
  byBot.forEach((group) => {
    group.sort((left, right) => {
      const leftCreated = Date.parse(left.version.created_at);
      const rightCreated = Date.parse(right.version.created_at);
      if (Number.isFinite(leftCreated) && Number.isFinite(rightCreated) && leftCreated !== rightCreated) return leftCreated - rightCreated;
      return left.originalIndex - right.originalIndex;
    });
    group.forEach(({ version }, index) => versionNumbers.set(version.id, index + 1));
  });
  versions.forEach((version) => {
    const raw = version as unknown as Record<string, unknown>;
    Object.assign(version, {
      version: versionNumbers.get(version.id) ?? 1,
      is_current: raw.is_current === true,
      script_source: typeof raw.script_source === 'string' ? raw.script_source : 'upload',
      source_file_id: typeof raw.source_file_id === 'string' ? raw.source_file_id : null,
      script_file: typeof raw.script_file === 'string' ? raw.script_file : (typeof raw.source_file_id === 'string' ? raw.source_file_id : 'script.zip'),
      entrypoint: typeof raw.entrypoint === 'string' ? raw.entrypoint : 'main.py',
      input_params_schema: object(raw.input_params_schema),
      default_input_source: inputSource(raw.default_input_source),
      default_config: object(raw.default_config),
      default_requirements: object(raw.default_requirements),
      change_note: typeof raw.change_note === 'string' ? raw.change_note : null,
      created_by: typeof raw.created_by === 'string' ? raw.created_by : 'user_demo',
      published_at: typeof raw.published_at === 'string' ? raw.published_at : null,
      published_by: typeof raw.published_by === 'string' ? raw.published_by : null,
    });
    changed = true;
  });
  bots.forEach((bot) => { const current = versions.find((version) => version.id === bot.current_version_id && version.bot_id === bot.id && version.status === 'published'); versions.filter((version) => version.bot_id === bot.id).forEach((version) => { version.is_current = Boolean(current && version.id === current.id); }); bot.current_version_id = current?.id ?? null; if (bot.status === 'enabled' && !current) { bot.status = 'disabled'; bot.enabled = false; } });
  tasks.forEach((task) => { const raw = task as unknown as Record<string, unknown>; const snapshot = object(raw.bot_snapshot); const frozen = typeof snapshot.bot_id === 'string' && snapshot.bot_id === task.bot_id && typeof snapshot.bot_version_id === 'string' && typeof snapshot.bot_code === 'string' && (typeof snapshot.version === 'number' || typeof snapshot.version === 'string') && typeof snapshot.script_file === 'string'; const version = versions.find((item) => item.id === (frozen ? snapshot.bot_version_id : raw.bot_version_id) && item.bot_id === task.bot_id); const bot = bots.find((item) => item.id === task.bot_id); if (frozen) raw.bot_snapshot = { ...snapshot, script_source: typeof snapshot.script_source === 'string' ? snapshot.script_source : (version?.script_source ?? 'upload'), source_file_id: typeof snapshot.source_file_id === 'string' ? snapshot.source_file_id : (version?.source_file_id ?? null), entrypoint: typeof snapshot.entrypoint === 'string' ? snapshot.entrypoint : (version?.entrypoint ?? 'main.py'), input_params_schema: object(snapshot.input_params_schema), default_input_source: inputSource(snapshot.default_input_source), default_config: object(snapshot.default_config), default_requirements: object(snapshot.default_requirements) }; else if (bot && version) raw.bot_snapshot = { bot_id: bot.id, bot_code: bot.code, bot_version_id: version.id, version: version.version, script_source: version.script_source, source_file_id: version.source_file_id, script_file: version.script_file, entrypoint: version.entrypoint, input_params_schema: version.input_params_schema, default_input_source: version.default_input_source, default_config: version.default_config, default_requirements: version.default_requirements }; const items = Array.isArray(task.items) ? task.items : []; Object.assign(task, { bot_code: typeof raw.bot_code === 'string' ? raw.bot_code : (bot?.code ?? task.bot_id), bot_version_id: frozen ? snapshot.bot_version_id as string : (version?.id ?? null), source_task_id: typeof raw.source_task_id === 'string' ? raw.source_task_id : null, schedule_id: typeof raw.schedule_id === 'string' ? raw.schedule_id : null, schedule_run_id: typeof raw.schedule_run_id === 'string' ? raw.schedule_run_id : null, run_type: ({ scheduled: 'schedule', retry: 'retry_all' } as Record<string, TaskRunType>)[String(raw.run_type)] ?? (['manual', 'api', 'schedule', 'retry_all', 'retry_failed_items', 'rerun'].includes(String(raw.run_type)) ? raw.run_type : 'manual'), input_source: inputSource(raw.input_source), input_file_id: typeof raw.input_file_id === 'string' ? raw.input_file_id : null, input_params: object(raw.input_params), config: object(raw.config), requirements: object(raw.requirements), priority: typeof raw.priority === 'number' ? raw.priority : 50, entrypoint: typeof raw.entrypoint === 'string' ? raw.entrypoint : (version?.entrypoint ?? 'main.py'), statistics: stats(items), updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : (task.created_at ?? ts) }); changed = true; });
  schedules.forEach((schedule) => { const raw = schedule as unknown as Record<string, unknown>; const status = ['enabled', 'disabled', 'archived'].includes(String(raw.status)) ? raw.status as Schedule['status'] : raw.enabled === false ? 'disabled' : 'enabled'; Object.assign(schedule, { description: typeof raw.description === 'string' ? raw.description : null, input_source: inputSource(raw.input_source), input_file_id: typeof raw.input_file_id === 'string' ? raw.input_file_id : null, input_params: object(raw.input_params), config: object(raw.config), requirements: object(raw.requirements), status, enabled: status === 'enabled', missed_run_policy: raw.missed_run_policy === 'run_once' ? 'run_once' : 'skip', max_parallel_runs: 1, last_run_at: typeof raw.last_run_at === 'string' ? raw.last_run_at : null, last_task_id: typeof raw.last_task_id === 'string' ? raw.last_task_id : null, created_by: typeof raw.created_by === 'string' ? raw.created_by : 'user_demo', updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : (schedule.created_at ?? ts), archived_at: typeof raw.archived_at === 'string' ? raw.archived_at : null }); changed = true; });
  schedules.forEach((schedule) => {
    if (schedule.bot_version_id && !versions.some((version) => version.id === schedule.bot_version_id && version.bot_id === schedule.bot_id && version.status === 'published')) {
      schedule.bot_version_id = null; changed = true;
    }
  });
  if (reconcileScheduleTaskLinks({ schedules, runs, tasks })) changed = true;
  schedules.forEach((schedule) => {
    const latest = runs.filter((run) => run.schedule_id === schedule.id).sort((a, b) => Date.parse(b.triggered_at) - Date.parse(a.triggered_at))[0];
    if (latest && !schedule.last_run_at) { schedule.last_run_at = latest.triggered_at; changed = true; }
    const latestTask = runs.filter((run) => run.schedule_id === schedule.id && run.status === 'task_created' && run.task_id).sort((a, b) => Date.parse(b.triggered_at) - Date.parse(a.triggered_at))[0];
    if (latestTask && !schedule.last_task_id) { schedule.last_task_id = latestTask.task_id; changed = true; }
  });
  parsed.schema_version = SCHEMA_VERSION; return { db: parsed as DB, changed: changed || schemaChanged };
}
function tryPersist(value: DB) { try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* memory-only */ } }
function load(): DB { try { const raw = localStorage.getItem(KEY); if (raw) { const migrated = migratePersistedDB(JSON.parse(raw)); if (migrated) { if (migrated.changed) tryPersist(migrated.db); return migrated.db; } } } catch { /* seed */ } const fresh = seed(); tryPersist(fresh); return fresh; }
export const db: DB = load();
export async function refreshScheduleTimes(reference = new Date()): Promise<void> { let changed = false; for (const schedule of db.schedules) { if (schedule.status !== 'enabled') { if (schedule.next_planned_at || schedule.next_run_at) { schedule.next_planned_at = schedule.next_run_at = null; changed = true; } continue; } const timezone = validateTimezone(schedule.timezone); if (!timezone) continue; const valid = schedule.next_planned_at && schedule.next_run_at && Date.parse(schedule.next_run_at) >= Date.parse(schedule.next_planned_at); if (!valid) { const timing = await calculateNextScheduleTimes({ cron: schedule.cron, timezone, jitterSeconds: schedule.jitter_seconds, after: reference }); if (timing) { schedule.next_planned_at = timing.next_planned_at; schedule.next_run_at = timing.next_run_at; changed = true; } } } if (changed) emit(); }
type Listener = () => void; const listeners = new Set<Listener>(); let revision = 0; let timer: number | null = null; function persist() { timer ??= window.setTimeout(() => { timer = null; tryPersist(db); }, 200); } export function subscribe(fn: Listener) { listeners.add(fn); return () => listeners.delete(fn); } export function getRevision() { return revision; } function emit() { persist(); revision++; listeners.forEach((fn) => fn()); }
let logSeq = 0; let workerLogSeq = 0;
export const emitHelpers = { emit, log(task_id: string, level: LogEntry['level'], source: LogEntry['source'], message: string) { db.logs.push({ id: uid('log'), task_id, seq: ++logSeq, level, source, message, created_at: now() }); }, workerLog(worker_id: string, level: WorkerLogEntry['level'], source: WorkerLogEntry['source'], message: string) { db.workerLogs.push({ id: uid('wlog'), worker_id, seq: ++workerLogSeq, level, source, message, created_at: now() }); }, workerMetric(workerId: string, point: WorkerMetricPoint) { (db.workerMetrics[workerId] ??= []).push(point); }, reset() { const fresh = seed(); Object.assign(db, fresh); emit(); void refreshScheduleTimes(); } };
void refreshScheduleTimes();
