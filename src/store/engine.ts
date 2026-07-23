// Mock execution engine: advances active tasks through the real lifecycle
// pending -> dispatching -> running -> terminal arbitration per the Task spec.

import { db, emitHelpers, now } from './db';

const TERMINAL = new Set(['success', 'partial_success', 'failed', 'canceled', 'timeout']);

export function tickTask(taskId: string): void {
  const task = db.tasks.find((t) => t.id === taskId);
  if (!task || TERMINAL.has(task.status)) return;

  if (task.status === 'pending') {
    // Worker matching: online + enabled + free capacity; stable pick (least loaded)
    const candidate = db.workers
      .filter((w) => w.status === 'online' && w.enabled && w.capacity_used < w.capacity_max)
      .sort((a, b) => a.capacity_used - b.capacity_used)[0];
    if (!candidate) return; // no candidate: stay queued (backoff)
    task.status = 'dispatching';
    task.worker_id = candidate.id;
    candidate.capacity_used += 1; // capacity reservation on dispatch
    candidate.current_task_ids.push(task.id);
    candidate.last_heartbeat_at = now();
    emitHelpers.log(task.id, 'info', 'master', `capacity reserved on ${candidate.name}; AssignTask sent (session=${candidate.session_id})`);
    emitHelpers.workerLog(candidate.id, 'info', 'dispatch', `assignment ${task.id} accepted (bot=${task.bot_name}); slot ${candidate.capacity_used}/${candidate.capacity_max}`);
  } else if (task.status === 'dispatching') {
    task.status = 'running';
    const w = db.workers.find((x) => x.id === task.worker_id);
    emitHelpers.log(task.id, 'info', 'worker', `TaskAck accepted by ${w?.name ?? 'worker'}; script process started`);
  } else if (task.status === 'running') {
    const assignedWorker = db.workers.find((worker) => worker.id === task.worker_id);
    if (assignedWorker) assignedWorker.last_heartbeat_at = now();

    // advance pending/running items
    const active = task.items.filter((i) => i.status === 'pending' || i.status === 'running');
    if (active.length > 0) {
      const batch = active.slice(0, 1 + Math.floor(Math.random() * 2));
      batch.forEach((item) => {
        const roll = Math.random();
        item.status = roll < 0.82 ? 'success' : roll < 0.92 ? 'failed' : 'skipped';
        if (item.status === 'success') task.statistics.success += 1;
        else if (item.status === 'failed') {
          task.statistics.failed += 1;
          emitHelpers.log(task.id, 'error', 'script', `item ${item.key} failed: upstream HTTP 503`);
        } else {
          task.statistics.skipped += 1;
          emitHelpers.log(task.id, 'debug', 'script', `item ${item.key} skipped: nothing to do`);
        }
      });
      const remaining = task.items.filter((i) => i.status === 'pending' || i.status === 'running');
      if (remaining.length > 0) {
        emitHelpers.log(task.id, 'info', 'runtime', `runtime report batch flushed (${task.statistics.success + task.statistics.failed + task.statistics.skipped}/${task.statistics.total} finalized)`);
      }
    }

    const allDone = task.items.every((i) => !['pending', 'running'].includes(i.status));
    if (allDone) {
      // terminal arbitration: error_items vs non_error_completed_items
      const { failed, success, skipped } = task.statistics;
      const errorItems = failed;
      const nonError = success + skipped;
      if (errorItems === 0) task.status = 'success';
      else if (nonError > 0) task.status = 'partial_success';
      else task.status = 'failed';
      task.finished_at = now();
      releaseWorker(task);
      emitHelpers.log(task.id, 'info', 'master', `TaskFinished exit_code=0; terminal state arbitrated: ${task.status}`);
      if (task.worker_id) {
        const done = failed + success + skipped;
        emitHelpers.workerLog(
          task.worker_id,
          task.status === 'success' ? 'info' : 'warning',
          'runtime',
          `${task.id} finished ${task.status} (${done}/${task.statistics.total} items); slot released`,
        );
      }
    }
  }
  emitHelpers.emit();
}

export function releaseWorker(task: { id: string; worker_id: string | null }): void {
  const w = db.workers.find((x) => x.id === task.worker_id);
  if (!w) return;
  w.capacity_used = Math.max(0, w.capacity_used - 1);
  w.current_task_ids = w.current_task_ids.filter((id) => id !== task.id);
  w.last_heartbeat_at = now();
}

// ---- worker telemetry ----
// Random-walk samples pulled toward a load-derived target, so charts track
// real slot usage while still looking like live machine noise.

function drift(prev: number, target: number, pull: number, noise: number, lo: number, hi: number): number {
  const next = prev + (target - prev) * pull + (Math.random() - 0.5) * noise;
  return Math.round(Math.min(hi, Math.max(lo, next)) * 10) / 10;
}

let telemetryPhase = 0;

export function tickWorkers(): void {
  telemetryPhase += 1;
  let sampled = false;

  db.workers.forEach((worker, index) => {
    if (worker.status !== 'online') return;
    sampled = true;
    worker.last_heartbeat_at = now();

    const history = db.workerMetrics[worker.id];
    const prev = history?.[history.length - 1];
    const load = worker.capacity_max > 0 ? worker.capacity_used / worker.capacity_max : 0;

    const cpuTarget = 8 + load * 58;
    const memTarget = 30 + load * 34;
    const tputTarget = load > 0 ? 4 + load * 16 : 0;

    const cpu = drift(prev?.cpu_pct ?? cpuTarget, cpuTarget, 0.3, 9, 2, 97);
    const mem = drift(prev?.mem_pct ?? memTarget, memTarget, 0.08, 3, 12, 93);
    const tput = drift(prev?.items_per_min ?? tputTarget, tputTarget, 0.35, 3, 0, 60);
    const spike = Math.random() < 0.03 ? 90 + Math.random() * 80 : 0;
    const rtt = Math.round(Math.min(280, Math.max(12, 18 + Math.random() * 26 + spike)));

    emitHelpers.workerMetric(worker.id, {
      ts: now(),
      cpu_pct: cpu,
      mem_pct: mem,
      items_per_min: tput,
      rtt_ms: rtt,
    });

    // Staggered periodic heartbeat lines keep the log alive without spamming
    // one entry per worker per tick.
    if ((telemetryPhase + index * 3) % 8 === 0) {
      emitHelpers.workerLog(worker.id, 'debug', 'heartbeat', `heartbeat ok rtt=${rtt}ms cap=${worker.capacity_used}/${worker.capacity_max}`);
    }
    if (rtt > 150) {
      emitHelpers.workerLog(worker.id, 'warning', 'heartbeat', `heartbeat degraded rtt=${rtt}ms; link jitter suspected`);
    }
    if (cpu >= 88 && (prev?.cpu_pct ?? 0) < 88) {
      emitHelpers.workerLog(worker.id, 'warning', 'runtime', `cpu pressure ${cpu}%; throttling script concurrency`);
    }
  });

  if (sampled) emitHelpers.emit();
}
