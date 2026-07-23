import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { Panel } from '../components/ui';
import { BackLink, DetailHero, ScheduleNextRun, timeShort } from '../components/console';
import { refreshScheduleNextRuns, toggleSchedule, triggerSchedule } from '../store/api';

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

  const schedule = db.schedules.find((s) => s.id === scheduleId);

  if (!schedule) {
    return (
      <>
        <div className="toolbar detail-toolbar">
          <div className="left">
            <BackLink to="/schedules" label={t('sch.detail.back')} />
          </div>
        </div>
        <div className="empty">{t('sch.detail.missing')}</div>
      </>
    );
  }

  const runs = db.runs.filter((r) => r.schedule_id === schedule.id);
  const materialized = runs.filter((r) => r.task_id !== null);

  const trigger = () => {
    const run = triggerSchedule(schedule.id);
    if (run) {
      setFlash(run.task_id ? `${run.id} → ${run.task_id}` : `${run.id} → ${t('sch.skipped')}`);
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
          <button className="btn sm" onClick={trigger} disabled={!schedule.enabled}>
            ⏵ {t('sch.trigger')}
          </button>
          <div className="admission-ctl">
            <span>{t('sch.col.enabled')}</span>
            <button
              type="button"
              className={`toggle${schedule.enabled ? ' on' : ''}`}
              aria-label={t('sch.col.enabled')}
              aria-pressed={schedule.enabled}
              onClick={() => toggleSchedule(schedule.id)}
            />
          </div>
        </div>
      </div>

      <DetailHero
        tag={t('sch.detail.tag')}
        title={schedule.name}
        sub={<>{schedule.id} // {schedule.bot_name}</>}
        side={
          <>
            <span className={`chip ${schedule.enabled ? 'green' : 'amber'}`}>
              {schedule.enabled ? t('wkp.detail.enabled') : t('wkp.detail.disabled')}
            </span>
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
          <div className="stat-val">{runs.length}</div>
          <div className="stat-label">{t('sch.stat.runs')}</div>
        </div>
        <div className="stat">
          <div className="stat-val green">{materialized.length}</div>
          <div className="stat-label">{t('sch.stat.materialized')}</div>
        </div>
        <div className="stat">
          <div className="stat-val dim">{schedule.jitter_seconds}</div>
          <div className="stat-label">{t('sch.stat.jitter')}</div>
        </div>
      </div>

      <div className="two-col detail-grid">
        <Panel title={t('sch.detail.timing')}>
          <dl className="kv detail-kv">
            <dt>{t('sch.col.cron')}</dt><dd className="mono">{schedule.cron}</dd>
            <dt>{t('sch.col.tz')}</dt><dd className="mono">{schedule.timezone}</dd>
            <dt>{t('sch.col.nextRun')}</dt><dd><ScheduleNextRun schedule={schedule} /></dd>
            <dt>{t('sch.detail.planned')}</dt>
            <dd className="mono">{schedule.next_planned_at ? timeShort(schedule.next_planned_at) : '—'}</dd>
            <dt>{t('sch.f.jitter')}</dt><dd className="mono">{schedule.jitter_seconds}s</dd>
          </dl>
        </Panel>

        <Panel title={t('sch.detail.policy')}>
          <dl className="kv detail-kv">
            <dt>{t('dash.col.bot')}</dt>
            <dd>
              <button className="btn ghost sm" onClick={() => navigate(`/bots/${schedule.bot_id}`)}>
                {schedule.bot_name}
              </button>
            </dd>
            <dt>{t('sch.f.overlap')}</dt><dd><span className="chip neon">{schedule.overlap_policy}</span></dd>
            <dt>{t('sch.f.missed')}</dt><dd><span className="chip amber">{schedule.missed_run_policy}</span></dd>
            <dt>{t('sch.col.enabled')}</dt>
            <dd>
              <span className={`chip ${schedule.enabled ? 'green' : 'amber'}`}>
                {schedule.enabled ? t('wkp.detail.enabled') : t('wkp.detail.disabled')}
              </span>
            </dd>
            <dt>{t('dash.col.created')}</dt><dd className="mono">{timeShort(schedule.created_at)}</dd>
          </dl>
        </Panel>
      </div>

      <h2 className="sec-title worker-section-title">{t('sch.runs')}</h2>
      {runs.length === 0 ? (
        <div className="empty">—</div>
      ) : (
        <div className="data-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{t('sch.col.run')}</th>
                <th>{t('sch.col.reason')}</th>
                <th>{t('sch.col.jitter')}</th>
                <th>{t('sch.col.task')}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr
                  key={r.id}
                  className={r.task_id ? '' : 'no-click'}
                  onClick={() => r.task_id && navigate(`/tasks/${r.task_id}`)}
                >
                  <td className="mono strong">{timeShort(r.created_at)}</td>
                  <td><span className="chip violet">{r.trigger_reason}</span></td>
                  <td className="mono">{r.jitter_applied_seconds}s</td>
                  <td className="mono">{r.task_id ?? t('sch.skipped')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
