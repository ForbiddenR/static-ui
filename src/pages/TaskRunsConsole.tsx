import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { PageHeader } from '../components/ui';
import { Progress, StatusBadge, timeShort } from '../components/console';

const TERMINAL = new Set(['success', 'partial_success', 'failed', 'canceled', 'timeout']);

export default function TaskRunsConsole() {
  const { t } = useI18n();
  const db = useDB();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'active' | 'terminal'>('all');

  const runs = db.taskRuns.filter((run) => {
    if (filter === 'active') return !TERMINAL.has(run.status);
    if (filter === 'terminal') return TERMINAL.has(run.status);
    return true;
  });

  return (
    <>
      <PageHeader tag={t('taskRuns.tag')} title={<>{t('taskRuns.title')}<span className="accent">_</span></>} lede="" />
      <div className="toolbar">
        <div className="left">
          <div className="seg">
            {(['all', 'active', 'terminal'] as const).map((key) => (
              <button
                key={key}
                type="button"
                className={`ctrl-btn${filter === key ? ' on' : ''}`}
                onClick={() => setFilter(key)}
              >
                {t(`taskRuns.filter.${key}`)}
              </button>
            ))}
          </div>
          <button className="btn ghost" type="button" onClick={() => navigate('/tasks')}>
            {t('nav.tasks')} →
          </button>
        </div>
      </div>
      {runs.length === 0 ? (
        <div className="empty" style={{ marginTop: 18 }}>{t('taskRuns.empty')}</div>
      ) : (
        <div className="data-scroll" style={{ marginTop: 18 }}>
          <table className="data">
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
              {runs.map((run) => {
                const task = db.tasks.find((item) => item.id === run.task_id);
                return (
                  <tr key={run.id} onClick={() => navigate(`/task-runs/${run.id}`)}>
                    <td className="mono strong">{run.id}</td>
                    <td>{task?.name ?? run.task_id}</td>
                    <td>{run.bot_code || run.bot_id}</td>
                    <td><span className="chip violet">{run.run_type}</span></td>
                    <td><StatusBadge status={run.status} /></td>
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
