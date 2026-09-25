import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from '../../shared/storage/transactional-postgres';
import { createPostgresLiveRecordStore } from '../../shared/storage/postgres-live-record-store';
import { ORBIT_RECORDS_SCHEMA_SQL } from '../../shared/storage/migrations';
import { createConfiguredReminderPlanService } from '../../features/notifications/reminder-plan-service-factory';
import { createInboxProjectionWorkRepository, INBOX_PROJECTION_WORK_SCHEMA_SQL } from '../../features/notifications/storage/inbox-projection-work';
import { runInboxProjectionPass } from '../../features/notifications/inbox-projection-worker';
import { reminderPlanNotification } from '../../features/notifications/inbox-business-projections';
import { createInboxRuntime } from '../../features/notifications/inbox-record-service-factory';
import { createReminderPlanRepository } from '../../features/notifications/reminder-plan-repository';
import { canonicalInboxProjectionRevision } from '../../features/notifications/canonical-inbox-projection-revision';
import { canonicalReminderWakeId, claimCanonicalReminderWakes, processCanonicalReminderWakeMessage } from '../../features/notifications/canonical-reminder-wake';
import { createCanonicalReminderCommandService } from '../../features/notifications/canonical-reminder-command-transaction';

const url = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL, at = '2026-09-25T00:00:00.000Z';

test('snooze reads one plan and enqueues atomically without a work/inbox lock inversion', { skip: !url, timeout: 30000 }, async () => {
  assert.ok(url); const address = new URL(url);
  assert.ok(['localhost', '127.0.0.1'].includes(address.hostname)); assert.equal(address.search, '');
  const schema = 'inbox_snooze_' + randomUUID().replaceAll('-', '');
  const pool = new Pool({ connectionString: url, max: 4, options: `-c search_path=${schema} -c statement_timeout=5000 -c lock_timeout=1000` });
  const client = createTransactionalPostgresClient({ connectionString: url, pool });
  let clock = at; const now = () => clock, workspaceId = 'w';
  const store = createPostgresLiveRecordStore({ client });
  const work = createInboxProjectionWorkRepository({ client, workspaceId, now });
  const runtime = { client, workspaceId, now, inboxProjection: work };
  const service = createConfiguredReminderPlanService({ runtime, env: { ORBIT_CANONICAL_INBOX_PROJECTION: '1' }, publisher: { publish: async () => {} } });
  const inbox = createInboxRuntime(runtime);
  let running: ReturnType<typeof runInboxProjectionPass> | undefined;
  try {
    await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL); await pool.query(INBOX_PROJECTION_WORK_SCHEMA_SQL);
    await store.upsertRecord({ workspaceId, collectionName: 'tasks', recordId: 'task:a', userId: 'a', sourceType: 'manual', sourceId: 'task:a', evidenceIds: [], lifecycleState: 'active', createdAt: at, updatedAt: at, payload: { version: 1, task: { id: 'task:a', accountId: 'a', ownerUserId: 'a', title: 'Task', status: 'open', category: 'work', priority: 'normal', source: 'manual', createdAt: at, updatedAt: at }, activities: [] } });
    const plan = await service.create({ actorId: 'a', targetType: 'task', targetId: 'task:a', fireAt: at, timeZone: 'UTC', channels: ['in_app'], title: 'Reminder', body: 'Body', deepLink: '/app/tasks/task:a', createdBy: 'user', idempotencyKey: 'create' });
    // Materialized already by the compatibility reader, while new work waits.
    const notification = await inbox.service.upsert(reminderPlanNotification(plan, clock)!);
    let reached!: () => void, claimed!: () => void, held!: () => void;
    const waitingForInbox = new Promise<void>(resolve => { reached = resolve; });
    const claimCommitted = new Promise<void>(resolve => { claimed = resolve; });
    const inboxHeld = new Promise<void>(resolve => { held = resolve; });
    let claimedOnce = false, heldOnce = false;
    const isInboxLock = (sql: string, values?: readonly unknown[]) => sql.includes('pg_advisory_xact_lock') && values?.includes(JSON.stringify([workspaceId, 'inboxNotifications', 'a']));
    const workerClient: TransactionalPostgresClient = { ...client, transaction: async operation => {
      let claimTransaction = false;
      const result = await client.transaction(tx => operation({ query: async (sql, values) => {
        if (sql.includes('with candidates as')) claimTransaction = true;
        if (isInboxLock(sql, values)) reached();
        return tx.query(sql, values);
      } }));
      // Commit claim BEFORE the action's snapshot; never emulate a nested
      // transaction whose serialization retry would reuse an aborted client.
      if (claimTransaction && !claimedOnce) { claimedOnce = true; claimed(); await inboxHeld; }
      return result;
    } };
    const scheduledFor = '2026-09-25T01:00:00.000Z';
    running = runInboxProjectionPass({ client: workerClient, workspaceId, now, enabled: true });
    await claimCommitted;
    const actionClient: TransactionalPostgresClient = { ...client, transaction: operation => client.transaction(tx => operation({ query: async <TRow>(sql:string, values?:readonly unknown[]) => {
        if (/^\s*select/i.test(sql) && values?.includes('reminderPlans') && !/record_id\s*=\s*\$/i.test(sql)) throw Error('Unbounded reminder list in snooze');
        const result = await tx.query<TRow>(sql, values);
        if (isInboxLock(sql, values) && !heldOnce) { heldOnce = true; held(); await waitingForInbox; }
        return result;
    } })) };
    const actionRuntime = { ...runtime, client: actionClient };
    const receipt = await createInboxRuntime(actionRuntime).service.action('a', notification.id, { action: 'snooze', scheduledFor, expectedRevision: notification.revision, idempotencyKey: 'later' });
    assert.equal(receipt.notification.scheduledFor, scheduledFor);
    const current = await createReminderPlanRepository({ store, workspaceId }).getPlan('a', plan.id);
    const queued = await client.query<{ source_revision: string; available_at: Date; generation: string }>('select source_revision,available_at,generation::text from orbit_inbox_projection_work');
    assert.equal(queued.rows[0]?.source_revision, canonicalInboxProjectionRevision(current!));
    assert.equal(queued.rows[0]?.available_at.toISOString(), scheduledFor);
    assert.equal(queued.rows[0]?.generation, '2');
    const wake = await store.getRecord({workspaceId,collectionName:'canonical_reminder_wakes',recordId:canonicalReminderWakeId(plan.id)});
    assert.equal(wake?.payload.fireAt, scheduledFor, 'snooze must update the authoritative due intent as well as the notification');
    assert.equal(wake?.payload.generation, 2);
    const staleResult = await running;
    assert.equal(staleResult?.projectionCompleted, 0, 'old worker must never overwrite the snoozed notification');
    assert.equal(staleResult?.projectionFailed, 0, 'lock inversion is not an acceptable retry failure');
    assert.equal((await runInboxProjectionPass({ ...runtime, enabled: true })).projectionClaimed, 0);
    const currentNotification = await inbox.service.get('a', notification.id);
    assert.equal(currentNotification.scheduledFor, scheduledFor);
    assert.equal(currentNotification.revision, notification.revision + 1);
    // Replaying the same action does not enqueue another generation.
    await inbox.service.action('a', notification.id, { action: 'snooze', scheduledFor, expectedRevision: notification.revision, idempotencyKey: 'later' });
    assert.equal((await pool.query('select generation::text from orbit_inbox_projection_work')).rows[0].generation, '2');
    clock = scheduledFor;
    assert.equal((await runInboxProjectionPass({ ...runtime, enabled: true })).projectionCompleted, 1);
    assert.equal((await store.listRecords({ workspaceId, collectionName: 'inboxNotifications', limit: 'unbounded' })).length, 1);
    assert.equal((await inbox.service.get('a', notification.id)).scheduledFor, scheduledFor);
    const before = await inbox.service.get('a', notification.id), next = '2026-09-25T02:00:00.000Z';
    const faulty = createInboxRuntime({ ...runtime, inboxProjection: { async enqueue(tx, source, options) {
      await work.enqueue(tx, source, options); throw Error('work failed');
    } } });
    const request = { action: 'snooze' as const, scheduledFor: next, expectedRevision: before.revision, idempotencyKey: 'retry-failed-action' };
    await assert.rejects(faulty.service.action('a', notification.id, request), /work failed/);
    assert.deepEqual(await inbox.service.get('a', notification.id), before);
    assert.equal((await createReminderPlanRepository({ store, workspaceId }).getPlan('a', plan.id))?.fireAt, scheduledFor);
    assert.equal((await pool.query('select generation::text from orbit_inbox_projection_work')).rows[0].generation, '2');
    await inbox.service.action('a', notification.id, request);
    assert.equal((await pool.query('select generation::text from orbit_inbox_projection_work')).rows[0].generation, '3');
    clock=next;
    const due=await claimCanonicalReminderWakes({runtime,workerId:'snooze-test',now:clock});
    assert.equal(due.messages.length,1);
    assert.equal((await processCanonicalReminderWakeMessage(due.messages[0]!,runtime)).outcome,'delivered');
    assert.equal((await runInboxProjectionPass({...runtime,enabled:true})).projectionCompleted,1);
    assert.equal((await inbox.service.get('a',notification.id)).scheduledFor,next);
    // Enlisting must neither retry an aborted transaction nor publish a hint
    // before its owner's commit. Every write rolls back with that owner.
    const stable = await createReminderPlanRepository({store,workspaceId}).getPlan('a',plan.id);
    let escaped = 0, sent = 0;
    const noEscape:TransactionalPostgresClient={...client,
      query:async()=>{escaped++;throw Error('escaped query');},
      transaction:async()=>{escaped++;throw Error('nested transaction');},
    };
    await assert.rejects(client.transaction(async executor=>{
      const enlisted=createCanonicalReminderCommandService({runtime:{...runtime,client:noEscape,executor,publisher:{publish:async()=>{sent++;}}}});
      await enlisted.reschedule({actorId:'a',reminderId:plan.id,fireAt:'2026-09-25T02:00:10.000Z',timeZone:'UTC',expectedUpdatedAt:stable!.updatedAt,idempotencyKey:'outer-rollback'});
      throw Error('outer rollback');
    }),/outer rollback/);
    assert.deepEqual(await createReminderPlanRepository({store,workspaceId}).getPlan('a',plan.id),stable);
    assert.equal(escaped,0);assert.equal(sent,0);
    let attempts=0;
    await assert.rejects(client.transaction(async tx=>{
      const enlisted=createCanonicalReminderCommandService({runtime:{...runtime,client:noEscape,executor:{query:async(sql,values)=>{
        if(sql.includes('pg_advisory_xact_lock')){attempts++;throw Object.assign(Error('retry owner'),{code:'40001'});}
        return tx.query(sql,values);
      }}}});
      await enlisted.cancel({actorId:'a',reminderId:plan.id,idempotencyKey:'outer-retry'});
    }),error=>(error as {code?:string}).code==='40001');
    assert.equal(attempts,1);assert.equal(escaped,0);
  } finally {
    await running?.catch(() => {});
    await pool.query(`drop schema if exists ${schema} cascade`); await client.close();
  }
});
