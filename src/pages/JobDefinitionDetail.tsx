import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { Panel } from '../components/ui';
import { BackLink, DetailHero, Progress, ScheduleNextRun, StatusBadge, timeShort } from '../components/console';
import { PlacementSelect, tokenToPlacement } from '../components/PlacementSelect';
import {
  createJobDefinitionVersion,
  createTask,
  publishJobDefinitionVersion,
  resolvePublishedJobDefinitionVersion,
  runTask,
  toggleJobDefinition,
} from '../store/api';
import type { InputSource, JsonObject } from '../store/db';

const TERMINAL = new Set(['success', 'partial_success', 'failed', 'canceled', 'timeout']);

function parseObject(value: string): JsonObject {
  const parsed: unknown = JSON.parse(value || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required');
  return parsed as JsonObject;
}

export default function JobDefinitionDetail() {
  const { t } = useI18n();
  const db = useDB();
  const { jobDefinitionId } = useParams();
  const navigate = useNavigate();
  const [sourceFile, setSourceFile] = useState('');
  const [entrypoint, setEntrypoint] = useState('');
  const [inputSource, setInputSource] = useState<Exclude<InputSource, 'task_items'> | 'inherit'>('inherit');
  const [schema, setSchema] = useState('');
  const [config, setConfig] = useState('');
  const [requirements, setRequirements] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [publish, setPublish] = useState(true);
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState('');
  const [placementToken, setPlacementToken] = useState('');

  const jobDefinition = db.bots.find((candidate) => candidate.id === jobDefinitionId);

  if (!jobDefinition) {
    return (
      <>
        <div className="toolbar detail-toolbar">
          <div className="left">
            <BackLink to="/job-definitions" label={t('jobDefinitions.detail.back')} />
          </div>
        </div>
        <div className="empty">{t('jobDefinitions.detail.missing')}</div>
      </>
    );
  }

  const versions = db.versions
    .filter((candidate) => candidate.bot_id === jobDefinition.id)
    .sort((a, b) => b.version - a.version);
  const drafts = versions.filter((candidate) => candidate.status === 'draft');
  const current = versions.find((candidate) => candidate.id === jobDefinition.current_version_id);
  const versionResolution = resolvePublishedJobDefinitionVersion(jobDefinition.id);
  const runnable = jobDefinition.status === 'enabled'
    && versionResolution.ok
    && versionResolution.version.default_input_source !== 'file';
  const tasks = db.tasks.filter((task) => task.bot_id === jobDefinition.id && task.status !== 'archived');
  const taskRuns = db.taskRuns.filter((run) => run.bot_id === jobDefinition.id);
  const activeRuns = taskRuns.filter((run) => !TERMINAL.has(run.status));
  const schedules = db.schedules.filter((schedule) => schedule.bot_id === jobDefinition.id);

  const showFlash = (message: string) => {
    setFlash(message);
    window.setTimeout(() => setFlash(''), 5000);
  };

  const addVersion = (event: FormEvent) => {
    event.preventDefault();
    if (!sourceFile.trim()) {
      setErr(t('jobDefinitions.err.version'));
      return;
    }
    try {
      const created = createJobDefinitionVersion(jobDefinition.id, {
        source_file_id: sourceFile.trim(),
        entrypoint: entrypoint.trim() || jobDefinition.entrypoint,
        default_input_source: inputSource === 'inherit' ? undefined : inputSource,
        input_params_schema: schema.trim() ? parseObject(schema) : undefined,
        default_config: config.trim() ? parseObject(config) : undefined,
        default_requirements: requirements.trim() ? parseObject(requirements) : undefined,
        change_note: changeNote.trim() || null,
        publish,
      });
      if (!created) {
        setErr(t('jobDefinitions.err.version'));
        return;
      }
      setSourceFile('');
      setEntrypoint('');
      setInputSource('inherit');
      setSchema('');
      setConfig('');
      setRequirements('');
      setChangeNote('');
      setErr('');
    } catch {
      setErr(t('console.err.json'));
    }
  };

  // One-shot: ensure a default template exists, then run it as a TaskRun on the appointed worker.
  const run = () => {
    if (!versionResolution.ok) {
      showFlash(t('jobDefinitions.err.runRejected'));
      return;
    }
    if (!placementToken) {
      showFlash(t('tasks.err.worker'));
      return;
    }
    let template = tasks.find((task) => task.status === 'enabled' && !task.bot_version_id)
      ?? tasks.find((task) => task.status === 'enabled');
    if (!template) {
      template = createTask({
        bot_id: jobDefinition.id,
        name: `${jobDefinition.code} default`,
        input_source: versionResolution.version.default_input_source === 'task_items'
          ? 'params'
          : versionResolution.version.default_input_source,
        input_params: versionResolution.version.default_input_source === 'params' ? {} : undefined,
      }) ?? undefined;
    }
    if (!template) {
      showFlash(t('jobDefinitions.err.runRejected'));
      return;
    }
    const placement = tokenToPlacement(placementToken);
    if (!placement) {
      showFlash(t('tasks.err.worker'));
      return;
    }
    const taskRun = runTask(template.id, {
      target_pool_id: placement.target_pool_id,
      target_worker_id: placement.target_worker_id,
    });
    if (taskRun) navigate(`/task-runs/${taskRun.id}`);
    else showFlash(t('jobDefinitions.err.runRejected'));
  };

  const toggle = () => {
    const result = toggleJobDefinition(jobDefinition.id);
    if (!result.ok) showFlash(t(`jobDefinitions.err.toggle.${result.code}`));
  };

  const promote = (versionId: string, rollback: boolean) => {
    if (publishJobDefinitionVersion(jobDefinition.id, versionId)) {
      showFlash(rollback ? t('jobDefinitions.rollback.done') : t('jobDefinitions.publish.done'));
    }
  };

  return (
    <>
      <div className="toolbar detail-toolbar">
        <div className="left">
          <BackLink to="/job-definitions" label={t('jobDefinitions.detail.back')} />
          {flash && <span className="chip red">{flash}</span>}
        </div>
        <div className="left run-target-ctl">
          <label className="run-target-label" htmlFor="job-run-placement">
            {t('tasks.f.worker')}
          </label>
          <PlacementSelect
            id="job-run-placement"
            value={placementToken}
            disabled={!runnable}
            requireChoice
            aria-label={t('tasks.f.worker')}
            onChange={setPlacementToken}
          />
          <button
            className="btn sm"
            type="button"
            onClick={run}
            disabled={!runnable || !placementToken}
            title={versionResolution.ok && versionResolution.version.default_input_source === 'file'
              ? t('jobDefinitions.run.fileRequired')
              : undefined}
          >
            ▶ {t('jobDefinitions.run')}
          </button>
          <div className="admission-ctl">
            <span>{t('dash.col.status')}</span>
            <button
              type="button"
              className={`toggle${jobDefinition.status === 'enabled' ? ' on' : ''}`}
              aria-label={t('jobDefinitions.col.enabled')}
              aria-pressed={jobDefinition.status === 'enabled'}
              disabled={jobDefinition.status === 'archived'}
              onClick={toggle}
            />
          </div>
        </div>
      </div>

      <DetailHero
        tag={t('jobDefinitions.detail.tag')}
        title={jobDefinition.code}
        sub={<>{jobDefinition.id} // {jobDefinition.category ?? t('jobDefinitions.category.none')}</>}
        side={
          <>
            <StatusBadge status={jobDefinition.status} />
            <span className={`chip ${versionResolution.ok ? 'neon' : 'red'}`}>
              {versionResolution.ok ? `v${versionResolution.version.version}` : t('jobDefinitions.version.none')}
            </span>
          </>
        }
      />

      <div className="stat-grid detail-stats">
        <div className="stat">
          <div className="stat-val">{versions.length}</div>
          <div className="stat-label">{t('jobDefinitions.stat.versions')}</div>
        </div>
        <div className="stat">
          <div className="stat-val dim">{drafts.length}</div>
          <div className="stat-label">{t('jobDefinitions.stat.drafts')}</div>
        </div>
        <div className="stat">
          <div className="stat-val">{tasks.length}</div>
          <div className="stat-label">{t('jobDefinitions.stat.tasks')}</div>
        </div>
        <div className="stat">
          <div className="stat-val green">{activeRuns.length}</div>
          <div className="stat-label">{t('jobDefinitions.stat.active')}</div>
        </div>
      </div>

      <div className="two-col detail-grid">
        <Panel title={t('jobDefinitions.detail.identity')}>
          <dl className="kv detail-kv">
            <dt>ID</dt><dd className="mono">{jobDefinition.id}</dd>
            <dt>{t('jobDefinitions.col.code')}</dt><dd className="mono">{jobDefinition.code}</dd>
            <dt>{t('dash.col.status')}</dt><dd><StatusBadge status={jobDefinition.status} /></dd>
            <dt>{t('jobDefinitions.f.category')}</dt><dd>{jobDefinition.category ?? '—'}</dd>
            <dt>{t('jobDefinitions.f.tags')}</dt><dd>{jobDefinition.tags.length ? jobDefinition.tags.join(', ') : '—'}</dd>
            <dt>{t('jobDefinitions.col.version')}</dt><dd className="mono">{current ? `v${current.version}` : '—'}</dd>
            <dt>{t('jobDefinitions.f.entrypoint')}</dt><dd className="mono">{jobDefinition.entrypoint}</dd>
            <dt>{t('tasks.f.inputSource')}</dt><dd><span className="chip violet">{jobDefinition.default_input_source}</span></dd>
            <dt>{t('dash.col.created')}</dt><dd className="mono">{timeShort(jobDefinition.created_at)}</dd>
          </dl>
          <p className="dim">{jobDefinition.description || '—'}</p>
        </Panel>

        <Panel glow title={t('jobDefinitions.detail.newversion')}>
          <form onSubmit={addVersion}>
            <div className="form-grid">
              <div className="field">
                <label>{t('jobDefinitions.f.sourceFile')}</label>
                <input value={sourceFile} onChange={(event) => setSourceFile(event.target.value)} placeholder="file_script_package" />
              </div>
              <div className="field">
                <label>{t('jobDefinitions.f.entrypoint')}</label>
                <input value={entrypoint} onChange={(event) => setEntrypoint(event.target.value)} placeholder={jobDefinition.entrypoint} />
              </div>
              <div className="field">
                <label>{t('tasks.f.inputSource')}</label>
                <select value={inputSource} onChange={(event) => setInputSource(event.target.value as Exclude<InputSource, 'task_items'> | 'inherit')}>
                  <option value="inherit">{t('jobDefinitions.f.inherit')}</option>
                  <option value="params">{t('input.params')}</option>
                  <option value="file">{t('input.file')}</option>
                  <option value="none">{t('input.none')}</option>
                </select>
              </div>
              <div className="field">
                <label>{t('jobDefinitions.f.changeNote')}</label>
                <input value={changeNote} onChange={(event) => setChangeNote(event.target.value)} />
              </div>
              <div className="field full">
                <label>{t('jobDefinitions.f.schema')}</label>
                <textarea value={schema} onChange={(event) => setSchema(event.target.value)} />
              </div>
              <div className="field">
                <label>{t('tasks.f.config')}</label>
                <textarea value={config} onChange={(event) => setConfig(event.target.value)} />
              </div>
              <div className="field">
                <label>{t('tasks.f.requirements')}</label>
                <textarea value={requirements} onChange={(event) => setRequirements(event.target.value)} />
              </div>
              <label className="check-field">
                <input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} />
                {' '}{t('jobDefinitions.f.publishInitial')}
              </label>
            </div>
            {err && <div className="form-error">{err}</div>}
            <div className="form-actions">
              <button className="btn sm" type="submit">+ {t('jobDefinitions.detail.newversion')}</button>
            </div>
          </form>
        </Panel>
      </div>

      {current && (
        <Panel title={t('jobDefinitions.detail.defaults')}>
          <dl className="kv detail-kv">
            <dt>{t('jobDefinitions.f.sourceFile')}</dt><dd className="mono">{current.source_file_id ?? '—'}</dd>
            <dt>{t('jobDefinitions.f.entrypoint')}</dt><dd className="mono">{current.entrypoint}</dd>
            <dt>{t('tasks.f.inputSource')}</dt><dd><span className="chip violet">{current.default_input_source}</span></dd>
            <dt>{t('jobDefinitions.f.schema')}</dt><dd className="mono">{JSON.stringify(current.input_params_schema)}</dd>
            <dt>{t('tasks.f.config')}</dt><dd className="mono">{JSON.stringify(current.default_config)}</dd>
            <dt>{t('tasks.f.requirements')}</dt><dd className="mono">{JSON.stringify(current.default_requirements)}</dd>
            <dt>{t('jobDefinitions.version.publishedAt')}</dt><dd className="mono">{current.published_at ? timeShort(current.published_at) : '—'}</dd>
            <dt>{t('jobDefinitions.version.publishedBy')}</dt><dd className="mono">{current.published_by ?? '—'}</dd>
          </dl>
        </Panel>
      )}

      <h2 className="sec-title worker-section-title">{t('jobDefinitions.detail.versions')}</h2>
      <div className="data-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>{t('jobDefinitions.f.version')}</th>
              <th>{t('jobDefinitions.f.sourceFile')}</th>
              <th>{t('jobDefinitions.f.entrypoint')}</th>
              <th>{t('dash.col.status')}</th>
              <th>{t('jobDefinitions.version.current')}</th>
              <th>{t('jobDefinitions.f.changeNote')}</th>
              <th>{t('dash.col.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((candidate) => (
              <tr key={candidate.id} className="no-click">
                <td className="mono strong">v{candidate.version}</td>
                <td className="mono">{candidate.source_file_id ?? '—'}</td>
                <td className="mono">{candidate.entrypoint}</td>
                <td><StatusBadge status={candidate.status} /></td>
                <td>{candidate.is_current ? <span className="chip neon current-version">{t('jobDefinitions.version.current')}</span> : '—'}</td>
                <td>{candidate.change_note ?? '—'}</td>
                <td>
                  {candidate.status === 'draft' ? (
                    <button className="btn sm" type="button" onClick={() => promote(candidate.id, false)}>
                      {t('jobDefinitions.publish')}
                    </button>
                  ) : !candidate.is_current ? (
                    <button className="btn ghost sm" type="button" onClick={() => promote(candidate.id, true)}>
                      ↶ {t('jobDefinitions.rollback')}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="sec-title worker-section-title">{t('jobDefinitions.detail.tasks')}</h2>
      {tasks.length === 0 ? (
        <div className="empty">{t('jobDefinitions.detail.notasks')}</div>
      ) : (
        <div className="data-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{t('tasks.col.name')}</th>
                <th>{t('tasks.f.version')}</th>
                <th>{t('tasks.f.inputSource')}</th>
                <th>{t('dash.col.status')}</th>
                <th>{t('dash.col.created')}</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const pinned = task.bot_version_id
                  ? versions.find((candidate) => candidate.id === task.bot_version_id)
                  : undefined;
                return (
                  <tr key={task.id} onClick={() => navigate(`/tasks/${task.id}`)}>
                    <td className="strong">{task.name}</td>
                    <td className="mono">{pinned ? `v${pinned.version}` : t('tasks.version.current')}</td>
                    <td><span className="chip violet">{task.input_source}</span></td>
                    <td><StatusBadge status={task.status} /></td>
                    <td className="mono">{timeShort(task.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="sec-title worker-section-title">{t('jobDefinitions.detail.schedules')}</h2>
      {schedules.length === 0 ? (
        <div className="empty">{t('jobDefinitions.detail.noschedules')}</div>
      ) : (
        <div className="data-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{t('sch.col.name')}</th>
                <th>{t('sch.col.task')}</th>
                <th>{t('sch.col.cron')}</th>
                <th>{t('sch.col.nextRun')}</th>
                <th>{t('dash.col.status')}</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((schedule) => {
                const boundTask = db.tasks.find((item) => item.id === schedule.task_id);
                return (
                  <tr key={schedule.id} onClick={() => navigate(`/schedules/${schedule.id}`)}>
                    <td className="strong">{schedule.name}</td>
                    <td>{boundTask?.name ?? schedule.task_id}</td>
                    <td className="mono">{schedule.cron}</td>
                    <td className="mono"><ScheduleNextRun schedule={schedule} /></td>
                    <td><StatusBadge status={schedule.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="sec-title worker-section-title">{t('jobDefinitions.detail.taskRuns')}</h2>
      {taskRuns.length === 0 ? (
        <div className="empty">{t('jobDefinitions.detail.noruns')}</div>
      ) : (
        <div className="data-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{t('taskRuns.col.id')}</th>
                <th>{t('tasks.col.name')}</th>
                <th>{t('tasks.col.runtype')}</th>
                <th>{t('dash.col.status')}</th>
                <th>{t('dash.col.progress')}</th>
                <th>{t('dash.col.created')}</th>
              </tr>
            </thead>
            <tbody>
              {taskRuns.slice(0, 12).map((run) => {
                const template = db.tasks.find((item) => item.id === run.task_id);
                return (
                  <tr key={run.id} onClick={() => navigate(`/task-runs/${run.id}`)}>
                    <td className="mono strong">{run.id}</td>
                    <td>{template?.name ?? run.task_id}</td>
                    <td><span className="chip violet">{run.run_type}</span></td>
                    <td><StatusBadge status={run.status} /></td>
                    <td style={{ minWidth: 140 }}><Progress task={run} /></td>
                    <td className="mono">{timeShort(run.created_at)}</td>
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
