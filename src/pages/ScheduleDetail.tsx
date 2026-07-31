import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { Panel } from '../components/ui';
import { BackLink, DetailHero, ScheduleNextRun, StatusBadge, timeShort } from '../components/console';
import { refreshScheduleNextRuns, toggleSchedule, triggerSchedule } from '../store/api';
import type { ScheduleRun } from '../store/db';

function triggerFeedback(run: ScheduleRun): string {
  return `${run.id} // ${run.status}${run.reason ? ` // ${run.reason}` : ''}`;
}

export default function ScheduleDetail() {
  const { t } = useI18n();
  const db = useDB();
  const { scheduleId } = useParams();
  const navigate = useNavigate();
  const [flash, setFlash] = useState('');

  useEffect(() => {
    void refreshScheduleNextRuns();
    const interval = window.setInterval(() => void refreshScheduleNextRuns(), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const schedule = db.schedules.find((candidate) => candidate.id === scheduleId);
  if (!schedule) {
    return (
      <>
        <div className="toolbar detail-toolbar">
          <div className="left"><BackLink to="/schedules" label={t('sch.detail.back')} /></div>
        </div>
        <div className="empty">{t('sch.detail.missing')}</div>
      </>
    );
  }

  const runs = db.runs.filter((run) => run.schedule_id === schedule.id);
  const materialized = runs.filter((run) => run.status === 'task_created');
  const task = db.tasks.find((item) => item.id === schedule.task_id);
  const lastTaskRun = schedule.last_task_run_id
    ? db.taskRuns.find((item) => item.id === schedule.last_task_run_id)
    : undefined;
  const canOperate = schedule.status === 'enabled';

  const trigger = () => {
    const run = triggerSchedule(schedule.id);
    if (run) {
      setFlash(triggerFeedback(run));
      window.setTimeout(() => setFlash(''), 4000);
    }
  };

  return (
    <>
      <div className="toolbar detail-toolbar">
        <div className="left">
          <BackLink to="/schedules" label={t('sch.detail.back')} />
          {flash && <span className="chip neon">{flash}</span>}
        </div>
        <div className="left">
          <button className="btn sm" type="button" onClick={trigger} disabled={!canOperate}>
            ⏵ {t('sch.trigger')}
          </button>
          <div className="admission-ctl">
            <span>{t('dash.col.status')}</span>
            <button
              type="button"
              className={`toggle${canOperate ? ' on' : ''}`}
              aria-label={t('dash.col.status')}
              aria-pressed={canOperate}
              disabled={schedule.status === 'archived'}
              onClick={() => toggleSchedule(schedule.id)}
            />
          </div>
        </div>
      </div>

      <DetailHero
        tag={t('sch.detail.tag')}
        title={schedule.name}
        sub={<>{schedule.id} // {task?.name ?? schedule.task_id} // {schedule.bot_code || schedule.bot_id}</>}
        side={
          <>
            <StatusBadge status={schedule.status} />
            <span className="chip neon mono">{schedule.cron}</span>
            <span className="chip violet">{schedule.timezone}</span>
          </>
        }
      />

      <h2 className="sec-title worker-section-title">{t('sch.detail.timing')}</h2>
      <div className="stat-grid detail-stats">
        <div className="stat stat-wide">
          <div className="stat-wide-head">
            <div>
              <div className="stat-val sm"><ScheduleNextRun schedule={schedule} /></div>
              <div className="stat-label">{t('sch.col.nextRun')}</div>
            </div>
            <span className="chip neon mono">{schedule.cron}</span>
          </div>
        </div>
        <div className="stat">
          <div className="stat-val sm">{schedule.last_run_at ? timeShort(schedule.last_run_at) : '—'}</div>
          <div className="stat-label">{t('sch.detail.lastRun')}</div>
        </div>
        <div className="stat">
          <div className="stat-val sm">{schedule.last_task_run_id ?? '—'}</div>
          <div className="stat-label">{t('sch.detail.lastTaskRun')}</div>
        </div>
        <div className="stat">
          <div className="stat-val">{runs.length}</div>
          <div className="stat-label">{t('sch.stat.runs')}</div>
        </div>
      </div>

      <div className="two-col detail-grid">
        <Panel title={t('sch.detail.timing')}>
          <dl className="kv detail-kv">
            <dt>{t('sch.col.cron')}</dt><dd className="mono">{schedule.cron}</dd>
            <dt>{t('sch.col.tz')}</dt><dd className="mono">{schedule.timezone}</dd>
            <dt>{t('sch.detail.planned')}</dt>
            <dd className="mono">{schedule.next_planned_at ? timeShort(schedule.next_planned_at) : '—'}</dd>
            <dt>{t('sch.col.nextRun')}</dt><dd><ScheduleNextRun schedule={schedule} /></dd>
            <dt>{t('sch.f.jitter')}</dt><dd className="mono">{schedule.jitter_seconds}s</dd>
          </dl>
        </Panel>
        <Panel title={t('sch.detail.policy')}>
          <dl className="kv detail-kv">
            <dt>{t('sch.col.task')}</dt>
            <dd>
              <button className="btn ghost sm relationship-link" type="button" onClick={() => navigate(`/tasks/${schedule.task_id}`)}>
                {task?.name ?? schedule.task_id}
              </button>
            </dd>
            <dt>{t('dash.col.jobDefinition')}</dt>
            <dd>
              <button className="btn ghost sm relationship-link" type="button" onClick={() => navigate(`/job-definitions/${schedule.bot_id}`)}>
                {schedule.bot_code || schedule.bot_id}
              </button>
            </dd>
            <dt>{t('sch.f.overlap')}</dt><dd><span className="chip neon">{schedule.overlap_policy}</span></dd>
            <dt>{t('sch.f.missed')}</dt><dd><span className="chip amber">{schedule.missed_run_policy}</span></dd>
            <dt>{t('dash.col.status')}</dt><dd><StatusBadge status={schedule.status} /></dd>
            <dt>{t('dash.col.created')}</dt><dd className="mono">{timeShort(schedule.created_at)}</dd>
          </dl>
        </Panel>
        <Panel title={t('sch.detail.boundTask')}>
          <dl className="kv detail-kv">
            <dt>{t('sch.f.description')}</dt><dd>{schedule.description ?? '—'}</dd>
            <dt>{t('tasks.f.inputSource')}</dt>
            <dd><span className="chip violet">{task?.input_source ?? '—'}</span></dd>
            <dt>{t('tasks.f.params')}</dt>
            <dd className="mono">{task ? JSON.stringify(task.input_params) : '—'}</dd>
            <dt>{t('tasks.f.config')}</dt>
            <dd className="mono">{task ? JSON.stringify(task.config) : '—'}</dd>
            <dt>{t('tasks.f.requirements')}</dt>
            <dd className="mono">{task ? JSON.stringify(task.requirements) : '—'}</dd>
            <dt>{t('tasks.f.priority')}</dt>
            <dd className="mono">{task?.priority ?? '—'}</dd>
          </dl>
        </Panel>
        <Panel title={t('sch.detail.lastDecision')}>
          <dl className="kv detail-kv">
            <dt>{t('sch.detail.lastRun')}</dt>
            <dd className="mono">{schedule.last_run_at ? timeShort(schedule.last_run_at) : '—'}</dd>
            <dt>{t('sch.detail.lastTaskRun')}</dt>
            <dd className="mono">
              {schedule.last_task_run_id ? (
                <button
                  className="btn ghost sm relationship-link"
                  type="button"
                  onClick={() => navigate(`/task-runs/${schedule.last_task_run_id}`)}
                >
                  {lastTaskRun?.id ?? schedule.last_task_run_id}
                </button>
              ) : '—'}
            </dd>
            <dt>{t('sch.stat.materialized')}</dt><dd className="mono">{materialized.length}</dd>
            <dt>{t('sch.detail.updated')}</dt><dd className="mono">{timeShort(schedule.updated_at)}</dd>
          </dl>
        </Panel>
      </div>

      <h2 className="sec-title worker-section-title">{t('sch.runs')}</h2>
      {runs.length === 0 ? (
        <div className="empty">—</div>
      ) : (
        <div className="data-scroll">
          <table className="data schedule-run-table">
            <thead>
              <tr>
                <th>{t('sch.col.run')}</th>
                <th>{t('dash.col.status')}</th>
                <th>{t('sch.col.reason')}</th>
                <th>{t('sch.run.detail.triggered')}</th>
                <th>{t('sch.col.taskRun')}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} onClick={() => navigate(`/schedule-runs/${run.id}`)}>
                  <td className="mono strong">{run.id}</td>
                  <td><StatusBadge status={run.status} /></td>
                  <td className="mono">{run.reason ?? '—'}</td>
                  <td className="mono">{timeShort(run.triggered_at)}</td>
                  <td className="mono" onClick={(event) => event.stopPropagation()}>
                    {run.task_run_id ? (
                      <button
                        className="btn ghost sm relationship-link"
                        type="button"
                        onClick={() => navigate(`/task-runs/${run.task_run_id}`)}
                      >
                        {run.task_run_id}
                      </button>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
