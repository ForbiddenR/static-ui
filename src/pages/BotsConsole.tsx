import { useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { PageHeader, Panel } from '../components/ui';
import { StatusBadge, timeShort } from '../components/console';
import { createBot, createBotVersion, publishBotVersion, toggleBot, createTask } from '../store/api';
import type { Bot } from '../store/db';

function CreateBotForm({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [err, setErr] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setErr(t('bots.err.required'));
      return;
    }
    createBot({ code: code.trim(), name: name.trim(), description: desc.trim() });
    onDone();
  };

  return (
    <Panel glow title={t('bots.create')}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>{t('bots.f.code')}</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="INV-SYNC" />
          </div>
          <div className="field">
            <label>{t('bots.f.name')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Invoice Sync Bot" />
          </div>
          <div className="field full">
            <label>{t('bots.f.desc')}</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
        </div>
        {err && <div className="form-error">{err}</div>}
        <div className="form-actions">
          <button className="btn" type="submit">{t('bots.f.submit')}</button>
          <button className="btn ghost" type="button" onClick={onDone}>{t('bots.f.cancel')}</button>
        </div>
      </form>
    </Panel>
  );
}

function BotDrawer({ bot, onClose }: { bot: Bot; onClose: () => void }) {
  const { t } = useI18n();
  const db = useDB();
  const navigate = useNavigate();
  const [version, setVersion] = useState('');
  const [script, setScript] = useState('');
  const [err, setErr] = useState('');

  const versions = db.versions.filter((v) => v.bot_id === bot.id);

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
      <div className="drawer-veil" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <div className="drawer-title">{bot.code} // {bot.name}</div>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>
        <dl className="kv">
          <dt>ID</dt><dd className="mono">{bot.id}</dd>
          <dt>{t('bots.col.enabled')}</dt>
          <dd><span className={`toggle${bot.enabled ? ' on' : ''}`} onClick={() => toggleBot(bot.id)} /></dd>
          <dt>{t('dash.col.created')}</dt><dd className="mono">{timeShort(bot.created_at)}</dd>
        </dl>
        <p className="dim">{bot.description || '—'}</p>

        <div className="form-actions">
          <button className="btn" onClick={run} disabled={!bot.enabled || !bot.current_version_id}>
            ▶ {t('bots.run')}
          </button>
        </div>

        <h3 className="sub-title">{t('bots.detail.versions')}</h3>
        <table className="data">
          <thead>
            <tr>
              <th>{t('bots.f.version')}</th>
              <th>{t('bots.f.script')}</th>
              <th>{t('dash.col.status')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id} className="no-click">
                <td className="mono strong">{v.version}</td>
                <td className="mono">{v.script_file}</td>
                <td><StatusBadge status={v.status} /></td>
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

        <h3 className="sub-title">{t('bots.detail.newversion')}</h3>
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
      </div>
    </>
  );
}

export default function BotsConsole() {
  const { t } = useI18n();
  const db = useDB();
  const { botId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const creating = params.get('new') === '1';

  const selected = db.bots.find((b) => b.id === botId) ?? null;

  return (
    <>
      <PageHeader tag={t('bots.tag')} title={<>{t('bots.title')}<span className="accent">_</span></>} lede="" />

      <div className="toolbar">
        <div className="left">
          <button className="btn" onClick={() => setParams(creating ? {} : { new: '1' })}>
            {creating ? '−' : '+'} {t('bots.create')}
          </button>
        </div>
      </div>

      {creating && <CreateBotForm onDone={() => setParams({})} />}

      {db.bots.length === 0 ? (
        <div className="empty">{t('bots.empty')}</div>
      ) : (
        <table className="data" style={{ marginTop: 18 }}>
          <thead>
            <tr>
              <th>{t('bots.col.code')}</th>
              <th>{t('bots.col.name')}</th>
              <th>{t('bots.col.version')}</th>
              <th>{t('bots.col.enabled')}</th>
              <th>{t('dash.col.created')}</th>
            </tr>
          </thead>
          <tbody>
            {db.bots.map((bot) => {
              const cur = db.versions.find((v) => v.id === bot.current_version_id);
              return (
                <tr key={bot.id} onClick={() => navigate(`/bots/${bot.id}`)}>
                  <td className="mono strong">{bot.code}</td>
                  <td className="strong">{bot.name}</td>
                  <td className="mono">{cur ? cur.version : '—'}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <span className={`toggle${bot.enabled ? ' on' : ''}`} onClick={() => toggleBot(bot.id)} />
                  </td>
                  <td className="mono">{timeShort(bot.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {selected && <BotDrawer bot={selected} onClose={() => navigate('/bots')} />}
    </>
  );
}
