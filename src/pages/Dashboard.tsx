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

  const active = db.tasks.filter((x) => !TERMINAL.has(x.status)).length;
  const succeeded = db.tasks.filter((x) => x.status === 'success' || x.status === 'partial_success').length;
  const failed = db.tasks.filter((x) => x.status === 'failed' || x.status === 'timeout').length;
  const schedOn = db.schedules.filter((s) => s.enabled).length;
  const recent = db.tasks.slice(0, 6);

  const stats: Array<[string, string, string]> = [
    [String(db.bots.length), t('dash.bots'), '/bots'],
    [String(active), t('dash.active'), '/tasks'],
    [String(succeeded), t('dash.success'), '/tasks'],
    [String(failed), t('dash.failed'), '/tasks'],
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
          <button className="btn" onClick={() => navigate('/bots?new=1')}>+ {t('dash.newbot')}</button>
          <button className="btn ghost" onClick={() => navigate('/tasks?new=1')}>+ {t('dash.newtask')}</button>
          <button className="btn ghost" onClick={() => navigate('/schedules?new=1')}>+ {t('dash.newschedule')}</button>
        </div>
      </div>

      <div className="section-head">
        <h2 className="sec-title" style={{ margin: '18px 0 14px' }}>{t('dash.recent')}</h2>
        <Link className="btn ghost sm" style={{ textDecoration: 'none' }} to="/tasks">{t('dash.viewall')} →</Link>
      </div>

      {recent.length === 0 ? (
        <div className="empty">{t('tasks.empty')}</div>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>{t('dash.col.task')}</th>
              <th>{t('dash.col.bot')}</th>
              <th>{t('dash.col.status')}</th>
              <th>{t('dash.col.progress')}</th>
              <th>{t('dash.col.created')}</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((task) => (
              <tr key={task.id} onClick={() => navigate(`/tasks/${task.id}`)}>
                <td className="mono strong">{task.id}</td>
                <td>{task.bot_name}</td>
                <td><StatusBadge status={task.status} /></td>
                <td style={{ minWidth: 140 }}><Progress task={task} /></td>
                <td className="mono">{timeShort(task.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
