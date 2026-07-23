export interface ScheduleTimes {
  next_planned_at: string;
  next_run_at: string;
}

// cron-parser drags in luxon (~half the app bundle), so it is only loaded on
// demand. The promise is cached on success; a failed load clears the cache so
// a later call can retry instead of staying broken forever.
let cronParserModule: Promise<typeof import('cron-parser')> | null = null;

function loadCronParser(): Promise<typeof import('cron-parser')> {
  cronParserModule ??= import('cron-parser').catch((err) => {
    cronParserModule = null;
    throw err;
  });
  return cronParserModule;
}

export function validateTimezone(value: string): string | null {
  const timezone = value.trim();
  if (!timezone) return null;

  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone })
      .resolvedOptions()
      .timeZone;
  } catch {
    return null;
  }
}

export async function validateCron(value: string, timezone: string): Promise<boolean> {
  const cron = value.trim();
  if (cron.split(/\s+/).length !== 5 || !validateTimezone(timezone)) return false;

  try {
    const { CronExpressionParser } = await loadCronParser();
    CronExpressionParser.parse(cron, {
      currentDate: new Date(),
      tz: timezone,
    });
    return true;
  } catch {
    return false;
  }
}

export async function calculateNextScheduleTimes(input: {
  cron: string;
  timezone: string;
  jitterSeconds: number;
  after?: Date;
}): Promise<ScheduleTimes | null> {
  const timezone = validateTimezone(input.timezone);
  const cron = input.cron.trim();
  if (!timezone || cron.split(/\s+/).length !== 5) return null;

  try {
    const { CronExpressionParser } = await loadCronParser();
    const expression = CronExpressionParser.parse(cron, {
      currentDate: input.after ?? new Date(),
      tz: timezone,
    });
    const planned = expression.next().toDate();
    const maxJitter = Math.max(0, Math.floor(input.jitterSeconds));
    const jitter = maxJitter > 0 ? Math.floor(Math.random() * (maxJitter + 1)) : 0;

    return {
      next_planned_at: planned.toISOString(),
      next_run_at: new Date(planned.getTime() + jitter * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

// Assembled from parts so the output is always `YYYY-MM-DD HH:mm:ss` — the
// same machine-timestamp shape timeShort() gives every other route — while
// still being computed in the schedule's own timezone.
export function formatScheduleNextRun(iso: string, timezone: string): string | null {
  const canonicalTimezone = validateTimezone(timezone);
  const date = new Date(iso);
  if (!canonicalTimezone || Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: canonicalTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}
