import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { formatScheduleNextRun } from '../store/scheduleTime';
import type { Schedule, Task, Worker } from '../store/db';

export function StatusBadge({ status }: { status: string }) {
  return <span className={`st ${status}`}>{status.replace('_', ' ')}</span>;
}

export function Progress({ task }: { task: Task }) {
  const done = task.statistics.completed
    ?? task.statistics.success
      + task.statistics.failed
      + task.statistics.skipped
      + (task.statistics.timeout ?? 0)
      + (task.statistics.canceled ?? 0);
  const pct = task.statistics.total === 0 ? 100 : Math.round((done / task.statistics.total) * 100);
  return (
    <div>
      <div className="progress">
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-meta">
        <span>{done}/{task.statistics.total}</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}

export function CapacityBar({ worker }: { worker: Worker }) {
  const pct = worker.capacity_max === 0 ? 0 : Math.round((worker.capacity_used / worker.capacity_max) * 100);
  return (
    <div style={{ minWidth: 130 }}>
      <div className="progress">
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-meta">
        <span>{worker.capacity_used}/{worker.capacity_max}</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}

export function timeShort(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Terminal-style back navigation for full-page detail records. The visible
// `cd ../<segment>` is a deliberate machine value; the label localizes it for
// assistive tech and the hover tooltip.
export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link className="back-link" to={to} aria-label={label} title={label}>
      <span className="bl-arrow">←</span> cd ..{to}
    </Link>
  );
}

// HUD-framed header for full-page detail records: corner brackets, mono title
// with the trailing accent underscore, and a right-hand status cluster.
export function DetailHero({ tag, title, sub, side }: {
  tag: string;
  title: ReactNode;
  sub?: ReactNode;
  side?: ReactNode;
}) {
  return (
    <section className="detail-hero">
      <div className="dh-head">
        <div className="dh-main">
          <div className="dh-tag">{tag}</div>
          <h1 className="dh-title">{title}<span className="accent">_</span></h1>
          {sub && <div className="dh-sub">{sub}</div>}
        </div>
        {side && <div className="dh-side">{side}</div>}
      </div>
    </section>
  );
}

export function ScheduleNextRun({ schedule }: { schedule: Schedule }) {
  const { t } = useI18n();

  if (!schedule.enabled) {
    return <span className="chip amber">{t('sch.next.disabled')}</span>;
  }

  const formatted = schedule.next_run_at
    ? formatScheduleNextRun(schedule.next_run_at, schedule.timezone)
    : null;

  return formatted
    ? <span className="mono">{formatted}</span>
    : <span className="chip">{t('sch.next.unavailable')}</span>;
}
