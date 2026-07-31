// Mock execution engine: advances active TaskRuns through the real lifecycle
// pending -> dispatching -> running -> terminal arbitration.

import { db, emitHelpers, now, type TaskItemStatus, type TaskRun } from './db';

const TERMINAL = new Set(['success', 'partial_success', 'failed', 'canceled', 'timeout']);

export function tickTaskRun(taskRunId: string): void {
  const taskRun = db.taskRuns.find((item) => item.id === taskRunId);
  if (!taskRun || TERMINAL.has(taskRun.status)) return;

  if (taskRun.status === 'pending') {
    // Worker pin > pool membership > all eligible online nodes.
    const online = db.workers.filter((w) => w.status === 'online' && w.enabled && w.capacity_used < w.capacity_max);
    let eligible = online;
    let placeNote = ' (auto dispatch)';
    if (taskRun.target_worker_id) {
      eligible = online.filter((w) => w.id === taskRun.target_worker_id);
      placeNote = ' (target worker appointed)';
    } else if (taskRun.target_pool_id) {
      const pool = db.workerPools.find((item) => item.id === taskRun.target_pool_id);
      const memberIds = new Set(pool?.worker_ids ?? []);
      eligible = online.filter((w) => memberIds.has(w.id));
      placeNote = ` (target pool ${pool?.name ?? taskRun.target_pool_id})`;
    }
    const candidate = eligible.length > 0
      ? eligible[Math.floor(Math.random() * eligible.length)]
      : undefined;
    if (!candidate) return;
    taskRun.status = 'dispatching';
    taskRun.worker_id = candidate.id;
    candidate.capacity_used += 1;
    candidate.current_task_run_ids.push(taskRun.id);
    candidate.last_heartbeat_at = now();
    emitHelpers.log(taskRun.id, 'info', 'master', `capacity reserved on ${candidate.name}${placeNote}; AssignTask sent (session=${candidate.session_id})`);
    emitHelpers.workerLog(
      candidate.id,
      'info',
      'dispatch',
      `assignment ${taskRun.id} accepted (job_definition=${taskRun.bot_code || taskRun.bot_id}); slot ${candidate.capacity_used}/${candidate.capacity_max}`,
    );
  } else if (taskRun.status === 'dispatching') {
    taskRun.status = 'running';
    const w = db.workers.find((x) => x.id === taskRun.worker_id);
    emitHelpers.log(taskRun.id, 'info', 'worker', `TaskAck accepted by ${w?.name ?? 'worker'}; script process started`);
  } else if (taskRun.status === 'running') {
    const assignedWorker = db.workers.find((worker) => worker.id === taskRun.worker_id);
    if (assignedWorker) assignedWorker.last_heartbeat_at = now();

    const active = taskRun.items.filter((i) => i.status === 'pending' || i.status === 'running');
    if (active.length > 0) {
      const batch = active.slice(0, 1 + Math.floor(Math.random() * 2));
      batch.forEach((item) => {
        const roll = Math.random();
        item.status = roll < 0.82 ? 'success' : roll < 0.92 ? 'failed' : 'skipped';
        if (item.status === 'success') taskRun.statistics.success += 1;
        else if (item.status === 'failed') {
          taskRun.statistics.failed += 1;
          emitHelpers.log(taskRun.id, 'error', 'script', `item ${item.key} failed: upstream HTTP 503`);
        } else {
          taskRun.statistics.skipped += 1;
          emitHelpers.log(taskRun.id, 'debug', 'script', `item ${item.key} skipped: nothing to do`);
        }
      });
      const remaining = taskRun.items.filter((i) => i.status === 'pending' || i.status === 'running');
      if (remaining.length > 0) {
        emitHelpers.log(
          taskRun.id,
          'info',
          'runtime',
          `runtime report batch flushed (${taskRun.statistics.success + taskRun.statistics.failed + taskRun.statistics.skipped}/${taskRun.statistics.total} finalized)`,
        );
      }
    }

    const allDone = taskRun.items.every((i) => !['pending', 'running'].includes(i.status));
    if (allDone) {
      const count = (status: TaskItemStatus) => taskRun.items.filter((item) => item.status === status).length;
      const success = count('success');
      const failed = count('failed');
      const skipped = count('skipped');
      const timeout = count('timeout');
      const canceled = count('canceled');
      taskRun.statistics = {
        total: taskRun.items.length, success, failed, skipped, timeout, canceled,
        pending: count('pending'), running: count('running'),
        completed: success + failed + skipped + timeout + canceled,
      };
      const errorItems = failed + timeout;
      const nonError = success + skipped;
      if (errorItems === 0) taskRun.status = 'success';
      else if (nonError > 0) taskRun.status = 'partial_success';
      else taskRun.status = 'failed';
      taskRun.finished_at = taskRun.updated_at = now();
      releaseWorker(taskRun);
      emitHelpers.log(taskRun.id, 'info', 'master', `TaskFinished exit_code=0; terminal state arbitrated: ${taskRun.status}`);
      if (taskRun.worker_id) {
        const done = failed + success + skipped;
        emitHelpers.workerLog(
          taskRun.worker_id,
          taskRun.status === 'success' ? 'info' : 'warning',
          'runtime',
          `${taskRun.id} finished ${taskRun.status} (${done}/${taskRun.statistics.total} items); slot released`,
        );
      }
    }
  }
  emitHelpers.emit();
}

export function releaseWorker(taskRun: Pick<TaskRun, 'id' | 'worker_id'>): void {
  const w = db.workers.find((x) => x.id === taskRun.worker_id);
  if (!w) return;
  w.capacity_used = Math.max(0, w.capacity_used - 1);
  w.current_task_run_ids = w.current_task_run_ids.filter((id) => id !== taskRun.id);
  w.last_heartbeat_at = now();
}

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
