import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { Panel } from '../components/ui';
import { BackLink, DetailHero, StatusBadge, timeShort } from '../components/console';
import { cancelTask, logsForTask, retryTask, rerunTask } from '../store/api';

const TERMINAL = new Set(['success', 'partial_success', 'failed', 'canceled', 'timeout']);

export default function TaskDetail() {
  const { t } = useI18n();
  const db = useDB();
  const { taskId } = useParams();
  const navigate = useNavigate();
  const termRef = useRef<HTMLDivElement>(null);

  const task = db.tasks.find((x) => x.id === taskId);
  const logs = task ? logsForTask(task.id) : [];

  useEffect(() => {
    const el = termRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  if (!task) {
    return (
      <>
        <div className="toolbar detail-toolbar">
          <div className="left">
            <BackLink to="/tasks" label={t('tasks.detail.back')} />
          </div>
        </div>
        <div className="empty">{t('tasks.detail.missing')}</div>
      </>
    );
  }

  const active = !TERMINAL.has(task.status);
  const stats = task.statistics;
  const done = stats.success + stats.failed + stats.skipped;
  const pct = stats.total === 0 ? 100 : Math.round((done / stats.total) * 100);
  const worker = task.worker_id ? db.workers.find((w) => w.id === task.worker_id) : undefined;

  return (
    <>
      <div className="toolbar detail-toolbar">
        <div className="left">
          <BackLink to="/tasks" label={t('tasks.detail.back')} />
        </div>
        <div className="left">
          {active ? (
            <button className="btn danger sm" onClick={() => cancelTask(task.id)}>■ {t('tasks.cancel')}</button>
          ) : (
            <>
              <button className="btn sm" onClick={() => { const n = retryTask(task.id); if (n) navigate(`/tasks/${n.id}`); }}>
                ↻ {t('tasks.retry')}
              </button>
              <button className="btn ghost sm" onClick={() => { const n = rerunTask(task.id); if (n) navigate(`/tasks/${n.id}`); }}>
                ⏵ {t('tasks.rerun')}
              </button>
            </>
          )}
        </div>
      </div>

      <DetailHero
        tag={t('tasks.detail.tag')}
        title={task.id}
        sub={<>{task.bot_name} // {timeShort(task.created_at)}</>}
        side={
          <>
            <StatusBadge status={task.status} />
            <span className="chip violet">{task.run_type}</span>
            {task.error_code && <span className="chip red">{task.error_code}</span>}
          </>
        }
      />

      <h2 className="sec-title worker-section-title">{t('tasks.detail.live')}</h2>
      <div className="stat-grid detail-stats">
        <div className="stat stat-wide">
          <div className="stat-wide-head">
            <div>
              <div className="stat-val">{done}/{stats.total}</div>
              <div className="stat-label">{t('dash.col.progress')}</div>
            </div>
            <span className="chip neon">{pct}%</span>
          </div>
          <div className="progress">
            <div className="fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="stat">
          <div className="stat-val green">{stats.success}</div>
          <div className="stat-label">{t('tasks.stat.success')}</div>
        </div>
        <div className="stat">
          <div className="stat-val red">{stats.failed}</div>
          <div className="stat-label">{t('tasks.stat.failed')}</div>
        </div>
        <div className="stat">
          <div className="stat-val dim">{stats.skipped}</div>
          <div className="stat-label">{t('tasks.stat.skipped')}</div>
        </div>
      </div>

      <div className="two-col detail-grid">
        <Panel title={t('tasks.detail.meta')}>
          <dl className="kv detail-kv">
            <dt>{t('dash.col.bot')}</dt>
            <dd>
              <button className="btn ghost sm" onClick={() => navigate(`/bots/${task.bot_id}`)}>
                {task.bot_name}
              </button>
            </dd>
            <dt>{t('tasks.detail.worker')}</dt>
            <dd className="mono">
              {task.worker_id ? (
                <button className="btn ghost sm" onClick={() => navigate(`/workers/${task.worker_id}`)}>
                  {worker?.name ?? task.worker_id}
                </button>
              ) : '—'}
            </dd>
            <dt>{t('tasks.col.runtype')}</dt>
            <dd><span className="chip violet">{task.run_type}</span></dd>
            <dt>{t('tasks.f.params')}</dt>
            <dd className="mono">{JSON.stringify(task.input_params)}</dd>
            {task.source_task_id && (
              <>
                <dt>{t('tasks.detail.source')}</dt>
                <dd className="mono">
                  <button className="btn ghost sm" onClick={() => navigate(`/tasks/${task.source_task_id}`)}>
                    {task.source_task_id}
                  </button>
                </dd>
              </>
            )}
            <dt>{t('dash.col.created')}</dt>
            <dd className="mono">{timeShort(task.created_at)}</dd>
            {task.finished_at && (
              <>
                <dt>{t('tasks.detail.finished')}</dt>
                <dd className="mono">{timeShort(task.finished_at)}</dd>
              </>
            )}
          </dl>
        </Panel>

        <Panel title={t('tasks.detail.items')}>
          <div className="panel-scroll">
            <table className="data">
              <thead>
                <tr><th>{t('tasks.item.key')}</th><th>{t('tasks.item.status')}</th></tr>
              </thead>
              <tbody>
                {task.items.map((it) => (
                  <tr key={it.id} className="no-click">
                    <td className="mono">{it.key}</td>
                    <td><StatusBadge status={it.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <h2 className="sec-title worker-section-title">{t('tasks.detail.logs')}</h2>
      <div className="terminal tall" ref={termRef}>
        {logs.map((l) => (
          <div className="tline" key={l.id}>
            <span className="tseq">{String(l.seq).padStart(3, '0')}</span>
            <span className={`lv ${l.level}`}>{l.level}</span>
            <span className="src">[{l.source}]</span>
            <span className="msg">{l.message}</span>
          </div>
        ))}
        {active && (
          <div className="tline">
            <span className="tseq">···</span>
            <span className="msg" style={{ color: 'var(--neon)' }}>▌</span>
          </div>
        )}
      </div>
    </>
  );
}
