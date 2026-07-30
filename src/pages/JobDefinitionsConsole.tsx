import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { PageHeader, Panel } from '../components/ui';
import { StatusBadge, timeShort } from '../components/console';
import { createJobDefinition } from '../store/api';

const json = (value: string) => JSON.parse(value || '{}') as Record<string, unknown>;

function CreateJobDefinitionForm({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [code, setCode] = useState(''); const [description, setDescription] = useState('');
  const [category, setCategory] = useState(''); const [tags, setTags] = useState('');
  const [sourceFile, setSourceFile] = useState(''); const [entrypoint, setEntrypoint] = useState('main.py');
  const [inputSource, setInputSource] = useState<'params' | 'file' | 'none'>('params');
  const [schema, setSchema] = useState('{}'); const [config, setConfig] = useState('{}'); const [requirements, setRequirements] = useState('{}');
  const [publish, setPublish] = useState(true); const [err, setErr] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      const created = createJobDefinition({ code, description: description.trim(), category: category.trim() || null, tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean), source_file_id: sourceFile.trim() || null, entrypoint: entrypoint.trim() || 'main.py', default_input_source: inputSource, input_params_schema: json(schema), default_config: json(config), default_requirements: json(requirements), publish });
      if (!created) return setErr(t('jobDefinitions.err.code'));
      onDone();
    } catch { setErr(t('console.err.json')); }
  };
  return <Panel glow title={t('jobDefinitions.create')}><form onSubmit={submit}><div className="form-grid">
    <div className="field"><label>{t('jobDefinitions.f.code')}</label><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="INV-SYNC" /></div>
    <div className="field"><label>{t('jobDefinitions.f.category')}</label><input value={category} onChange={(e) => setCategory(e.target.value)} /></div>
    <div className="field full"><label>{t('jobDefinitions.f.desc')}</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
    <div className="field"><label>{t('jobDefinitions.f.tags')}</label><input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="finance, nightly" /></div>
    <div className="field"><label>{t('jobDefinitions.f.sourceFile')}</label><input value={sourceFile} onChange={(e) => setSourceFile(e.target.value)} placeholder="file_package.zip" /></div>
    <div className="field"><label>{t('jobDefinitions.f.entrypoint')}</label><input value={entrypoint} onChange={(e) => setEntrypoint(e.target.value)} /></div>
    <div className="field"><label>{t('tasks.f.inputSource')}</label><select value={inputSource} onChange={(e) => setInputSource(e.target.value as typeof inputSource)}><option value="params">{t('input.params')}</option><option value="file">{t('input.file')}</option><option value="none">{t('input.none')}</option></select></div>
    <div className="field"><label>{t('jobDefinitions.f.schema')}</label><textarea value={schema} onChange={(e) => setSchema(e.target.value)} /></div>
    <div className="field"><label>{t('tasks.f.config')}</label><textarea value={config} onChange={(e) => setConfig(e.target.value)} /></div>
    <div className="field"><label>{t('tasks.f.requirements')}</label><textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} /></div>
    <label className="check-field"><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> {t('jobDefinitions.f.publishInitial')}</label>
  </div>{err && <div className="form-error">{err}</div>}<div className="form-actions"><button className="btn" type="submit">{t('jobDefinitions.f.submit')}</button><button className="btn ghost" type="button" onClick={onDone}>{t('jobDefinitions.f.cancel')}</button></div></form></Panel>;
}

export default function JobDefinitionsConsole() {
  const { t } = useI18n(); const db = useDB(); const navigate = useNavigate(); const [params, setParams] = useSearchParams();
  const creating = params.get('new') === '1';
  return <><PageHeader tag={t('jobDefinitions.tag')} title={<>{t('jobDefinitions.title')}<span className="accent">_</span></>} lede={t('jobDefinitions.lede')} />
    <div className="toolbar"><button className="btn" onClick={() => setParams(creating ? {} : { new: '1' })}>{creating ? '−' : '+'} {t('jobDefinitions.create')}</button></div>
    {creating && <CreateJobDefinitionForm onDone={() => setParams({})} />}
    {db.bots.length === 0 ? <div className="empty">{t('jobDefinitions.empty')}</div> : <div className="data-scroll"><table className="data"><thead><tr><th>{t('jobDefinitions.col.code')}</th><th>{t('jobDefinitions.col.version')}</th><th>{t('dash.col.status')}</th><th>{t('jobDefinitions.f.entrypoint')}</th><th>{t('dash.col.created')}</th></tr></thead><tbody>{db.bots.map((item) => { const current = db.versions.find((version) => version.id === item.current_version_id); return <tr key={item.id} onClick={() => navigate(`/job-definitions/${item.id}`)}><td className="mono strong">{item.code}</td><td className="mono">{current?.version ?? '—'}</td><td><StatusBadge status={item.status} /></td><td className="mono">{item.entrypoint}</td><td className="mono">{timeShort(item.created_at)}</td></tr>; })}</tbody></table></div>}
  </>;
}
