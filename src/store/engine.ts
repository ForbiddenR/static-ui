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
  } else if (task.status === 'dispatching') {
    task.status = 'running';
    const w = db.workers.find((x) => x.id === task.worker_id);
    emitHelpers.log(task.id, 'info', 'worker', `TaskAck accepted by ${w?.name ?? 'worker'}; script process started`);
  } else if (task.status === 'running') {
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
