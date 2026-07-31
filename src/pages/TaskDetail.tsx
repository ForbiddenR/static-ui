import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { Panel } from '../components/ui';
import { BackLink, DetailHero, Progress, ScheduleNextRun, StatusBadge, timeShort } from '../components/console';
import { PlacementSelect, tokenToPlacement } from '../components/PlacementSelect';
import { runTask, toggleTask } from '../store/api';

const TERMINAL = new Set(['success', 'partial_success', 'failed', 'canceled', 'timeout']);

function json(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2);
}

export default function TaskDetail() {
  const { t } = useI18n();
  const db = useDB();
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [placementToken, setPlacementToken] = useState('');
  const [runErr, setRunErr] = useState('');

  const task = db.tasks.find((item) => item.id === taskId);
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

  const pinnedVersion = task.bot_version_id
    ? db.versions.find((version) => version.id === task.bot_version_id && version.bot_id === task.bot_id)
    : undefined;
  const schedules = db.schedules.filter((schedule) => schedule.task_id === task.id);
  const taskRuns = db.taskRuns.filter((run) => run.task_id === task.id);
  const activeRuns = taskRuns.filter((run) => !TERMINAL.has(run.status));
  const canRun = task.status === 'enabled'
    && db.bots.find((bot) => bot.id === task.bot_id)?.status === 'enabled';

  const run = () => {
    if (!placementToken) {
      setRunErr(t('tasks.err.worker'));
      return;
    }
    setRunErr('');
    const placement = tokenToPlacement(placementToken);
    if (!placement) {
      setRunErr(t('tasks.err.worker'));
      return;
    }
    const taskRun = runTask(task.id, {
      target_pool_id: placement.target_pool_id,
      target_worker_id: placement.target_worker_id,
    });
    if (taskRun) navigate(`/task-runs/${taskRun.id}`);
    else setRunErr(t('tasks.err.run'));
  };

  return (
    <>
      <div className="toolbar detail-toolbar">
        <div className="left">
          <BackLink to="/tasks" label={t('tasks.detail.back')} />
          {runErr && <span className="chip amber">{runErr}</span>}
        </div>
        <div className="left run-target-ctl">
          <label className="run-target-label" htmlFor="task-run-placement">
            {t('tasks.f.worker')}
          </label>
          <PlacementSelect
            id="task-run-placement"
            value={placementToken}
            disabled={!canRun}
            requireChoice
            aria-label={t('tasks.f.worker')}
            onChange={(token) => {
              setPlacementToken(token);
              if (runErr) setRunErr('');
            }}
          />
          <button className="btn sm" type="button" onClick={run} disabled={!canRun || !placementToken}>
            ▶ {t('tasks.run')}
          </button>
          <div className="admission-ctl">
            <span>{t('dash.col.status')}</span>
            <button
              type="button"
              className={`toggle${task.status === 'enabled' ? ' on' : ''}`}
              aria-label={t('dash.col.status')}
              aria-pressed={task.status === 'enabled'}
              disabled={task.status === 'archived'}
              onClick={() => toggleTask(task.id)}
            />
          </div>
        </div>
      </div>

      <DetailHero
        tag={t('tasks.detail.tag')}
        title={task.name}
        sub={<>{task.id} // {task.bot_code || task.bot_id}</>}
        side={
          <>
            <StatusBadge status={task.status} />
            <span className="chip violet">{task.input_source}</span>
            <span className="chip neon mono">P{task.priority}</span>
          </>
        }
      />

      <div className="stat-grid detail-stats">
        <div className="stat">
          <div className="stat-val">{taskRuns.length}</div>
          <div className="stat-label">{t('tasks.stat.runs')}</div>
        </div>
        <div className="stat">
          <div className="stat-val green">{activeRuns.length}</div>
          <div className="stat-label">{t('tasks.stat.active')}</div>
        </div>
        <div className="stat">
          <div className="stat-val">{schedules.length}</div>
          <div className="stat-label">{t('tasks.stat.schedules')}</div>
        </div>
        <div className="stat">
          <div className="stat-val sm mono">{pinnedVersion ? `v${pinnedVersion.version}` : t('tasks.version.current')}</div>
          <div className="stat-label">{t('tasks.f.version')}</div>
        </div>
      </div>

      <div className="two-col detail-grid">
        <Panel title={t('tasks.detail.template')}>
          <dl className="kv detail-kv">
            <dt>ID</dt><dd className="mono">{task.id}</dd>
            <dt>{t('dash.col.jobDefinition')}</dt>
            <dd>
              <button className="btn ghost sm relationship-link" type="button" onClick={() => navigate(`/job-definitions/${task.bot_id}`)}>
                {task.bot_code || task.bot_id}
              </button>
            </dd>
            <dt>{t('tasks.f.version')}</dt>
            <dd className="mono">{pinnedVersion ? `v${pinnedVersion.version}` : t('tasks.version.current')}</dd>
            <dt>{t('tasks.f.inputSource')}</dt><dd><span className="chip violet">{task.input_source}</span></dd>
            <dt>{t('tasks.f.inputFile')}</dt><dd className="mono">{task.input_file_id ?? '—'}</dd>
            <dt>{t('tasks.f.priority')}</dt><dd className="mono">{task.priority}</dd>
            <dt>{t('dash.col.created')}</dt><dd className="mono">{timeShort(task.created_at)}</dd>
          </dl>
          <p className="dim">{task.description || '—'}</p>
        </Panel>
        <Panel title={t('tasks.detail.execution')}>
          <dl className="kv detail-kv">
            <dt>{t('tasks.f.params')}</dt><dd className="mono">{json(task.input_params)}</dd>
            <dt>{t('tasks.f.config')}</dt><dd className="mono">{json(task.config)}</dd>
            <dt>{t('tasks.f.requirements')}</dt><dd className="mono">{json(task.requirements)}</dd>
          </dl>
        </Panel>
      </div>

      <h2 className="sec-title worker-section-title">{t('tasks.detail.schedules')}</h2>
      {schedules.length === 0 ? (
        <div className="empty">{t('tasks.detail.noschedules')}</div>
      ) : (
        <div className="data-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{t('sch.col.name')}</th>
                <th>{t('sch.col.cron')}</th>
                <th>{t('sch.col.nextRun')}</th>
                <th>{t('dash.col.status')}</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((schedule) => (
                <tr key={schedule.id} onClick={() => navigate(`/schedules/${schedule.id}`)}>
                  <td className="strong">{schedule.name}</td>
                  <td className="mono">{schedule.cron}</td>
                  <td className="mono"><ScheduleNextRun schedule={schedule} /></td>
                  <td><StatusBadge status={schedule.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="sec-title worker-section-title">{t('tasks.detail.runs')}</h2>
      {taskRuns.length === 0 ? (
        <div className="empty">{t('tasks.detail.noruns')}</div>
      ) : (
        <div className="data-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{t('taskRuns.col.id')}</th>
                <th>{t('tasks.col.runtype')}</th>
                <th>{t('dash.col.status')}</th>
                <th>{t('dash.col.progress')}</th>
                <th>{t('dash.col.created')}</th>
              </tr>
            </thead>
            <tbody>
              {taskRuns.map((taskRun) => (
                <tr key={taskRun.id} onClick={() => navigate(`/task-runs/${taskRun.id}`)}>
                  <td className="mono strong">{taskRun.id}</td>
                  <td><span className="chip violet">{taskRun.run_type}</span></td>
                  <td><StatusBadge status={taskRun.status} /></td>
                  <td style={{ minWidth: 140 }}><Progress task={taskRun} /></td>
                  <td className="mono">{timeShort(taskRun.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
