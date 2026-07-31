import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { PageHeader, Panel } from '../components/ui';
import { StatusBadge } from '../components/console';
import { createWorkerPool } from '../store/api';

function CreatePoolForm({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const db = useDB();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [err, setErr] = useState('');

  const toggleMember = (workerId: string) => {
    setMemberIds((prev) => (
      prev.includes(workerId) ? prev.filter((id) => id !== workerId) : [...prev, workerId]
    ));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setErr(t('pools.err.required'));
      return;
    }
    const pool = createWorkerPool({
      name: name.trim(),
      description: description.trim() || null,
      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      worker_ids: memberIds,
      enabled: true,
    });
    if (!pool) {
      setErr(t('pools.err.create'));
      return;
    }
    onDone();
  };

  return (
    <Panel glow title={t('pools.create')}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>{t('pools.f.name')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Edge fleet" />
          </div>
          <div className="field">
            <label>{t('pools.f.description')}</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="field full">
            <label>{t('pools.f.tags')}</label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="edge, gpu" />
          </div>
          <div className="field full">
            <label>{t('pools.f.members')}</label>
            <div className="pool-member-pick">
              {db.workers.map((worker) => (
                <label key={worker.id} className="check-field">
                  <input
                    type="checkbox"
                    checked={memberIds.includes(worker.id)}
                    onChange={() => toggleMember(worker.id)}
                  />
                  {' '}
                  <span className="mono">{worker.name}</span>
                  {' // '}
                  {worker.status}
                  {' // '}
                  {worker.capacity_used}/{worker.capacity_max}
                </label>
              ))}
            </div>
          </div>
        </div>
        {err && <div className="form-error">{err}</div>}
        <div className="form-actions">
          <button className="btn" type="submit">{t('pools.f.submit')}</button>
          <button className="btn ghost" type="button" onClick={onDone}>{t('pools.f.cancel')}</button>
        </div>
      </form>
    </Panel>
  );
}

export default function WorkerPoolsConsole() {
  const { t } = useI18n();
  const db = useDB();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const creating = params.get('new') === '1';

  const pools = db.workerPools.filter((pool) => pool.status !== 'archived');

  return (
    <>
      <PageHeader tag={t('pools.tag')} title={<>{t('pools.title')}<span className="accent">_</span></>} lede="" />
      <div className="toolbar">
        <div className="left">
          <button className="btn" type="button" onClick={() => setParams(creating ? {} : { new: '1' })}>
            {creating ? '−' : '+'} {t('pools.create')}
          </button>
        </div>
      </div>
      {creating && <CreatePoolForm onDone={() => setParams({})} />}
      {pools.length === 0 ? (
        <div className="empty" style={{ marginTop: 18 }}>{t('pools.empty')}</div>
      ) : (
        <div className="data-scroll" style={{ marginTop: 18 }}>
          <table className="data">
            <thead>
              <tr>
                <th>{t('pools.col.name')}</th>
                <th>{t('pools.col.members')}</th>
                <th>{t('pools.col.online')}</th>
                <th>{t('pools.col.capacity')}</th>
                <th>{t('pools.col.tags')}</th>
                <th>{t('pools.col.status')}</th>
              </tr>
            </thead>
            <tbody>
              {pools.map((pool) => {
                const members = pool.worker_ids
                  .map((id) => db.workers.find((w) => w.id === id))
                  .filter(Boolean);
                const online = members.filter((w) => w!.status === 'online' && w!.enabled).length;
                const free = members.reduce((sum, w) => sum + Math.max(0, w!.capacity_max - w!.capacity_used), 0);
                return (
                  <tr key={pool.id} onClick={() => navigate(`/worker-pools/${pool.id}`)}>
                    <td className="strong">{pool.name}</td>
                    <td className="mono">{members.length}</td>
                    <td className="mono">{online}</td>
                    <td className="mono">{free}</td>
                    <td>{pool.tags.map((tag) => <span key={tag} className="chip violet">{tag}</span>)}</td>
                    <td><StatusBadge status={pool.status} /></td>
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
