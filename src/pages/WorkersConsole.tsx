import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { PageHeader } from '../components/ui';
import { CapacityBar, timeShort } from '../components/console';
import { toggleWorker } from '../store/api';
import { workerAllTags } from '../store/db';

export default function WorkersConsole() {
  const { t } = useI18n();
  const db = useDB();
  const navigate = useNavigate();

  return (
    <>
      <PageHeader tag={t('wkp.tag')} title={<>{t('wkp.title')}<span className="accent">_</span></>} lede="" />

      {db.workers.length === 0 ? (
        <div className="empty">{t('wkp.empty')}</div>
      ) : (
        <div className="data-scroll" style={{ marginTop: 18 }}>
          <table className="data worker-table">
            <thead>
              <tr>
                <th>{t('wkp.col.name')}</th>
                <th>{t('wkp.col.status')}</th>
                <th>{t('wkp.col.capacity')}</th>
                <th>{t('wkp.col.tags')}</th>
                <th>{t('wkp.col.pools')}</th>
                <th>{t('wkp.col.runtimes')}</th>
                <th>{t('wkp.col.version')}</th>
                <th>{t('wkp.col.heartbeat')}</th>
                <th>{t('wkp.col.enabled')}</th>
              </tr>
            </thead>
            <tbody>
              {db.workers.map((worker) => {
                const pools = db.workerPools.filter(
                  (pool) => pool.status !== 'archived' && pool.worker_ids.includes(worker.id),
                );
                return (
                  <tr key={worker.id} onClick={() => navigate(`/workers/${worker.id}`)}>
                    <td className="mono strong">{worker.name}</td>
                    <td>
                      <span className={`st ${worker.status === 'online' ? 'running' : 'canceled'}`}>
                        {worker.status === 'online' ? t('wkp.online') : t('wkp.offline')}
                      </span>
                    </td>
                    <td><CapacityBar worker={worker} /></td>
                    <td className="worker-tags">
                      {worker.system_tags.map((tag) => (
                        <span key={`sys-${tag}`} className="chip neon" title={t('wkp.col.systemTags')}>{tag}</span>
                      ))}
                      {worker.user_tags.map((tag) => (
                        <span key={`usr-${tag}`} className="chip violet" title={t('wkp.col.userTags')}>{tag}</span>
                      ))}
                      {workerAllTags(worker).length === 0 && '—'}
                    </td>
                    <td>
                      {pools.length === 0
                        ? '—'
                        : pools.map((pool) => <span key={pool.id} className="chip neon">{pool.name}</span>)}
                    </td>
                    <td className="worker-tags">
                      {(worker.runtimes ?? []).length === 0
                        ? '—'
                        : worker.runtimes.map((runtime) => (
                          <span key={runtime} className="chip neon" title={t('wkp.col.runtimes')}>{runtime}</span>
                        ))}
                    </td>
                    <td className="mono">{worker.version}</td>
                    <td className="mono">{timeShort(worker.last_heartbeat_at)}</td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <span className={`toggle${worker.enabled ? ' on' : ''}`} onClick={() => toggleWorker(worker.id)} />
                    </td>
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
