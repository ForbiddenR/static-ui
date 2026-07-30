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

  const task = db.tasks.find((item) => item.id === taskId);
  const logs = task ? logsForTask(task.id) : [];

  useEffect(() => {
    const element = termRef.current;
    if (element) element.scrollTop = element.scrollHeight;
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
  const canRetry = ['failed', 'partial_success', 'timeout', 'canceled'].includes(task.status);
  const failedItems = task.items.filter((item) => item.status === 'failed' || item.status === 'timeout');
  const stats = task.statistics;
  const done = stats.completed ?? stats.success + stats.failed + stats.skipped + (stats.timeout ?? 0) + (stats.canceled ?? 0);
  const pct = stats.total === 0 ? 100 : Math.round((done / stats.total) * 100);
  const worker = task.worker_id ? db.workers.find((item) => item.id === task.worker_id) : undefined;
  const snapshot = task.bot_snapshot;
  const schedule = task.schedule_id ? db.schedules.find((item) => item.id === task.schedule_id) : undefined;
  const scheduleRun = task.schedule_run_id ? db.runs.find((item) => item.id === task.schedule_run_id) : undefined;

  const retry = (mode: 'all' | 'failed_items') => {
    const next = retryTask(task.id, mode);
    if (next) navigate(`/tasks/${next.id}`);
  };

  const rerun = () => {
    const next = rerunTask(task.id);
    if (next) navigate(`/tasks/${next.id}`);
  };

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
              {canRetry && (
                <button className="btn sm" onClick={() => retry('all')}>
                  ↻ {t('tasks.retryAll')}
                </button>
              )}
              {canRetry && failedItems.length > 0 && (
                <button className="btn sm" onClick={() => retry('failed_items')}>
                  ↻ {t('tasks.retryFailed')} ({failedItems.length})
                </button>
              )}
              <button className="btn ghost sm" onClick={rerun}>
                ⏵ {t('tasks.rerun')}
              </button>
            </>
          )}
        </div>
      </div>

      <DetailHero
        tag={t('tasks.detail.tag')}
        title={task.id}
        sub={<>{snapshot?.bot_code ?? task.bot_code ?? task.bot_id} // {timeShort(task.created_at)}</>}
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
          <div className="stat-val red">{stats.failed + (stats.timeout ?? 0)}</div>
          <div className="stat-label">{t('tasks.stat.failed')}</div>
        </div>
        <div className="stat">
          <div className="stat-val dim">{stats.skipped}</div>
          <div className="stat-label">{t('tasks.stat.skipped')}</div>
        </div>
      </div>

      <div className="two-col detail-grid">
        <Panel title={t('tasks.detail.provenance')}>
          <dl className="kv detail-kv">
            <dt>{t('dash.col.jobDefinition')}</dt>
            <dd>
              <button className="btn ghost sm relationship-link" type="button" onClick={() => navigate(`/job-definitions/${snapshot?.bot_id ?? task.bot_id}`)}>
                {snapshot?.bot_code ?? task.bot_code ?? task.bot_id}
              </button>
            </dd>
            <dt>{t('jobDefinitions.col.version')}</dt>
            <dd className="mono">{snapshot ? `v${snapshot.version} // ${snapshot.bot_version_id}` : task.bot_version_id ?? '—'}</dd>
            <dt>{t('jobDefinitions.f.sourceFile')}</dt><dd className="mono">{snapshot?.source_file_id ?? '—'}</dd>
            <dt>{t('jobDefinitions.f.entrypoint')}</dt><dd className="mono">{snapshot?.entrypoint ?? task.entrypoint}</dd>
            <dt>{t('jobDefinitions.f.scriptSource')}</dt><dd className="mono">{snapshot?.script_source ?? '—'}</dd>
            <dt>{t('sch.detail.tag')}</dt>
            <dd className="mono">
              {task.schedule_id ? (
                <button className="btn ghost sm relationship-link" type="button" onClick={() => navigate(`/schedules/${task.schedule_id}`)}>
                  {schedule?.name ?? task.schedule_id}
                </button>
              ) : '—'}
            </dd>
            <dt>{t('sch.col.run')}</dt>
            <dd className="mono">
              {task.schedule_run_id ? (
                <button className="btn ghost sm relationship-link" type="button" onClick={() => navigate(`/schedule-runs/${task.schedule_run_id}`)}>
                  {scheduleRun?.id ?? task.schedule_run_id}
                </button>
              ) : '—'}
            </dd>
            <dt>{t('tasks.detail.worker')}</dt>
            <dd className="mono">
              {task.worker_id ? (
                <button className="btn ghost sm relationship-link" onClick={() => navigate(`/workers/${task.worker_id}`)}>
                  {worker?.name ?? task.worker_id}
                </button>
              ) : '—'}
            </dd>
            {task.source_task_id && (
              <>
                <dt>{t('tasks.detail.source')}</dt>
                <dd className="mono">
                  <button className="btn ghost sm relationship-link" onClick={() => navigate(`/tasks/${task.source_task_id}`)}>
                    {task.source_task_id}
                  </button>
                </dd>
              </>
            )}
          </dl>
        </Panel>

        <Panel title={t('tasks.detail.execution')}>
          <dl className="kv detail-kv">
            <dt>{t('tasks.col.runtype')}</dt><dd><span className="chip violet">{task.run_type}</span></dd>
            <dt>{t('tasks.f.inputSource')}</dt><dd><span className="chip neon">{task.input_source}</span></dd>
            <dt>{t('tasks.f.inputFile')}</dt><dd className="mono">{task.input_file_id ?? '—'}</dd>
            <dt>{t('tasks.f.params')}</dt><dd className="mono">{JSON.stringify(task.input_params)}</dd>
            <dt>{t('tasks.f.config')}</dt><dd className="mono">{JSON.stringify(task.config)}</dd>
            <dt>{t('tasks.f.requirements')}</dt><dd className="mono">{JSON.stringify(task.requirements)}</dd>
            <dt>{t('tasks.f.priority')}</dt><dd className="mono">{task.priority}</dd>
            <dt>{t('dash.col.created')}</dt><dd className="mono">{timeShort(task.created_at)}</dd>
            {task.finished_at && (
              <>
                <dt>{t('tasks.detail.finished')}</dt>
                <dd className="mono">{timeShort(task.finished_at)}</dd>
              </>
            )}
          </dl>
        </Panel>
      </div>

      <Panel title={t('tasks.detail.snapshot')}>
        <dl className="kv detail-kv">
          <dt>{t('jobDefinitions.f.schema')}</dt><dd className="mono">{JSON.stringify(snapshot?.input_params_schema ?? {})}</dd>
          <dt>{t('tasks.detail.defaultInput')}</dt><dd className="mono">{snapshot?.default_input_source ?? '—'}</dd>
          <dt>{t('tasks.detail.defaultConfig')}</dt><dd className="mono">{JSON.stringify(snapshot?.default_config ?? {})}</dd>
          <dt>{t('tasks.detail.defaultRequirements')}</dt><dd className="mono">{JSON.stringify(snapshot?.default_requirements ?? {})}</dd>
        </dl>
      </Panel>

      <h2 className="sec-title worker-section-title">{t('tasks.detail.items')}</h2>
      <div className="data-scroll">
        <table className="data">
          <thead>
            <tr><th>{t('tasks.item.key')}</th><th>{t('tasks.item.status')}</th></tr>
          </thead>
          <tbody>
            {task.items.map((item) => (
              <tr key={item.id} className="no-click">
                <td className="mono strong">{item.key}</td>
                <td><StatusBadge status={item.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="sec-title worker-section-title">{t('tasks.detail.logs')}</h2>
      <div className="terminal tall" ref={termRef}>
        {logs.map((log) => (
          <div className="tline" key={log.id}>
            <span className="tseq">{String(log.seq).padStart(3, '0')}</span>
            <span className={`lv ${log.level}`}>{log.level}</span>
            <span className="src">[{log.source}]</span>
            <span className="msg">{log.message}</span>
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
