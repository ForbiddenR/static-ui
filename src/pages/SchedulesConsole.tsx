import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { PageHeader, Panel } from '../components/ui';
import { ScheduleNextRun, StatusBadge, timeShort } from '../components/console';
import { createSchedule, refreshScheduleNextRuns, triggerSchedule } from '../store/api';
import type { Schedule, ScheduleRun } from '../store/db';
import { validateCron, validateTimezone } from '../store/scheduleTime';

function triggerFeedback(run: ScheduleRun): string {
  return `${run.id} // ${run.status}${run.reason ? ` // ${run.reason}` : ''}`;
}

function CreateScheduleForm({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const db = useDB();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [taskId, setTaskId] = useState('');
  const [cron, setCron] = useState('0 2 * * *');
  const [tz, setTz] = useState('Asia/Shanghai');
  const [overlap, setOverlap] = useState<Schedule['overlap_policy']>('skip');
  const [missed, setMissed] = useState<Schedule['missed_run_policy']>('skip');
  const [jitter, setJitter] = useState('300');
  const [enabled, setEnabled] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Schedules bind a Task template; timing/policies only.
  const availableTasks = db.tasks.filter((task) => task.status !== 'archived');
  const selectedTask = availableTasks.find((task) => task.id === taskId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!name.trim() || !taskId || !cron.trim()) {
      setErr(t('sch.err.required'));
      return;
    }

    const timezone = validateTimezone(tz);
    if (!timezone) {
      setErr(t('sch.err.timezone'));
      return;
    }

    setBusy(true);
    try {
      if (!(await validateCron(cron, timezone))) {
        setErr(t('sch.err.cron'));
        return;
      }

      const schedule = await createSchedule({
        task_id: taskId,
        name: name.trim(),
        description: description.trim() || null,
        cron: cron.trim(),
        timezone,
        overlap_policy: overlap,
        missed_run_policy: missed,
        jitter_seconds: Math.max(0, parseInt(jitter, 10) || 0),
        enabled,
      });
      if (!schedule) {
        setErr(t('sch.err.create'));
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel glow title={t('sch.create')}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>{t('sch.f.name')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nightly sync" />
          </div>
          <div className="field">
            <label>{t('sch.f.description')}</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('sch.f.task')}</label>
            <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">{t('sch.f.task.pick')}</option>
              {availableTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name} // {task.bot_code || task.bot_id}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t('dash.col.jobDefinition')}</label>
            <input value={selectedTask ? (selectedTask.bot_code || selectedTask.bot_id) : '—'} disabled readOnly />
          </div>
          <div className="field">
            <label>{t('sch.f.cron')}</label>
            <input value={cron} onChange={(e) => setCron(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('sch.f.tz')}</label>
            <input value={tz} onChange={(e) => setTz(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('sch.f.overlap')}</label>
            <select value={overlap} onChange={(e) => setOverlap(e.target.value as Schedule['overlap_policy'])}>
              <option value="skip">skip</option>
            </select>
          </div>
          <div className="field">
            <label>{t('sch.f.missed')}</label>
            <select value={missed} onChange={(e) => setMissed(e.target.value as Schedule['missed_run_policy'])}>
              <option value="skip">skip</option>
              <option value="run_once">run_once</option>
            </select>
          </div>
          <div className="field">
            <label>{t('sch.f.jitter')}</label>
            <input type="number" min={0} value={jitter} onChange={(e) => setJitter(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('sch.f.initialStatus')}</label>
            <select value={enabled ? 'enabled' : 'disabled'} onChange={(e) => setEnabled(e.target.value === 'enabled')}>
              <option value="enabled">enabled</option>
              <option value="disabled">disabled</option>
            </select>
          </div>
        </div>
        {err && <div className="form-error">{err}</div>}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={busy}>{t('sch.f.submit')}</button>
          <button className="btn ghost" type="button" onClick={onDone}>{t('jobDefinitions.f.cancel')}</button>
        </div>
      </form>
    </Panel>
  );
}

export default function SchedulesConsole() {
  const { t } = useI18n();
  const db = useDB();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const creating = params.get('new') === '1';
  const [flash, setFlash] = useState<string>('');

  useEffect(() => {
    void refreshScheduleNextRuns();
    const interval = window.setInterval(() => void refreshScheduleNextRuns(), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const trigger = (id: string) => {
    const run = triggerSchedule(id);
    if (run) {
      setFlash(triggerFeedback(run));
      window.setTimeout(() => setFlash(''), 4000);
    }
  };

  const schedules = db.schedules.filter((schedule) => schedule.status !== 'archived');

  return (
    <>
      <PageHeader tag={t('sch.tag')} title={<>{t('sch.title')}<span className="accent">_</span></>} lede="" />
      <div className="toolbar">
        <div className="left">
          <button className="btn" type="button" onClick={() => setParams(creating ? {} : { new: '1' })}>
            {creating ? '−' : '+'} {t('sch.create')}
          </button>
        </div>
        {flash && <span className="chip neon">{flash}</span>}
      </div>
      {creating && <CreateScheduleForm onDone={() => setParams({})} />}
      {schedules.length === 0 ? (
        <div className="empty" style={{ marginTop: 18 }}>{t('sch.empty')}</div>
      ) : (
        <div className="data-scroll" style={{ marginTop: 18 }}>
          <table className="data schedule-table">
            <thead>
              <tr>
                <th>{t('sch.col.name')}</th>
                <th>{t('sch.col.task')}</th>
                <th>{t('dash.col.jobDefinition')}</th>
                <th>{t('dash.col.status')}</th>
                <th>{t('sch.col.cron')}</th>
                <th className="schedule-next-col">{t('sch.col.nextRun')}</th>
                <th>{t('sch.col.run')}</th>
                <th>{t('sch.col.taskRun')}</th>
                <th className="schedule-actions-col">{t('dash.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((schedule) => {
                const task = db.tasks.find((item) => item.id === schedule.task_id);
                return (
                  <tr key={schedule.id} onClick={() => navigate(`/schedules/${schedule.id}`)}>
                    <td className="strong">{schedule.name}</td>
                    <td>{task?.name ?? schedule.task_id}</td>
                    <td>{schedule.bot_code || schedule.bot_id}</td>
                    <td><StatusBadge status={schedule.status} /></td>
                    <td className="mono">{schedule.cron} // {schedule.timezone}</td>
                    <td className="mono schedule-next-col"><ScheduleNextRun schedule={schedule} /></td>
                    <td className="mono">{schedule.last_run_at ? timeShort(schedule.last_run_at) : '—'}</td>
                    <td className="mono">{schedule.last_task_run_id ?? '—'}</td>
                    <td className="schedule-actions-col" onClick={(event) => event.stopPropagation()}>
                      <button className="btn sm" type="button" onClick={() => trigger(schedule.id)} disabled={schedule.status !== 'enabled'}>
                        ⏵ {t('sch.trigger')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
