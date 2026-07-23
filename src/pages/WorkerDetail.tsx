import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { Panel } from '../components/ui';
import { BackLink, CapacityBar, DetailHero, Progress, StatusBadge, timeShort } from '../components/console';
import { toggleWorker } from '../store/api';

const TERMINAL = new Set(['success', 'partial_success', 'failed', 'canceled', 'timeout']);

export default function WorkerDetail() {
  const { t } = useI18n();
  const db = useDB();
  const { workerId } = useParams();
  const navigate = useNavigate();
  const worker = db.workers.find((item) => item.id === workerId);

  if (!worker) {
    return (
      <>
        <div className="toolbar detail-toolbar">
          <div className="left">
            <BackLink to="/workers" label={t('wkp.detail.back')} />
          </div>
        </div>
        <div className="empty">{t('wkp.detail.missing')}</div>
      </>
    );
  }

  const tasks = db.tasks.filter((task) => task.worker_id === worker.id);
  const activeTasks = tasks.filter((task) => !TERMINAL.has(task.status));
  const freeSlots = Math.max(worker.capacity_max - worker.capacity_used, 0);
  const capacityPct = worker.capacity_max === 0
    ? 0
    : Math.round((worker.capacity_used / worker.capacity_max) * 100);
  const currentTaskIds = new Set(worker.current_task_ids);

  return (
    <>
      <div className="toolbar detail-toolbar">
        <div className="left">
          <BackLink to="/workers" label={t('wkp.detail.back')} />
        </div>
        <div className="left">
          <div className="admission-ctl">
            <span>{t('wkp.detail.admission')}</span>
            <button
              type="button"
              className={`toggle${worker.enabled ? ' on' : ''}`}
              aria-label={t('wkp.detail.admission')}
              aria-pressed={worker.enabled}
              onClick={() => toggleWorker(worker.id)}
            />
          </div>
        </div>
      </div>

      <DetailHero
        tag={t('wkp.detail.tag')}
        title={worker.name}
        sub={<>{worker.id} // {worker.version}</>}
        side={
          <>
            <span className={`st ${worker.status === 'online' ? 'running' : 'canceled'}`}>
              {worker.status === 'online' ? t('wkp.online') : t('wkp.offline')}
            </span>
            <span className={`chip ${worker.enabled ? 'green' : 'amber'}`}>
              {worker.enabled ? t('wkp.detail.enabled') : t('wkp.detail.disabled')}
            </span>
          </>
        }
      />

      <h2 className="sec-title worker-section-title">{t('wkp.detail.live')}</h2>
      <div className="stat-grid detail-stats">
        <div className="stat stat-wide">
          <div className="stat-wide-head">
            <div>
              <div className="stat-val">{worker.capacity_used}/{worker.capacity_max}</div>
              <div className="stat-label">{t('wkp.detail.capacityUsed')}</div>
            </div>
            <span className="chip neon">{capacityPct}%</span>
          </div>
          <CapacityBar worker={worker} />
        </div>

        <div className="stat worker-signal-stat">
          <div className="worker-stat-signal">
            <span className={`st ${worker.status === 'online' ? 'running' : 'canceled'}`}>
              {worker.status === 'online' ? t('wkp.online') : t('wkp.offline')}
            </span>
          </div>
          <div className="stat-label">{t('wkp.col.status')}</div>
        </div>

        <div className="stat">
          <div className="stat-val">{freeSlots}</div>
          <div className="stat-label">{t('wkp.detail.available')}</div>
        </div>

        <div className="stat">
          <div className="stat-val">{worker.current_task_ids.length}</div>
          <div className="stat-label">{t('wkp.detail.assignedNow')}</div>
        </div>
      </div>

      <h2 className="sec-title worker-section-title">{t('wkp.detail.record')}</h2>
      <div className="two-col detail-grid">
        <Panel title={t('wkp.detail.identity')}>
          <dl className="kv detail-kv">
            <dt>ID</dt><dd className="mono">{worker.id}</dd>
            <dt>{t('wkp.col.version')}</dt><dd className="mono">{worker.version}</dd>
            <dt>{t('wkp.detail.session')}</dt><dd className="mono">{worker.session_id ?? '—'}</dd>
            <dt>{t('wkp.detail.registered')}</dt><dd className="mono">{timeShort(worker.created_at)}</dd>
          </dl>
        </Panel>

        <Panel title={t('wkp.detail.profile')}>
          <dl className="kv detail-kv">
            <dt>{t('wkp.detail.transport')}</dt><dd><span className="chip neon">{t('wkp.grpc')}</span></dd>
            <dt>{t('wkp.col.tags')}</dt>
            <dd className="worker-tags">
              {worker.tags.map((tag) => <span key={tag} className="chip violet">{tag}</span>)}
            </dd>
            <dt>{t('wkp.detail.admission')}</dt>
            <dd>
              <span className={`chip ${worker.enabled ? 'green' : 'amber'}`}>
                {worker.enabled ? t('wkp.detail.enabled') : t('wkp.detail.disabled')}
              </span>
            </dd>
            <dt>{t('wkp.col.heartbeat')}</dt><dd className="mono">{timeShort(worker.last_heartbeat_at)}</dd>
            <dt>{t('wkp.detail.assignedNow')}</dt><dd className="mono">{worker.current_task_ids.length}</dd>
          </dl>
        </Panel>
      </div>

      <div className="section-head worker-task-head">
        <h2 className="sec-title worker-section-title">{t('wkp.detail.tasks')}</h2>
        <div className="worker-impact">
          <span className="chip neon">{activeTasks.length} {t('wkp.detail.active')}</span>
          <span className="chip violet">{tasks.length} {t('wkp.detail.recorded')}</span>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="empty">{t('wkp.detail.notasks')}</div>
      ) : (
        <div className="data-scroll">
          <table className="data worker-task-table">
            <thead>
              <tr>
                <th>{t('tasks.col.id')}</th>
                <th>{t('dash.col.bot')}</th>
                <th>{t('tasks.col.runtype')}</th>
                <th>{t('dash.col.status')}</th>
                <th>{t('dash.col.progress')}</th>
                <th>{t('dash.col.created')}</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} onClick={() => navigate(`/tasks/${task.id}`)}>
                  <td className="mono strong">
                    {task.id}
                    {currentTaskIds.has(task.id) && (
                      <span className="chip neon worker-current-chip">{t('wkp.detail.current')}</span>
                    )}
                  </td>
                  <td>{task.bot_name}</td>
                  <td><span className="chip violet">{task.run_type}</span></td>
                  <td><StatusBadge status={task.status} /></td>
                  <td className="worker-task-progress"><Progress task={task} /></td>
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
