import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { Panel } from '../components/ui';
import { BackLink, DetailHero, Progress, StatusBadge, timeShort } from '../components/console';
import { setWorkerPoolMembers, toggleWorkerPool, updateWorkerPool } from '../store/api';
import { workerAllTags, workerMatchesPoolTags } from '../store/db';

export default function WorkerPoolDetail() {
  const { t } = useI18n();
  const db = useDB();
  const { poolId } = useParams();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [matchOnly, setMatchOnly] = useState(true);
  const [editingTags, setEditingTags] = useState(false);
  const [tagsDraft, setTagsDraft] = useState('');

  const pool = db.workerPools.find((item) => item.id === poolId);
  if (!pool) {
    return (
      <>
        <div className="toolbar detail-toolbar">
          <div className="left"><BackLink to="/worker-pools" label={t('pools.detail.back')} /></div>
        </div>
        <div className="empty">{t('pools.detail.missing')}</div>
      </>
    );
  }

  const members = pool.worker_ids
    .map((id) => db.workers.find((w) => w.id === id))
    .filter((w): w is NonNullable<typeof w> => Boolean(w));
  const candidates = db.workers.filter((worker) => !pool.worker_ids.includes(worker.id));
  const hasPoolTags = pool.tags.length > 0;
  const matchingCandidates = hasPoolTags
    ? candidates.filter((worker) => workerMatchesPoolTags(worker, pool.tags))
    : candidates;
  const visibleCandidates = adding && hasPoolTags && matchOnly ? matchingCandidates : candidates;
  const online = members.filter((w) => w.status === 'online' && w.enabled);
  const free = members.reduce((sum, w) => sum + Math.max(0, w.capacity_max - w.capacity_used), 0);
  const taskRuns = db.taskRuns.filter((run) => run.target_pool_id === pool.id);
  const canOperate = pool.status !== 'archived';
  const mismatchedMembers = hasPoolTags
    ? members.filter((worker) => !workerMatchesPoolTags(worker, pool.tags))
    : [];

  const removeMember = (workerId: string) => {
    setWorkerPoolMembers(pool.id, pool.worker_ids.filter((id) => id !== workerId));
  };

  const addMember = (workerId: string) => {
    if (pool.worker_ids.includes(workerId)) return;
    setWorkerPoolMembers(pool.id, [...pool.worker_ids, workerId]);
  };

  const beginEditTags = () => {
    setTagsDraft(pool.tags.join(', '));
    setEditingTags(true);
  };

  const saveTags = (event: FormEvent) => {
    event.preventDefault();
    const tags = tagsDraft.split(',').map((tag) => tag.trim()).filter(Boolean);
    if (!updateWorkerPool(pool.id, { tags })) return;
    setEditingTags(false);
  };

  return (
    <>
      <div className="toolbar detail-toolbar">
        <div className="left">
          <BackLink to="/worker-pools" label={t('pools.detail.back')} />
        </div>
        <div className="left">
          <div className="admission-ctl">
            <span>{t('dash.col.status')}</span>
            <button
              type="button"
              className={`toggle${pool.status === 'enabled' ? ' on' : ''}`}
              aria-label={t('dash.col.status')}
              aria-pressed={pool.status === 'enabled'}
              disabled={!canOperate}
              onClick={() => toggleWorkerPool(pool.id)}
            />
          </div>
        </div>
      </div>

      <DetailHero
        tag={t('pools.detail.tag')}
        title={pool.name}
        sub={<>{pool.id} // {members.length} members</>}
        side={
          <>
            <StatusBadge status={pool.status} />
            {pool.tags.map((tag) => <span key={tag} className="chip violet">{tag}</span>)}
          </>
        }
      />

      <div className="stat-grid detail-stats">
        <div className="stat">
          <div className="stat-val">{members.length}</div>
          <div className="stat-label">{t('pools.stat.members')}</div>
        </div>
        <div className="stat">
          <div className="stat-val green">{online.length}</div>
          <div className="stat-label">{t('pools.stat.online')}</div>
        </div>
        <div className="stat">
          <div className="stat-val">{free}</div>
          <div className="stat-label">{t('pools.stat.free')}</div>
        </div>
        <div className="stat">
          <div className="stat-val">{taskRuns.length}</div>
          <div className="stat-label">{t('pools.stat.runs')}</div>
        </div>
      </div>

      <div className="two-col detail-grid">
        <Panel title={t('pools.detail.identity')}>
          <dl className="kv detail-kv">
            <dt>ID</dt><dd className="mono">{pool.id}</dd>
            <dt>{t('pools.f.name')}</dt><dd>{pool.name}</dd>
            <dt>{t('pools.f.description')}</dt><dd>{pool.description ?? '—'}</dd>
            <dt>{t('pools.col.tags')}</dt>
            <dd>
              {editingTags ? (
                <form className="worker-user-tags-edit" onSubmit={saveTags}>
                  <input
                    value={tagsDraft}
                    onChange={(event) => setTagsDraft(event.target.value)}
                    placeholder={t('pools.f.tagsPlaceholder')}
                    aria-label={t('pools.col.tags')}
                    autoFocus
                  />
                  <div className="worker-user-tags-actions">
                    <button className="btn sm" type="submit">{t('pools.detail.tagsSave')}</button>
                    <button className="btn ghost sm" type="button" onClick={() => setEditingTags(false)}>
                      {t('pools.detail.tagsCancel')}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="worker-tags">
                    {pool.tags.length === 0
                      ? <span className="dim">{t('pools.detail.notags')}</span>
                      : pool.tags.map((tag) => <span key={tag} className="chip violet">{tag}</span>)}
                  </div>
                  {canOperate && (
                    <div className="worker-user-tags-actions">
                      <button className="btn ghost sm" type="button" onClick={beginEditTags}>
                        {t('pools.detail.tagsEdit')}
                      </button>
                    </div>
                  )}
                </>
              )}
              <div className="field-hint dim">{t('pools.detail.tagsHint')}</div>
            </dd>
            <dt>{t('dash.col.status')}</dt><dd><StatusBadge status={pool.status} /></dd>
            <dt>{t('dash.col.created')}</dt><dd className="mono">{timeShort(pool.created_at)}</dd>
          </dl>
        </Panel>
        <Panel title={t('pools.detail.placement')}>
          <p className="dim">{t('pools.detail.placementHint')}</p>
          <dl className="kv detail-kv">
            <dt>{t('pools.stat.online')}</dt><dd className="mono">{online.length}/{members.length}</dd>
            <dt>{t('pools.stat.free')}</dt><dd className="mono">{free}</dd>
          </dl>
        </Panel>
      </div>

      <div className="toolbar" style={{ marginTop: 8 }}>
        <div className="left">
          <h2 className="sec-title worker-section-title" style={{ margin: 0 }}>{t('pools.detail.members')}</h2>
        </div>
        {canOperate && candidates.length > 0 && (
          <div className="left">
            <button className="btn sm" type="button" onClick={() => setAdding((value) => !value)}>
              {adding ? '−' : '+'} {t('pools.detail.addMembers')}
            </button>
          </div>
        )}
      </div>

      {mismatchedMembers.length > 0 && (
        <div className="field-hint amber" style={{ marginTop: 8 }}>
          {t('pools.detail.tagMismatch')} ({mismatchedMembers.length})
        </div>
      )}

      {adding && canOperate && candidates.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Panel glow title={t('pools.detail.addMembers')}>
            {hasPoolTags ? (
              <div className="toolbar" style={{ marginBottom: 10 }}>
                <div className="left">
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={matchOnly}
                      onChange={(event) => setMatchOnly(event.target.checked)}
                    />
                    {' '}
                    {t('pools.detail.matchFilter')}
                    {' '}
                    <span className="dim">({matchingCandidates.length}/{candidates.length})</span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="field-hint dim" style={{ marginBottom: 10 }}>{t('pools.detail.noTagFilter')}</div>
            )}
            {visibleCandidates.length === 0 ? (
              <div className="empty">{t('pools.detail.noCandidates')}</div>
            ) : (
              <div className="pool-member-pick">
                {visibleCandidates.map((worker) => {
                  const matches = hasPoolTags && workerMatchesPoolTags(worker, pool.tags);
                  return (
                    <div key={worker.id} className="check-field">
                      <button className="btn sm" type="button" onClick={() => addMember(worker.id)}>
                        {t('pools.detail.add')}
                      </button>
                      {' '}
                      <span className="mono">{worker.name}</span>
                      {' // '}
                      {worker.status}
                      {' // '}
                      {worker.capacity_used}/{worker.capacity_max}
                      {matches && <span className="chip neon" style={{ marginLeft: 8 }}>{t('pools.detail.tagMatch')}</span>}
                      {hasPoolTags && !matches && (
                        <span className="chip amber" style={{ marginLeft: 8 }}>{t('pools.detail.tagNoMatch')}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>
      )}

      {members.length === 0 ? (
        <div className="empty">{t('pools.detail.nomembers')}</div>
      ) : (
        <div className="data-scroll" style={{ marginTop: 12 }}>
          <table className="data">
            <thead>
              <tr>
                <th>{t('wkp.col.name')}</th>
                <th>{t('wkp.col.status')}</th>
                <th>{t('wkp.col.capacity')}</th>
                <th>{t('wkp.col.runtimes')}</th>
                <th>{t('wkp.col.tags')}</th>
                {canOperate && <th>{t('pools.detail.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((worker) => {
                const matches = !hasPoolTags || workerMatchesPoolTags(worker, pool.tags);
                return (
                  <tr key={worker.id}>
                    <td className="mono strong">
                      <button
                        className="btn ghost sm relationship-link"
                        type="button"
                        onClick={() => navigate(`/workers/${worker.id}`)}
                      >
                        {worker.name}
                      </button>
                      {!matches && (
                        <span className="chip amber" style={{ marginLeft: 8 }} title={t('pools.detail.tagNoMatch')}>
                          {t('pools.detail.tagNoMatch')}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`st ${worker.status === 'online' ? 'running' : 'canceled'}`}>
                        {worker.status === 'online' ? t('wkp.online') : t('wkp.offline')}
                      </span>
                    </td>
                    <td className="mono">{worker.capacity_used}/{worker.capacity_max}</td>
                    <td className="worker-tags">
                      {(worker.runtimes ?? []).length === 0
                        ? '—'
                        : worker.runtimes.map((runtime) => (
                          <span key={runtime} className="chip neon" title={t('wkp.col.runtimes')}>{runtime}</span>
                        ))}
                    </td>
                    <td className="worker-tags">
                      {worker.system_tags.map((tag) => (
                        <span key={`sys-${tag}`} className="chip neon" title={t('wkp.col.systemTags')}>{tag}</span>
                      ))}
                      {worker.user_tags.map((tag) => (
                        <span key={`usr-${tag}`} className="chip violet" title={t('wkp.col.userTags')}>{tag}</span>
                      ))}
                      {workerAllTags(worker).length === 0 && '—'}
                    </td>
                    {canOperate && (
                      <td>
                        <button
                          className="btn ghost sm danger"
                          type="button"
                          onClick={() => removeMember(worker.id)}
                        >
                          {t('pools.detail.remove')}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="sec-title worker-section-title">{t('pools.detail.taskRuns')}</h2>
      {taskRuns.length === 0 ? (
        <div className="empty">{t('pools.detail.noruns')}</div>
      ) : (
        <div className="data-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{t('taskRuns.col.id')}</th>
                <th>{t('dash.col.status')}</th>
                <th>{t('wkp.col.name')}</th>
                <th>{t('dash.col.progress')}</th>
                <th>{t('dash.col.created')}</th>
              </tr>
            </thead>
            <tbody>
              {taskRuns.slice(0, 12).map((run) => {
                const worker = run.worker_id ? db.workers.find((w) => w.id === run.worker_id) : undefined;
                return (
                  <tr key={run.id} onClick={() => navigate(`/task-runs/${run.id}`)}>
                    <td className="mono strong">{run.id}</td>
                    <td><StatusBadge status={run.status} /></td>
                    <td className="mono">{worker?.name ?? '—'}</td>
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
