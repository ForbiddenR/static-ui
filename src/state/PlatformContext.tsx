import { createContext, useContext, useMemo, useReducer, useRef } from 'react'
import { initialPlatformState } from '../data/seedData'
import type {
  AddBotVersionPayload,
  Artifact,
  Bot,
  BotStatus,
  CreateTaskPayload,
  PlatformAction,
  PlatformContextValue,
  PlatformProviderProps,
  PlatformState,
  Result,
  Schedule,
  ScheduleFormPayload,
  ScheduleRun,
  ScheduleRunReason,
  ScheduleRunStatus,
  Task,
  TaskEvent,
  TaskItem,
  TaskLog,
  TaskStatistics,
  TaskStatus,
} from '../domain/types'

const PlatformContext = createContext<PlatformContextValue | null>(null)
const activeTaskStatuses = new Set<TaskStatus>(['pending', 'dispatching', 'running', 'canceling'])
const cancelableTaskStatuses = new Set<TaskStatus>(['pending', 'dispatching', 'running'])
const retryableTaskStatuses = new Set<TaskStatus>(['failed', 'partial_success', 'timeout', 'canceled'])
type BuildTaskPayload = Omit<CreateTaskPayload, 'botId'> & { bot: Bot }

function demoStamp(sequence: number, withSeconds = false): string {
  const base = new Date('2026-07-15T10:48:00+08:00')
  base.setMinutes(base.getMinutes() + Math.max(sequence - 400, 0))
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: withSeconds ? '2-digit' : undefined,
    hour12: false,
  }).formatToParts(base).reduce<Record<string, string>>((acc, part) => {
    acc[part.type] = part.value
    return acc
  }, {})
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}${withSeconds ? `:${parts.second}` : ''}`
}

function compactTime(sequence: number): string {
  return demoStamp(sequence).slice(11)
}

function emptyStatistics(total = 1): TaskStatistics {
  return {
    total_items: total, completed_items: 0, pending_items: total, running_items: 0,
    success_items: 0, failed_items: 0, skipped_items: 0, canceled_items: 0,
    timeout_items: 0, progress_rate: 0, success_rate: 0, error_rate: 0,
    total_results: 0, artifact_count: 0, log_count: 1, error_log_count: 0,
  }
}

function rate(value: number, total: number): number {
  return total ? Math.round((value / total) * 1000) / 10 : 0
}

function finalizeStatistics(statistics: TaskStatistics, status: 'failed' | 'canceled'): TaskStatistics {
  const total = statistics.total_items
  const remaining = Math.max(total - statistics.completed_items, 0)
  const failedItems = statistics.failed_items + (status === 'failed' ? remaining : 0)
  const canceledItems = statistics.canceled_items + (status === 'canceled' ? remaining : 0)
  return {
    ...statistics,
    completed_items: total,
    pending_items: 0,
    running_items: 0,
    failed_items: failedItems,
    canceled_items: canceledItems,
    progress_rate: 100,
    success_rate: rate(statistics.success_items, total),
    error_rate: rate(failedItems + statistics.timeout_items, total),
  }
}

function returnToPendingStatistics(statistics: TaskStatistics): TaskStatistics {
  return {
    ...statistics,
    pending_items: Math.max(statistics.total_items - statistics.completed_items, 0),
    running_items: 0,
    progress_rate: rate(statistics.completed_items, statistics.total_items),
  }
}

function nextRunAt(jitterSeconds: number): string {
  return Number(jitterSeconds) > 0 ? '2026-07-15 17:02' : '2026-07-15 17:00'
}

function reducer(state: PlatformState, action: PlatformAction): PlatformState {
  switch (action.type) {
    case 'SET_TOAST':
      return { ...state, toast: action.message }
    case 'ADD_TASK':
      return {
        ...state,
        sequence: action.sequence,
        tasks: [action.task, ...state.tasks],
        taskItems: [...action.items, ...state.taskItems],
        logs: [...action.logs, ...state.logs],
        taskEvents: [...action.events, ...state.taskEvents],
      }
    case 'CANCEL_TASK_REQUEST': {
      const task = state.tasks.find((item) => item.id === action.taskId)
      const nextStatus = task?.status === 'pending' ? 'canceled' : 'canceling'
      return {
        ...state,
        sequence: action.sequence,
        tasks: state.tasks.map((item) => item.id === action.taskId ? {
          ...item,
          status: nextStatus,
          finished_at: nextStatus === 'canceled' ? action.finishedAt : item.finished_at,
          statistics: finalizeStatistics(item.statistics, 'canceled'),
        } : item),
        taskItems: state.taskItems.map((item) => item.task_id === action.taskId && !['success', 'failed', 'skipped', 'canceled', 'timeout'].includes(item.status) ? { ...item, status: 'canceled', summary: '任务取消，明细已停止' } : item),
        logs: [action.log, ...state.logs],
        taskEvents: [action.event, ...state.taskEvents],
      }
    }
    case 'CANCEL_TASK_COMPLETE':
      return {
        ...state,
        tasks: state.tasks.map((task) => task.id === action.taskId ? { ...task, status: 'canceled', finished_at: action.finishedAt, statistics: finalizeStatistics(task.statistics, 'canceled') } : task),
        taskEvents: [action.event, ...state.taskEvents],
      }
    case 'TOGGLE_BOT':
      return { ...state, bots: state.bots.map((bot) => bot.id === action.botId ? { ...bot, status: action.status, updated_at: action.updatedAt } : bot) }
    case 'ADD_BOT_VERSION':
      return {
        ...state,
        sequence: action.sequence,
        botVersions: [action.version, ...state.botVersions],
        bots: state.bots.map((bot) => bot.id === action.botId ? { ...bot, current_version_id: action.version.id, entrypoint: action.version.entrypoint, updated_at: action.version.created_at } : bot),
      }
    case 'ADD_SCHEDULE':
      return { ...state, sequence: action.sequence, schedules: [action.schedule, ...state.schedules] }
    case 'UPDATE_SCHEDULE':
      return { ...state, schedules: state.schedules.map((schedule) => schedule.id === action.schedule.id ? action.schedule : schedule) }
    case 'TOGGLE_SCHEDULE':
      return {
        ...state,
        schedules: state.schedules.map((schedule) => schedule.id === action.scheduleId ? {
          ...schedule,
          status: action.status,
          next_planned_at: action.nextPlannedAt,
          next_run_at: action.nextRunAt,
          updated_at: action.updatedAt,
        } : schedule),
      }
    case 'ADD_SCHEDULE_RUN':
      return {
        ...state,
        sequence: action.sequence,
        scheduleRuns: [action.run, ...state.scheduleRuns],
        schedules: state.schedules.map((schedule) => schedule.id === action.scheduleId ? {
          ...schedule,
          last_run_at: action.run.triggered_at,
          last_task_id: action.task?.id || schedule.last_task_id,
        } : schedule),
        tasks: action.task ? [action.task, ...state.tasks] : state.tasks,
        logs: action.log ? [action.log, ...state.logs] : state.logs,
        taskEvents: action.event ? [action.event, ...state.taskEvents] : state.taskEvents,
      }
    case 'ADD_ARTIFACT':
      return { ...state, sequence: action.sequence, artifacts: [action.artifact, ...state.artifacts] }
    case 'WORKER_OFFLINE': {
      const affected = new Set(action.affectedTaskIds)
      const affectedStatuses = new Map(state.tasks.filter((task) => affected.has(task.id)).map((task) => [task.id, task.status]))
      return {
        ...state,
        sequence: action.sequence,
        workers: state.workers.map((worker) => worker.id === action.workerId ? { ...worker, status: 'offline', current_running: 0, free_slots: 0, running_tasks: [] } : worker),
        tasks: state.tasks.map((task) => {
          if (!affected.has(task.id)) return task
          if (task.status === 'dispatching') return { ...task, status: 'pending', worker_id: null, error_code: null, error_message: null, statistics: returnToPendingStatistics(task.statistics) }
          return { ...task, status: 'failed', finished_at: action.at, error_code: 'WORKER_OFFLINE', error_message: 'Worker 心跳超时，运行任务已终止', statistics: finalizeStatistics(task.statistics, 'failed') }
        }),
        taskItems: state.taskItems.map((item) => {
          const taskStatus = affectedStatuses.get(item.task_id)
          if (!taskStatus || ['success', 'failed', 'skipped', 'canceled', 'timeout'].includes(item.status)) return item
          return taskStatus === 'dispatching'
            ? { ...item, status: 'pending', summary: 'Worker 未确认任务，明细已退回等待队列' }
            : { ...item, status: 'failed', summary: 'Worker 心跳超时，明细执行终止', error_message: 'WORKER_OFFLINE' }
        }),
        logs: [...action.logs, ...state.logs],
        taskEvents: [...action.events, ...state.taskEvents],
      }
    }
    default:
      return state
  }
}

export function PlatformProvider({ children }: PlatformProviderProps) {
  const initialState: PlatformState = { ...initialPlatformState, toast: '' }
  const [state, dispatch] = useReducer(reducer, initialState)
  const toastTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null)

  const showToast = (message: string): void => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    dispatch({ type: 'SET_TOAST', message })
    toastTimer.current = window.setTimeout(() => dispatch({ type: 'SET_TOAST', message: '' }), 2800)
  }

  const buildTask = ({ bot, botVersionId = null, name, owner = '平台运营组', runType = 'manual', sourceTaskId = null, scheduleId = null, scheduleRunId = null, inputSource = 'params', inputSummary = '使用默认运行参数', totalItems = 1 }: BuildTaskPayload): { sequence: number; task: Task } => {
    const sequence = state.sequence + 1
    const id = `TASK-0715-${String(sequence).padStart(4, '0')}`
    const selectedVersionId = botVersionId || bot.current_version_id
    const version = state.botVersions.find((item) => item.id === selectedVersionId && item.bot_id === bot.id)
    const resolvedVersionId = version?.id || bot.current_version_id
    const resolvedVersion = version || state.botVersions.find((item) => item.id === bot.current_version_id)
    return {
      sequence,
      task: {
        id, name, bot_id: bot.id, bot_version_id: resolvedVersionId,
        bot_snapshot: { name: bot.name, version: resolvedVersion?.version || '未发布', entrypoint: resolvedVersion?.entrypoint || bot.entrypoint },
        status: 'pending', run_type: runType, priority: 'normal', worker_id: null, owner,
        input_source: inputSource, input_summary: inputSummary, created_at: demoStamp(sequence),
        started_at: null, finished_at: null, source_task_id: sourceTaskId,
        schedule_id: scheduleId, schedule_run_id: scheduleRunId,
        error_code: null, error_message: null, statistics: emptyStatistics(totalItems),
      },
    }
  }

  const createTask = (payload: CreateTaskPayload): string | null => {
    const bot = state.bots.find((item) => item.id === payload.botId)
    if (!bot || bot.status !== 'enabled') {
      showToast('Bot 当前未启用，无法创建任务')
      return null
    }
    const built = buildTask({ bot, ...payload })
    dispatch({
      type: 'ADD_TASK', sequence: built.sequence, task: built.task, items: [],
      logs: [{ id: `LOG-${built.sequence}-01`, task_id: built.task.id, task_item_id: null, level: 'info', source: 'master', seq: 1, message: '任务已创建，等待 Worker 分配', created_at: compactTime(built.sequence) }],
      events: [{ id: `EV-${built.sequence}-01`, task_id: built.task.id, type: 'created', label: '任务已创建', at: compactTime(built.sequence), actor: '当前用户' }],
    })
    showToast('任务已创建，正在等待 Worker 分配')
    return built.task.id
  }

  const cancelTask = (taskId: string): void => {
    const task = state.tasks.find((item) => item.id === taskId)
    if (!task || !cancelableTaskStatuses.has(task.status)) {
      showToast('当前任务状态不支持取消')
      return
    }
    const sequence = state.sequence + 1
    dispatch({
      type: 'CANCEL_TASK_REQUEST', taskId, sequence, finishedAt: task.status === 'pending' ? demoStamp(sequence) : null,
      log: { id: `LOG-CANCEL-${sequence}`, task_id: taskId, task_item_id: null, level: 'warning', source: 'master', seq: 999, message: '已收到取消请求', created_at: compactTime(sequence) },
      event: { id: `EV-CANCEL-${sequence}`, task_id: taskId, type: 'canceling', label: task.status === 'pending' ? '任务已取消' : '正在取消任务', at: compactTime(sequence), actor: '当前用户' },
    })
    if (task.status === 'pending') {
      showToast('任务已取消')
      return
    }
    showToast('取消指令已发送')
    window.setTimeout(() => dispatch({
      type: 'CANCEL_TASK_COMPLETE', taskId, finishedAt: demoStamp(sequence + 1),
      event: { id: `EV-CANCELED-${sequence}`, task_id: taskId, type: 'canceled', label: '任务已取消', at: compactTime(sequence + 1), actor: task.worker_id || 'Master' },
    }), 650)
  }

  const retryTask = (taskId: string, mode: 'all' | 'failed_items' = 'all'): string | null => {
    const source = state.tasks.find((item) => item.id === taskId)
    if (!source || !retryableTaskStatuses.has(source.status)) {
      showToast('当前任务状态不支持重试')
      return null
    }
    const bot = state.bots.find((item) => item.id === source.bot_id)
    if (!bot || bot.status !== 'enabled') {
      showToast('关联 Bot 未启用，无法重试')
      return null
    }
    const failedItems = state.taskItems.filter((item) => item.task_id === taskId && ['failed', 'timeout'].includes(item.status))
    const totalItems = mode === 'failed_items' ? Math.max(failedItems.length, 1) : source.statistics.total_items
    const built = buildTask({
      bot, botVersionId: source.bot_version_id, name: `${source.name} · ${mode === 'failed_items' ? '失败明细重试' : '全部重试'}`,
      owner: source.owner, runType: mode === 'failed_items' ? 'retry_failed_items' : 'retry_all',
      sourceTaskId: source.id, inputSource: source.input_source, inputSummary: source.input_summary, totalItems,
    })
    dispatch({
      type: 'ADD_TASK', sequence: built.sequence, task: built.task,
      items: mode === 'failed_items' ? failedItems.map((item, index) => ({ ...item, id: `ITEM-${built.sequence}-${index + 1}`, task_id: built.task.id, status: 'pending', summary: '等待重试', duration_ms: null, error_message: null })) : [],
      logs: [{ id: `LOG-RETRY-${built.sequence}`, task_id: built.task.id, task_item_id: null, level: 'info', source: 'master', seq: 1, message: `由 ${source.id} 创建重试任务`, created_at: compactTime(built.sequence) }],
      events: [{ id: `EV-RETRY-${built.sequence}`, task_id: built.task.id, type: 'created', label: '重试任务已创建', at: compactTime(built.sequence), actor: '当前用户' }],
    })
    showToast('重试任务已创建，原任务保持不变')
    return built.task.id
  }

  const toggleBot = (botId: string): void => {
    const bot = state.bots.find((item) => item.id === botId)
    if (!bot) return
    const status = bot.status === 'enabled' ? 'disabled' : 'enabled'
    dispatch({ type: 'TOGGLE_BOT', botId, status, updatedAt: demoStamp(state.sequence + 1) })
    showToast(status === 'enabled' ? 'Bot 已启用' : 'Bot 已停用；已有任务不受影响')
  }

  const addBotVersion = (botId: string, form: AddBotVersionPayload): void => {
    const sequence = state.sequence + 1
    const versions = state.botVersions.filter((item) => item.bot_id === botId)
    const major = versions[0]?.version?.match(/v(\d+)\.(\d+)\.(\d+)/)
    const versionName = major ? `v${major[1]}.${Number(major[2]) + 1}.0` : 'v1.0.0'
    const version = { id: `bv-${sequence}`, bot_id: botId, version: versionName, source_file: form.fileName, entrypoint: form.entrypoint || 'main.py', change_note: form.changeNote, created_by: '当前用户', created_at: demoStamp(sequence) }
    dispatch({ type: 'ADD_BOT_VERSION', botId, version, sequence })
    showToast('新版本已上传并设为当前版本')
  }

  const createSchedule = (form: ScheduleFormPayload): string | null => {
    const version = form.botVersionId ? state.botVersions.find((item) => item.id === form.botVersionId && item.bot_id === form.botId) : null
    if (form.botVersionId && !version) {
      showToast('固定版本与目标 Bot 不匹配')
      return null
    }
    const sequence = state.sequence + 1
    const id = `schedule-${sequence}`
    const nextPlanned = '2026-07-15 17:00'
    const schedule: Schedule = {
      id, name: form.name, description: form.description || '暂无说明', bot_id: form.botId,
      bot_version_id: version?.id || null, cron: form.cron, timezone: form.timezone,
      input_source: 'params', input_params: { mode: 'default' }, overlap_policy: 'skip',
      missed_run_policy: 'run_once', jitter_seconds: Number(form.jitterSeconds || 0),
      status: form.enabled ? 'enabled' : 'disabled', last_run_at: null, last_task_id: null,
      next_planned_at: form.enabled ? nextPlanned : null,
      next_run_at: form.enabled ? (Number(form.jitterSeconds) ? '2026-07-15 17:02' : nextPlanned) : null,
      created_by: '当前用户', updated_at: demoStamp(sequence),
    }
    dispatch({ type: 'ADD_SCHEDULE', schedule, sequence })
    showToast('调度计划已创建')
    return id
  }

  const updateSchedule = (scheduleId: string, form: ScheduleFormPayload): void => {
    const current = state.schedules.find((item) => item.id === scheduleId)
    if (!current) return
    const version = form.botVersionId ? state.botVersions.find((item) => item.id === form.botVersionId && item.bot_id === form.botId) : null
    if (form.botVersionId && !version) {
      showToast('固定版本与目标 Bot 不匹配')
      return
    }
    const status: Schedule['status'] = form.enabled ? 'enabled' : 'disabled'
    const jitterSeconds = Number(form.jitterSeconds || 0)
    const schedule: Schedule = {
      ...current,
      name: form.name,
      description: form.description,
      bot_id: form.botId,
      bot_version_id: version?.id || null,
      cron: form.cron,
      timezone: form.timezone,
      jitter_seconds: jitterSeconds,
      status,
      updated_at: demoStamp(state.sequence + 1),
      next_planned_at: status === 'enabled' ? '2026-07-15 17:00' : null,
      next_run_at: status === 'enabled' ? nextRunAt(jitterSeconds) : null,
    }
    dispatch({ type: 'UPDATE_SCHEDULE', schedule })
    showToast('调度计划已更新，下一次运行时间已重算')
  }

  const toggleSchedule = (scheduleId: string): void => {
    const schedule = state.schedules.find((item) => item.id === scheduleId)
    if (!schedule) return
    const status = schedule.status === 'enabled' ? 'disabled' : 'enabled'
    dispatch({ type: 'TOGGLE_SCHEDULE', scheduleId, status, nextPlannedAt: status === 'enabled' ? '2026-07-15 17:00' : null, nextRunAt: status === 'enabled' ? nextRunAt(schedule.jitter_seconds) : null, updatedAt: demoStamp(state.sequence + 1) })
    showToast(status === 'enabled' ? '调度计划已启用' : '调度计划已停用；已创建任务不受影响')
  }

  const triggerSchedule = (scheduleId: string): string | null => {
    const schedule = state.schedules.find((item) => item.id === scheduleId)
    if (!schedule) return null
    if (schedule.status !== 'enabled') {
      showToast('请先启用调度计划')
      return null
    }
    const bot = state.bots.find((item) => item.id === schedule.bot_id)
    const sequence = state.sequence + 1
    const activeTask = state.tasks.find((task) => task.schedule_id === scheduleId && activeTaskStatuses.has(task.status))
    let runStatus: ScheduleRunStatus = 'task_created'
    let reason: ScheduleRunReason = 'manual_trigger'
    if (!bot || bot.status !== 'enabled') {
      runStatus = 'skipped'; reason = 'bot_disabled'
    } else if (activeTask) {
      runStatus = 'skipped'; reason = 'previous_task_running'
    }
    let task: Task | null = null
    if (runStatus === 'task_created' && bot) {
      const runId = `sr-${sequence}`
      task = buildTask({ bot, botVersionId: schedule.bot_version_id, name: `${schedule.name} · 手动触发`, runType: 'schedule', scheduleId, scheduleRunId: runId, inputSummary: JSON.stringify(schedule.input_params), totalItems: 1 }).task
      task.id = `TASK-0715-${String(sequence).padStart(4, '0')}`
    }
    const run: ScheduleRun = { id: `sr-${sequence}`, schedule_id: scheduleId, bot_id: schedule.bot_id, planned_at: demoStamp(sequence), scheduled_at: demoStamp(sequence), triggered_at: demoStamp(sequence), jitter_seconds: schedule.jitter_seconds, jitter_applied_seconds: 0, status: runStatus, reason, task_id: task?.id || null, overlap_policy: 'skip', missed_run_policy: 'run_once', error_message: null }
    dispatch({
      type: 'ADD_SCHEDULE_RUN', sequence, run, scheduleId, task,
      log: task ? { id: `LOG-SCH-${sequence}`, task_id: task.id, task_item_id: null, level: 'info', source: 'master', seq: 1, message: `由调度计划 ${schedule.name} 手动触发`, created_at: compactTime(sequence) } : null,
      event: task ? { id: `EV-SCH-${sequence}`, task_id: task.id, type: 'created', label: '调度任务已创建', at: compactTime(sequence), actor: 'Schedule' } : null,
    })
    showToast(runStatus === 'task_created' ? '已创建任务，等待 Worker 分配' : reason === 'bot_disabled' ? '本轮已跳过：关联 Bot 未启用' : '本轮已跳过：上一轮任务仍在执行')
    return task?.id || null
  }

  const exportResults = (results: Result[], format: 'csv' | 'json' = 'csv'): void => {
    const sequence = state.sequence + 1
    const content = format === 'json'
      ? JSON.stringify(results, null, 2)
      : `﻿${[['结果编号', '任务编号', '类型', '业务键', '数据'], ...results.map((result) => [result.id, result.task_id, result.type, result.key, JSON.stringify(result.data)])].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')}`
    const name = `results-export-${sequence}.${format}`
    const artifact: Artifact = { id: `ART-${sequence}`, task_id: results[0]?.task_id || null, task_item_id: null, bot_id: results[0]?.bot_id || null, name, type: 'export', content_type: format === 'json' ? 'application/json' : 'text/csv', size: new Blob([content]).size, checksum: `demo:${sequence}`, created_at: demoStamp(sequence), content }
    dispatch({ type: 'ADD_ARTIFACT', artifact, sequence })
    downloadArtifact(artifact)
    showToast('结果已导出，并生成新的附件记录')
  }

  const downloadArtifact = (artifact: Artifact): void => {
    const url = URL.createObjectURL(new Blob([artifact.content || `示例附件：${artifact.name}`], { type: artifact.content_type }))
    const link = document.createElement('a')
    link.href = url
    link.download = artifact.name
    link.click()
    URL.revokeObjectURL(url)
  }

  const simulateWorkerOffline = (workerId: string): void => {
    const worker = state.workers.find((item) => item.id === workerId)
    if (!worker || worker.status === 'offline') {
      showToast('Worker 当前已离线')
      return
    }
    const affected = state.tasks.filter((task) => task.worker_id === workerId && ['dispatching', 'running'].includes(task.status))
    const sequence = state.sequence + 1
    dispatch({
      type: 'WORKER_OFFLINE', workerId, sequence, affectedTaskIds: affected.map((task) => task.id), at: demoStamp(sequence),
      logs: affected.map((task, index) => ({ id: `LOG-OFFLINE-${sequence}-${index}`, task_id: task.id, task_item_id: null, level: 'error', source: 'master', seq: 1000 + index, message: task.status === 'running' ? 'Worker 心跳超时，任务执行失败' : 'Worker 未确认任务，已退回等待队列', created_at: compactTime(sequence) })),
      events: affected.map((task, index) => ({ id: `EV-OFFLINE-${sequence}-${index}`, task_id: task.id, type: task.status === 'running' ? 'failed' : 'pending', label: task.status === 'running' ? 'Worker 离线，任务失败' : '任务退回等待队列', at: compactTime(sequence), actor: 'Master' })),
    })
    showToast(`已模拟心跳超时，影响 ${affected.length} 个任务`)
  }

  const value = useMemo(() => ({
    state, showToast, createTask, cancelTask, retryTask, toggleBot, addBotVersion,
    createSchedule, updateSchedule, toggleSchedule, triggerSchedule,
    exportResults, downloadArtifact, simulateWorkerOffline,
  }), [state])

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>
}

export function usePlatform() {
  const context = useContext(PlatformContext)
  if (!context) throw new Error('usePlatform must be used within PlatformProvider')
  return context
}

export const taskCanCancel = (task: Task): boolean => cancelableTaskStatuses.has(task.status)
export const taskCanRetry = (task: Task): boolean => retryableTaskStatuses.has(task.status)
