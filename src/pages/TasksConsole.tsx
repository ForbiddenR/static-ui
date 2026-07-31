import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { PageHeader, Panel } from '../components/ui';
import { StatusBadge, timeShort } from '../components/console';
import { createTask, resolvePublishedJobDefinitionVersion } from '../store/api';
import type { InputSource, JsonObject } from '../store/db';

function parseObject(value: string): JsonObject {
  const parsed: unknown = JSON.parse(value || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required');
  return parsed as JsonObject;
}

function CreateTaskForm({ onDone, onCreated }: { onDone: () => void; onCreated: (id: string) => void }) {
  const { t } = useI18n();
  const db = useDB();
  const available = db.bots.filter((jobDefinition) => jobDefinition.status !== 'archived');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [jobDefinitionId, setJobDefinitionId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [inputSource, setInputSource] = useState<Exclude<InputSource, 'task_items'>>('params');
  const [inputFileId, setInputFileId] = useState('');
  const [inputParams, setInputParams] = useState('{}');
  const [config, setConfig] = useState('{}');
  const [requirements, setRequirements] = useState('{}');
  const [priority, setPriority] = useState(50);
  const [enabled, setEnabled] = useState(true);
  const [err, setErr] = useState('');

  const selectedDefinition = available.find((item) => item.id === jobDefinitionId);
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
    if (!name.trim() || !jobDefinitionId) {
      setErr(t('tasks.err.required'));
      return;
    }
    try {
      const task = createTask({
        bot_id: jobDefinitionId,
        name: name.trim(),
        description: description.trim() || null,
        bot_version_id: versionId || null,
        input_source: inputSource,
        input_file_id: inputSource === 'file' ? inputFileId.trim() || null : null,
        input_params: inputSource === 'params' ? parseObject(inputParams) : {},
        config: parseObject(config),
        requirements: parseObject(requirements),
        priority,
        enabled,
      });
      if (!task) {
        setErr(t('tasks.err.create'));
        return;
      }
      onCreated(task.id);
      onDone();
    } catch {
      setErr(t('tasks.err.json'));
    }
  };

  return (
    <Panel glow title={t('tasks.create')}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>{t('tasks.f.name')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nightly invoice window" />
          </div>
          <div className="field">
            <label>{t('tasks.f.description')}</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('tasks.f.jobDefinition')}</label>
            <select value={jobDefinitionId} onChange={(e) => { setJobDefinitionId(e.target.value); setVersionId(''); }}>
              <option value="">{t('tasks.f.jobDefinition.pick')}</option>
              {available.map((jobDefinition) => (
                <option key={jobDefinition.id} value={jobDefinition.id}>{jobDefinition.code}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t('tasks.f.version')}</label>
            <select value={versionId} onChange={(e) => setVersionId(e.target.value)} disabled={!jobDefinitionId}>
              <option value="" disabled={!!selectedDefinition && !currentResolution?.ok}>
                {currentResolution?.ok
                  ? `${t('tasks.version.current')} // v${currentResolution.version.version}`
                  : t('tasks.version.current')}
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
            <select value={inputSource} onChange={(e) => setInputSource(e.target.value as Exclude<InputSource, 'task_items'>)}>
              <option value="params">{t('input.params')}</option>
              <option value="file">{t('input.file')}</option>
              <option value="none">{t('input.none')}</option>
            </select>
          </div>
          <div className="field">
            <label>{t('tasks.f.inputFile')}</label>
            <input value={inputFileId} disabled={inputSource !== 'file'} onChange={(e) => setInputFileId(e.target.value)} placeholder="file_task_input" />
          </div>
          <div className="field full">
            <label>{t('tasks.f.params')}</label>
            <textarea value={inputParams} disabled={inputSource !== 'params'} onChange={(e) => setInputParams(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('tasks.f.config')}</label>
            <textarea value={config} onChange={(e) => setConfig(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('tasks.f.requirements')}</label>
            <textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('tasks.f.priority')}</label>
            <input type="number" min={0} max={100} value={priority} onChange={(e) => setPriority(Number(e.target.value) || 0)} />
          </div>
          <div className="field">
            <label>{t('tasks.f.initialStatus')}</label>
            <select value={enabled ? 'enabled' : 'disabled'} onChange={(e) => setEnabled(e.target.value === 'enabled')}>
              <option value="enabled">enabled</option>
              <option value="disabled">disabled</option>
            </select>
          </div>
        </div>
        {err && <div className="form-error">{err}</div>}
        <div className="form-actions">
          <button className="btn" type="submit">{t('tasks.f.submit')}</button>
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
  const tasks = db.tasks.filter((task) => task.status !== 'archived');

  return (
    <>
      <PageHeader tag={t('tasks.tag')} title={<>{t('tasks.title')}<span className="accent">_</span></>} lede="" />
      <div className="toolbar">
        <div className="left">
          <button className="btn" type="button" onClick={() => setParams(creating ? {} : { new: '1' })}>
            {creating ? '−' : '+'} {t('tasks.create')}
          </button>
          <button className="btn ghost" type="button" onClick={() => navigate('/task-runs')}>
            {t('nav.taskRuns')} →
          </button>
        </div>
      </div>
      {creating && (
        <CreateTaskForm
          onDone={() => setParams({})}
          onCreated={(id) => navigate(`/tasks/${id}`)}
        />
      )}
      {tasks.length === 0 ? (
        <div className="empty" style={{ marginTop: 18 }}>{t('tasks.empty')}</div>
      ) : (
        <div className="data-scroll" style={{ marginTop: 18 }}>
          <table className="data">
            <thead>
              <tr>
                <th>{t('tasks.col.name')}</th>
                <th>{t('dash.col.jobDefinition')}</th>
                <th>{t('tasks.f.version')}</th>
                <th>{t('tasks.f.inputSource')}</th>
                <th>{t('dash.col.status')}</th>
                <th>{t('dash.col.created')}</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const pinned = task.bot_version_id
                  ? db.versions.find((version) => version.id === task.bot_version_id)
                  : undefined;
                return (
                  <tr key={task.id} onClick={() => navigate(`/tasks/${task.id}`)}>
                    <td className="strong">{task.name}</td>
                    <td>{task.bot_code || task.bot_id}</td>
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
    </>
  );
}
