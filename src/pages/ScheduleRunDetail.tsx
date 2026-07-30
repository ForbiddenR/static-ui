import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { Panel } from '../components/ui';
import { BackLink, DetailHero, StatusBadge, timeShort } from '../components/console';

export default function ScheduleRunDetail() {
  const { t } = useI18n();
  const db = useDB();
  const { runId } = useParams();
  const navigate = useNavigate();
  const run = db.runs.find((candidate) => candidate.id === runId);

  if (!run) {
    return <><div className="toolbar detail-toolbar"><div className="left"><BackLink to="/schedules" label={t('sch.detail.back')} /></div></div><div className="empty">{t('sch.run.detail.missing')}</div></>;
  }

  const schedule = db.schedules.find((candidate) => candidate.id === run.schedule_id);
  const bot = db.bots.find((candidate) => candidate.id === run.bot_id);
  const task = run.task_id ? db.tasks.find((candidate) => candidate.id === run.task_id) : undefined;

  return (
    <>
      <div className="toolbar detail-toolbar">
        <div className="left"><BackLink to={schedule ? `/schedules/${schedule.id}` : '/schedules'} label={t('sch.run.detail.back')} /></div>
        <div className="left">
          {run.task_id && <button className="btn sm" type="button" onClick={() => navigate(`/tasks/${run.task_id}`)}>{t('sch.col.task')} {task?.id ?? run.task_id}</button>}
        </div>
      </div>

      <DetailHero
        tag={t('sch.run.detail.tag')}
        title={run.id}
        sub={<>{schedule?.name ?? run.schedule_id} // {timeShort(run.triggered_at)}</>}
        side={<><StatusBadge status={run.status} /><span className="chip violet">{run.trigger_type}</span>{run.reason && <span className="chip amber">{run.reason}</span>}</>}
      />

      <h2 className="sec-title worker-section-title">{t('sch.run.detail.decision')}</h2>
      <div className="stat-grid detail-stats">
        <div className="stat stat-wide"><div className="stat-wide-head"><div><div className="stat-val sm">{timeShort(run.triggered_at)}</div><div className="stat-label">{t('sch.run.detail.triggered')}</div></div><span className="chip violet">{run.trigger_type}</span></div></div>
        <div className="stat"><div className="stat-val sm"><StatusBadge status={run.status} /></div><div className="stat-label">{t('dash.col.status')}</div></div>
        <div className="stat"><div className="stat-val sm">{run.jitter_applied_seconds}s</div><div className="stat-label">{t('sch.col.jitter')}</div></div>
        {run.task_id && <div className="stat"><div className="stat-val sm green">{run.task_id}</div><div className="stat-label">{t('sch.col.task')}</div></div>}
      </div>

      <div className="two-col detail-grid">
        <Panel title={t('sch.run.detail.relationships')}>
          <dl className="kv detail-kv">
            <dt>{t('sch.col.run')}</dt><dd className="mono">{run.id}</dd>
            <dt>{t('sch.detail.tag')}</dt><dd><button className="btn ghost sm relationship-link" type="button" onClick={() => navigate(`/schedules/${run.schedule_id}`)}>{schedule?.name ?? run.schedule_id}</button></dd>
            <dt>{t('dash.col.jobDefinition')}</dt><dd><button className="btn ghost sm relationship-link" type="button" onClick={() => navigate(`/job-definitions/${run.bot_id}`)}>{bot?.code ?? run.bot_id}</button></dd>
            {run.task_id && <><dt>{t('sch.col.task')}</dt><dd className="mono"><button className="btn ghost sm relationship-link" type="button" onClick={() => navigate(`/tasks/${run.task_id}`)}>{task?.id ?? run.task_id}</button></dd></>}
          </dl>
        </Panel>
        <Panel title={t('sch.run.detail.result')}>
          <dl className="kv detail-kv">
            <dt>{t('dash.col.status')}</dt><dd><StatusBadge status={run.status} /></dd>
            <dt>{t('sch.col.reason')}</dt><dd className="mono">{run.reason ?? '—'}</dd>
            <dt>{t('sch.run.detail.taskOutcome')}</dt><dd>{run.task_id ? <span className="chip green">{t('sch.run.detail.taskCreated')}</span> : <span className="chip amber">{t('sch.run.detail.noTask')}</span>}</dd>
            <dt>{t('sch.run.detail.errorCode')}</dt><dd className="mono">{run.error_code ?? '—'}</dd>
            <dt>{t('sch.run.detail.errorMessage')}</dt><dd>{run.error_message ?? '—'}</dd>
            <dt>{t('sch.f.overlap')}</dt><dd><span className="chip neon">{run.overlap_policy}</span></dd>
            <dt>{t('sch.f.missed')}</dt><dd><span className="chip amber">{run.missed_run_policy}</span></dd>
          </dl>
        </Panel>
        <Panel title={t('sch.detail.timing')}>
          <dl className="kv detail-kv">
            <dt>{t('sch.detail.planned')}</dt><dd className="mono">{timeShort(run.planned_at)}</dd>
            <dt>{t('sch.run.detail.scheduled')}</dt><dd className="mono">{timeShort(run.scheduled_at)}</dd>
            <dt>{t('sch.run.detail.triggered')}</dt><dd className="mono">{timeShort(run.triggered_at)}</dd>
            <dt>{t('sch.f.jitter')}</dt><dd className="mono">{run.jitter_seconds}s</dd>
            <dt>{t('sch.col.jitter')}</dt><dd className="mono">{run.jitter_applied_seconds}s</dd>
            <dt>{t('dash.col.created')}</dt><dd className="mono">{timeShort(run.created_at)}</dd>
          </dl>
        </Panel>
      </div>
    </>
  );
}
