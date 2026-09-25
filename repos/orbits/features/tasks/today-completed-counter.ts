import type { LiveRecordSqlClient } from '../../shared/storage/postgres-live-record-store';
import { taskRecordsValidityCte, taskTimestampSql } from './task-page';

export interface TodayCompletedCounter {
  count(query: { actorId: string; now: string; timeZone: string }): Promise<number>;
}

/** A completion is a historical fact, not the task's current status. Include
 * soft-deleted tasks just as TaskService.history does; count each task once. */
export function createTodayCompletedCounter(input: { client: LiveRecordSqlClient; workspaceId: string }): TodayCompletedCounter {
  if (!input.workspaceId.trim()) throw Error('TODAY_COMPLETED_SCOPE_INVALID');
  return { async count(query) {
    if (!query.actorId.trim() || !Number.isFinite(Date.parse(query.now))) throw Error('TODAY_COMPLETED_INPUT_INVALID');
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: query.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = Object.fromEntries(formatter.formatToParts(new Date(query.now)).map(part => [part.type, part.value]));
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const zone = formatter.resolvedOptions().timeZone;
    // Intl accepts ISO fixed offsets; PostgreSQL interprets textual offsets
    // with POSIX's opposite sign. Named IANA zones retain their normal rules.
    const sqlZone = /^[+-]\d{2}:\d{2}$/.test(zone) ? (zone.startsWith('+') ? '-' : '+') + zone.slice(1) : zone;
    const result = await input.client.query<{ count: unknown }>(`with ${taskRecordsValidityCte(true)}
      select count(*)::text as count from valid where exists (
        select 1 from jsonb_array_elements(activities) a where a->>'type'='completed'
          and to_char((${taskTimestampSql("a->>'occurredAt'")}) at time zone $3,'FMYYYY-MM-DD')=$4
      )`, [input.workspaceId, query.actorId, sqlZone, date]);
    const value = result.rows[0]?.count;
    if (result.rows.length !== 1 || typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value))) throw Error('TODAY_COMPLETED_RESULT_INVALID');
    return Number(value);
  } };
}
