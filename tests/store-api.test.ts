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

describe('Job Definition Version and Task contracts', () => {
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

  it('keeps a Task snapshot immutable after a later publication', async () => {
    const { createJobDefinitionVersion, createTask, db } = await loadStore();
    const task = createTask({ bot_id: 'bot_invoice_sync', input_source: 'params', input_params: { batch: 1 } })!;
    const frozen = JSON.parse(JSON.stringify(task.bot_snapshot));

    const next = createJobDefinitionVersion('bot_invoice_sync', {
      source_file_id: 'file_inv_next',
      entrypoint: 'next.py',
      default_config: { generation: 2 },
      publish: true,
    })!;

    expect(next.is_current).toBe(true);
    expect(db.bots.find((item) => item.id === 'bot_invoice_sync')?.current_version_id).toBe(next.id);
    expect(task.bot_snapshot).toEqual(frozen);
    expect(task.bot_snapshot?.bot_version_id).toBe('bv_inv_3');
    expect(task.entrypoint).toBe(frozen.entrypoint);
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
    expect(validateTaskInput({ input_source: 'task_items', input_params: taskItems, run_type: 'retry_failed_items', source_task_id: 'task_source' })).toMatchObject({ ok: true });
    expect(validateTaskInput({ input_source: 'task_items', input_params: taskItems, run_type: 'retry_all', source_task_id: 'task_source' })).toMatchObject({ ok: true });
    expect(validateTaskInput({ input_source: 'task_items', input_params: taskItems, run_type: 'rerun', source_task_id: 'task_source' })).toMatchObject({ ok: true });
    expect(validateTaskInput({ input_source: 'task_items', run_type: 'manual' })).toMatchObject({ ok: false });
  });
});

describe('Schedule decision contracts', () => {
  it('inherits the execution template and resolves an unpinned version at each trigger', async () => {
    const {
      createJobDefinition,
      createJobDefinitionVersion,
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

    const schedule = await createSchedule({
      bot_id: definition.id,
      name: 'Contract schedule',
      cron: '7 * * * *',
      timezone: 'UTC',
      input_source: 'params',
      input_params: { window: 'today' },
      config: { retries: 2 },
      requirements: { region: 'east' },
      enabled: true,
    });
    expect(schedule?.bot_version_id).toBeNull();

    const firstRun = triggerSchedule(schedule!.id)!;
    const firstTask = db.tasks.find((item) => item.id === firstRun.task_id)!;
    expect(firstRun.status).toBe('task_created');
    expect(firstTask).toMatchObject({
      schedule_id: schedule!.id,
      schedule_run_id: firstRun.id,
      run_type: 'schedule',
      input_params: { window: 'today' },
      config: { retries: 2 },
      requirements: { region: 'east' },
      entrypoint: 'v1.py',
    });

    firstTask.status = 'success';
    const secondVersion = createJobDefinitionVersion(definition.id, {
      source_file_id: 'file_schedule_v2',
      entrypoint: 'v2.py',
      publish: true,
    })!;
    const secondRun = triggerSchedule(schedule!.id)!;
    const secondTask = db.tasks.find((item) => item.id === secondRun.task_id)!;

    expect(secondTask.bot_version_id).toBe(secondVersion.id);
    expect(secondTask.entrypoint).toBe('v2.py');
    expect(firstTask.bot_version_id).not.toBe(secondTask.bot_version_id);
  });

  it('links a Task only for task_created decisions', async () => {
    const { db, toggleJobDefinition, triggerSchedule } = await loadStore();
    const schedule = db.schedules.find((item) => item.id === 'sch_hourly_price')!;
    schedule.status = 'enabled';
    schedule.enabled = true;
    toggleJobDefinition('bot_price_crawl');

    const run = triggerSchedule(schedule.id)!;

    expect(run).toMatchObject({ status: 'skipped', reason: 'bot_disabled', task_id: null });
    expect(db.tasks.some((task) => task.schedule_run_id === run.id)).toBe(false);
    expect(schedule.last_run_at).toBe(run.triggered_at);
    expect(schedule.last_task_id).toBeNull();
  });

  it('audits overlap skips without creating a second Task', async () => {
    const { db, triggerSchedule } = await loadStore();
    const schedule = db.schedules.find((item) => item.id === 'sch_nightly_inv')!;
    const first = triggerSchedule(schedule.id)!;
    const second = triggerSchedule(schedule.id)!;

    expect(first.status).toBe('task_created');
    expect(first.task_id).not.toBeNull();
    expect(second).toMatchObject({ status: 'skipped', reason: 'previous_task_running', task_id: null });
    expect(db.tasks.filter((task) => task.schedule_run_id === first.id)).toHaveLength(1);
    expect(db.tasks.filter((task) => task.schedule_run_id === second.id)).toHaveLength(0);
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
    const decision = db.runs.find((run) => run.schedule_id === schedule.id)!;

    expect(decision).toMatchObject({ status: 'skipped', reason: 'missed_run_skipped', task_id: null });
    expect(schedule.last_run_at).toBe(decision.triggered_at);
    expect(Date.parse(schedule.next_planned_at!)).toBeGreaterThan(Date.parse('2025-01-01T01:00:00.000Z'));
  });

  it('runs one catch-up decision for multiple missed occurrences', async () => {
    const { db, tickSchedules } = await loadStore();
    const schedule = db.schedules.find((item) => item.id === 'sch_nightly_inv')!;
    db.tasks
      .filter((task) => task.schedule_id === schedule.id)
      .forEach((task) => { task.status = 'success'; });
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
  it('keeps retry-all, failed-item retry, and rerun distinct', async () => {
    const { db, retryTask, rerunTask } = await loadStore();
    const source = db.tasks.find((item) => item.id === 'task_7ab3d4')!;
    const retryAll = retryTask(source.id, 'all')!;
    const retryFailed = retryTask(source.id, 'failed_items')!;
    const rerun = rerunTask(source.id)!;

    expect(retryAll).toMatchObject({ run_type: 'retry_all', source_task_id: source.id, input_source: source.input_source, input_params: source.input_params });
    expect(retryFailed).toMatchObject({ run_type: 'retry_failed_items', source_task_id: source.id, input_source: 'task_items' });
    expect(retryFailed.input_params).toEqual({
      task_items: source.items
        .filter((item) => item.status === 'failed' || item.status === 'timeout')
        .map((item) => ({ id: item.id, key: item.key, input_data: item.input_data ?? {} })),
    });
    expect(rerun).toMatchObject({ run_type: 'rerun', source_task_id: source.id, input_source: source.input_source, input_params: source.input_params });
    expect(retryAll.bot_snapshot).toEqual(source.bot_snapshot);
    expect(retryFailed.bot_snapshot).toEqual(source.bot_snapshot);
    expect(rerun.bot_snapshot).toEqual(source.bot_snapshot);
  });

  it('can retry or rerun a failed-item retry without losing its item input', async () => {
    const { db, retryTask, rerunTask } = await loadStore();
    const source = db.tasks.find((item) => item.id === 'task_7ab3d4')!;
    const failedItems = retryTask(source.id, 'failed_items')!;
    failedItems.status = 'failed';

    const retryAll = retryTask(failedItems.id, 'all');
    const rerun = rerunTask(failedItems.id);

    expect(retryAll).toMatchObject({
      run_type: 'retry_all',
      source_task_id: failedItems.id,
      input_source: 'task_items',
      input_params: failedItems.input_params,
    });
    expect(rerun).toMatchObject({
      run_type: 'rerun',
      source_task_id: failedItems.id,
      input_source: 'task_items',
      input_params: failedItems.input_params,
    });
    const expectedKeys = (failedItems.input_params.task_items as Array<{ key: string }>).map((item) => item.key);
    expect(failedItems.items.map((item) => item.key)).toEqual(expectedKeys);
    expect(retryAll!.items.map((item) => item.key)).toEqual(expectedKeys);
    expect(rerun!.items.map((item) => item.key)).toEqual(expectedKeys);
  });
});

describe('v4 to v5 migration', () => {
  it('is idempotent and preserves a valid historical frozen snapshot', async () => {
    const timestamp = '2025-01-01T00:00:00.000Z';
    const frozenSnapshot = {
      bot_id: 'bot_legacy',
      bot_code: 'LEGACY',
      bot_version_id: 'bv_legacy_2',
      version: 'v9.9.9',
      script_file: 'historical.zip',
    };
    storage.setItem('botops-db-v2', JSON.stringify({
      schema_version: 4,
      bots: [{ id: 'bot_legacy', code: 'LEGACY', description: '', enabled: true, current_version_id: 'bv_legacy_2', created_at: timestamp }],
      versions: [
        { id: 'bv_legacy_1', bot_id: 'bot_legacy', version: 'v1.2.0', status: 'published', script_file: 'one.zip', created_at: timestamp },
        { id: 'bv_legacy_2', bot_id: 'bot_legacy', version: 'v1.3.0', status: 'published', script_file: 'two.zip', created_at: '2025-01-02T00:00:00.000Z' },
      ],
      tasks: [{
        id: 'task_legacy', bot_id: 'bot_legacy', bot_code: 'LEGACY', bot_version_id: 'bv_legacy_2', bot_snapshot: frozenSnapshot,
        schedule_id: 'sch_conflicting', schedule_run_id: 'srun_conflicting', source_task_id: null, status: 'success', run_type: 'manual', input_params: {},
        statistics: {}, items: [], worker_id: null, error_code: null, created_at: timestamp, finished_at: timestamp,
      }],
      schedules: [{
        id: 'sch_legacy', bot_id: 'bot_legacy', bot_version_id: 'bv_legacy_2', bot_code: 'LEGACY', name: 'Legacy schedule',
        cron: '0 * * * *', timezone: 'UTC', enabled: true, overlap_policy: 'skip', jitter_seconds: 0,
        next_planned_at: null, next_run_at: null, created_at: timestamp,
      }],
      runs: [{
        id: 'srun_legacy', schedule_id: 'sch_legacy', bot_id: 'bot_legacy', task_id: 'task_legacy',
        trigger_type: 'cron', planned_at: timestamp, scheduled_at: timestamp, jitter_seconds: 0,
        jitter_applied_seconds: 0, triggered_at: timestamp, status: 'task_created', reason: null,
        overlap_policy: 'skip', missed_run_policy: 'skip', error_code: null, error_message: null, created_at: timestamp,
      }],
      logs: [], workers: [], workerMetrics: {}, workerLogs: [],
    }));

    const first = await loadStore();
    const migratedTask = first.db.tasks[0];
    expect(first.db.schema_version).toBe(5);
    expect(first.db.versions.map((version) => version.version)).toEqual([1, 2]);
    expect(migratedTask.bot_snapshot).toMatchObject(frozenSnapshot);
    expect(migratedTask.bot_snapshot?.version).toBe('v9.9.9');
    expect(migratedTask.bot_snapshot?.script_file).toBe('historical.zip');
    expect(first.db.runs[0]).toMatchObject({
      status: 'failed',
      reason: 'create_task_failed',
      task_id: null,
    });
    expect(migratedTask.schedule_id).toBeNull();
    expect(migratedTask.schedule_run_id).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));
    vi.resetModules();
    const second = await loadStore();
    expect(second.db.schema_version).toBe(5);
    expect(second.db.tasks[0].bot_snapshot).toEqual(migratedTask.bot_snapshot);
    expect(second.db.versions.map((version) => version.version)).toEqual([1, 2]);
  });

  it('reconciles broken reciprocal links in structurally valid v5 storage', async () => {
    const first = await loadStore();
    const persisted = JSON.parse(JSON.stringify(first.db));
    const run = persisted.runs.find((candidate: { task_id: string | null }) => candidate.task_id);
    const task = persisted.tasks.find((candidate: { id: string }) => candidate.id === run.task_id);
    task.schedule_id = 'sch_broken';
    task.schedule_run_id = 'srun_broken';
    storage.setItem('botops-db-v2', JSON.stringify(persisted));
    vi.resetModules();

    const repaired = await loadStore();
    const repairedRun = repaired.db.runs.find((candidate) => candidate.id === run.id)!;
    const repairedTask = repaired.db.tasks.find((candidate) => candidate.id === task.id)!;

    expect(repairedRun).toMatchObject({ status: 'failed', reason: 'create_task_failed', task_id: null });
    expect(repairedTask.schedule_id).toBeNull();
    expect(repairedTask.schedule_run_id).toBeNull();
  });
});
