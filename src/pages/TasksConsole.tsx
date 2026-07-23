import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { PageHeader, Panel } from '../components/ui';
import { StatusBadge, Progress, timeShort } from '../components/console';
import { createTask } from '../store/api';

const TERMINAL = new Set(['success', 'partial_success', 'failed', 'canceled', 'timeout']);

function CreateTaskForm({ onDone, onCreated }: { onDone: () => void; onCreated: (id: string) => void }) {
  const { t } = useI18n();
  const db = useDB();
  const runnable = db.bots.filter((b) => b.enabled && b.current_version_id);
  const [botId, setBotId] = useState('');
  const [params, setParams] = useState('{}');
  const [err, setErr] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!botId) {
      setErr(t('tasks.err.bot'));
      return;
    }
    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(params || '{}');
    } catch {
      setErr(t('tasks.err.json'));
      return;
    }
    const task = createTask({ bot_id: botId, input_params: parsed });
    if (task) onCreated(task.id);
    else setErr(t('tasks.err.bot'));
  };

  return (
    <Panel glow title={t('tasks.create')}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field full">
            <label>{t('tasks.f.bot')}</label>
            <select value={botId} onChange={(e) => setBotId(e.target.value)}>
              <option value="">{t('tasks.f.bot.pick')}</option>
              {runnable.map((b) => (
                <option key={b.id} value={b.id}>{b.code} — {b.name}</option>
              ))}
            </select>
          </div>
          <div className="field full">
            <label>{t('tasks.f.params')}</label>
            <textarea value={params} onChange={(e) => setParams(e.target.value)} />
          </div>
        </div>
        {err && <div className="form-error">{err}</div>}
        <div className="form-actions">
          <button className="btn" type="submit">▶ {t('tasks.f.submit')}</button>
          <button className="btn ghost" type="button" onClick={onDone}>{t('tasks.f.cancel')}</button>
        </div>
      </form>
    </Panel>
  );
}

export default function TasksConsole() {
  const { t } = useI18n();
  const db = useDB();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const creating = params.get('new') === '1';
  const [filter, setFilter] = useState<'all' | 'active' | 'terminal'>('all');

  const shown = db.tasks.filter((x) =>
    filter === 'all' ? true : filter === 'active' ? !TERMINAL.has(x.status) : TERMINAL.has(x.status),
  );

  return (
    <>
      <PageHeader tag={t('tasks.tag')} title={<>{t('tasks.title')}<span className="accent">_</span></>} lede="" />

      <div className="toolbar">
        <div className="left">
          <button className="btn" onClick={() => setParams(creating ? {} : { new: '1' })}>
            {creating ? '−' : '+'} {t('tasks.create')}
          </button>
          <div className="seg">
            {(['all', 'active', 'terminal'] as const).map((f) => (
              <button key={f} className={`ctrl-btn${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {creating && (
        <CreateTaskForm
          onDone={() => setParams({})}
          onCreated={(id) => { setParams({}); navigate(`/tasks/${id}`); }}
        />
      )}

      {shown.length === 0 ? (
        <div className="empty" style={{ marginTop: 18 }}>{t('tasks.empty')}</div>
      ) : (
        <table className="data" style={{ marginTop: 18 }}>
          <thead>
            <tr>
              <th>{t('tasks.col.id')}</th>
              <th>{t('dash.col.bot')}</th>
              <th>{t('tasks.col.runtype')}</th>
              <th>{t('dash.col.status')}</th>
              <th>{t('dash.col.progress')}</th>
              <th>{t('dash.col.created')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((task) => (
              <tr key={task.id} onClick={() => navigate(`/tasks/${task.id}`)}>
                <td className="mono strong">{task.id}</td>
                <td>{task.bot_name}</td>
                <td><span className="chip violet">{task.run_type}</span></td>
                <td><StatusBadge status={task.status} /></td>
                <td style={{ minWidth: 130 }}><Progress task={task} /></td>
                <td className="mono">{timeShort(task.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
