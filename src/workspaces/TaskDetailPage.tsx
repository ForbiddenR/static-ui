import { useMemo, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DefinitionGrid, EmptyState, Icon, PageHeader, PanelHeader, ProgressBar, StatusBadge } from '../components/ui'
import { taskCanCancel, taskCanRetry, usePlatform } from '../state/PlatformContext'
import type { LogLevel, TaskLog } from '../domain/types'

const tabs = [['overview','概览'],['items','TaskItems'],['logs','运行日志'],['results','业务结果'],['artifacts','附件'],['events','事件历史']]

export default function TaskDetailPage() {
  const { taskId } = useParams()
  const navigate = useNavigate()
  const { state, cancelTask, retryTask, downloadArtifact, showToast } = usePlatform()
  const [tab, setTab] = useState('overview')
  const [itemStatus, setItemStatus] = useState('all')
  const [logLevel, setLogLevel] = useState<LogLevel | 'all'>('all')
  const [extraLogs, setExtraLogs] = useState<TaskLog[]>([])
  const task = state.tasks.find((item) => item.id === taskId)
  const bot = state.bots.find((item) => item.id === task?.bot_id)
  const worker = state.workers.find((item) => item.id === task?.worker_id)
  const items = state.taskItems.filter((item) => item.task_id === taskId && (itemStatus === 'all' || item.status === itemStatus))
  const logs = useMemo(() => [...extraLogs, ...state.logs.filter((item) => item.task_id === taskId)].filter((item) => logLevel === 'all' || item.level === logLevel).sort((a,b) => a.seq - b.seq), [extraLogs, state.logs, taskId, logLevel])
  const results = state.results.filter((item) => item.task_id === taskId)
  const artifacts = state.artifacts.filter((item) => item.task_id === taskId)
  const events = state.taskEvents.filter((item) => item.task_id === taskId)

  if (!task) return <div className="page-body"><EmptyState title="任务不存在" description="该任务可能已从演示数据中移除。"/></div>

  const retry = (mode: 'all' | 'failed_items'): void => { const id = retryTask(task.id, mode); if (id) navigate(`/tasks/${id}`) }
  const appendDemoLog = () => {
    const number = extraLogs.length + 1
    setExtraLogs((current) => [...current, { id: `LOCAL-${number}`, task_id: task.id, task_item_id: null, level: number % 3 === 0 ? 'warning' : 'info', source: 'script', seq: 100 + number, message: number % 3 === 0 ? '检测到一条业务校验警告，继续执行' : `实时日志事件 ${number} 已写入`, created_at: `10:48:${String(number * 3).padStart(2,'0')}` }])
    showToast('已模拟一条 SSE log 事件')
  }
  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    setTab(tabs[nextIndex][0])
    document.getElementById(`task-tab-${tabs[nextIndex][0]}`)?.focus()
  }

  return <div className="page-body">
    <PageHeader eyebrow={task.id} title={task.name} description={`${task.bot_snapshot.name} · ${task.owner}`} backTo="/tasks" actions={<><StatusBadge status={task.status}/>{taskCanCancel(task) && <button className="secondary-button danger-button" onClick={() => cancelTask(task.id)}><Icon name="close" size={15}/>取消任务</button>}{taskCanRetry(task) && <><button className="secondary-button" onClick={() => retry('failed_items')}><Icon name="refresh" size={15}/>重试失败明细</button><button className="primary-button" onClick={() => retry('all')}><Icon name="refresh" size={15}/>全部重试</button></>}</>}/>

    <nav className="detail-tabs" aria-label="任务详情栏目" role="tablist">{tabs.map(([key,label], index) => <button key={key} id={`task-tab-${key}`} role="tab" tabIndex={tab === key ? 0 : -1} className={tab === key ? 'active' : ''} aria-selected={tab === key} aria-controls={`task-panel-${key}`} onKeyDown={(event) => handleTabKey(event, index)} onClick={() => setTab(key)}>{label}{key === 'items' ? ` ${state.taskItems.filter((item) => item.task_id === task.id).length}` : key === 'results' ? ` ${results.length}` : key === 'artifacts' ? ` ${artifacts.length}` : ''}</button>)}</nav>

    {tab === 'overview' && <div className="detail-layout" role="tabpanel" id="task-panel-overview" aria-labelledby="task-tab-overview">
      <section className="panel detail-main"><PanelHeader kicker="Execution summary" title="执行概况"/><div className="task-hero-progress"><ProgressBar value={task.statistics.progress_rate} status={task.status}/><div><strong>{task.statistics.completed_items.toLocaleString()}</strong><span>/ {task.statistics.total_items.toLocaleString()} 条明细已完成</span></div></div><div className="stat-strip">{[['成功',task.statistics.success_items],['失败',task.statistics.failed_items],['超时',task.statistics.timeout_items],['结果',task.statistics.total_results],['附件',task.statistics.artifact_count],['错误日志',task.statistics.error_log_count]].map(([label,value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>{task.error_message && <div className="error-callout"><Icon name="activity" size={18}/><div><strong>{task.error_code}</strong><p>{task.error_message}</p></div></div>}<DefinitionGrid items={[["输入来源",task.input_source],["输入摘要",task.input_summary],["运行方式",task.run_type],["优先级",task.priority],["创建时间",task.created_at],["开始时间",task.started_at],["结束时间",task.finished_at]]}/></section>
      <aside className="detail-side"><section className="panel side-card"><PanelHeader kicker="Bot snapshot" title="执行快照"/><DefinitionGrid items={[["Bot",bot ? <Link to={`/bots/${bot.id}`}>{task.bot_snapshot.name}</Link> : task.bot_snapshot.name],["版本",task.bot_snapshot.version],["入口",task.bot_snapshot.entrypoint],["源任务",task.source_task_id ? <Link to={`/tasks/${task.source_task_id}`}>{task.source_task_id}</Link> : '—'],["调度计划",task.schedule_id ? <Link to={`/schedules/${task.schedule_id}`}>{task.schedule_id}</Link> : '手动执行']]}/></section><section className="panel side-card"><PanelHeader kicker="Worker" title="运行资源"/>{worker ? <><Link className="worker-link-card" to={`/workers/${worker.id}`}><span className={`health-indicator ${worker.status}`}/><div><strong>{worker.name}</strong><small>{worker.hostname}</small></div><Icon name="chevron" size={15}/></Link><DefinitionGrid items={[["CPU",`${worker.metrics.cpu}%`],["内存",`${worker.metrics.memory}%`],["执行槽位",`${worker.current_running} / ${worker.max_concurrency}`],["最近心跳",worker.last_heartbeat_at]]}/></> : <p className="muted-copy">等待 Master 匹配可用 Worker。</p>}</section></aside>
    </div>}

    {tab === 'items' && <section className="panel workspace-panel" role="tabpanel" id="task-panel-items" aria-labelledby="task-tab-items"><div className="workspace-toolbar"><div><p className="panel-kicker">Dynamic details</p><h2>TaskItems</h2></div><select value={itemStatus} onChange={(event) => setItemStatus(event.target.value)}><option value="all">全部状态</option><option value="pending">等待中</option><option value="running">执行中</option><option value="success">成功</option><option value="failed">失败</option><option value="timeout">超时</option><option value="canceled">已取消</option></select></div><div className="table-wrap"><table className="data-table"><caption className="sr-only">任务明细</caption><thead><tr><th>序号 / 业务键</th><th>类型</th><th>状态</th><th>摘要</th><th>耗时</th><th>关联数据</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>#{item.index} · {item.key}</strong><small>{item.id}</small></td><td>{item.type}</td><td><StatusBadge status={item.status}/></td><td><strong>{item.summary}</strong>{item.error_message && <small className="error-text">{item.error_message}</small>}<details><summary>查看输入输出摘要</summary><p>输入：{item.input_data}</p><p>输出：{item.output_data || '—'}</p></details></td><td>{item.duration_ms !== null ? `${(item.duration_ms/1000).toFixed(2)} 秒` : '执行中'}</td><td>{item.result_count} 结果 · {item.artifact_count} 附件 · {item.log_count} 日志</td></tr>)}</tbody></table></div>{!items.length && <EmptyState title="暂无匹配明细" description="TaskItem 由脚本运行时动态上报，不支持在此手动创建或重试。"/>}</section>}

    {tab === 'logs' && <section className="panel log-panel" role="tabpanel" id="task-panel-logs" aria-labelledby="task-tab-logs"><div className="workspace-toolbar"><div><p className="panel-kicker">SSE simulation</p><h2>运行日志</h2></div><div className="toolbar-actions"><select value={logLevel} onChange={(event) => { const next = event.target.value; if (next === 'all' || next === 'info' || next === 'warning' || next === 'error') setLogLevel(next) }}><option value="all">全部级别</option><option value="info">Info</option><option value="warning">Warning</option><option value="error">Error</option></select>{['running','dispatching'].includes(task.status) && <button className="secondary-button" onClick={appendDemoLog}><Icon name="pulse" size={15}/>模拟实时事件</button>}</div></div><div className="log-console" aria-live="polite">{logs.map((log) => <div key={log.id} className={`log-line log-${log.level}`}><time>{log.created_at}</time><b>{log.level.toUpperCase()}</b><span>{log.source}</span><p>{log.message}</p>{log.task_item_id && <button onClick={() => { setItemStatus('all'); setTab('items') }}>{log.task_item_id}</button>}</div>)}</div>{!logs.length && <EmptyState title="暂无日志" description="运行开始后，日志会按序号持续写入。"/>}</section>}

    {tab === 'results' && <section className="panel workspace-panel" role="tabpanel" id="task-panel-results" aria-labelledby="task-tab-results"><PanelHeader kicker="Structured business data" title="业务结果"/>{results.length ? <div className="result-grid">{results.map((result) => <article key={result.id} className="result-card"><div><StatusBadge status="success"/><code>{result.type}</code></div><h3>{result.key}</h3><pre>{JSON.stringify(result.data, null, 2)}</pre><small>{result.id} · {result.task_item_id || 'Task 级结果'}</small></article>)}</div> : <EmptyState icon="database" title="暂无业务结果" description="脚本通过 SDK 上报的结构化数据会显示在这里。"/>}</section>}

    {tab === 'artifacts' && <section className="panel workspace-panel" role="tabpanel" id="task-panel-artifacts" aria-labelledby="task-tab-artifacts"><PanelHeader kicker="Files and large content" title="附件"/>{artifacts.length ? <div className="artifact-list">{artifacts.map((artifact) => <article key={artifact.id}><span className="artifact-icon"><Icon name="file" size={20}/></span><div><strong>{artifact.name}</strong><small>{artifact.type} · {artifact.content_type} · {(artifact.size/1024).toFixed(1)} KB</small></div><code>{artifact.checksum}</code><button className="secondary-button" onClick={() => downloadArtifact(artifact)}><Icon name="download" size={15}/>下载</button></article>)}</div> : <EmptyState icon="file" title="暂无附件" description="截图、下载文件和导出文件会显示在这里。"/>}</section>}

    {tab === 'events' && <section className="panel event-panel" role="tabpanel" id="task-panel-events" aria-labelledby="task-tab-events"><PanelHeader kicker="Task lifecycle" title="任务事件"/><ol className="event-timeline">{events.map((event) => <li key={event.id}><span/><time>{event.at}</time><div><strong>{event.label}</strong><small>{event.actor}</small></div></li>)}</ol>{!events.length && <EmptyState title="暂无事件" description="任务状态变化会记录为不可变事件。"/>}</section>}
  </div>
}
