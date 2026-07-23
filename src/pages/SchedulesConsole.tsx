import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { PageHeader, Panel } from '../components/ui';
import { ScheduleNextRun } from '../components/console';
import { createSchedule, refreshScheduleNextRuns, toggleSchedule, triggerSchedule } from '../store/api';
import type { Schedule } from '../store/db';
import { validateCron, validateTimezone } from '../store/scheduleTime';

function CreateScheduleForm({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const db = useDB();
  const [name, setName] = useState('');
  const [botId, setBotId] = useState('');
  const [cron, setCron] = useState('0 2 * * *');
  const [tz, setTz] = useState('Asia/Shanghai');
  const [overlap, setOverlap] = useState<Schedule['overlap_policy']>('skip');
  const [missed, setMissed] = useState<Schedule['missed_run_policy']>('skip');
  const [jitter, setJitter] = useState('300');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!name.trim() || !botId || !cron.trim()) {
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
        bot_id: botId,
        name: name.trim(),
        cron: cron.trim(),
        timezone,
        overlap_policy: overlap,
        missed_run_policy: missed,
        jitter_seconds: Math.max(0, parseInt(jitter, 10) || 0),
      });
      if (!schedule) {
        setErr(t('sch.err.cron'));
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
            <label>{t('tasks.f.bot')}</label>
            <select value={botId} onChange={(e) => setBotId(e.target.value)}>
              <option value="">{t('tasks.f.bot.pick')}</option>
              {db.bots.map((b) => (
                <option key={b.id} value={b.id}>{b.code} — {b.name}</option>
              ))}
            </select>
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
              <option value="queue">queue</option>
              <option value="replace">replace</option>
              <option value="parallel">parallel</option>
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
        </div>
        {err && <div className="form-error">{err}</div>}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={busy}>{t('sch.f.submit')}</button>
          <button className="btn ghost" type="button" onClick={onDone}>{t('bots.f.cancel')}</button>
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
      setFlash(run.task_id ? `${run.id} → ${run.task_id}` : `${run.id} → ${t('sch.skipped')}`);
      window.setTimeout(() => setFlash(''), 4000);
    }
  };

  return (
    <>
      <PageHeader tag={t('sch.tag')} title={<>{t('sch.title')}<span className="accent">_</span></>} lede="" />

      <div className="toolbar">
        <div className="left">
          <button className="btn" onClick={() => setParams(creating ? {} : { new: '1' })}>
            {creating ? '−' : '+'} {t('sch.create')}
          </button>
        </div>
        {flash && <span className="chip neon">{flash}</span>}
      </div>

      {creating && <CreateScheduleForm onDone={() => setParams({})} />}

      {db.schedules.length === 0 ? (
        <div className="empty" style={{ marginTop: 18 }}>{t('sch.empty')}</div>
      ) : (
        <div className="data-scroll" style={{ marginTop: 18 }}>
          <table className="data schedule-table">
            <thead>
              <tr>
                <th>{t('sch.col.name')}</th>
                <th>{t('dash.col.bot')}</th>
                <th>{t('sch.col.cron')}</th>
                <th>{t('sch.col.tz')}</th>
                <th className="schedule-next-col">{t('sch.col.nextRun')}</th>
                <th className="schedule-enabled-col">{t('sch.col.enabled')}</th>
                <th className="schedule-actions-col">{t('dash.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {db.schedules.map((s) => (
                <tr key={s.id} onClick={() => navigate(`/schedules/${s.id}`)}>
                  <td className="strong">{s.name}</td>
                  <td>{s.bot_name}</td>
                  <td className="mono">{s.cron}</td>
                  <td className="mono">{s.timezone}</td>
                  <td className="mono schedule-next-col"><ScheduleNextRun schedule={s} /></td>
                  <td className="schedule-enabled-col" onClick={(e) => e.stopPropagation()}>
                    <span className={`toggle${s.enabled ? ' on' : ''}`} onClick={() => toggleSchedule(s.id)} />
                  </td>
                  <td className="schedule-actions-col" onClick={(e) => e.stopPropagation()}>
                    <button className="btn sm" onClick={() => trigger(s.id)} disabled={!s.enabled}>
                      ⏵ {t('sch.trigger')}
                    </button>
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
