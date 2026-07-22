import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import { PageHeader, Panel } from '../components/ui';
import { StatusBadge, Progress, timeShort } from '../components/console';
import { cancelTask, createTask, logsForTask, retryTask, rerunTask } from '../store/api';
import type { Task } from '../store/db';

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

function TaskDrawer({ task, onClose }: { task: Task; onClose: () => void }) {
  const { t } = useI18n();
  useDB(); // re-render on ticks
  const navigate = useNavigate();
  const termRef = useRef<HTMLDivElement>(null);
  const logs = logsForTask(task.id);

  useEffect(() => {
    const el = termRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  const active = !TERMINAL.has(task.status);
  const retryable = TERMINAL.has(task.status);

  return (
    <>
      <div className="drawer-veil" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <div className="drawer-title">{task.id}</div>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ margin: '8px 0 14px' }}>
          <StatusBadge status={task.status} />
          <span className="chip violet" style={{ marginLeft: 8 }}>{task.run_type}</span>
          {task.error_code && <span className="chip red" style={{ marginLeft: 8 }}>{task.error_code}</span>}
        </div>

        <Progress task={task} />

        <dl className="kv">
          <dt>{t('dash.col.bot')}</dt><dd>{task.bot_name}</dd>
          <dt>{t('tasks.f.params')}</dt><dd className="mono">{JSON.stringify(task.input_params)}</dd>
          {task.source_task_id && (
            <>
              <dt>{t('tasks.detail.source')}</dt>
              <dd className="mono">{task.source_task_id}</dd>
            </>
          )}
          <dt>{t('dash.col.created')}</dt><dd className="mono">{timeShort(task.created_at)}</dd>
          {task.finished_at && (
            <>
              <dt>{t('tasks.detail.finished')}</dt><dd className="mono">{timeShort(task.finished_at)}</dd>
            </>
          )}
        </dl>

        <div className="form-actions">
          {active && (
            <button className="btn danger sm" onClick={() => cancelTask(task.id)}>■ {t('tasks.cancel')}</button>
          )}
          {retryable && (
            <>
              <button className="btn sm" onClick={() => { const n = retryTask(task.id); if (n) navigate(`/tasks/${n.id}`); }}>
                ↻ {t('tasks.retry')}
              </button>
              <button className="btn ghost sm" onClick={() => { const n = rerunTask(task.id); if (n) navigate(`/tasks/${n.id}`); }}>
                ⏵ {t('tasks.rerun')}
              </button>
            </>
          )}
        </div>

        <h3 className="sub-title">{t('tasks.detail.items')}</h3>
        <table className="data">
          <thead>
            <tr><th>{t('tasks.item.key')}</th><th>{t('tasks.item.status')}</th></tr>
          </thead>
          <tbody>
            {task.items.map((it) => (
              <tr key={it.id} className="no-click">
                <td className="mono">{it.key}</td>
                <td><StatusBadge status={it.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="sub-title">{t('tasks.detail.logs')}</h3>
        <div className="terminal" ref={termRef}>
          {logs.map((l) => (
            <div className="tline" key={l.id}>
              <span className="tseq">{String(l.seq).padStart(3, '0')}</span>
              <span className={`lv ${l.level}`}>{l.level}</span>
              <span className="src">[{l.source}]</span>
              <span className="msg">{l.message}</span>
            </div>
          ))}
          {active && <div className="tline"><span className="tseq">···</span><span className="msg" style={{ color: 'var(--neon)' }}>▌</span></div>}
        </div>
      </div>
    </>
  );
}

export default function TasksConsole() {
  const { t } = useI18n();
  const db = useDB();
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const creating = params.get('new') === '1';
  const [filter, setFilter] = useState<'all' | 'active' | 'terminal'>('all');

  const selected = db.tasks.find((x) => x.id === taskId) ?? null;
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

      {selected && <TaskDrawer task={selected} onClose={() => navigate('/tasks')} />}
    </>
  );
}
