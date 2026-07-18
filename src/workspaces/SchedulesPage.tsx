import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { EmptyState, Icon, Modal, PageHeader, StatusBadge } from '../components/ui'
import type { IconName } from '../components/ui'
import type { Schedule, ScheduleFormPayload } from '../domain/types'
import { formatDateTime, formatNumber, formatTime } from '../i18n/formatters'
import { usePlatform } from '../state/PlatformContext'
import { useDemoText } from '../i18n/demo'
import ScheduleForm from './ScheduleForm'

export default function SchedulesPage() {
  const { t } = useTranslation(['schedules', 'common'])
  const { state, createSchedule } = usePlatform()
  const demo = useDemoText()
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
  const summaryTiles: readonly [string, string | number, IconName][] = [[t('schedules:summaryEnabled'), formatNumber(state.schedules.filter((item) => item.status === 'enabled').length), 'calendar'], [t('schedules:summaryNextRun'), formatTime(nextRunSchedules[0]?.next_run_at || null), 'clock'], [t('schedules:summarySkipped'), formatNumber(state.scheduleRuns.filter((item) => item.status === 'skipped').length), 'activity']]
  return <div className="page-body"><PageHeader eyebrow={t('schedules:eyebrow')} title={t('schedules:title')} description={t('schedules:description')} actions={<button className="primary-button" onClick={() => setOpen(true)}><Icon name="plus" size={16}/>{t('schedules:create')}</button>}/>
    <section className="schedule-summary-grid">{summaryTiles.map(([label,value,icon]) => <article className="summary-tile" key={label}><span><Icon name={icon} size={18}/>{label}</span><strong>{value}</strong></article>)}</section>
    <section className="panel workspace-panel"><div className="workspace-toolbar"><div className="status-tabs">{(['all', 'enabled', 'disabled'] as const).map((key) => <button key={key} className={status === key ? 'active' : ''} onClick={() => setStatus(key)}>{key === 'all' ? t('schedules:all') : t(`common:statuses.${key}`)}</button>)}</div><span className="toolbar-note">{t('schedules:policySummary')}</span></div>
      <div className="schedule-card-list">{filtered.map((schedule) => { const bot = state.bots.find((item) => item.id === schedule.bot_id); const lastRun = state.scheduleRuns.find((item) => item.schedule_id === schedule.id); return <Link to={`/schedules/${schedule.id}`} className="schedule-card" key={schedule.id}><div className="schedule-card-time"><span>{t('schedules:nextActualRun')}</span><strong>{schedule.next_run_at ? formatTime(schedule.next_run_at) : t('schedules:noPlan')}</strong><small>{schedule.next_run_at ? formatDateTime(schedule.next_run_at) : t('common:statuses.disabled')}</small></div><div className="schedule-card-main"><div><StatusBadge status={schedule.status}/><code>{schedule.cron}</code></div><h2>{demo('schedules', schedule.id, 'name', schedule.name)}</h2><p>{bot ? demo('bots', bot.id, 'name', bot.name) : undefined} · {schedule.timezone}</p><div className="policy-row"><span>{t('schedules:overlapPolicy')}</span><span>{t('schedules:missedRunPolicy')}</span><span>{t('schedules:jitter', { seconds: formatNumber(schedule.jitter_seconds) })}</span></div></div><div className="schedule-card-last"><span>{t('schedules:lastDecision')}</span>{lastRun ? <><StatusBadge status={lastRun.status}/><small>{t(`common:scheduleReasons.${lastRun.reason}`)}</small></> : <strong>{t('schedules:notRunYet')}</strong>}<Icon name="chevron" size={16}/></div></Link>})}</div>{!filtered.length && <EmptyState icon="calendar" title={t('schedules:emptyTitle')} description={t('schedules:emptyDescription')}/>}
    </section>
    <Modal open={open} onClose={() => setOpen(false)} kicker={t('schedules:createKicker')} title={t('schedules:createTitle')} width="720px"><ScheduleForm onSubmit={save} onCancel={() => setOpen(false)}/></Modal>
  </div>
}
