import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { PageHeader, Panel } from '../components/ui';
import { timeShort } from '../components/console';
import { createBot, toggleBot } from '../store/api';

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

export default function BotsConsole() {
  const { t } = useI18n();
  const db = useDB();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const creating = params.get('new') === '1';

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
    </>
  );
}
