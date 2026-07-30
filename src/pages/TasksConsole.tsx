import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { PageHeader, Panel } from '../components/ui';
import { StatusBadge, Progress, timeShort } from '../components/console';
import { createTask, resolvePublishedJobDefinitionVersion } from '../store/api';
import type { InputSource, JsonObject } from '../store/db';

const TERMINAL = new Set(['success', 'partial_success', 'failed', 'canceled', 'timeout']);

function parseObject(value: string): JsonObject {
  const parsed: unknown = JSON.parse(value || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required');
  return parsed as JsonObject;
}

function CreateTaskForm({ onDone, onCreated }: { onDone: () => void; onCreated: (id: string) => void }) {
  const { t } = useI18n();
  const db = useDB();
  const runnable = db.bots.filter((jobDefinition) => {
    if (jobDefinition.status !== 'enabled') return false;
    return db.versions.some((version) =>
      version.bot_id === jobDefinition.id
      && version.status === 'published'
      && resolvePublishedJobDefinitionVersion(jobDefinition.id, version.id).ok,
    );
  });
  const [jobDefinitionId, setJobDefinitionId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [inputSource, setInputSource] = useState<Exclude<InputSource, 'task_items'>>('params');
  const [inputFileId, setInputFileId] = useState('');
  const [inputParams, setInputParams] = useState('{}');
  const [config, setConfig] = useState('{}');
  const [requirements, setRequirements] = useState('{}');
  const [priority, setPriority] = useState(50);
  const [err, setErr] = useState('');

  const selectedDefinition = runnable.find((item) => item.id === jobDefinitionId);
  const publishedVersions = db.versions
    .filter((version) => version.bot_id === jobDefinitionId && version.status === 'published')
    .sort((a, b) => b.version - a.version);
  const currentResolution = selectedDefinition
    ? resolvePublishedJobDefinitionVersion(selectedDefinition.id)
    : null;
  const selectedResolution = selectedDefinition
    ? resolvePublishedJobDefinitionVersion(selectedDefinition.id, versionId || undefined)
    : null;

  useEffect(() => {
    if (!selectedResolution?.ok) return;
    setInputSource(selectedResolution.version.default_input_source === 'task_items'
      ? 'params'
      : selectedResolution.version.default_input_source);
    setInputFileId('');
    setInputParams('{}');
    setConfig('{}');
    setRequirements('{}');
  }, [jobDefinitionId, versionId]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!jobDefinitionId || !selectedResolution?.ok) {
      setErr(t('tasks.err.jobDefinition'));
      return;
    }
    try {
      const task = createTask({
        bot_id: jobDefinitionId,
        bot_version_id: versionId || undefined,
        run_type: 'manual',
        input_source: inputSource,
        input_file_id: inputSource === 'file' ? inputFileId.trim() || null : null,
        input_params: inputSource === 'params' ? parseObject(inputParams) : undefined,
        config: parseObject(config),
        requirements: parseObject(requirements),
        priority,
      });
      if (task) onCreated(task.id);
      else setErr(t('tasks.err.create'));
    } catch {
      setErr(t('console.err.json'));
    }
  };

  return (
    <Panel glow title={t('tasks.create')}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>{t('tasks.f.jobDefinition')}</label>
            <select
              value={jobDefinitionId}
              onChange={(event) => {
                setJobDefinitionId(event.target.value);
                setVersionId('');
              }}
            >
              <option value="">{t('tasks.f.jobDefinition.pick')}</option>
              {runnable.map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}
            </select>
          </div>
          <div className="field">
            <label>{t('tasks.f.version')}</label>
            <select value={versionId} onChange={(event) => setVersionId(event.target.value)} disabled={!selectedDefinition}>
              <option value="" disabled={!currentResolution?.ok}>
                {currentResolution?.ok
                  ? `${t('tasks.version.current')} // v${currentResolution.version.version}`
                  : t('jobDefinitions.version.none')}
              </option>
              {publishedVersions.map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.version}{version.is_current ? ` // ${t('jobDefinitions.version.current')}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t('tasks.f.inputSource')}</label>
            <select value={inputSource} onChange={(event) => setInputSource(event.target.value as Exclude<InputSource, 'task_items'>)}>
              <option value="params">{t('input.params')}</option>
              <option value="file">{t('input.file')}</option>
              <option value="none">{t('input.none')}</option>
            </select>
          </div>
          <div className="field">
            <label>{t('tasks.f.priority')}</label>
            <input type="number" min="0" max="100" value={priority} onChange={(event) => setPriority(Number(event.target.value))} />
          </div>
          {inputSource === 'file' && (
            <div className="field full">
              <label>{t('tasks.f.inputFile')}</label>
              <input value={inputFileId} onChange={(event) => setInputFileId(event.target.value)} placeholder="file_task_input" />
            </div>
          )}
          {inputSource === 'params' && (
            <div className="field full">
              <label>{t('tasks.f.params')}</label>
              <textarea value={inputParams} onChange={(event) => setInputParams(event.target.value)} />
            </div>
          )}
          <div className="field">
            <label>{t('tasks.f.config')}</label>
            <textarea value={config} onChange={(event) => setConfig(event.target.value)} />
          </div>
          <div className="field">
            <label>{t('tasks.f.requirements')}</label>
            <textarea value={requirements} onChange={(event) => setRequirements(event.target.value)} />
          </div>
        </div>
        {err && <div className="form-error">{err}</div>}
        <div className="form-actions">
          <button className="btn" type="submit">▶ {t('tasks.f.submit')}</button>
          <button className="btn ghost" type="button" onClick={onDone}>{t('tasks.f.cancel')}</button>
        </div>
      </form>
    </Panel>
  );
}

export default function TasksConsole() {
  const { t } = useI18n();
  const db = useDB();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const creating = params.get('new') === '1';
  const [filter, setFilter] = useState<'all' | 'active' | 'terminal'>('all');

  const shown = db.tasks.filter((task) =>
    filter === 'all' ? true : filter === 'active' ? !TERMINAL.has(task.status) : TERMINAL.has(task.status),
  );

  return (
    <>
      <PageHeader tag={t('tasks.tag')} title={<>{t('tasks.title')}<span className="accent">_</span></>} lede="" />

      <div className="toolbar">
        <div className="left">
          <button className="btn" onClick={() => setParams(creating ? {} : { new: '1' })}>
            {creating ? '−' : '+'} {t('tasks.create')}
          </button>
          <div className="seg">
            {(['all', 'active', 'terminal'] as const).map((item) => (
              <button key={item} className={`ctrl-btn${filter === item ? ' on' : ''}`} onClick={() => setFilter(item)}>
                {item.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {creating && (
        <CreateTaskForm
          onDone={() => setParams({})}
          onCreated={(id) => { setParams({}); navigate(`/tasks/${id}`); }}
        />
      )}

      {shown.length === 0 ? (
        <div className="empty" style={{ marginTop: 18 }}>{t('tasks.empty')}</div>
      ) : (
        <div className="data-scroll" style={{ marginTop: 18 }}>
          <table className="data">
            <thead>
              <tr>
                <th>{t('tasks.col.id')}</th>
                <th>{t('dash.col.jobDefinition')}</th>
                <th>{t('jobDefinitions.col.version')}</th>
                <th>{t('tasks.col.runtype')}</th>
                <th>{t('dash.col.status')}</th>
                <th>{t('dash.col.progress')}</th>
                <th>{t('dash.col.created')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((task) => (
                <tr key={task.id} onClick={() => navigate(`/tasks/${task.id}`)}>
                  <td className="mono strong">{task.id}</td>
                  <td>{task.bot_snapshot?.bot_code ?? task.bot_code ?? task.bot_id}</td>
                  <td className="mono">v{task.bot_snapshot?.version ?? '—'}</td>
                  <td><span className="chip violet">{task.run_type}</span></td>
                  <td><StatusBadge status={task.status} /></td>
                  <td style={{ minWidth: 130 }}><Progress task={task} /></td>
                  <td className="mono">{timeShort(task.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
