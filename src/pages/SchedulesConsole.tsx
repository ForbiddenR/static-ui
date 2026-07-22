import { useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { PageHeader, Panel } from '../components/ui';
import { timeShort } from '../components/console';
import { createSchedule, toggleSchedule, triggerSchedule } from '../store/api';
import type { Schedule } from '../store/db';

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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !botId || !cron.trim()) {
      setErr(t('sch.err.required'));
      return;
    }
    createSchedule({
      bot_id: botId,
      name: name.trim(),
      cron: cron.trim(),
      timezone: tz.trim() || 'UTC',
      overlap_policy: overlap,
      missed_run_policy: missed,
      jitter_seconds: Math.max(0, parseInt(jitter, 10) || 0),
    });
    onDone();
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
          <button className="btn" type="submit">{t('sch.f.submit')}</button>
          <button className="btn ghost" type="button" onClick={onDone}>{t('bots.f.cancel')}</button>
        </div>
      </form>
    </Panel>
  );
}

function ScheduleDrawer({ schedule, onClose }: { schedule: Schedule; onClose: () => void }) {
  const { t } = useI18n();
  const db = useDB();
  const navigate = useNavigate();
  const runs = db.runs.filter((r) => r.schedule_id === schedule.id);

  return (
    <>
      <div className="drawer-veil" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <div className="drawer-title">{schedule.name}</div>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>
        <dl className="kv">
          <dt>{t('dash.col.bot')}</dt><dd>{schedule.bot_name}</dd>
          <dt>{t('sch.col.cron')}</dt><dd className="mono">{schedule.cron}</dd>
          <dt>{t('sch.col.tz')}</dt><dd className="mono">{schedule.timezone}</dd>
          <dt>{t('sch.f.overlap')}</dt><dd><span className="chip neon">{schedule.overlap_policy}</span></dd>
          <dt>{t('sch.f.missed')}</dt><dd><span className="chip amber">{schedule.missed_run_policy}</span></dd>
          <dt>{t('sch.f.jitter')}</dt><dd className="mono">{schedule.jitter_seconds}s</dd>
          <dt>{t('sch.col.enabled')}</dt>
          <dd><span className={`toggle${schedule.enabled ? ' on' : ''}`} onClick={() => toggleSchedule(schedule.id)} /></dd>
        </dl>

        <h3 className="sub-title">{t('sch.runs')}</h3>
        {runs.length === 0 ? (
          <div className="empty">—</div>
        ) : (
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
                  <td className="mono">{timeShort(r.created_at)}</td>
                  <td><span className="chip violet">{r.trigger_reason}</span></td>
                  <td className="mono">{r.jitter_applied_seconds}s</td>
                  <td className="mono">{r.task_id ?? t('sch.skipped')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export default function SchedulesConsole() {
  const { t } = useI18n();
  const db = useDB();
  const { scheduleId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const creating = params.get('new') === '1';
  const [flash, setFlash] = useState<string>('');

  const selected = db.schedules.find((s) => s.id === scheduleId) ?? null;

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
        <table className="data" style={{ marginTop: 18 }}>
          <thead>
            <tr>
              <th>{t('sch.col.name')}</th>
              <th>{t('dash.col.bot')}</th>
              <th>{t('sch.col.cron')}</th>
              <th>{t('sch.col.tz')}</th>
              <th>{t('sch.col.enabled')}</th>
              <th>{t('dash.col.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {db.schedules.map((s) => (
              <tr key={s.id} onClick={() => navigate(`/schedules/${s.id}`)}>
                <td className="strong">{s.name}</td>
                <td>{s.bot_name}</td>
                <td className="mono">{s.cron}</td>
                <td className="mono">{s.timezone}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <span className={`toggle${s.enabled ? ' on' : ''}`} onClick={() => toggleSchedule(s.id)} />
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button className="btn sm" onClick={() => trigger(s.id)} disabled={!s.enabled}>
                    ⏵ {t('sch.trigger')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && <ScheduleDrawer schedule={selected} onClose={() => navigate('/schedules')} />}
    </>
  );
}
