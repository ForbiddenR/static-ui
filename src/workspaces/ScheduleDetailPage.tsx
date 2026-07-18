import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DefinitionGrid, EmptyState, Icon, Modal, PageHeader, PanelHeader, StatusBadge } from '../components/ui'
import type { ScheduleFormPayload } from '../domain/types'
import { formatDateTime, formatNumber, formatTime } from '../i18n/formatters'
import { usePlatform } from '../state/PlatformContext'
import { useDemoText } from '../i18n/demo'
import ScheduleForm from './ScheduleForm'

export default function ScheduleDetailPage() {
  const { t } = useTranslation(['schedules', 'common'])
  const { scheduleId } = useParams()
  const navigate = useNavigate()
  const { state, toggleSchedule, triggerSchedule, updateSchedule } = usePlatform()
  const demo = useDemoText()
  const [editOpen, setEditOpen] = useState(false)
  const schedule = state.schedules.find((item) => item.id === scheduleId)
  if (!schedule) return <div className="page-body"><EmptyState title={t('schedules:notFoundTitle')} description={t('schedules:notFoundDescription')}/></div>
  const bot = state.bots.find((item) => item.id === schedule.bot_id)
  const version = state.botVersions.find((item) => item.id === schedule.bot_version_id)
  const runs = state.scheduleRuns.filter((item) => item.schedule_id === schedule.id)
  const trigger = () => { const taskId = triggerSchedule(schedule.id); if (taskId) navigate(`/tasks/${taskId}`) }
  const save = (form: ScheduleFormPayload) => { updateSchedule(schedule.id, form); setEditOpen(false) }
  const jitterMinutes = schedule.next_planned_at && schedule.next_run_at ? Math.max(0, Number(schedule.next_run_at.slice(14,16)) - Number(schedule.next_planned_at.slice(14,16))) : 0
  return <div className="page-body">
    <PageHeader eyebrow={schedule.id} title={demo('schedules', schedule.id, 'name', schedule.name)} description={demo('schedules', schedule.id, 'description', schedule.description)} backTo="/schedules" actions={<><StatusBadge status={schedule.status}/><button className="secondary-button" onClick={() => toggleSchedule(schedule.id)}>{schedule.status === 'enabled' ? t('schedules:disable') : t('schedules:enable')}</button><button className="secondary-button" onClick={() => setEditOpen(true)}><Icon name="edit" size={15}/>{t('common:edit')}</button><button className="primary-button" disabled={schedule.status !== 'enabled'} onClick={trigger}><Icon name="play" size={15}/>{t('schedules:triggerNow')}</button></>}/>
    <div className="schedule-detail-grid"><section className="panel schedule-config-panel"><PanelHeader kicker={t('schedules:definitionKicker')} title={t('schedules:configuration')}/><DefinitionGrid items={[[t('schedules:targetBot'), bot ? <Link to={`/bots/${bot.id}`}>{demo('bots', bot.id, 'name', bot.name)}</Link> : t('schedules:botRemoved')], [t('schedules:fixedVersion'), version?.version || t('schedules:currentVersionAtTrigger')], [t('schedules:cron'), <code>{schedule.cron}</code>], [t('schedules:timezone'), schedule.timezone], [t('schedules:inputSource'), t(`common:inputSources.${schedule.input_source}`)], [t('schedules:inputParameters'), <code>{JSON.stringify(schedule.input_params)}</code>], [t('schedules:overlapPolicyLabel'), t('schedules:overlapPolicy')], [t('schedules:missedRunPolicyLabel'), t('schedules:missedRunPolicy')], [t('schedules:maximumJitter'), t('schedules:maximumJitterValue', { seconds: formatNumber(schedule.jitter_seconds) })], [t('schedules:createdBy'), schedule.created_by]]}/></section>
      <section className="panel time-rail-panel"><PanelHeader kicker={t('schedules:nextRunKicker')} title={t('schedules:nextRun')}/>{schedule.next_run_at && schedule.next_planned_at ? <div className="time-rail"><div><span>{t('schedules:nominalTrigger')}</span><strong>{formatTime(schedule.next_planned_at)}</strong><small>{formatDateTime(schedule.next_planned_at)}</small></div><div className="time-rail-track"><i/><em>{t('schedules:jitterMinutes', { minutes: formatNumber(jitterMinutes) })}</em></div><div><span>{t('schedules:actualSchedule')}</span><strong>{formatTime(schedule.next_run_at)}</strong><small>{schedule.timezone}</small></div></div> : <EmptyState icon="clock" title={t('schedules:noNextRunTitle')} description={t('schedules:noNextRunDescription')}/>}<div className="policy-note compact"><Icon name="activity" size={18}/><div><strong>{t('schedules:traceableDecisionsTitle')}</strong><p>{t('schedules:traceableDecisionsDescription')}</p></div></div></section>
    </div>
    <section className="panel workspace-panel spaced-panel"><PanelHeader kicker={t('schedules:historyKicker')} title={t('schedules:historyTitle')}/><div className="table-wrap"><table className="data-table"><caption className="sr-only">{t('schedules:historyCaption')}</caption><thead><tr><th>{t('schedules:plannedActualTime')}</th><th>{t('schedules:decisionResult')}</th><th>{t('schedules:reason')}</th><th>{t('schedules:jitterLabel')}</th><th>{t('schedules:relatedTask')}</th><th>{t('schedules:errorDescription')}</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id}><td><strong>{formatDateTime(run.planned_at)}</strong><small>{t('schedules:actualTime', { time: formatDateTime(run.scheduled_at) })}</small></td><td><StatusBadge status={run.status}/></td><td><strong>{t(`common:scheduleReasons.${run.reason}`)}</strong></td><td>{t('schedules:jitterApplied', { applied: formatNumber(run.jitter_applied_seconds), maximum: formatNumber(run.jitter_seconds) })}</td><td>{run.task_id ? <Link to={`/tasks/${run.task_id}`}>{run.task_id}</Link> : t('schedules:noTaskCreated')}</td><td>{run.error_message ? demo('scheduleRuns', run.id, 'errorMessage', run.error_message) : t('common:none')}</td></tr>)}</tbody></table></div>{!runs.length && <EmptyState icon="clock" title={t('schedules:emptyHistoryTitle')} description={t('schedules:emptyHistoryDescription')}/>}</section>
    <Modal open={editOpen} onClose={() => setEditOpen(false)} kicker={t('schedules:editKicker')} title={t('schedules:editTitle')} width="720px"><ScheduleForm initial={schedule} onSubmit={save} onCancel={() => setEditOpen(false)}/></Modal>
  </div>
}
