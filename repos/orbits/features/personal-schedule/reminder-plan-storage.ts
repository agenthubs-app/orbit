import type { LiveRecordStoreLike } from '../../shared/storage/live-record-store';
import type { TransactionalSqlExecutor } from '../../shared/storage/transactional-postgres';
import { createReminderPlanRepository, type ReminderPlanRepository } from '../notifications/reminder-plan-repository';
import type { ReminderPlanDTO } from '../notifications/reminder-plan-contract';

export interface ScheduleReminderCancellationQuery {
  actorId: string;
  prefix: string;
  keepRevisionPrefix?: string;
  now: string;
  afterId?: string;
}
export interface PersonalScheduleReminderRepository extends Pick<ReminderPlanRepository, 'savePlan'> {
  cancellationPage(query: ScheduleReminderCancellationQuery): Promise<readonly ReminderPlanDTO[]>;
  existingPlanIds(actorId: string, ids: readonly string[]): Promise<readonly string[]>;
}
export const SCHEDULE_REMINDER_PAGE_SIZE = 50;

/** The SQL executor must belong to the schedule mutation/extension transaction.
 * No changes to the general reminder repository or its legacy consumers. */
export function createPersonalScheduleReminderRepository(input: {
  store: LiveRecordStoreLike; workspaceId: string; executor: TransactionalSqlExecutor;
}): PersonalScheduleReminderRepository {
  const base = createReminderPlanRepository(input);
  return {
    savePlan: base.savePlan,
    async existingPlanIds(actorId, ids) {
      if (!actorId || ids.length > SCHEDULE_REMINDER_PAGE_SIZE || ids.some(id => !/^schedule-reminder:[a-f0-9]{24}:[a-f0-9]{24}:[a-f0-9]{24}$/.test(id))) throw Error('Invalid schedule reminder identity scope');
      if (!ids.length) return [];
      // Include tombstones: an old/cancelled/deleted identity must never be
      // resurrected, and a corrupt foreign-owned collision must never transfer.
      const result = await input.executor.query<{ record_id: string; valid: boolean }>(`
        select record_id,coalesce(user_id=$2 and source_id=record_id and payload->'entity'->>'id'=record_id
          and payload->'entity'->>'ownerUserId'=$2 and payload->'entity'->>'accountId'=$2,false) as valid
        from orbit_records where workspace_id=$1 and collection_name='reminderPlans' and record_id=any($3::text[])`, [input.workspaceId, actorId, ids]);
      if (result.rows.length > ids.length || result.rows.some(row => !row.valid || !ids.includes(row.record_id))) throw Error('Schedule reminder identity is unavailable');
      return result.rows.map(row => row.record_id);
    },
    async cancellationPage(query) {
      if (!query.actorId || !input.workspaceId || !/^schedule-reminder:[a-f0-9]{24}:$/.test(query.prefix) ||
          !Number.isFinite(Date.parse(query.now)) ||
          (query.keepRevisionPrefix !== undefined && (!query.keepRevisionPrefix.startsWith(query.prefix) || !/^[a-f0-9]{24}:$/.test(query.keepRevisionPrefix.slice(query.prefix.length)))) ||
          (query.afterId !== undefined && !query.afterId.startsWith(query.prefix))) throw Error('Invalid schedule reminder cancellation scope');
      const result = await input.executor.query<{ record_id: string; source_id: string; user_id: string; payload: { entity: ReminderPlanDTO } }>(`
        select record_id,source_id,user_id,payload from orbit_records
        where workspace_id=$1 and collection_name='reminderPlans' and user_id=$2 and lifecycle_state='active'
          and record_id like 'schedule-reminder:%'
          and record_id collate "C" >= $3 collate "C" and record_id collate "C" < $7 collate "C"
          and record_id like $3 || '%' and ($4::text is null or record_id not like $4 || '%')
          and record_id collate "C" > $5 collate "C"
          and payload->'entity'->>'status'='scheduled'
          and payload->'entity'->>'ownerUserId'=$2 and payload->'entity'->>'accountId'=$2
          and case when pg_input_is_valid(payload->'entity'->>'fireAt','timestamp with time zone')
            then (payload->'entity'->>'fireAt')::timestamptz >= $6::timestamptz else false end
        order by record_id collate "C" limit 50`,
      [input.workspaceId, query.actorId, query.prefix, query.keepRevisionPrefix ?? null, query.afterId ?? '', query.now, query.prefix.slice(0, -1) + ';']);
      if (result.rows.length > SCHEDULE_REMINDER_PAGE_SIZE) throw Error('Schedule reminder page exceeded its bound');
      let previous = query.afterId ?? '';
      return result.rows.map(row => {
        const plan = row.payload?.entity;
        if (!plan || row.user_id !== query.actorId || plan.ownerUserId !== query.actorId || plan.accountId !== query.actorId ||
            plan.id !== row.record_id || row.source_id !== row.record_id || plan.id <= previous || !plan.id.startsWith(query.prefix) ||
            (query.keepRevisionPrefix && plan.id.startsWith(query.keepRevisionPrefix)) || plan.status !== 'scheduled' ||
            !Number.isFinite(Date.parse(plan.fireAt)) || Date.parse(plan.fireAt) < Date.parse(query.now)) throw Error('Schedule reminder page integrity mismatch');
        previous = plan.id;
        return plan;
      });
    },
  };
}

/** In-memory adapter for the existing non-SQL service. Production schedule
 * commands always use the SQL adapter enlisted in withScheduleTransaction. */
export function createMemoryPersonalScheduleReminderRepository(input: {
  store: LiveRecordStoreLike; workspaceId: string;
}): PersonalScheduleReminderRepository {
  const base = createReminderPlanRepository(input);
  return {
    savePlan: base.savePlan,
    async existingPlanIds(actorId, ids) {
      if (!actorId || ids.length > SCHEDULE_REMINDER_PAGE_SIZE) throw Error('Invalid schedule reminder identity scope');
      const found: string[] = [];
      for (const id of ids) {
        const record = await input.store.getRecord({ workspaceId: input.workspaceId, collectionName: 'reminderPlans', recordId: id, includeDeleted: true });
        if (!record) continue;
        const plan = record.payload.entity as ReminderPlanDTO | undefined;
        if (record.userId !== actorId || record.sourceId !== id || plan?.id !== id || plan.ownerUserId !== actorId || plan.accountId !== actorId) throw Error('Schedule reminder identity is unavailable');
        found.push(id);
      }
      return found;
    },
    async cancellationPage(query) {
      return (await base.listPlans({ actorId: query.actorId, includeCancelled: true }))
        .filter(plan => plan.ownerUserId === query.actorId && plan.accountId === query.actorId && plan.id.startsWith(query.prefix) &&
          (!query.keepRevisionPrefix || !plan.id.startsWith(query.keepRevisionPrefix)) && plan.id > (query.afterId ?? '') &&
          plan.status === 'scheduled' && Date.parse(plan.fireAt) >= Date.parse(query.now))
        .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).slice(0, SCHEDULE_REMINDER_PAGE_SIZE);
    },
  };
}
