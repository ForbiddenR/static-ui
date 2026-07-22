import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { PageHeader } from '../components/ui';
import { StatusBadge, timeShort } from '../components/console';
import { toggleWorker } from '../store/api';
import type { Worker } from '../store/db';

function CapacityBar({ worker }: { worker: Worker }) {
  const pct = worker.capacity_max === 0 ? 0 : Math.round((worker.capacity_used / worker.capacity_max) * 100);
  return (
    <div style={{ minWidth: 130 }}>
      <div className="progress">
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-meta">
        <span>{worker.capacity_used}/{worker.capacity_max}</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}

function WorkerDrawer({ worker, onClose }: { worker: Worker; onClose: () => void }) {
  const { t } = useI18n();
  const db = useDB();
  const navigate = useNavigate();
  const tasks = db.tasks.filter((x) => x.worker_id === worker.id);

  return (
    <>
      <div className="drawer-veil" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <div className="drawer-title">{worker.name}</div>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ margin: '8px 0 14px' }}>
          <span className={`st ${worker.status === 'online' ? 'running' : 'canceled'}`}>
            {worker.status === 'online' ? t('wkp.online') : t('wkp.offline')}
          </span>
          <span className="chip neon" style={{ marginLeft: 8 }}>{t('wkp.grpc')}</span>
        </div>

        <dl className="kv">
          <dt>ID</dt><dd className="mono">{worker.id}</dd>
          <dt>{t('wkp.detail.session')}</dt><dd className="mono">{worker.session_id ?? '—'}</dd>
          <dt>{t('wkp.col.version')}</dt><dd className="mono">{worker.version}</dd>
          <dt>{t('wkp.col.tags')}</dt>
          <dd>{worker.tags.map((tag) => <span key={tag} className="chip violet">{tag}</span>)}</dd>
          <dt>{t('wkp.col.capacity')}</dt><dd><CapacityBar worker={worker} /></dd>
          <dt>{t('wkp.col.heartbeat')}</dt><dd className="mono">{timeShort(worker.last_heartbeat_at)}</dd>
          <dt>{t('wkp.col.enabled')}</dt>
          <dd><span className={`toggle${worker.enabled ? ' on' : ''}`} onClick={() => toggleWorker(worker.id)} /></dd>
        </dl>

        <h3 className="sub-title">{t('wkp.detail.tasks')}</h3>
        {tasks.length === 0 ? (
          <div className="empty">{t('wkp.detail.notasks')}</div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>{t('tasks.col.id')}</th>
                <th>{t('dash.col.bot')}</th>
                <th>{t('dash.col.status')}</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} onClick={() => navigate(`/tasks/${task.id}`)}>
                  <td className="mono strong">{task.id}</td>
                  <td>{task.bot_name}</td>
                  <td><StatusBadge status={task.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export default function WorkersConsole() {
  const { t } = useI18n();
  const db = useDB();
  const { workerId } = useParams();
  const navigate = useNavigate();

  const selected = db.workers.find((w) => w.id === workerId) ?? null;

  return (
    <>
      <PageHeader tag={t('wkp.tag')} title={<>{t('wkp.title')}<span className="accent">_</span></>} lede="" />

      {db.workers.length === 0 ? (
        <div className="empty">{t('wkp.empty')}</div>
      ) : (
        <table className="data" style={{ marginTop: 18 }}>
          <thead>
            <tr>
              <th>{t('wkp.col.name')}</th>
              <th>{t('wkp.col.status')}</th>
              <th>{t('wkp.col.capacity')}</th>
              <th>{t('wkp.col.tags')}</th>
              <th>{t('wkp.col.version')}</th>
              <th>{t('wkp.col.heartbeat')}</th>
              <th>{t('wkp.col.enabled')}</th>
            </tr>
          </thead>
          <tbody>
            {db.workers.map((w) => (
              <tr key={w.id} onClick={() => navigate(`/workers/${w.id}`)}>
                <td className="mono strong">{w.name}</td>
                <td>
                  <span className={`st ${w.status === 'online' ? 'running' : 'canceled'}`}>
                    {w.status === 'online' ? t('wkp.online') : t('wkp.offline')}
                  </span>
                </td>
                <td><CapacityBar worker={w} /></td>
                <td>{w.tags.map((tag) => <span key={tag} className="chip violet">{tag}</span>)}</td>
                <td className="mono">{w.version}</td>
                <td className="mono">{timeShort(w.last_heartbeat_at)}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <span className={`toggle${w.enabled ? ' on' : ''}`} onClick={() => toggleWorker(w.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && <WorkerDrawer worker={selected} onClose={() => navigate('/workers')} />}
    </>
  );
}
