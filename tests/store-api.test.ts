import { beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });

async function loadStore() {
  const dbModule = await import('../src/store/db');
  const api = await import('../src/store/api');
  return { ...dbModule, ...api };
}

beforeEach(() => {
  storage.clear();
  vi.resetModules();
});

describe('Job Definition Version and Task template contracts', () => {
  it('resolves current and explicit published versions with ownership checks', async () => {
    const { db, resolvePublishedJobDefinitionVersion } = await loadStore();
    const definition = db.bots.find((item) => item.id === 'bot_invoice_sync')!;
    const current = resolvePublishedJobDefinitionVersion(definition.id);
    const explicit = resolvePublishedJobDefinitionVersion(definition.id, 'bv_inv_3');
    const mismatch = resolvePublishedJobDefinitionVersion(definition.id, 'bv_prc_2');
    const draft = resolvePublishedJobDefinitionVersion(definition.id, 'bv_inv_4');

    expect(current.ok && current.version.id).toBe('bv_inv_3');
    expect(explicit.ok && explicit.version.id).toBe('bv_inv_3');
    expect(mismatch).toMatchObject({ ok: false, code: 'BOT_VERSION_MISMATCH' });
    expect(draft).toMatchObject({ ok: false, code: 'BOT_VERSION_NOT_PUBLISHED' });
  });

  it('creates a Task template without materializing a TaskRun', async () => {
    const { createTask, db } = await loadStore();
    const before = db.taskRuns.length;
    const task = createTask({
      bot_id: 'bot_invoice_sync',
      name: 'Ad-hoc invoice pull',
      input_source: 'params',
      input_params: { batch: 1 },
    })!;

    expect(task).toMatchObject({
      name: 'Ad-hoc invoice pull',
      bot_id: 'bot_invoice_sync',
      status: 'enabled',
      input_params: { batch: 1 },
    });
    expect(db.taskRuns).toHaveLength(before);
    expect(db.tasks.some((item) => item.id === task.id)).toBe(true);
  });

  it('freezes a TaskRun snapshot that survives a later publication', async () => {
    const { createJobDefinitionVersion, createTask, runTask, db } = await loadStore();
    const task = createTask({
      bot_id: 'bot_invoice_sync',
      name: 'Snapshot probe',
      input_source: 'params',
      input_params: { batch: 1 },
    })!;
    const taskRun = runTask(task.id)!;
    const frozen = JSON.parse(JSON.stringify(taskRun.bot_snapshot));

    const next = createJobDefinitionVersion('bot_invoice_sync', {
      source_file_id: 'file_inv_next',
      entrypoint: 'next.py',
      default_config: { generation: 2 },
      publish: true,
    })!;

    expect(next.is_current).toBe(true);
    expect(db.bots.find((item) => item.id === 'bot_invoice_sync')?.current_version_id).toBe(next.id);
    expect(taskRun.bot_snapshot).toEqual(frozen);
    expect(taskRun.bot_snapshot?.bot_version_id).toBe('bv_inv_3');
    expect(taskRun.entrypoint).toBe(frozen.entrypoint);
  });

  it('inherits executable defaults when a new version omits replacements', async () => {
    const { createJobDefinition, createJobDefinitionVersion } = await loadStore();
    const definition = createJobDefinition({
      code: 'INHERIT-DEFAULTS',
      source_file_id: 'file_inherit_v1',
      entrypoint: 'inherit.py',
      default_input_source: 'none',
      input_params_schema: { type: 'object' },
      default_config: { queue: 'batch' },
      default_requirements: { region: 'east' },
      script_source: 'git',
      publish: true,
    })!;

    const next = createJobDefinitionVersion(definition.id, {
      source_file_id: 'file_inherit_v2',
    })!;

    expect(next).toMatchObject({
      entrypoint: 'inherit.py',
      script_source: 'git',
      default_input_source: 'none',
      input_params_schema: { type: 'object' },
      default_config: { queue: 'batch' },
      default_requirements: { region: 'east' },
    });
  });

  it('validates every supported input source branch', async () => {
    const { validateTaskInput } = await loadStore();

    expect(validateTaskInput({ input_source: 'file', input_file_id: 'file_input' })).toMatchObject({ ok: true, input_file_id: 'file_input' });
    expect(validateTaskInput({ input_source: 'file' })).toMatchObject({ ok: false });
    expect(validateTaskInput({ input_source: 'params', input_params: { page: 2 } })).toMatchObject({ ok: true, input_params: { page: 2 } });
    expect(validateTaskInput({ input_source: 'none' })).toMatchObject({ ok: true, input_file_id: null });
    expect(validateTaskInput({ input_source: 'none', input_file_id: 'forbidden' })).toMatchObject({ ok: false });
    const taskItems = { task_items: [{ id: 'item_source', key: 'source-key', input_data: { page: 2 } }] };
    expect(validateTaskInput({ input_source: 'task_items', input_params: taskItems, run_type: 'retry_failed_items', source_task_run_id: 'trun_source' })).toMatchObject({ ok: true });
    expect(validateTaskInput({ input_source: 'task_items', input_params: taskItems, run_type: 'retry_all', source_task_run_id: 'trun_source' })).toMatchObject({ ok: true });
    expect(validateTaskInput({ input_source: 'task_items', input_params: taskItems, run_type: 'rerun', source_task_run_id: 'trun_source' })).toMatchObject({ ok: true });
    expect(validateTaskInput({ input_source: 'task_items', run_type: 'manual' })).toMatchObject({ ok: false });
  });
});

describe('Schedule decision contracts', () => {
  it('binds a Task template and resolves an unpinned version at each trigger', async () => {
    const {
      createJobDefinition,
      createJobDefinitionVersion,
      createTask,
      createSchedule,
      db,
      toggleJobDefinition,
      triggerSchedule,
    } = await loadStore();

    const definition = createJobDefinition({
      code: 'SCHEDULE-CONTRACT',
      source_file_id: 'file_schedule_v1',
      entrypoint: 'v1.py',
      publish: true,
    })!;
    expect(toggleJobDefinition(definition.id).ok).toBe(true);

    const task = createTask({
      bot_id: definition.id,
      name: 'Contract task',
      bot_version_id: null,
      input_source: 'params',
      input_params: { window: 'today' },
      config: { retries: 2 },
      requirements: { region: 'east' },
    })!;

    const schedule = await createSchedule({
      task_id: task.id,
      name: 'Contract schedule',
      cron: '7 * * * *',
      timezone: 'UTC',
      enabled: true,
    });
    expect(schedule?.task_id).toBe(task.id);
    expect(schedule?.bot_id).toBe(definition.id);

    const firstRun = triggerSchedule(schedule!.id)!;
    const firstTaskRun = db.taskRuns.find((item) => item.id === firstRun.task_run_id)!;
    expect(firstRun.status).toBe('task_created');
    expect(firstRun.task_id).toBe(task.id);
    expect(firstTaskRun).toMatchObject({
      task_id: task.id,
      schedule_id: schedule!.id,
      schedule_run_id: firstRun.id,
      run_type: 'schedule',
      input_params: { window: 'today' },
      config: { retries: 2 },
      requirements: { region: 'east' },
      entrypoint: 'v1.py',
    });

    firstTaskRun.status = 'success';
    const secondVersion = createJobDefinitionVersion(definition.id, {
      source_file_id: 'file_schedule_v2',
      entrypoint: 'v2.py',
      publish: true,
    })!;
    const secondRun = triggerSchedule(schedule!.id)!;
    const secondTaskRun = db.taskRuns.find((item) => item.id === secondRun.task_run_id)!;

    expect(secondTaskRun.bot_version_id).toBe(secondVersion.id);
    expect(secondTaskRun.entrypoint).toBe('v2.py');
    expect(firstTaskRun.bot_version_id).not.toBe(secondTaskRun.bot_version_id);
  });

  it('skips when the bound Task template is disabled', async () => {
    const { createTask, createSchedule, db, toggleJobDefinition, toggleTask, triggerSchedule } = await loadStore();
    const definition = db.bots.find((item) => item.id === 'bot_invoice_sync')!;
    expect(toggleJobDefinition(definition.id).ok || definition.status === 'enabled').toBe(true);

    const task = createTask({
      bot_id: definition.id,
      name: 'Disabled later',
      input_source: 'params',
      input_params: {},
    })!;
    toggleTask(task.id);
    expect(task.status).toBe('disabled');

    const schedule = await createSchedule({
      task_id: task.id,
      name: 'Disabled task schedule',
      cron: '0 * * * *',
      timezone: 'UTC',
      enabled: true,
    })!;
    const run = triggerSchedule(schedule!.id)!;

    expect(run).toMatchObject({ status: 'skipped', reason: 'task_disabled', task_id: task.id, task_run_id: null });
    expect(db.taskRuns.some((item) => item.schedule_run_id === run.id)).toBe(false);
  });

  it('links a TaskRun only for task_created decisions', async () => {
    const { db, toggleJobDefinition, triggerSchedule } = await loadStore();
    const schedule = db.schedules.find((item) => item.id === 'sch_hourly_price')!;
    schedule.status = 'enabled';
    schedule.enabled = true;
    // Disable the Job Definition so the decision cannot materialize a TaskRun.
    const bot = db.bots.find((item) => item.id === 'bot_price_crawl')!;
    if (bot.status === 'enabled') toggleJobDefinition(bot.id);

    const run = triggerSchedule(schedule.id)!;

    expect(run).toMatchObject({ status: 'skipped', reason: 'bot_disabled', task_run_id: null });
    expect(run.task_id).toBe(schedule.task_id);
    expect(db.taskRuns.some((taskRun) => taskRun.schedule_run_id === run.id)).toBe(false);
    expect(schedule.last_run_at).toBe(run.triggered_at);
    expect(schedule.last_task_run_id).toBeNull();
  });

  it('audits overlap skips without creating a second TaskRun', async () => {
    const { db, triggerSchedule } = await loadStore();
    const schedule = db.schedules.find((item) => item.id === 'sch_nightly_inv')!;
    // Seed TaskRun is terminal; force an active one so the second decision overlaps.
    db.taskRuns
      .filter((taskRun) => taskRun.schedule_id === schedule.id)
      .forEach((taskRun) => { taskRun.status = 'success'; });
    const first = triggerSchedule(schedule.id)!;
    const second = triggerSchedule(schedule.id)!;

    expect(first.status).toBe('task_created');
    expect(first.task_run_id).not.toBeNull();
    expect(second).toMatchObject({ status: 'skipped', reason: 'previous_task_running', task_run_id: null });
    expect(db.taskRuns.filter((taskRun) => taskRun.schedule_run_id === first.id)).toHaveLength(1);
    expect(db.taskRuns.filter((taskRun) => taskRun.schedule_run_id === second.id)).toHaveLength(0);
  });

  it('records a missed-run skip and advances the schedule', async () => {
    const { db, tickSchedules } = await loadStore();
    const schedule = db.schedules.find((item) => item.id === 'sch_hourly_price')!;
    schedule.status = 'enabled';
    schedule.enabled = true;
    schedule.missed_run_policy = 'skip';
    schedule.next_planned_at = '2025-01-01T00:00:00.000Z';
    schedule.next_run_at = '2025-01-01T00:00:00.000Z';

    await tickSchedules(new Date('2025-01-01T01:00:00.000Z'));
    const decision = db.runs.find((run) => run.schedule_id === schedule.id && run.reason === 'missed_run_skipped')
      ?? db.runs.find((run) => run.schedule_id === schedule.id)!;

    expect(decision).toMatchObject({ status: 'skipped', reason: 'missed_run_skipped', task_run_id: null });
    expect(schedule.last_run_at).toBe(decision.triggered_at);
    expect(Date.parse(schedule.next_planned_at!)).toBeGreaterThan(Date.parse('2025-01-01T01:00:00.000Z'));
  });

  it('runs one catch-up decision for multiple missed occurrences', async () => {
    const { db, tickSchedules } = await loadStore();
    const schedule = db.schedules.find((item) => item.id === 'sch_nightly_inv')!;
    db.taskRuns
      .filter((taskRun) => taskRun.schedule_id === schedule.id)
      .forEach((taskRun) => { taskRun.status = 'success'; });
    schedule.cron = '*/5 * * * *';
    schedule.timezone = 'UTC';
    schedule.jitter_seconds = 0;
    schedule.missed_run_policy = 'run_once';
    schedule.next_planned_at = '2025-01-01T00:00:00.000Z';
    schedule.next_run_at = '2025-01-01T00:00:00.000Z';
    const reference = new Date('2025-01-01T01:00:00.000Z');

    await tickSchedules(reference);
    const decisions = db.runs.filter((run) =>
      run.schedule_id === schedule.id
      && run.trigger_type === 'missed_run_catchup',
    );

    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ status: 'task_created', reason: 'missed_run_catchup' });
    expect(Date.parse(schedule.next_planned_at!)).toBeGreaterThan(reference.getTime());

    await tickSchedules(reference);
    expect(db.runs.filter((run) =>
      run.schedule_id === schedule.id
      && run.trigger_type === 'missed_run_catchup',
    )).toHaveLength(1);
  });
});

describe('Retry and rerun contracts', () => {
  it('keeps retry-all, failed-item retry, and rerun distinct under the same Task template', async () => {
    const { db, retryTaskRun, rerunTaskRun } = await loadStore();
    const source = db.taskRuns.find((item) => item.id === 'trun_7ab3d4')!;
    const retryAll = retryTaskRun(source.id, 'all')!;
    const retryFailed = retryTaskRun(source.id, 'failed_items')!;
    const rerun = rerunTaskRun(source.id)!;

    expect(retryAll).toMatchObject({
      run_type: 'retry_all',
      task_id: source.task_id,
      source_task_run_id: source.id,
      input_source: source.input_source,
      input_params: source.input_params,
    });
    expect(retryFailed).toMatchObject({
      run_type: 'retry_failed_items',
      task_id: source.task_id,
      source_task_run_id: source.id,
      input_source: 'task_items',
    });
    expect(retryFailed.input_params).toEqual({
      task_items: source.items
        .filter((item) => item.status === 'failed' || item.status === 'timeout')
        .map((item) => ({ id: item.id, key: item.key, input_data: item.input_data ?? {} })),
    });
    expect(rerun).toMatchObject({
      run_type: 'rerun',
      task_id: source.task_id,
      source_task_run_id: source.id,
      input_source: source.input_source,
      input_params: source.input_params,
    });
    expect(retryAll.bot_snapshot).toEqual(source.bot_snapshot);
    expect(retryFailed.bot_snapshot).toEqual(source.bot_snapshot);
    expect(rerun.bot_snapshot).toEqual(source.bot_snapshot);
  });

  it('can retry or rerun a failed-item retry without losing its item input', async () => {
    const { db, retryTaskRun, rerunTaskRun } = await loadStore();
    const source = db.taskRuns.find((item) => item.id === 'trun_7ab3d4')!;
    const failedItems = retryTaskRun(source.id, 'failed_items')!;
    failedItems.status = 'failed';

    const retryAll = retryTaskRun(failedItems.id, 'all');
    const rerun = rerunTaskRun(failedItems.id);

    expect(retryAll).toMatchObject({
      run_type: 'retry_all',
      source_task_run_id: failedItems.id,
      input_source: 'task_items',
      input_params: failedItems.input_params,
    });
    expect(rerun).toMatchObject({
      run_type: 'rerun',
      source_task_run_id: failedItems.id,
      input_source: 'task_items',
      input_params: failedItems.input_params,
    });
    const expectedKeys = (failedItems.input_params.task_items as Array<{ key: string }>).map((item) => item.key);
    expect(failedItems.items.map((item) => item.key)).toEqual(expectedKeys);
    expect(retryAll!.items.map((item) => item.key)).toEqual(expectedKeys);
    expect(rerun!.items.map((item) => item.key)).toEqual(expectedKeys);
  });
});

describe('Schema load and reconcile', () => {
  it('reseeds pre-v6 localStorage and lands on schema 6', async () => {
    const timestamp = '2025-01-01T00:00:00.000Z';
    storage.setItem('botops-db-v2', JSON.stringify({
      schema_version: 5,
      bots: [{ id: 'bot_legacy', code: 'LEGACY', description: '', enabled: true, current_version_id: 'bv_legacy_2', created_at: timestamp }],
      versions: [
        { id: 'bv_legacy_1', bot_id: 'bot_legacy', version: 1, status: 'published', script_file: 'one.zip', created_at: timestamp },
      ],
      tasks: [{
        id: 'task_legacy', bot_id: 'bot_legacy', bot_code: 'LEGACY', bot_version_id: 'bv_legacy_2', bot_snapshot: null,
        schedule_id: null, schedule_run_id: null, source_task_id: null, status: 'success', run_type: 'manual', input_params: {},
        statistics: {}, items: [], worker_id: null, error_code: null, created_at: timestamp, finished_at: timestamp,
      }],
      schedules: [],
      runs: [],
      logs: [],
      workers: [],
      workerMetrics: {},
      workerLogs: [],
    }));

    const loaded = await loadStore();
    expect(loaded.db.schema_version).toBe(6);
    expect(loaded.db.tasks.some((task) => task.id === 'task_nightly_inv')).toBe(true);
    expect(loaded.db.taskRuns.some((run) => run.id === 'trun_9f2c01')).toBe(true);
    expect(loaded.db.schedules.every((schedule) => typeof schedule.task_id === 'string')).toBe(true);
  });

  it('reconciles broken ScheduleRun ↔ TaskRun links in valid v6 storage', async () => {
    const first = await loadStore();
    const persisted = JSON.parse(JSON.stringify(first.db));
    const run = persisted.runs.find((candidate: { task_run_id: string | null }) => candidate.task_run_id);
    const taskRun = persisted.taskRuns.find((candidate: { id: string }) => candidate.id === run.task_run_id);
    taskRun.schedule_id = 'sch_broken';
    taskRun.schedule_run_id = 'srun_broken';
    storage.setItem('botops-db-v2', JSON.stringify(persisted));
    vi.resetModules();

    const repaired = await loadStore();
    const repairedRun = repaired.db.runs.find((candidate) => candidate.id === run.id)!;
    const repairedTaskRun = repaired.db.taskRuns.find((candidate) => candidate.id === taskRun.id)!;

    // Broken reciprocal links are demoted so provenance stays one-sided-safe.
    expect(repairedRun.task_run_id === null || repairedTaskRun.schedule_run_id === repairedRun.id).toBe(true);
    if (repairedRun.task_run_id === null) {
      expect(repairedRun).toMatchObject({ status: 'failed', reason: 'create_task_failed' });
      expect(repairedTaskRun.schedule_id).toBeNull();
      expect(repairedTaskRun.schedule_run_id).toBeNull();
    }
  });
});
