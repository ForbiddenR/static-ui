import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { PageHeader, Panel } from '../components/ui';
import { ScheduleNextRun, StatusBadge, timeShort } from '../components/console';
import { createSchedule, refreshScheduleNextRuns, triggerSchedule } from '../store/api';
import type { InputSource, JsonObject, Schedule, ScheduleRun } from '../store/db';
import { validateCron, validateTimezone } from '../store/scheduleTime';

function triggerFeedback(run: ScheduleRun): string {
  return `${run.id} // ${run.status}${run.reason ? ` // ${run.reason}` : ''}`;
}

function parseObject(value: string): JsonObject | null {
  try {
    const parsed: unknown = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonObject : null;
  } catch {
    return null;
  }
}

function CreateScheduleForm({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const db = useDB();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [botId, setBotId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [cron, setCron] = useState('0 2 * * *');
  const [tz, setTz] = useState('Asia/Shanghai');
  const [inputSource, setInputSource] = useState<InputSource>('params');
  const [inputFileId, setInputFileId] = useState('');
  const [inputParams, setInputParams] = useState('{}');
  const [config, setConfig] = useState('{}');
  const [requirements, setRequirements] = useState('{}');
  const [overlap, setOverlap] = useState<Schedule['overlap_policy']>('skip');
  const [missed, setMissed] = useState<Schedule['missed_run_policy']>('skip');
  const [jitter, setJitter] = useState('300');
  const [enabled, setEnabled] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // A Schedule definition may target any non-archived Job Definition. Whether a
  // later decision materializes a Task is recorded by its ScheduleRun.
  const availableJobDefinitions = db.bots.filter((jobDefinition) => jobDefinition.status !== 'archived');
  const publishedVersions = db.versions.filter(
    (version) => version.bot_id === botId && version.status === 'published',
  );

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

    const parsedInputParams = inputSource === 'params' ? parseObject(inputParams) : {};
    const parsedConfig = parseObject(config);
    const parsedRequirements = parseObject(requirements);
    if (!parsedInputParams || !parsedConfig || !parsedRequirements) {
      setErr(t('tasks.err.json'));
      return;
    }
    if (inputSource === 'file' && !inputFileId.trim()) {
      setErr(t('sch.err.inputFileRequired'));
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
        bot_version_id: versionId || null,
        name: name.trim(),
        description: description.trim() || null,
        cron: cron.trim(),
        timezone,
        input_source: inputSource,
        input_file_id: inputSource === 'file' ? inputFileId.trim() : null,
        input_params: parsedInputParams,
        config: parsedConfig,
        requirements: parsedRequirements,
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
            <label>{t('tasks.f.jobDefinition')}</label>
            <select value={botId} onChange={(e) => { setBotId(e.target.value); setVersionId(''); }}>
              <option value="">{t('tasks.f.jobDefinition.pick')}</option>
              {availableJobDefinitions.map((jobDefinition) => (
                <option key={jobDefinition.id} value={jobDefinition.id}>{jobDefinition.code}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t('sch.f.version')}</label>
            <select value={versionId} onChange={(e) => setVersionId(e.target.value)} disabled={!botId}>
              <option value="">{t('sch.version.current')}</option>
              {publishedVersions.map((version) => (
                <option key={version.id} value={version.id}>{version.version} — {version.script_file}</option>
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
            <label>{t('sch.f.inputSource')}</label>
            <select value={inputSource} onChange={(e) => setInputSource(e.target.value as InputSource)}>
              <option value="params">params</option>
              <option value="file">file</option>
              <option value="none">none</option>
            </select>
          </div>
          <div className="field">
            <label>{t('sch.f.inputFileId')}</label>
            <input value={inputFileId} disabled={inputSource !== 'file'} onChange={(e) => setInputFileId(e.target.value)} />
          </div>
          <div className="field full">
            <label>{t('tasks.f.params')}</label>
            <textarea value={inputParams} disabled={inputSource !== 'params'} onChange={(e) => setInputParams(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('sch.f.config')}</label>
            <textarea value={config} onChange={(e) => setConfig(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('sch.f.requirements')}</label>
            <textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} />
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
                <th>{t('sch.col.name')}</th><th>{t('dash.col.jobDefinition')}</th><th>{t('dash.col.status')}</th>
                <th>{t('sch.col.cron')}</th><th className="schedule-next-col">{t('sch.col.nextRun')}</th>
                <th>{t('sch.col.run')}</th><th>{t('sch.col.task')}</th><th className="schedule-actions-col">{t('dash.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((schedule) => (
                <tr key={schedule.id} onClick={() => navigate(`/schedules/${schedule.id}`)}>
                  <td className="strong">{schedule.name}</td>
                  <td>{schedule.bot_code || schedule.bot_id}</td>
                  <td><StatusBadge status={schedule.status} /></td>
                  <td className="mono">{schedule.cron} // {schedule.timezone}</td>
                  <td className="mono schedule-next-col"><ScheduleNextRun schedule={schedule} /></td>
                  <td className="mono">{schedule.last_run_at ? timeShort(schedule.last_run_at) : '—'}</td>
                  <td className="mono">{schedule.last_task_id ?? '—'}</td>
                  <td className="schedule-actions-col" onClick={(event) => event.stopPropagation()}>
                    <button className="btn sm" type="button" onClick={() => trigger(schedule.id)} disabled={schedule.status !== 'enabled'}>
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
