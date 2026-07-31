import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { Panel } from '../components/ui';
import { BackLink, CapacityBar, DetailHero, Progress, StatusBadge, timeShort } from '../components/console';
import { logsForWorker, toggleWorker } from '../store/api';

const TERMINAL = new Set(['success', 'partial_success', 'failed', 'canceled', 'timeout']);

// Single-series sparkline tile. Identity comes from the label text (never from
// hue alone) and the current value is direct-labeled; scrubbing swaps the
// readout to the hovered sample.
function MetricTile({ label, points, times, format }: {
  label: string;
  points: number[];
  times: string[];
  format: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const count = points.length;
  const idx = hover !== null && hover < count ? hover : count - 1;
  const min = count ? Math.min(...points) : 0;
  const max = count ? Math.max(...points) : 0;
  const span = max - min;

  const coords = points.map((v, i) => {
    const x = count > 1 ? (i / (count - 1)) * 100 : 50;
    const y = span === 0 ? 15 : 28 - ((v - min) / span) * 26;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const line = count > 1 ? `M${coords.join(' L')}` : '';

  const scrub = (e: PointerEvent<HTMLDivElement>) => {
    if (count < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    setHover(Math.min(count - 1, Math.max(0, Math.round(frac * (count - 1)))));
  };

  return (
    <div className="stat metric-tile">
      <div className="metric-head">
        <span className="stat-label">{label}</span>
        <span className="metric-cur">{count ? format(points[idx]) : '—'}</span>
      </div>
      <div
        className="metric-spark"
        role="img"
        aria-label={count ? `${label} ${format(points[count - 1])}` : label}
        onPointerMove={scrub}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
          {line && <path className="spark-area" d={`${line} L100,30 L0,30 Z`} />}
          {line && <path className="spark-line" d={line} />}
        </svg>
        {hover !== null && count > 1 && (
          <div className="spark-hair" style={{ left: `${(idx / (count - 1)) * 100}%` }} />
        )}
      </div>
      <div className="metric-sub mono">
        {hover !== null && count ? timeShort(times[idx]) : count ? <>↓{format(min)} ↑{format(max)}</> : '—'}
      </div>
    </div>
  );
}

export default function WorkerDetail() {
  const { t } = useI18n();
  const db = useDB();
  const { workerId } = useParams();
  const navigate = useNavigate();
  const termRef = useRef<HTMLDivElement>(null);

  const worker = db.workers.find((item) => item.id === workerId);
  const workerLogs = worker ? logsForWorker(worker.id) : [];

  useEffect(() => {
    const el = termRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [workerLogs.length]);

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

  const taskRuns = db.taskRuns.filter((run) => run.worker_id === worker.id);
  const activeRuns = taskRuns.filter((run) => !TERMINAL.has(run.status));
  const freeSlots = Math.max(worker.capacity_max - worker.capacity_used, 0);
  const capacityPct = worker.capacity_max === 0
    ? 0
    : Math.round((worker.capacity_used / worker.capacity_max) * 100);
  const currentTaskRunIds = new Set(worker.current_task_run_ids);

  const metrics = db.workerMetrics[worker.id] ?? [];
  const metricTimes = metrics.map((m) => m.ts);

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
          <div className="stat-val">{worker.current_task_run_ids.length}</div>
          <div className="stat-label">{t('wkp.detail.assignedNow')}</div>
        </div>
      </div>

      <h2 className="sec-title worker-section-title">{t('wkp.detail.telemetry')}</h2>
      {worker.status !== 'online' ? (
        <div className="empty">{t('wkp.metric.offline')}</div>
      ) : (
        <div className="stat-grid metric-grid">
          <MetricTile
            label={t('wkp.metric.cpu')}
            points={metrics.map((m) => m.cpu_pct)}
            times={metricTimes}
            format={(v) => `${Math.round(v)}%`}
          />
          <MetricTile
            label={t('wkp.metric.mem')}
            points={metrics.map((m) => m.mem_pct)}
            times={metricTimes}
            format={(v) => `${Math.round(v)}%`}
          />
          <MetricTile
            label={t('wkp.metric.tput')}
            points={metrics.map((m) => m.items_per_min)}
            times={metricTimes}
            format={(v) => `${v.toFixed(1)}/min`}
          />
          <MetricTile
            label={t('wkp.metric.rtt')}
            points={metrics.map((m) => m.rtt_ms)}
            times={metricTimes}
            format={(v) => `${Math.round(v)}ms`}
          />
        </div>
      )}

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
            <dt>{t('wkp.detail.assignedNow')}</dt><dd className="mono">{worker.current_task_run_ids.length}</dd>
          </dl>
        </Panel>
      </div>

      <div className="section-head worker-task-head">
        <h2 className="sec-title worker-section-title">{t('wkp.detail.taskRuns')}</h2>
        <div className="worker-impact">
          <span className="chip neon">{activeRuns.length} {t('wkp.detail.active')}</span>
          <span className="chip violet">{taskRuns.length} {t('wkp.detail.recorded')}</span>
        </div>
      </div>

      {taskRuns.length === 0 ? (
        <div className="empty">{t('wkp.detail.notasks')}</div>
      ) : (
        <div className="data-scroll">
          <table className="data worker-task-table">
            <thead>
              <tr>
                <th>{t('taskRuns.col.id')}</th>
                <th>{t('tasks.col.name')}</th>
                <th>{t('dash.col.jobDefinition')}</th>
                <th>{t('tasks.col.runtype')}</th>
                <th>{t('dash.col.status')}</th>
                <th>{t('dash.col.progress')}</th>
                <th>{t('dash.col.created')}</th>
              </tr>
            </thead>
            <tbody>
              {taskRuns.map((run) => {
                const task = db.tasks.find((item) => item.id === run.task_id);
                return (
                  <tr key={run.id} onClick={() => navigate(`/task-runs/${run.id}`)}>
                    <td className="mono strong">
                      {run.id}
                      {currentTaskRunIds.has(run.id) && (
                        <span className="chip neon worker-current-chip">{t('wkp.detail.current')}</span>
                      )}
                    </td>
                    <td>{task?.name ?? run.task_id}</td>
                    <td>{run.bot_code || run.bot_id}</td>
                    <td><span className="chip violet">{run.run_type}</span></td>
                    <td><StatusBadge status={run.status} /></td>
                    <td className="worker-task-progress"><Progress task={run} /></td>
                    <td className="mono">{timeShort(run.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="sec-title worker-section-title">{t('wkp.detail.logs')}</h2>
      {workerLogs.length === 0 ? (
        <div className="empty">{t('wkp.detail.nologs')}</div>
      ) : (
        <div className="terminal" ref={termRef}>
          {workerLogs.map((l) => (
            <div className="tline" key={l.id}>
              <span className="tseq">{String(l.seq).padStart(3, '0')}</span>
              <span className={`lv ${l.level}`}>{l.level}</span>
              <span className="src">[{l.source}]</span>
              <span className="msg">{l.message}</span>
            </div>
          ))}
          {worker.status === 'online' && (
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
