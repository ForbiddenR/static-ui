import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { PageHeader } from '../components/ui';
import { StatusBadge, Progress, timeShort } from '../components/console';

const TERMINAL = new Set(['success', 'partial_success', 'failed', 'canceled', 'timeout']);

export default function Dashboard() {
  const { t } = useI18n();
  const db = useDB();
  const navigate = useNavigate();

  const active = db.taskRuns.filter((x) => !TERMINAL.has(x.status)).length;
  const succeeded = db.taskRuns.filter((x) => x.status === 'success' || x.status === 'partial_success').length;
  const failed = db.taskRuns.filter((x) => x.status === 'failed' || x.status === 'timeout').length;
  const schedOn = db.schedules.filter((s) => s.enabled).length;
  const recent = db.taskRuns.slice(0, 6);

  const stats: Array<[string, string, string]> = [
    [String(db.bots.length), t('dash.jobDefinitions'), '/job-definitions'],
    [String(db.tasks.filter((task) => task.status !== 'archived').length), t('dash.tasks'), '/tasks'],
    [String(active), t('dash.active'), '/task-runs'],
    [String(succeeded), t('dash.success'), '/task-runs'],
    [String(failed), t('dash.failed'), '/task-runs'],
    [String(schedOn), t('dash.schedules'), '/schedules'],
    [String(db.workers.filter((w) => w.status === 'online').length), t('dash.workers'), '/workers'],
  ];

  return (
    <>
      <PageHeader tag={t('dash.tag')} title={<>{t('dash.title')}<span className="accent">_</span></>} lede="" />

      <div className="stat-grid">
        {stats.map(([val, label, to]) => (
          <Link className="stat link" to={to} key={label}>
            <div className="stat-val">{val}</div>
            <div className="stat-label">{label}</div>
          </Link>
        ))}
      </div>

      <div className="toolbar" style={{ marginTop: 30 }}>
        <div className="left">
          <button className="btn" onClick={() => navigate('/job-definitions?new=1')}>+ {t('dash.newJobDefinition')}</button>
          <button className="btn ghost" onClick={() => navigate('/tasks?new=1')}>+ {t('dash.newtask')}</button>
          <button className="btn ghost" onClick={() => navigate('/schedules?new=1')}>+ {t('dash.newschedule')}</button>
        </div>
      </div>

      <div className="section-head">
        <h2 className="sec-title" style={{ margin: '18px 0 14px' }}>{t('dash.recent')}</h2>
        <Link className="btn ghost sm" style={{ textDecoration: 'none' }} to="/task-runs">{t('dash.viewall')} →</Link>
      </div>

      {recent.length === 0 ? (
        <div className="empty">{t('taskRuns.empty')}</div>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>{t('dash.col.taskRun')}</th>
              <th>{t('tasks.col.name')}</th>
              <th>{t('dash.col.jobDefinition')}</th>
              <th>{t('dash.col.status')}</th>
              <th>{t('dash.col.progress')}</th>
              <th>{t('dash.col.created')}</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((run) => {
              const task = db.tasks.find((item) => item.id === run.task_id);
              return (
                <tr key={run.id} onClick={() => navigate(`/task-runs/${run.id}`)}>
                  <td className="mono strong">{run.id}</td>
                  <td>{task?.name ?? run.task_id}</td>
                  <td>{run.bot_code || run.bot_id}</td>
                  <td><StatusBadge status={run.status} /></td>
                  <td style={{ minWidth: 140 }}><Progress task={run} /></td>
                  <td className="mono">{timeShort(run.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
