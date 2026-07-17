import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { EmptyState, Icon, Modal, PageHeader, StatusBadge } from '../components/ui'
import { usePlatform } from '../state/PlatformContext'
import type { IconName } from '../components/ui'
import type { Schedule, ScheduleFormPayload } from '../domain/types'
import ScheduleForm from './ScheduleForm'

export default function SchedulesPage() {
  const { state, createSchedule } = usePlatform()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('all')
  const [open, setOpen] = useState(false)
  const query = (params.get('q') || '').toLowerCase()
  const filtered = useMemo(() => state.schedules.filter((schedule) => {
    const bot = state.bots.find((item) => item.id === schedule.bot_id)
    return [schedule.name, schedule.cron, bot?.name || ''].join(' ').toLowerCase().includes(query) && (status === 'all' || schedule.status === status)
  }), [state.schedules, state.bots, query, status])
  const save = (form: ScheduleFormPayload): void => { const id = createSchedule(form); setOpen(false); if (id) navigate(`/schedules/${id}`) }
  const nextRunSchedules = state.schedules.filter((schedule): schedule is Schedule & { next_run_at: string } => schedule.next_run_at !== null).sort((a, b) => a.next_run_at.localeCompare(b.next_run_at))
  const summaryTiles: readonly [string, string | number, IconName][] = [['已启用', state.schedules.filter((item) => item.status === 'enabled').length, 'calendar'], ['下一次运行', nextRunSchedules[0]?.next_run_at.slice(11) || '—', 'clock'], ['策略跳过', state.scheduleRuns.filter((item) => item.status === 'skipped').length, 'activity']]
  return <div className="page-body"><PageHeader eyebrow="Schedule control room" title="调度计划" description="管理定时触发规则，并追踪每一次 ScheduleRun 的决策结果。" actions={<button className="primary-button" onClick={() => setOpen(true)}><Icon name="plus" size={16}/>新增调度计划</button>}/>
    <section className="schedule-summary-grid">{summaryTiles.map(([label,value,icon]) => <article className="summary-tile" key={label}><span><Icon name={icon} size={18}/>{label}</span><strong>{value}</strong></article>)}</section>
    <section className="panel workspace-panel"><div className="workspace-toolbar"><div className="status-tabs">{[['all','全部'],['enabled','已启用'],['disabled','已停用']].map(([key,label]) => <button key={key} className={status === key ? 'active' : ''} onClick={() => setStatus(key)}>{label}</button>)}</div><span className="toolbar-note">重叠策略：skip · 错过策略：run_once</span></div>
      <div className="schedule-card-list">{filtered.map((schedule) => { const bot = state.bots.find((item) => item.id === schedule.bot_id); const lastRun = state.scheduleRuns.find((item) => item.schedule_id === schedule.id); return <Link to={`/schedules/${schedule.id}`} className="schedule-card" key={schedule.id}><div className="schedule-card-time"><span>下一次实际运行</span><strong>{schedule.next_run_at ? schedule.next_run_at.slice(11) : '暂无计划'}</strong><small>{schedule.next_run_at?.slice(0,10) || '已停用'}</small></div><div className="schedule-card-main"><div><StatusBadge status={schedule.status}/><code>{schedule.cron}</code></div><h2>{schedule.name}</h2><p>{bot?.name} · {schedule.timezone}</p><div className="policy-row"><span>重叠：skip</span><span>错过：run_once</span><span>Jitter：{schedule.jitter_seconds}s</span></div></div><div className="schedule-card-last"><span>最近决策</span>{lastRun ? <><StatusBadge status={lastRun.status}/><small>{lastRun.reason}</small></> : <strong>尚未运行</strong>}<Icon name="chevron" size={16}/></div></Link>})}</div>{!filtered.length && <EmptyState icon="calendar" title="未找到调度计划" description="请调整搜索或状态筛选。"/>}
    </section>
    <Modal open={open} onClose={() => setOpen(false)} kicker="Create schedule" title="新增调度计划" width="720px"><ScheduleForm onSubmit={save} onCancel={() => setOpen(false)}/></Modal>
  </div>
}
