import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { Panel } from '../components/ui';
import { BackLink, DetailHero, Progress, StatusBadge, timeShort } from '../components/console';
import { createBotVersion, createTask, publishBotVersion, toggleBot } from '../store/api';

const TERMINAL = new Set(['success', 'partial_success', 'failed', 'canceled', 'timeout']);

export default function BotDetail() {
  const { t } = useI18n();
  const db = useDB();
  const { botId } = useParams();
  const navigate = useNavigate();
  const [version, setVersion] = useState('');
  const [script, setScript] = useState('');
  const [err, setErr] = useState('');

  const bot = db.bots.find((b) => b.id === botId);

  if (!bot) {
    return (
      <>
        <div className="toolbar detail-toolbar">
          <div className="left">
            <BackLink to="/bots" label={t('bots.detail.back')} />
          </div>
        </div>
        <div className="empty">{t('bots.detail.missing')}</div>
      </>
    );
  }

  const versions = db.versions.filter((v) => v.bot_id === bot.id);
  const drafts = versions.filter((v) => v.status === 'draft');
  const current = db.versions.find((v) => v.id === bot.current_version_id);
  const tasks = db.tasks.filter((task) => task.bot_id === bot.id);
  const activeTasks = tasks.filter((task) => !TERMINAL.has(task.status));

  const addVersion = (e: FormEvent) => {
    e.preventDefault();
    if (!version.trim() || !script.trim()) {
      setErr(t('bots.err.version'));
      return;
    }
    createBotVersion(bot.id, version.trim(), script.trim());
    setVersion('');
    setScript('');
    setErr('');
  };

  const run = () => {
    const task = createTask({ bot_id: bot.id, input_params: {} });
    if (task) navigate(`/tasks/${task.id}`);
  };

  return (
    <>
      <div className="toolbar detail-toolbar">
        <div className="left">
          <BackLink to="/bots" label={t('bots.detail.back')} />
        </div>
        <div className="left">
          <button className="btn sm" onClick={run} disabled={!bot.enabled || !bot.current_version_id}>
            ▶ {t('bots.run')}
          </button>
          <div className="admission-ctl">
            <span>{t('bots.col.enabled')}</span>
            <button
              type="button"
              className={`toggle${bot.enabled ? ' on' : ''}`}
              aria-label={t('bots.col.enabled')}
              aria-pressed={bot.enabled}
              onClick={() => toggleBot(bot.id)}
            />
          </div>
        </div>
      </div>

      <DetailHero
        tag={t('bots.detail.tag')}
        title={bot.code}
        sub={<>{bot.name} // {bot.id}</>}
        side={
          <>
            <span className={`chip ${bot.enabled ? 'green' : 'amber'}`}>
              {bot.enabled ? t('wkp.detail.enabled') : t('wkp.detail.disabled')}
            </span>
            <span className="chip neon">{current ? current.version : '—'}</span>
          </>
        }
      />

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-val">{versions.length}</div>
          <div className="stat-label">{t('bots.stat.versions')}</div>
        </div>
        <div className="stat">
          <div className="stat-val dim">{drafts.length}</div>
          <div className="stat-label">{t('bots.stat.drafts')}</div>
        </div>
        <div className="stat">
          <div className="stat-val">{tasks.length}</div>
          <div className="stat-label">{t('bots.stat.runs')}</div>
        </div>
        <div className="stat">
          <div className="stat-val green">{activeTasks.length}</div>
          <div className="stat-label">{t('bots.stat.active')}</div>
        </div>
      </div>

      <div className="two-col detail-grid">
        <Panel title={t('bots.detail.identity')}>
          <dl className="kv detail-kv">
            <dt>ID</dt><dd className="mono">{bot.id}</dd>
            <dt>{t('bots.col.name')}</dt><dd>{bot.name}</dd>
            <dt>{t('bots.col.version')}</dt><dd className="mono">{current ? current.version : '—'}</dd>
            <dt>{t('dash.col.created')}</dt><dd className="mono">{timeShort(bot.created_at)}</dd>
          </dl>
          <p className="dim">{bot.description || '—'}</p>
        </Panel>

        <Panel glow title={t('bots.detail.newversion')}>
          <form onSubmit={addVersion}>
            <div className="form-grid">
              <div className="field">
                <label>{t('bots.f.version')}</label>
                <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v1.3.0" />
              </div>
              <div className="field">
                <label>{t('bots.f.script')}</label>
                <input value={script} onChange={(e) => setScript(e.target.value)} placeholder="bot_pkg_v13.zip" />
              </div>
            </div>
            {err && <div className="form-error">{err}</div>}
            <div className="form-actions">
              <button className="btn sm" type="submit">+ {t('bots.detail.newversion')}</button>
            </div>
          </form>
        </Panel>
      </div>

      <h2 className="sec-title worker-section-title">{t('bots.detail.versions')}</h2>
      <div className="data-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>{t('bots.f.version')}</th>
              <th>{t('bots.f.script')}</th>
              <th>{t('dash.col.status')}</th>
              <th>{t('dash.col.created')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id} className="no-click">
                <td className="mono strong">{v.version}</td>
                <td className="mono">{v.script_file}</td>
                <td><StatusBadge status={v.status} /></td>
                <td className="mono">{timeShort(v.created_at)}</td>
                <td>
                  {v.status === 'draft' && (
                    <button className="btn sm" onClick={() => publishBotVersion(bot.id, v.id)}>
                      {t('bots.publish')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="sec-title worker-section-title">{t('bots.detail.tasks')}</h2>
      {tasks.length === 0 ? (
        <div className="empty">{t('bots.detail.notasks')}</div>
      ) : (
        <div className="data-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{t('tasks.col.id')}</th>
                <th>{t('tasks.col.runtype')}</th>
                <th>{t('dash.col.status')}</th>
                <th>{t('dash.col.progress')}</th>
                <th>{t('dash.col.created')}</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} onClick={() => navigate(`/tasks/${task.id}`)}>
                  <td className="mono strong">{task.id}</td>
                  <td><span className="chip violet">{task.run_type}</span></td>
                  <td><StatusBadge status={task.status} /></td>
                  <td style={{ minWidth: 140 }}><Progress task={task} /></td>
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
