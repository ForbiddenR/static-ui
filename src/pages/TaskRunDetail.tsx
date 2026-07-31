import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { Panel } from '../components/ui';
import { BackLink, DetailHero, StatusBadge, timeShort } from '../components/console';
import { formatPlacementLabel } from '../components/PlacementSelect';
import { cancelTaskRun, logsForTaskRun, retryTaskRun, rerunTaskRun } from '../store/api';

const TERMINAL = new Set(['success', 'partial_success', 'failed', 'canceled', 'timeout']);

export default function TaskRunDetail() {
  const { t } = useI18n();
  const db = useDB();
  const { taskRunId } = useParams();
  const navigate = useNavigate();
  const termRef = useRef<HTMLDivElement>(null);

  const taskRun = db.taskRuns.find((item) => item.id === taskRunId);
  const logs = taskRun ? logsForTaskRun(taskRun.id) : [];

  useEffect(() => {
    const element = termRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [logs.length]);

  if (!taskRun) {
    return (
      <>
        <div className="toolbar detail-toolbar">
          <div className="left">
            <BackLink to="/task-runs" label={t('taskRuns.detail.back')} />
          </div>
        </div>
        <div className="empty">{t('taskRuns.detail.missing')}</div>
      </>
    );
  }

  const active = !TERMINAL.has(taskRun.status);
  const canRetry = ['failed', 'partial_success', 'timeout', 'canceled'].includes(taskRun.status);
  const failedItems = taskRun.items.filter((item) => item.status === 'failed' || item.status === 'timeout');
  const stats = taskRun.statistics;
  const done = stats.completed ?? stats.success + stats.failed + stats.skipped + (stats.timeout ?? 0) + (stats.canceled ?? 0);
  const pct = stats.total === 0 ? 100 : Math.round((done / stats.total) * 100);
  const worker = taskRun.worker_id ? db.workers.find((item) => item.id === taskRun.worker_id) : undefined;
  const targetWorker = taskRun.target_worker_id
    ? db.workers.find((item) => item.id === taskRun.target_worker_id)
    : undefined;
  const targetPool = taskRun.target_pool_id
    ? db.workerPools.find((item) => item.id === taskRun.target_pool_id)
    : undefined;
  const placementLabel = formatPlacementLabel(taskRun, {
    workers: db.workers,
    pools: db.workerPools,
    autoLabel: t('place.auto'),
  });
  const snapshot = taskRun.bot_snapshot;
  const task = db.tasks.find((item) => item.id === taskRun.task_id);
  const schedule = taskRun.schedule_id ? db.schedules.find((item) => item.id === taskRun.schedule_id) : undefined;
  const scheduleRun = taskRun.schedule_run_id ? db.runs.find((item) => item.id === taskRun.schedule_run_id) : undefined;

  const retry = (mode: 'all' | 'failed_items') => {
    const next = retryTaskRun(taskRun.id, mode);
    if (next) navigate(`/task-runs/${next.id}`);
  };

  const rerun = () => {
    const next = rerunTaskRun(taskRun.id);
    if (next) navigate(`/task-runs/${next.id}`);
  };

  return (
    <>
      <div className="toolbar detail-toolbar">
        <div className="left">
          <BackLink to="/task-runs" label={t('taskRuns.detail.back')} />
        </div>
        <div className="left">
          {active ? (
            <button className="btn danger sm" onClick={() => cancelTaskRun(taskRun.id)}>■ {t('tasks.cancel')}</button>
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
        tag={t('taskRuns.detail.tag')}
        title={taskRun.id}
        sub={<>{task?.name ?? taskRun.task_id} // {snapshot?.bot_code ?? taskRun.bot_code ?? taskRun.bot_id} // {timeShort(taskRun.created_at)}</>}
        side={
          <>
            <StatusBadge status={taskRun.status} />
            <span className="chip violet">{taskRun.run_type}</span>
            {taskRun.error_code && <span className="chip red">{taskRun.error_code}</span>}
          </>
        }
      />

      <h2 className="sec-title worker-section-title">{t('taskRuns.detail.live')}</h2>
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
        <Panel title={t('tasks.detail.provenance')}>
          <dl className="kv detail-kv">
            <dt>{t('tasks.col.name')}</dt>
            <dd>
              <button className="btn ghost sm relationship-link" type="button" onClick={() => navigate(`/tasks/${taskRun.task_id}`)}>
                {task?.name ?? taskRun.task_id}
              </button>
            </dd>
            <dt>{t('dash.col.jobDefinition')}</dt>
            <dd>
              <button className="btn ghost sm relationship-link" type="button" onClick={() => navigate(`/job-definitions/${taskRun.bot_id}`)}>
                {snapshot?.bot_code ?? taskRun.bot_code ?? taskRun.bot_id}
              </button>
            </dd>
            <dt>{t('tasks.f.version')}</dt>
            <dd className="mono">{snapshot ? `v${snapshot.version}` : (taskRun.bot_version_id ?? '—')}</dd>
            {schedule && (
              <>
                <dt>{t('nav.schedules')}</dt>
                <dd>
                  <button className="btn ghost sm relationship-link" type="button" onClick={() => navigate(`/schedules/${schedule.id}`)}>
                    {schedule.name}
                  </button>
                </dd>
              </>
            )}
            {scheduleRun && (
              <>
                <dt>{t('sch.col.run')}</dt>
                <dd>
                  <button className="btn ghost sm relationship-link" type="button" onClick={() => navigate(`/schedule-runs/${scheduleRun.id}`)}>
                    {scheduleRun.id}
                  </button>
                </dd>
              </>
            )}
            {taskRun.source_task_run_id && (
              <>
                <dt>{t('taskRuns.detail.source')}</dt>
                <dd>
                  <button className="btn ghost sm relationship-link" type="button" onClick={() => navigate(`/task-runs/${taskRun.source_task_run_id}`)}>
                    {taskRun.source_task_run_id}
                  </button>
                </dd>
              </>
            )}
            <dt>{t('place.label')}</dt>
            <dd>
              {targetWorker ? (
                <button className="btn ghost sm relationship-link" type="button" onClick={() => navigate(`/workers/${targetWorker.id}`)}>
                  {targetWorker.name}
                </button>
              ) : targetPool ? (
                <button className="btn ghost sm relationship-link" type="button" onClick={() => navigate(`/worker-pools/${targetPool.id}`)}>
                  {targetPool.name}
                </button>
              ) : (
                <span className="chip violet">{placementLabel}</span>
              )}
            </dd>
            <dt>{t('tasks.detail.worker')}</dt>
            <dd>
              {worker ? (
                <button className="btn ghost sm relationship-link" type="button" onClick={() => navigate(`/workers/${worker.id}`)}>
                  {worker.name}
                </button>
              ) : (taskRun.worker_id ?? '—')}
            </dd>
            <dt>{t('tasks.detail.finished')}</dt>
            <dd className="mono">{taskRun.finished_at ? timeShort(taskRun.finished_at) : '—'}</dd>
          </dl>
        </Panel>
        <Panel title={t('tasks.detail.execution')}>
          <dl className="kv detail-kv">
            <dt>{t('tasks.col.runtype')}</dt><dd><span className="chip violet">{taskRun.run_type}</span></dd>
            <dt>{t('tasks.f.inputSource')}</dt><dd><span className="chip violet">{taskRun.input_source}</span></dd>
            <dt>{t('tasks.f.inputFile')}</dt><dd className="mono">{taskRun.input_file_id ?? '—'}</dd>
            <dt>{t('tasks.f.params')}</dt><dd className="mono">{JSON.stringify(taskRun.input_params)}</dd>
            <dt>{t('tasks.f.config')}</dt><dd className="mono">{JSON.stringify(taskRun.config)}</dd>
            <dt>{t('tasks.f.requirements')}</dt><dd className="mono">{JSON.stringify(taskRun.requirements)}</dd>
            <dt>{t('tasks.f.priority')}</dt><dd className="mono">{taskRun.priority}</dd>
            <dt>{t('dash.col.created')}</dt><dd className="mono">{timeShort(taskRun.created_at)}</dd>
          </dl>
        </Panel>
        {snapshot && (
          <Panel title={t('tasks.detail.snapshot')}>
            <dl className="kv detail-kv">
              <dt>{t('jobDefinitions.f.entrypoint')}</dt><dd className="mono">{snapshot.entrypoint}</dd>
              <dt>{t('jobDefinitions.f.sourceFile')}</dt><dd className="mono">{snapshot.source_file_id ?? snapshot.script_file}</dd>
              <dt>{t('tasks.detail.defaultInput')}</dt><dd><span className="chip violet">{snapshot.default_input_source}</span></dd>
              <dt>{t('tasks.detail.defaultConfig')}</dt><dd className="mono">{JSON.stringify(snapshot.default_config)}</dd>
              <dt>{t('tasks.detail.defaultRequirements')}</dt><dd className="mono">{JSON.stringify(snapshot.default_requirements)}</dd>
            </dl>
          </Panel>
        )}
      </div>

      <h2 className="sec-title worker-section-title">{t('tasks.detail.items')}</h2>
      <div className="data-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>{t('tasks.item.key')}</th>
              <th>{t('tasks.item.status')}</th>
            </tr>
          </thead>
          <tbody>
            {taskRun.items.map((item) => (
              <tr key={item.id} className="no-click">
                <td className="mono strong">{item.key}</td>
                <td><StatusBadge status={item.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="sec-title worker-section-title">{t('tasks.detail.logs')}</h2>
      {logs.length === 0 ? (
        <div className="empty">{t('taskRuns.detail.nologs')}</div>
      ) : (
        <div className="terminal" ref={termRef}>
          {logs.map((entry) => (
            <div className="tline" key={entry.id}>
              <span className="tseq">{String(entry.seq).padStart(3, '0')}</span>
              <span className={`lv ${entry.level}`}>{entry.level}</span>
              <span className="src">[{entry.source}]</span>
              <span className="msg">{entry.message}</span>
            </div>
          ))}
          {active && (
            <div className="tline">
              <span className="tseq">···</span>
              <span className="msg" style={{ color: 'var(--neon)' }}>▌</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
