import type { TransactionalPostgresClient, TransactionalSqlExecutor } from '../../shared/storage/transactional-postgres';
import type { PersonalScheduleContract } from '../../shared/contract/tasks';
import { localParts } from '../tasks/local-date-time';

export const SCHEDULE_REMINDER_WINDOW_SCHEMA_SQL = `
create table if not exists orbit_schedule_reminder_windows (
  workspace_id text not null, actor_id text not null, series_id text not null,
  source_revision text not null, state text not null check(state in ('active','inactive','failed')),
  horizon_through timestamptz not null, next_refresh_at timestamptz not null,
  failures integer not null default 0 check(failures>=0), error_code text,
  updated_at timestamptz not null,
  primary key(workspace_id,actor_id,series_id)
);
create index if not exists orbit_schedule_reminder_windows_due_idx
  on orbit_schedule_reminder_windows(workspace_id,next_refresh_at,actor_id,series_id) where state='active';
`;

export interface ScheduleReminderWindowCandidate {
  actorId: string; seriesId: string; sourceRevision: string; nextRefreshAt: string;
}
const day = 86400000;
const iso = (value: string | Date) => new Date(value).toISOString();

/** One small progress record per recurring schedule. No event timestamp cursor
 * and no long-running lease: the bounded database-only refresh commits atomically. */
export function createScheduleReminderWindowRepository(input: { client: TransactionalPostgresClient; workspaceId: string }) {
  if (!input.workspaceId.trim()) throw Error('Schedule reminder window workspace is required');
  return {
    /** Caller holds the schedule actor lock in the same transaction. Repeated
     * GET refresh before next_refresh_at does not churn this progress record. */
    async record(executor: TransactionalSqlExecutor, item: PersonalScheduleContract, at: string, horizonThrough: string) {
      if (!item.ownerUserId || item.accountId !== item.ownerUserId || item.sourceId !== item.id || !Number.isFinite(Date.parse(at)) || !Number.isFinite(Date.parse(horizonThrough))) throw Error('Invalid schedule reminder window source');
      const active = item.state !== 'cancelled' && item.recurrence !== undefined && item.reminderMinutes !== undefined &&
        (!item.recurrence.until || localParts(at, item.timeZone ?? 'UTC').date <= item.recurrence.until);
      if (!active) {
        await executor.query(`update orbit_schedule_reminder_windows set state='inactive',source_revision=$4,updated_at=$5,failures=0,error_code=null
          where workspace_id=$1 and actor_id=$2 and series_id=$3 and (state<>'inactive' or source_revision<>$4)`, [input.workspaceId, item.ownerUserId, item.id, item.updatedAt, at]);
        return;
      }
      await executor.query(`insert into orbit_schedule_reminder_windows(workspace_id,actor_id,series_id,source_revision,state,horizon_through,next_refresh_at,updated_at)
        values($1,$2,$3,$4,'active',$5,$6,$7)
        on conflict(workspace_id,actor_id,series_id) do update set source_revision=excluded.source_revision,state='active',
          horizon_through=excluded.horizon_through,next_refresh_at=excluded.next_refresh_at,failures=0,error_code=null,updated_at=excluded.updated_at
        where orbit_schedule_reminder_windows.source_revision<>excluded.source_revision
          or (orbit_schedule_reminder_windows.state='active' and orbit_schedule_reminder_windows.next_refresh_at<=excluded.updated_at)`,
      [input.workspaceId, item.ownerUserId, item.id, item.updatedAt, horizonThrough, new Date(Date.parse(horizonThrough) - 30 * day).toISOString(), at]);
    },
    async due(at: string, limit = 10, executor: TransactionalSqlExecutor = input.client): Promise<ScheduleReminderWindowCandidate[]> {
      if (!Number.isFinite(Date.parse(at)) || !Number.isSafeInteger(limit) || limit < 1 || limit > 25) throw Error('Invalid schedule reminder window bound');
      const result = await executor.query<{ actor_id: string; series_id: string; source_revision: string; next_refresh_at: Date | string }>(`
        select actor_id,series_id,source_revision,next_refresh_at from orbit_schedule_reminder_windows
        where workspace_id=$1 and state='active' and next_refresh_at<=$2::timestamptz
        order by next_refresh_at,actor_id,series_id limit $3`, [input.workspaceId, at, limit]);
      return result.rows.map(row => ({ actorId: row.actor_id, seriesId: row.series_id, sourceRevision: row.source_revision, nextRefreshAt: iso(row.next_refresh_at) }));
    },
    async current(executor: TransactionalSqlExecutor, candidate: ScheduleReminderWindowCandidate, at: string): Promise<boolean> {
      const result = await executor.query(`select series_id from orbit_schedule_reminder_windows
        where workspace_id=$1 and actor_id=$2 and series_id=$3 and source_revision=$4 and next_refresh_at=$5::timestamptz
          and state='active' and next_refresh_at<=$6::timestamptz for update`,
      [input.workspaceId, candidate.actorId, candidate.seriesId, candidate.sourceRevision, candidate.nextRefreshAt, at]);
      return result.rows.length === 1;
    },
    async missing(executor: TransactionalSqlExecutor, candidate: ScheduleReminderWindowCandidate, at: string) {
      await executor.query(`update orbit_schedule_reminder_windows set state='inactive',updated_at=$6,failures=0,error_code=null
        where workspace_id=$1 and actor_id=$2 and series_id=$3 and source_revision=$4 and next_refresh_at=$5::timestamptz`,
      [input.workspaceId, candidate.actorId, candidate.seriesId, candidate.sourceRevision, candidate.nextRefreshAt, at]);
    },
    async fail(candidate: ScheduleReminderWindowCandidate, at: string, executor: TransactionalSqlExecutor = input.client) {
      // A concurrent edit has a new revision/date and must not inherit the old
      // job's failure. Same-revision dead letters are not revived by a GET.
      await executor.query(`update orbit_schedule_reminder_windows set failures=failures+1,
        state=case when failures+1>=8 then 'failed' else 'active' end,error_code='WINDOW_REFRESH_FAILED',updated_at=$6,
        next_refresh_at=$6::timestamptz+least(3600,60*power(2,least(failures,6))) * interval '1 second'
        where workspace_id=$1 and actor_id=$2 and series_id=$3 and source_revision=$4 and next_refresh_at=$5::timestamptz and state='active'`,
      [input.workspaceId, candidate.actorId, candidate.seriesId, candidate.sourceRevision, candidate.nextRefreshAt, at]);
    },
  };
}
