import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DefinitionGrid, EmptyState, Icon, Modal, PageHeader, PanelHeader, StatusBadge } from '../components/ui'
import { usePlatform } from '../state/PlatformContext'
import type { ScheduleFormPayload } from '../domain/types'
import ScheduleForm from './ScheduleForm'

const reasonLabels = { scheduled: '按计划触发', manual_trigger: '手动触发', previous_task_running: '上一轮任务仍在执行', bot_disabled: '关联 Bot 未启用', missed_run_recovered: '错过触发后补跑一次', invalid_input: '输入参数无效' }

export default function ScheduleDetailPage() {
  const { scheduleId } = useParams()
  const navigate = useNavigate()
  const { state, toggleSchedule, triggerSchedule, updateSchedule } = usePlatform()
  const [editOpen, setEditOpen] = useState(false)
  const schedule = state.schedules.find((item) => item.id === scheduleId)
  if (!schedule) return <div className="page-body"><EmptyState title="调度计划不存在" description="该计划可能已归档。"/></div>
  const bot = state.bots.find((item) => item.id === schedule.bot_id)
  const version = state.botVersions.find((item) => item.id === schedule.bot_version_id)
  const runs = state.scheduleRuns.filter((item) => item.schedule_id === schedule.id)
  const trigger = () => { const taskId = triggerSchedule(schedule.id); if (taskId) navigate(`/tasks/${taskId}`) }
  const save = (form: ScheduleFormPayload) => { updateSchedule(schedule.id, form); setEditOpen(false) }
  const jitterMinutes = schedule.next_planned_at && schedule.next_run_at ? Math.max(0, Number(schedule.next_run_at.slice(14,16)) - Number(schedule.next_planned_at.slice(14,16))) : 0
  return <div className="page-body">
    <PageHeader eyebrow={schedule.id} title={schedule.name} description={schedule.description} backTo="/schedules" actions={<><StatusBadge status={schedule.status}/><button className="secondary-button" onClick={() => toggleSchedule(schedule.id)}>{schedule.status === 'enabled' ? '停用计划' : '启用计划'}</button><button className="secondary-button" onClick={() => setEditOpen(true)}><Icon name="edit" size={15}/>编辑</button><button className="primary-button" disabled={schedule.status !== 'enabled'} onClick={trigger}><Icon name="play" size={15}/>立即触发</button></>}/>
    <div className="schedule-detail-grid"><section className="panel schedule-config-panel"><PanelHeader kicker="Schedule definition" title="计划配置"/><DefinitionGrid items={[["目标 Bot",bot ? <Link to={`/bots/${bot.id}`}>{bot.name}</Link> : 'Bot 已移除'],["固定版本",version?.version || '触发时使用当前版本'],["Cron",<code>{schedule.cron}</code>],["时区",schedule.timezone],["输入来源",schedule.input_source],["输入参数",<code>{JSON.stringify(schedule.input_params)}</code>],["重叠策略","skip — 上一轮未完成则跳过"],["错过策略","run_once — 只补跑一次"],["随机延迟",`0–${schedule.jitter_seconds} 秒`],["创建人",schedule.created_by]]}/></section>
      <section className="panel time-rail-panel"><PanelHeader kicker="Nominal → actual" title="下一次运行"/>{schedule.next_run_at && schedule.next_planned_at ? <div className="time-rail"><div><span>理论触发</span><strong>{schedule.next_planned_at.slice(11)}</strong><small>{schedule.next_planned_at.slice(0,10)}</small></div><div className="time-rail-track"><i/><em>+{jitterMinutes} 分钟</em></div><div><span>实际计划</span><strong>{schedule.next_run_at.slice(11)}</strong><small>{schedule.timezone}</small></div></div> : <EmptyState icon="clock" title="暂无下一次运行" description="启用计划后，系统会重新计算理论与实际运行时间。"/>}<div className="policy-note compact"><Icon name="activity" size={18}/><div><strong>触发决策可追溯</strong><p>即使本轮被策略跳过，也会保留一条 ScheduleRun。</p></div></div></section>
    </div>
    <section className="panel workspace-panel spaced-panel"><PanelHeader kicker="Every trigger decision" title="ScheduleRun 历史"/><div className="table-wrap"><table className="data-table"><caption className="sr-only">调度运行历史</caption><thead><tr><th>理论 / 实际时间</th><th>决策结果</th><th>原因</th><th>Jitter</th><th>关联任务</th><th>错误说明</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id}><td><strong>{run.planned_at}</strong><small>实际 {run.scheduled_at}</small></td><td><StatusBadge status={run.status}/></td><td><strong>{reasonLabels[run.reason] || run.reason}</strong><small>{run.reason}</small></td><td>{run.jitter_applied_seconds} / {run.jitter_seconds} 秒</td><td>{run.task_id ? <Link to={`/tasks/${run.task_id}`}>{run.task_id}</Link> : '未创建 Task'}</td><td>{run.error_message || '—'}</td></tr>)}</tbody></table></div>{!runs.length && <EmptyState icon="clock" title="尚无触发记录" description="手动触发或到达计划时间后，会创建第一条 ScheduleRun。"/>}</section>
    <Modal open={editOpen} onClose={() => setEditOpen(false)} kicker="Edit schedule" title="编辑调度计划" width="720px"><ScheduleForm initial={schedule} onSubmit={save} onCancel={() => setEditOpen(false)}/></Modal>
  </div>
}
