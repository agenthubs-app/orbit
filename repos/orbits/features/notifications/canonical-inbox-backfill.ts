import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from '../../shared/storage/transactional-postgres';
import { createPostgresLiveRecordStore } from '../../shared/storage/postgres-live-record-store';
import { canonicalReminderActorLockKey, readCanonicalReminderProjectionCandidate } from './canonical-reminder-wake';
import { canonicalInboxProjectionRevision } from './canonical-inbox-projection-revision';
import { createInboxProjectionWorkRepository } from './storage/inbox-projection-work';
import { createPostgresInboxRecordTransaction } from './storage/inbox-record-repository';
import { inboxNotificationId } from './inbox-record-service';
import { deliveryPolicyId, recordHistoricalNotificationSuppression } from './delivery-policy-repository';

const COLLECTION = 'notificationProjectionBackfill';
const key = z.string().min(1).max(2048).refine(value => value === value.trim() && !value.includes('\0'));
const instant = z.string().refine(value => Number.isFinite(Date.parse(value)));
const progressSchema = z.object({ version: z.literal(1), actorId: key, batchId: key, cutoff: instant,
  afterId: key.nullable(), done: z.boolean(), processed: z.number().int().nonnegative().safe(),
  enqueued: z.number().int().nonnegative().safe(), suppressed: z.number().int().nonnegative().safe(), skipped: z.number().int().nonnegative().safe(),
}).strict().superRefine((value, ctx) => {
  if (value.processed !== value.enqueued + value.skipped || value.suppressed > value.enqueued
    || (value.processed === 0) !== (value.afterId === null)) ctx.addIssue({ code: 'custom', message: 'Invalid backfill progress' });
});
export type CanonicalInboxBackfillProgress = z.infer<typeof progressSchema>;

/** Explicit operator-invoked migration only; no request or scheduler calls this.
 * New/old writers must be reconciled before acknowledging writersReady. Each
 * authority source, historical push fence, work item and checkpoint share one
 * transaction. Failures leave the last completed source resumable. */
export async function runCanonicalInboxBackfillPass(input: {
  client: TransactionalPostgresClient; workspaceId: string; actorId: string; batchId: string; cutoff: string;
  writersReady: boolean; limit?: number; budgetMs?: number; now?: () => string;
}) {
  const { workspaceId, actorId, batchId, cutoff } = input;
  [workspaceId, actorId, batchId].forEach(value => key.parse(value)); instant.parse(cutoff);
  const limit = input.limit ?? 10, budget = input.budgetMs ?? 5000, now = input.now ?? (() => new Date().toISOString());
  if (input.writersReady !== true || !Number.isSafeInteger(limit) || limit < 1 || limit > 25 || !Number.isSafeInteger(budget) || budget < 1 || budget > 10000
    || !Number.isFinite(Date.parse(now())) || Date.parse(cutoff) > Date.parse(now())) throw Error('CANONICAL_BACKFILL_INPUT_INVALID');
  const expires = performance.now() + budget, recordId = deliveryPolicyId('canonical-reminder', actorId, batchId);
  const work = createInboxProjectionWorkRepository({ client: input.client, workspaceId, now });
  let advanced = 0, progress: CanonicalInboxBackfillProgress | null = null;
  while (advanced < limit && performance.now() < expires) {
    let next: CanonicalInboxBackfillProgress;
    for (let attempt = 0; ; attempt++) {
      try {
        next = await input.client.transaction(async executor => {
          await executor.query("set local lock_timeout='1s'");
          await executor.query("set local idle_in_transaction_session_timeout='5s'");
          const tx: TransactionalSqlExecutor = { async query<TRow>(sql: string, values?: readonly unknown[]) {
            const remaining = Math.floor(expires - performance.now());
            if (remaining < 1) throw Error('CANONICAL_BACKFILL_BUDGET_EXHAUSTED');
            await executor.query("select set_config('statement_timeout',$1,true)", [String(Math.min(5000, remaining))]);
            return executor.query<TRow>(sql, values);
          } };
          // Policy -> inbox -> reminder actor -> authority row -> work. All
          // other producers retain their current (non-reversed) lock order.
          await tx.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify(['notification-delivery-policy', workspaceId, actorId])]);
          const store = createPostgresLiveRecordStore({ client: tx });
          const saved = await store.getRecord({ workspaceId, collectionName: COLLECTION, recordId });
          if (saved && (saved.userId !== actorId || saved.lifecycleState !== 'active')) throw Error('CANONICAL_BACKFILL_PROGRESS_INVALID');
          const current = saved ? progressSchema.parse(saved.payload) : progressSchema.parse({ version: 1, actorId, batchId, cutoff, afterId: null, done: false, processed: 0, enqueued: 0, suppressed: 0, skipped: 0 });
          if (current.actorId !== actorId || current.batchId !== batchId || current.cutoff !== cutoff) throw Error('CANONICAL_BACKFILL_PROGRESS_CONFLICT');
          if (current.done) return current;
          const candidates = await tx.query<{ record_id: string }>(`select record_id from orbit_records
            where workspace_id=$1 and collection_name='reminderPlans' and user_id=$2 and created_at<=$3::timestamptz
              and ($4::text is null or record_id collate "C">$4 collate "C") order by record_id collate "C" limit 1`, [workspaceId, actorId, cutoff, current.afterId]);
          const candidate = candidates.rows[0];
          let updated = { ...current, done: !candidate };
          if (candidate) {
            const sourceId = key.parse(candidate.record_id);
            const inbox = await createPostgresInboxRecordTransaction({ executor: tx, workspaceId, actorId });
            await tx.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [canonicalReminderActorLockKey(workspaceId, actorId)]);
            await tx.query("select record_id from orbit_records where workspace_id=$1 and collection_name='reminderPlans' and record_id=$2 and user_id=$3 for update", [workspaceId, sourceId, actorId]);
            const plan = await readCanonicalReminderProjectionCandidate(tx, workspaceId, { actorId, sourceId });
            let suppressed = 0;
            if (plan) {
              const notificationId = inboxNotificationId(actorId, 'reminder-plan:' + plan.id);
              const existing = await inbox.get(notificationId);
              // Don't reinterpret an already-visible event as a newly created
              // historical notice. Unseen past events get their push fence
              // before any projection worker can publish them.
              if (Date.parse(plan.fireAt) <= Date.parse(cutoff)
                && (!existing || (existing.notification.scheduledFor ?? existing.notification.occurredAt) !== plan.fireAt)) {
                await recordHistoricalNotificationSuppression({ executor: tx, workspaceId, actorId, notificationId, scheduledFor: plan.fireAt, cutoff, now: now(), batchId });
                suppressed = 1;
              }
              await work.enqueue(tx, { actorId, sourceKind: 'canonical_reminder', sourceId, sourceRevision: canonicalInboxProjectionRevision(plan) }, { availableAt: plan.fireAt });
            }
            updated = { ...current, afterId: sourceId, done: false, processed: current.processed + 1, enqueued: current.enqueued + Number(Boolean(plan)),
              suppressed: current.suppressed + suppressed, skipped: current.skipped + Number(!plan) };
          }
          const at = now();
          await store.upsertRecord({ workspaceId, collectionName: COLLECTION, recordId, userId: actorId, sourceType: 'system', sourceId: recordId, evidenceIds: [], lifecycleState: 'active',
            createdAt: saved?.createdAt ?? at, updatedAt: at, payload: updated });
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
