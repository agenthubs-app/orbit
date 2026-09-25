import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from '../../shared/storage/transactional-postgres';
import { createPostgresLiveRecordStore } from '../../shared/storage/postgres-live-record-store';
import { personalScheduleSchema } from '../../shared/api-schema/personal-schedule';
import { localParts } from '../tasks/local-date-time';
import { canonicalScheduleItemSchema } from './authority-contract';

const collection = 'scheduleWindowBackfill';
const key = z.string().min(1).max(2048).refine(value => value === value.trim() && !value.includes('\0'));
const instant = z.string().datetime({ offset: true });
const progressSchema = z.object({ version: z.literal(1), actorId: key, batchId: key, cutoff: instant,
  afterId: key.nullable(), done: z.boolean(), processed: z.number().int().nonnegative().safe(),
  registered: z.number().int().nonnegative().safe(), skipped: z.number().int().nonnegative().safe(),
}).strict().superRefine((value, ctx) => {
  if (value.processed !== value.registered + value.skipped || (value.processed === 0) !== (value.afterId === null)) {
    ctx.addIssue({ code: 'custom', message: 'Invalid schedule backfill progress' });
  }
});
export type ScheduleWindowBackfillProgress = z.infer<typeof progressSchema>;

/** Explicit migration, never called by a GET or the maintenance loop. The
 * checkpoint and missing-window registration commit together. A registration
 * means "inspect this series now", NOT "its future horizon is already covered".
 * Existing windows (including failed ones) are never reset by this migration. */
export async function runScheduleReminderWindowBootstrapPass(input: {
  client: TransactionalPostgresClient; workspaceId: string; actorId: string; batchId: string; cutoff: string;
  writersReady: boolean; now?: () => string; limit?: number; budgetMs?: number;
}) {
  const { workspaceId, actorId, batchId, cutoff } = input;
  [workspaceId, actorId, batchId].forEach(value => key.parse(value)); instant.parse(cutoff);
  const now = input.now ?? (() => new Date().toISOString()), limit = input.limit ?? 10, budget = input.budgetMs ?? 5000;
  instant.parse(now());
  if (input.writersReady !== true || Date.parse(cutoff) > Date.parse(now()) || !Number.isSafeInteger(limit) || limit < 1 || limit > 25
    || !Number.isSafeInteger(budget) || budget < 1 || budget > 10000) throw Error('SCHEDULE_BACKFILL_INPUT_INVALID');
  const recordId = createHash('sha256').update(JSON.stringify([workspaceId, actorId, batchId])).digest('hex');
  const expires = performance.now() + budget;
  let advanced = 0, progress: ScheduleWindowBackfillProgress | null = null;
  while (advanced < limit && performance.now() < expires) {
    let next: ScheduleWindowBackfillProgress;
    for (let attempt = 0; ; attempt++) {
      try {
        next = await input.client.transaction(async executor => {
          await executor.query("set local lock_timeout='1s'");
          await executor.query("set local idle_in_transaction_session_timeout='5s'");
          const tx: TransactionalSqlExecutor = { async query<T>(sql: string, values?: readonly unknown[]) {
            const remaining = Math.floor(expires - performance.now());
            if (remaining < 1) throw Error('SCHEDULE_BACKFILL_BUDGET_EXHAUSTED');
            await executor.query("select set_config('statement_timeout',$1,true)", [String(Math.min(5000, remaining))]);
            return executor.query<T>(sql, values);
          } };
          // Same actor -> authority/window order as a normal schedule mutation.
          await tx.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify(['personal-schedule', workspaceId, actorId])]);
          const store = createPostgresLiveRecordStore({ client: tx });
          const saved = await store.getRecord({ workspaceId, collectionName: collection, recordId });
          if (saved && (saved.userId !== actorId || saved.lifecycleState !== 'active')) throw Error('SCHEDULE_BACKFILL_PROGRESS_INVALID');
          const current = saved ? progressSchema.parse(saved.payload) : progressSchema.parse({ version: 1, actorId, batchId, cutoff, afterId: null, done: false, processed: 0, registered: 0, skipped: 0 });
          if (current.actorId !== actorId || current.batchId !== batchId || current.cutoff !== cutoff) throw Error('SCHEDULE_BACKFILL_PROGRESS_CONFLICT');
          if (current.done) return current;
          const candidates = await tx.query<{ record_id: string }>(`select record_id from orbit_records
            where workspace_id=$1 and collection_name='personal_schedule_items' and user_id=$2 and created_at<=$3::timestamptz
              and ($4::text is null or record_id collate "C">$4 collate "C") order by record_id collate "C" limit 1`,
          [workspaceId, actorId, cutoff, current.afterId]);
          const candidate = candidates.rows[0];
          let updated = { ...current, done: !candidate };
          const at = instant.parse(now());
          if (candidate) {
            const sourceId = key.parse(candidate.record_id);
            // Lock and re-read current authority, not the earlier scan payload.
            // Oversized/corrupt sources fail closed without downloading a body.
            const source = await tx.query<{ lifecycle_state: string; payload: unknown }>(`select lifecycle_state,
              case when octet_length(payload::text)<=65536 then payload else null end as payload
              from orbit_records where workspace_id=$1 and collection_name='personal_schedule_items' and record_id=$2 and user_id=$3 for update`,
            [workspaceId, sourceId, actorId]);
            let registered = 0;
            const row = source.rows[0];
            if (row && row.lifecycle_state !== 'deleted') {
              const kind = z.object({ kind: z.string() }).parse(row.payload).kind;
              const item = kind === 'personal' ? personalScheduleSchema.parse(row.payload) : canonicalScheduleItemSchema.parse(row.payload);
              if (item.id !== sourceId || item.ownerUserId !== actorId || item.accountId !== actorId) throw Error('SCHEDULE_BACKFILL_SOURCE_INVALID');
              if (item.kind === 'personal' && item.sourceId === item.id && item.recurrence && item.reminderMinutes !== undefined) {
                if (!item.timeZone) throw Error('SCHEDULE_BACKFILL_SOURCE_INVALID');
                const active = item.state !== 'cancelled' && (!item.recurrence.until || localParts(at, item.timeZone).date <= item.recurrence.until);
                const inserted = await tx.query(`insert into orbit_schedule_reminder_windows
                  (workspace_id,actor_id,series_id,source_revision,state,horizon_through,next_refresh_at,updated_at)
                  values($1,$2,$3,$4,$5,$6,$6,$6) on conflict(workspace_id,actor_id,series_id) do nothing returning series_id`,
                [workspaceId, actorId, sourceId, item.updatedAt, active ? 'active' : 'inactive', at]);
                registered = inserted.rows.length;
              }
            }
            updated = { ...current, afterId: sourceId, done: false, processed: current.processed + 1,
              registered: current.registered + registered, skipped: current.skipped + 1 - registered };
          }
          await store.upsertRecord({ workspaceId, collectionName: collection, recordId, userId: actorId, sourceType: 'system', sourceId: recordId,
            evidenceIds: [], lifecycleState: 'active', createdAt: saved?.createdAt ?? at, updatedAt: at, payload: updated });
          return updated;
        });
        break;
      } catch (error) {
        if (attempt >= 2 || performance.now() >= expires || !['40001', '40P01'].includes(String((error as { code?: string })?.code))) throw error;
      }
    }
    progress = next;
    if (next.done) break;
    advanced++;
  }
  return { advanced, progress, deferred: progress?.done !== true && advanced < limit };
}
