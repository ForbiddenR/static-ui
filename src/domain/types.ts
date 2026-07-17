import type { ReactNode } from 'react'
import type { JsonObject } from './json'

export type BotStatus = 'enabled' | 'disabled'
export type TaskStatus = 'pending' | 'dispatching' | 'running' | 'canceling' | 'success' | 'partial_success' | 'failed' | 'timeout' | 'canceled'
export type TaskItemStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'canceled' | 'timeout'
export type TaskRunType = 'manual' | 'schedule' | 'retry_failed_items' | 'retry_all'
export type TaskPriority = 'low' | 'normal' | 'high'
export type InputSource = 'file' | 'params'
export type WorkerStatus = 'online' | 'offline'
export type LogLevel = 'info' | 'warning' | 'error'
export type LogSource = 'runtime' | 'script' | 'master'
export type ScheduleStatus = 'enabled' | 'disabled'
export type ScheduleRunStatus = 'task_created' | 'skipped' | 'failed'
export type ScheduleRunReason = 'scheduled' | 'missed_run_recovered' | 'previous_task_running' | 'bot_disabled' | 'invalid_input' | 'manual_trigger'
export type OverlapPolicy = 'skip'
export type MissedRunPolicy = 'run_once'
export type ArtifactType = 'download' | 'screenshot' | 'export'
export type TaskItemType = 'record' | 'url' | 'file' | 'page'
export type ResultType = 'summary' | 'record'
export type TaskEventType = 'created' | 'assigned' | 'started' | 'failed' | 'canceling' | 'canceled' | 'pending'

export interface Bot {
  id: string
  code: string
  name: string
  description: string
  category: string
  tags: string[]
  status: BotStatus
  entrypoint: string
  current_version_id: string
  default_input_source: InputSource
  default_config: JsonObject
  default_requirements: JsonObject
  created_by: string
  updated_at: string
}

export interface BotVersion {
  id: string
  bot_id: string
  version: string
  source_file: string
  entrypoint: string
  change_note: string
  created_by: string
  created_at: string
}

export interface TaskStatistics {
  total_items: number
  completed_items: number
  pending_items: number
  running_items: number
  success_items: number
  failed_items: number
  skipped_items: number
  canceled_items: number
  timeout_items: number
  progress_rate: number
  success_rate: number
  error_rate: number
  total_results: number
  artifact_count: number
  log_count: number
  error_log_count: number
}

export interface TaskSnapshot {
  name: string
  version: string
  entrypoint: string
}

export interface Task {
  id: string
  name: string
  bot_id: string
  bot_version_id: string
  bot_snapshot: TaskSnapshot
  status: TaskStatus
  run_type: TaskRunType
  priority: TaskPriority
  worker_id: string | null
  owner: string
  input_source: InputSource
  input_summary: string
  created_at: string
  started_at: string | null
  finished_at: string | null
  source_task_id: string | null
  schedule_id: string | null
  schedule_run_id: string | null
  error_code: string | null
  error_message: string | null
  statistics: TaskStatistics
}

export interface TaskItem {
  id: string
  task_id: string
  type: TaskItemType
  key: string
  index: number
  status: TaskItemStatus
  summary: string
  duration_ms: number | null
  result_count: number
  artifact_count: number
  log_count: number
  error_message: string | null
  input_data: string
  output_data: string | null
}

export interface TaskLog {
  id: string
  task_id: string
  task_item_id: string | null
  level: LogLevel
  source: LogSource
  seq: number
  message: string
  created_at: string
}

export interface TaskEvent {
  id: string
  task_id: string
  type: TaskEventType
  label: string
  at: string
  actor: string
}

export interface Schedule {
  id: string
  name: string
  description: string
  bot_id: string
  bot_version_id: string | null
  cron: string
  timezone: string
  input_source: InputSource
  input_params: JsonObject
  overlap_policy: OverlapPolicy
  missed_run_policy: MissedRunPolicy
  jitter_seconds: number
  status: ScheduleStatus
  last_run_at: string | null
  last_task_id: string | null
  next_planned_at: string | null
  next_run_at: string | null
  created_by: string
  updated_at: string
}

export interface ScheduleRun {
  id: string
  schedule_id: string
  bot_id: string
  planned_at: string
  scheduled_at: string
  triggered_at: string
  jitter_seconds: number
  jitter_applied_seconds: number
  status: ScheduleRunStatus
  reason: ScheduleRunReason
  task_id: string | null
  overlap_policy: OverlapPolicy
  missed_run_policy: MissedRunPolicy
  error_message: string | null
}

export interface Result {
  id: string
  task_id: string
  task_item_id: string | null
  bot_id: string
  type: ResultType
  key: string
  data: JsonObject
  created_at: string
}

export interface Artifact {
  id: string
  task_id: string | null
  task_item_id: string | null
  bot_id: string | null
  name: string
  type: ArtifactType
  content_type: string
  size: number
  checksum: string
  created_at: string
  content: string
}

export interface Worker {
  id: string
  name: string
  hostname: string
  status: WorkerStatus
  version: string
  runtimes: string[]
  capabilities: string[]
  labels: string[]
  max_concurrency: number
  current_running: number
  free_slots: number
  running_tasks: string[]
  metrics: { cpu: number; memory: number }
  last_heartbeat_at: string
}

export interface PlatformSeedState {
  sequence: number
  demoNow: string
  bots: Bot[]
  botVersions: BotVersion[]
  tasks: Task[]
  taskItems: TaskItem[]
  logs: TaskLog[]
  taskEvents: TaskEvent[]
  schedules: Schedule[]
  scheduleRuns: ScheduleRun[]
  results: Result[]
  artifacts: Artifact[]
  workers: Worker[]
}

export interface PlatformState extends PlatformSeedState {
  toast: string
}

export interface CreateTaskPayload {
  botId: string
  botVersionId?: string | null
  name: string
  owner?: string
  runType?: TaskRunType
  sourceTaskId?: string | null
  scheduleId?: string | null
  scheduleRunId?: string | null
  inputSource?: InputSource
  inputSummary?: string
  totalItems?: number
}

export interface AddBotVersionPayload {
  fileName: string
  entrypoint?: string
  changeNote: string
}

export interface ScheduleFormPayload {
  name: string
  description: string
  botId: string
  botVersionId: string
  cron: string
  timezone: string
  jitterSeconds: number
  enabled: boolean
}

export interface PlatformContextValue {
  state: PlatformState
  showToast: (message: string) => void
  createTask: (payload: CreateTaskPayload) => string | null
  cancelTask: (taskId: string) => void
  retryTask: (taskId: string, mode?: 'all' | 'failed_items') => string | null
  toggleBot: (botId: string) => void
  addBotVersion: (botId: string, form: AddBotVersionPayload) => void
  createSchedule: (form: ScheduleFormPayload) => string | null
  updateSchedule: (scheduleId: string, form: ScheduleFormPayload) => void
  toggleSchedule: (scheduleId: string) => void
  triggerSchedule: (scheduleId: string) => string | null
  exportResults: (results: Result[], format?: 'csv' | 'json') => void
  downloadArtifact: (artifact: Artifact) => void
  simulateWorkerOffline: (workerId: string) => void
}

export interface PlatformProviderProps {
  children: ReactNode
}

export type PlatformAction =
  | { type: 'SET_TOAST'; message: string }
  | { type: 'ADD_TASK'; sequence: number; task: Task; items: TaskItem[]; logs: TaskLog[]; events: TaskEvent[] }
  | { type: 'CANCEL_TASK_REQUEST'; taskId: string; sequence: number; finishedAt: string | null; log: TaskLog; event: TaskEvent }
  | { type: 'CANCEL_TASK_COMPLETE'; taskId: string; finishedAt: string; event: TaskEvent }
  | { type: 'TOGGLE_BOT'; botId: string; status: BotStatus; updatedAt: string }
  | { type: 'ADD_BOT_VERSION'; botId: string; version: BotVersion; sequence: number }
  | { type: 'ADD_SCHEDULE'; schedule: Schedule; sequence: number }
  | { type: 'UPDATE_SCHEDULE'; schedule: Schedule }
  | { type: 'TOGGLE_SCHEDULE'; scheduleId: string; status: ScheduleStatus; nextPlannedAt: string | null; nextRunAt: string | null; updatedAt: string }
  | { type: 'ADD_SCHEDULE_RUN'; sequence: number; run: ScheduleRun; scheduleId: string; task: Task | null; log: TaskLog | null; event: TaskEvent | null }
  | { type: 'ADD_ARTIFACT'; artifact: Artifact; sequence: number }
  | { type: 'WORKER_OFFLINE'; workerId: string; sequence: number; affectedTaskIds: string[]; at: string; logs: TaskLog[]; events: TaskEvent[] }
