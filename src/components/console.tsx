import type { Task } from '../store/db';

export function StatusBadge({ status }: { status: string }) {
  return <span className={`st ${status}`}>{status.replace('_', ' ')}</span>;
}

export function Progress({ task }: { task: Task }) {
  const done = task.statistics.success + task.statistics.failed + task.statistics.skipped;
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

export function timeShort(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
