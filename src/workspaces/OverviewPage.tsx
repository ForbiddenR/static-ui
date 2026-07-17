import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon, PanelHeader, ProgressBar, StatusBadge, TrendChart } from '../components/ui'
import { trendByPeriod } from '../data/seedData'
import { usePlatform } from '../state/PlatformContext'
import type { Schedule, TaskStatus } from '../domain/types'
import type { IconName } from '../components/ui'

type TrendPeriod = keyof typeof trendByPeriod
const periodOptions: readonly [TrendPeriod, string][] = [['today', '今日'], ['week', '近 7 日'], ['month', '近 30 日']]
const terminalStatusFilters: readonly TaskStatus[] = ['success', 'partial_success', 'failed', 'canceled']
export default function OverviewPage() {
  const { state } = usePlatform()
  const [period, setPeriod] = useState<TrendPeriod>('today')
  const [chartMode, setChartMode] = useState('chart')
  const trendValues = trendByPeriod[period]
  const peakIndex = trendValues.indexOf(Math.max(...trendValues))
  const activeTasks = state.tasks.filter((task) => ['pending', 'dispatching', 'running', 'canceling'].includes(task.status))
  const terminalTasks = state.tasks.filter((task) => ['success', 'partial_success', 'failed', 'canceled', 'timeout'].includes(task.status))
  const successRate = terminalTasks.length ? Math.round((terminalTasks.filter((task) => task.status === 'success').length / terminalTasks.length) * 1000) / 10 : 100
  const onlineWorkers = state.workers.filter((worker) => worker.status === 'online')
  const enabledBots = state.bots.filter((bot) => bot.status === 'enabled')
  const upcomingSchedules = state.schedules.filter((schedule): schedule is Schedule & { next_run_at: string } => schedule.status === 'enabled' && schedule.next_run_at !== null).sort((a, b) => a.next_run_at.localeCompare(b.next_run_at)).slice(0, 3)
  const statuses = useMemo<{ status: TaskStatus; count: number }[]>(() => terminalStatusFilters.map((status) => ({ status, count: terminalTasks.filter((task) => task.status === status).length })), [terminalTasks])
  const flowNodes: readonly [IconName, string, string][] = [['bot', 'Bot', `${enabledBots.length} 个已启用`], ['tasks', 'Task', `${activeTasks.length} 项活跃`], ['file', 'TaskItem', `${state.taskItems.length} 条样本`]]

  return <div className="page-body">
    <section className="page-heading"><div><p className="eyebrow">2026 年 7 月 15 日 · 星期三</p><h1>运行总览</h1><p>掌握自动化任务的执行效率、资源状态与异常风险。</p></div><div className="period-switch" aria-label="时间范围">{periodOptions.map(([key,label]) => <button key={key} className={period === key ? 'active' : ''} aria-pressed={period === key} onClick={() => setPeriod(key)}>{label}</button>)}</div></section>

    <section className="metric-grid" aria-label="关键指标">
      <Link className="metric-card metric-primary" to="/tasks"><div className="metric-label"><span>平台任务</span><Icon name="activity" size={19}/></div><div className="metric-value">{state.tasks.length}<small>条样本</small></div><div className="metric-foot positive"><Icon name="arrowUp" size={13}/><strong>12.4%</strong><span>今日处理规模提升</span></div></Link>
      <Link className="metric-card" to="/tasks?status=success"><div className="metric-label"><span>执行成功率</span><Icon name="check" size={19}/></div><div className="metric-value">{successRate}<small>%</small></div><div className="metric-foot positive"><strong>{terminalTasks.length}</strong><span>项已结束任务</span></div></Link>
      <Link className="metric-card" to="/tasks?active=1"><div className="metric-label"><span>活跃任务</span><Icon name="pulse" size={19}/></div><div className="metric-value">{activeTasks.length}<small>项</small></div><div className="metric-foot neutral"><i/><strong>{enabledBots.length}</strong><span>个 Bot 已启用</span></div></Link>
      <Link className="metric-card" to="/workers"><div className="metric-label"><span>Worker 在线</span><Icon name="worker" size={19}/></div><div className="metric-value">{onlineWorkers.length}<small>/ {state.workers.length}</small></div><div className="metric-foot positive"><strong>{onlineWorkers.reduce((sum, worker) => sum + worker.free_slots, 0)}</strong><span>个空闲执行槽位</span></div></Link>
    </section>

    <section className="dashboard-grid">
      <article className="panel trend-panel"><PanelHeader kicker="执行规模" title="任务运行趋势" action={<div className="view-switch"><button className={chartMode === 'chart' ? 'active' : ''} onClick={() => setChartMode('chart')}>图表</button><button className={chartMode === 'table' ? 'active' : ''} onClick={() => setChartMode('table')}>数据</button></div>}/><div className="trend-summary"><strong>{trendValues.reduce((sum, value) => sum + value, 0).toLocaleString()}</strong><span>次任务执行</span><em>高峰出现在 {peakIndex + 8}:00</em></div>{chartMode === 'chart' ? <TrendChart values={trendValues}/> : <div className="chart-table-wrap"><table className="chart-table"><caption className="sr-only">任务运行趋势数据</caption><thead><tr><th>时段</th><th>执行次数</th></tr></thead><tbody>{trendValues.map((value, index) => <tr key={index}><td>{index + 8}:00</td><td>{value}</td></tr>)}</tbody></table></div>}<div className="chart-note"><span className="legend-line"/>任务执行次数 <small>静态演示数据</small></div></article>

      <article className="panel flow-panel"><PanelHeader kicker="核心执行链路" title="运行脉络" action={<span className="live-label"><i/>实时</span>}/><div className="flow-map"><div className="flow-line"><span className="flow-signal"/></div>{flowNodes.map(([icon,title,sub], index) => <div className={`flow-node ${index === 1 ? 'active' : ''}`} key={title}><span className="node-icon"><Icon name={icon}/></span><div><strong>{title}</strong><small>{sub}</small></div><b>{['定义','调度','观测'][index]}</b></div>)}</div><div className="worker-strip"><div><span className="server-icon"><Icon name="worker" size={18}/></span><span><strong>Worker 资源池</strong><small>{onlineWorkers.length} / {state.workers.length} 在线</small></span></div><div className="worker-bars">{onlineWorkers.map((worker) => <span key={worker.id} style={{ height: `${worker.metrics.cpu}%` }}/>)}</div><strong>{Math.round(onlineWorkers.reduce((sum, worker) => sum + worker.metrics.cpu, 0) / Math.max(onlineWorkers.length, 1))}%<small>平均负载</small></strong></div></article>

      <article className="panel status-panel"><PanelHeader kicker="任务完成情况" title="状态分布" action={<Link className="text-button" to="/tasks">查看全部 <Icon name="chevron" size={14}/></Link>}/><div className="status-total"><strong>{terminalTasks.length}</strong><span>项已结束任务</span></div><div className="status-stack" aria-label="任务状态分布">{statuses.map((item) => <span key={item.status} className={`stack-${item.status === 'success' ? 'success' : item.status === 'partial_success' ? 'warning' : item.status === 'failed' ? 'danger' : 'muted'}`} style={{ width: `${terminalTasks.length ? item.count / terminalTasks.length * 100 : 0}%` }}/>)}</div><div className="status-legend">{statuses.map((item) => <div key={item.status}><i className={`legend-${item.status === 'success' ? 'success' : item.status === 'partial_success' ? 'warning' : item.status === 'failed' ? 'danger' : 'muted'}`}/><span><StatusBadge status={item.status}/></span><strong>{item.count}</strong><em>{terminalTasks.length ? Math.round(item.count / terminalTasks.length * 100) : 0}%</em></div>)}</div></article>

      <article className="panel schedule-panel"><PanelHeader kicker="未来计划" title="调度计划" action={<Link className="icon-button small" to="/schedules" aria-label="管理全部调度计划"><Icon name="more" size={18}/></Link>}/><div className="schedule-list">{upcomingSchedules.map((schedule, index) => <Link className="schedule-row" to={`/schedules/${schedule.id}`} key={schedule.id}><time>{schedule.next_run_at.slice(11)}</time><span className="schedule-marker"><i className={index === 0 ? 'next' : ''}/></span><div><strong>{schedule.name}</strong><small>{schedule.cron} · {schedule.timezone}</small></div><em>{index === 0 ? '即将执行' : '等待中'}</em></Link>)}</div><Link className="schedule-action" to="/schedules">管理全部调度计划 <Icon name="chevron" size={14}/></Link></article>
    </section>

    <section className="panel compact-task-panel"><PanelHeader kicker="实时任务" title="近期执行记录" action={<Link className="text-button" to="/tasks">进入任务中心 <Icon name="chevron" size={14}/></Link>}/><div className="compact-task-list">{state.tasks.slice(0, 4).map((task) => <Link to={`/tasks/${task.id}`} key={task.id}><span><strong>{task.name}</strong><small>{task.id} · {task.bot_snapshot.name}</small></span><StatusBadge status={task.status}/><ProgressBar value={task.statistics.progress_rate} status={task.status}/><time>{task.created_at.slice(11)}</time></Link>)}</div></section>

    <section className="lower-grid"><article className="panel bot-panel"><PanelHeader kicker="核心自动化能力" title="Bot 运行概况" action={<Link className="text-button" to="/bots">管理 Bot <Icon name="chevron" size={14}/></Link>}/><div className="bot-list">{state.bots.map((bot) => <Link className="bot-row" to={`/bots/${bot.id}`} key={bot.id}><span className="bot-glyph blue"><Icon name="bot" size={18}/></span><span><strong>{bot.name}</strong><small>{bot.category} · {bot.code}</small></span><span className="bot-success"><small>关联任务</small><strong>{state.tasks.filter((task) => task.bot_id === bot.id).length}</strong></span><StatusBadge status={bot.status}/><Icon name="chevron" size={15}/></Link>)}</div></article><article className="insight-card"><div className="insight-top"><span><Icon name="activity" size={18}/></span><p>运营洞察</p></div><h2>自动化产能持续提升</h2><p>核心流程已形成从 <strong>Bot 定义、任务执行到明细观测</strong> 的完整闭环，调度与资源风险可以在一个工作台中追踪。</p><div className="insight-number"><span><strong>+18.4%</strong><small>本周自动化处理量</small></span><div>{[35,48,44,60,68,78,92].map((height) => <i key={height} style={{height:`${height}%`}}/>)}</div></div><Link to="/results">查看结果与附件 <Icon name="chevron" size={14}/></Link></article></section>
  </div>
}
