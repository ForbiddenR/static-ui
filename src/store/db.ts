// Client-side data layer simulating the Master REST API contracts from docs/.
// Persisted to localStorage; a tiny pub/sub keeps React views in sync.

export type TaskStatus =
  | 'pending' | 'dispatching' | 'running' | 'canceling'
  | 'success' | 'partial_success' | 'failed' | 'canceled' | 'timeout';

export type TaskItemStatus =
  | 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'canceled' | 'timeout';

export interface Bot {
  id: string;
  code: string;
  name: string;
  description: string;
  enabled: boolean;
  current_version_id: string | null;
  created_at: string;
}

export interface BotVersion {
  id: string;
  bot_id: string;
  version: string;
  status: 'draft' | 'published';
  script_file: string;
  created_at: string;
}

export interface TaskItem {
  id: string;
  key: string;
  status: TaskItemStatus;
}

export interface Task {
  id: string;
  bot_id: string;
  bot_name: string;
  status: TaskStatus;
  run_type: 'manual' | 'scheduled' | 'retry' | 'rerun';
  source_task_id: string | null;
  input_params: Record<string, string>;
  statistics: { total: number; success: number; failed: number; skipped: number };
  items: TaskItem[];
  worker_id: string | null;
  error_code: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface Schedule {
  id: string;
  bot_id: string;
  bot_name: string;
  name: string;
  cron: string;
  timezone: string;
  enabled: boolean;
  overlap_policy: 'skip' | 'queue' | 'replace' | 'parallel';
  missed_run_policy: 'skip' | 'run_once';
  jitter_seconds: number;
  created_at: string;
}

export interface ScheduleRun {
  id: string;
  schedule_id: string;
  task_id: string | null;
  trigger_reason: 'cron' | 'manual' | 'missed_run_catchup';
  planned_at: string;
  jitter_applied_seconds: number;
  created_at: string;
}

export interface LogEntry {
  id: string;
  task_id: string;
  seq: number;
  level: 'debug' | 'info' | 'warning' | 'error';
  source: 'script' | 'worker' | 'runtime' | 'master' | 'system';
  message: string;
  created_at: string;
}

export interface Worker {
  id: string;
  name: string;
  status: 'online' | 'offline';
  enabled: boolean;
  capacity_max: number;
  capacity_used: number;
  tags: string[];
  version: string;
  session_id: string | null;
  current_task_ids: string[];
  last_heartbeat_at: string;
  created_at: string;
}

export interface DB {
  bots: Bot[];
  versions: BotVersion[];
  tasks: Task[];
  schedules: Schedule[];
  runs: ScheduleRun[];
  logs: LogEntry[];
  workers: Worker[];
}

const KEY = 'botops-db-v2';

let counter = 0;
export function uid(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function now(): string {
  return new Date().toISOString();
}

function seed(): DB {
  const ts = now();
  const botA: Bot = { id: 'bot_invoice_sync', code: 'INV-SYNC', name: 'Invoice Sync Bot', description: 'Syncs invoices from the ERP into the finance data warehouse.', enabled: true, current_version_id: 'bv_inv_3', created_at: ts };
  const botB: Bot = { id: 'bot_price_crawl', code: 'PRC-CRAWL', name: 'Price Crawler', description: 'Reads competitor price pages and reports structured crawl records.', enabled: true, current_version_id: 'bv_prc_2', created_at: ts };
  const versions: BotVersion[] = [
    { id: 'bv_inv_1', bot_id: botA.id, version: 'v1.0.0', status: 'published', script_file: 'inv_sync_v1.zip', created_at: ts },
    { id: 'bv_inv_3', bot_id: botA.id, version: 'v1.2.0', status: 'published', script_file: 'inv_sync_v1_2.zip', created_at: ts },
    { id: 'bv_inv_4', bot_id: botA.id, version: 'v1.3.0-rc1', status: 'draft', script_file: 'inv_sync_v1_3rc1.zip', created_at: ts },
    { id: 'bv_prc_2', bot_id: botB.id, version: 'v0.9.2', status: 'published', script_file: 'price_crawl_092.zip', created_at: ts },
  ];
  const tasks: Task[] = [
    {
      id: 'task_9f2c01', bot_id: botA.id, bot_name: botA.name, status: 'success', run_type: 'scheduled',
      source_task_id: null, input_params: { window: '2026-07-20' },
      statistics: { total: 128, success: 128, failed: 0, skipped: 0 },
      items: [
        { id: 'ti_1', key: 'INV-2026-0701', status: 'success' },
        { id: 'ti_2', key: 'INV-2026-0702', status: 'success' },
        { id: 'ti_3', key: 'INV-2026-0703', status: 'success' },
      ],
      error_code: null, worker_id: 'worker_edge_01', created_at: ts, finished_at: ts,
    },
    {
      id: 'task_7ab3d4', bot_id: botB.id, bot_name: botB.name, status: 'partial_success', run_type: 'manual',
      source_task_id: null, input_params: { category: 'gpu' },
      statistics: { total: 40, success: 36, failed: 3, skipped: 1 },
      items: [
        { id: 'ti_9', key: 'https://shop.example/gpu/rtx5090', status: 'success' },
        { id: 'ti_10', key: 'https://shop.example/gpu/rx8900', status: 'failed' },
        { id: 'ti_11', key: 'https://shop.example/gpu/arc-b880', status: 'skipped' },
      ],
      error_code: null, worker_id: 'worker_edge_02', created_at: ts, finished_at: ts,
    },
    {
      id: 'task_55e8aa', bot_id: botB.id, bot_name: botB.name, status: 'running', run_type: 'manual',
      source_task_id: null, input_params: { category: 'cpu' },
      statistics: { total: 12, success: 8, failed: 0, skipped: 0 },
      items: [
        { id: 'ti_21', key: 'https://shop.example/cpu/i9-15900k', status: 'success' },
        { id: 'ti_22', key: 'https://shop.example/cpu/r9-9950x', status: 'running' },
        { id: 'ti_23', key: 'https://shop.example/cpu/u9-285k', status: 'pending' },
      ],
      error_code: null, worker_id: 'worker_edge_01', created_at: ts, finished_at: null,
    },
  ];
  const schedules: Schedule[] = [
    { id: 'sch_nightly_inv', bot_id: botA.id, bot_name: botA.name, name: 'Nightly invoice sync', cron: '0 2 * * *', timezone: 'Asia/Shanghai', enabled: true, overlap_policy: 'skip', missed_run_policy: 'skip', jitter_seconds: 300, created_at: ts },
    { id: 'sch_hourly_price', bot_id: botB.id, bot_name: botB.name, name: 'Hourly price sweep', cron: '7 * * * *', timezone: 'UTC', enabled: false, overlap_policy: 'skip', missed_run_policy: 'run_once', jitter_seconds: 60, created_at: ts },
  ];
  const runs: ScheduleRun[] = [
    { id: 'srun_1', schedule_id: 'sch_nightly_inv', task_id: 'task_9f2c01', trigger_reason: 'cron', planned_at: ts, jitter_applied_seconds: 127, created_at: ts },
  ];
  const logs: LogEntry[] = [
    { id: 'log_1', task_id: 'task_9f2c01', seq: 1, level: 'info', source: 'master', message: 'task dispatched to worker_edge-03', created_at: ts },
    { id: 'log_2', task_id: 'task_9f2c01', seq: 2, level: 'info', source: 'worker', message: 'script process started, assignment accepted', created_at: ts },
    { id: 'log_3', task_id: 'task_9f2c01', seq: 3, level: 'info', source: 'script', message: 'loaded 128 invoices from ERP window 2026-07-20', created_at: ts },
    { id: 'log_4', task_id: 'task_9f2c01', seq: 4, level: 'info', source: 'script', message: 'all task items finalized', created_at: ts },
    { id: 'log_5', task_id: 'task_7ab3d4', seq: 1, level: 'warning', source: 'script', message: '3 pages returned HTTP 503, marked failed', created_at: ts },
    { id: 'log_6', task_id: 'task_7ab3d4', seq: 2, level: 'info', source: 'master', message: 'terminal state arbitrated: partial_success', created_at: ts },
    { id: 'log_7', task_id: 'task_55e8aa', seq: 1, level: 'info', source: 'worker', message: 'script process started, assignment accepted', created_at: ts },
    { id: 'log_8', task_id: 'task_55e8aa', seq: 2, level: 'debug', source: 'runtime', message: 'runtime report batch flushed (12 items)', created_at: ts },
  ];
  const workers: Worker[] = [
    { id: 'worker_edge_01', name: 'edge-01', status: 'online', enabled: true, capacity_max: 4, capacity_used: 1, tags: ['gpu', 'cn-shanghai'], version: 'workerd/1.4.2', session_id: 'sess_a91f', current_task_ids: ['task_55e8aa'], last_heartbeat_at: ts, created_at: ts },
    { id: 'worker_edge_02', name: 'edge-02', status: 'online', enabled: true, capacity_max: 2, capacity_used: 0, tags: ['cn-beijing'], version: 'workerd/1.4.2', session_id: 'sess_b207', current_task_ids: [], last_heartbeat_at: ts, created_at: ts },
    { id: 'worker_batch_01', name: 'batch-01', status: 'offline', enabled: false, capacity_max: 8, capacity_used: 0, tags: ['batch', 'high-mem'], version: 'workerd/1.3.9', session_id: null, current_task_ids: [], last_heartbeat_at: ts, created_at: ts },
  ];
  return { bots: [botA, botB], versions, tasks, schedules, runs, logs, workers };
}

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (Array.isArray(parsed.bots) && Array.isArray(parsed.tasks)) return parsed;
    }
  } catch {
    /* corrupted -> reseed */
  }
  const fresh = seed();
  localStorage.setItem(KEY, JSON.stringify(fresh));
  return fresh;
}

export const db: DB = load();

function persist() {
  localStorage.setItem(KEY, JSON.stringify(db));
}

// ---- pub/sub ----
type Listener = () => void;
const listeners = new Set<Listener>();
let revision = 0;

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getRevision(): number {
  return revision;
}

function emit() {
  persist();
  revision += 1;
  listeners.forEach((fn) => fn());
}

let logSeq = db.logs.reduce((m, l) => Math.max(m, l.seq), 0);

export const emitHelpers = {
  emit,
  log(taskId: string, level: LogEntry['level'], source: LogEntry['source'], message: string) {
    logSeq += 1;
    db.logs.push({ id: uid('log'), task_id: taskId, seq: logSeq, level, source, message, created_at: now() });
  },
  reset() {
    const fresh = seed();
    db.bots = fresh.bots;
    db.versions = fresh.versions;
    db.tasks = fresh.tasks;
    db.schedules = fresh.schedules;
    db.runs = fresh.runs;
    db.logs = fresh.logs;
    db.workers = fresh.workers;
    emit();
  },
};
