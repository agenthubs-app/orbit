import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createConfiguredTransactionalPostgresRuntime, createTransactionalPostgresClient, type TransactionalPostgresClient } from '../../shared/storage/transactional-postgres';
import { createPostgresLiveRecordStore } from '../../shared/storage/postgres-live-record-store';
import { ORBIT_RECORDS_SCHEMA_SQL } from '../../shared/storage/migrations';
import { INBOX_PROJECTION_WORK_SCHEMA_SQL } from '../../features/notifications/storage/inbox-projection-work';
import { createConfiguredPersonalScheduleService } from '../../features/personal-schedule/service-factory';
import { createConfiguredReminderPlanService } from '../../features/notifications/reminder-plan-service-factory';
import { createReminderPlanRepository } from '../../features/notifications/reminder-plan-repository';
import { createNotificationInteractionService } from '../../features/notifications/interaction-service';
import { inboxNotificationId } from '../../features/notifications/inbox-record-service';
import { runScheduleReminderWindowBootstrapPass } from '../../features/personal-schedule/reminder-window-backfill';
import { runCanonicalInboxBackfillPass } from '../../features/notifications/canonical-inbox-backfill';
import { createConfiguredMaintenanceTasks } from '../../features/operations/maintenance/configured-tasks';
import { createInboxRuntime } from '../../features/notifications/inbox-record-service-factory';
import { createInboxNotificationHandler } from '../../app/api/inbox/notifications/handler';
import { createTypedDeliveryRuntime } from '../../features/notifications/typed-delivery-factory';

const url = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const day = 86_400_000;
type TrackedQuery = { sql: string; values?: readonly unknown[] };

function track(client: TransactionalPostgresClient) {
  const queries: TrackedQuery[] = [];
  const record = (sql: string, values?: readonly unknown[]) => queries.push({ sql, values });
  const observed: TransactionalPostgresClient = {
    async query<T>(sql: string, values?: readonly unknown[]) { record(sql, values); return client.query<T>(sql, values); },
    async transaction<T>(operation) {
      return client.transaction(tx => operation({
        async query<TRow>(sql: string, values?: readonly unknown[]) { record(sql, values); return tx.query<TRow>(sql, values); },
      }));
    },
    close: () => client.close(),
  };
  return { client: observed, queries };
}

function saveEnvironment(keys: readonly string[]) {
  const original = new Map(keys.map(key => [key, process.env[key]]));
  return () => { for (const [key, value] of original) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };
}

test('legacy reminder states migrate through backfill and workers; inbox reads do not scan reminderPlans', { skip: !url, timeout: 60000 }, async () => {
  assert.ok(url);
  const address = new URL(url);
  assert.ok(['localhost', '127.0.0.1'].includes(address.hostname), 'the migration exercise is local-only');
  assert.equal(address.search, '', 'use the dedicated local test database URL without inherited query parameters');

  const schema = 'schedule_refresh_cutover_' + randomUUID().replaceAll('-', '');
  const pool = new Pool({ connectionString: url, max: 3, options: `-c search_path=${schema} -c statement_timeout=5000 -c lock_timeout=1000` });
  const baseClient = createTransactionalPostgresClient({ connectionString: url, pool });
  const keys = ['ORBIT_DATABASE_TARGET', 'ORBIT_LOCAL_DATABASE_URL', 'ORBIT_LOCAL_WORKSPACE_ID', 'ORBIT_CANONICAL_INBOX_PROJECTION', 'ORBIT_TYPED_INBOX_SINCE'];
  const restoreEnvironment = saveEnvironment(keys);
  const workspaceId = 'schedule-refresh-cutover-workspace', actorId = 'schedule-refresh-cutover-actor';
  const runtimeClients = new Set<TransactionalPostgresClient>();
  const t0 = new Date();
  const start = new Date(Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth() + 1, 2, 9, 0, 0, 0));
  const targetStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 2, 9, 0, 0, 0));
  const targetDate = targetStart.toISOString().slice(0, 10);
  const targetFireAt = new Date(targetStart.getTime() - 15 * 60_000).toISOString();
  const cutoff = new Date(t0.getTime() + 65 * day).toISOString();
  const scopedDatabaseUrl = new URL(url);
  scopedDatabaseUrl.searchParams.set('options', `-c search_path=${schema}`);
  process.env.ORBIT_DATABASE_TARGET = 'local';
  process.env.ORBIT_LOCAL_DATABASE_URL = scopedDatabaseUrl.toString();
  process.env.ORBIT_LOCAL_WORKSPACE_ID = workspaceId;
  process.env.ORBIT_CANONICAL_INBOX_PROJECTION = '0';
  delete process.env.ORBIT_TYPED_INBOX_SINCE;

  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await pool.query(INBOX_PROJECTION_WORK_SCHEMA_SQL);
    const runtime = createConfiguredTransactionalPostgresRuntime({ env: process.env });
    assert.ok(runtime);
    runtimeClients.add(runtime.client);
    assert.equal(runtime.workspaceId, workspaceId);
    assert.equal((await runtime.client.query<{ current_schema: string }>('select current_schema()')).rows[0]?.current_schema, schema);
    const maintenanceRuntime = createConfiguredTransactionalPostgresRuntime({ env: process.env, max: 2 });
    assert.ok(maintenanceRuntime);
    runtimeClients.add(maintenanceRuntime.client);

    // A schedule written by the old configuration has plans, but neither a
    // refresh window nor canonical inbox work. This is the state the two
    // existing resumable backfills have to close before the old GET scan goes.
    const legacy = createConfiguredPersonalScheduleService();
    const { scheduleItem: oldSeries } = await legacy.create(actorId, {
      title: 'Legacy monthly reminder', startsAt: start.toISOString(), timeZone: 'UTC', reminderMinutes: 15,
      recurrence: { frequency: 'monthly' }, idempotencyKey: 'legacy-monthly',
    });
    const legacyReminders = createConfiguredReminderPlanService({
      runtime: { client: runtime.client, workspaceId, now: () => t0.toISOString(), publisher: { publish: async () => {} } },
      env: { ORBIT_CANONICAL_INBOX_PROJECTION: '0' },
    });
    const planRepository = createReminderPlanRepository({ store: createPostgresLiveRecordStore({ client: runtime.client }), workspaceId });
    const manualPlans = new Map<string, Awaited<ReturnType<typeof legacyReminders.create>>>();
    for (const scenario of [
      { key: 'scheduled-due', status: 'scheduled' as const, fireAt: new Date(t0.getTime() - 60_000).toISOString() },
      { key: 'scheduled-future', status: 'scheduled' as const, fireAt: new Date(Date.parse(targetFireAt) + day).toISOString() },
      { key: 'failed', status: 'failed' as const, fireAt: new Date(t0.getTime() - 120_000).toISOString() },
      { key: 'delivered', status: 'delivered' as const, fireAt: new Date(t0.getTime() - 180_000).toISOString() },
      { key: 'cancelled', status: 'cancelled' as const, fireAt: new Date(t0.getTime() - 240_000).toISOString() },
    ]) {
      const created = await legacyReminders.create({ actorId, targetType: 'schedule_item', targetId: oldSeries.id,
        fireAt: scenario.fireAt, timeZone: 'UTC', channels: ['ios_push'], title: `Legacy ${scenario.key}`, body: `Legacy ${scenario.key} body`,
        deepLink: `/schedule/personal/${encodeURIComponent(oldSeries.id)}`, createdBy: 'user', idempotencyKey: `legacy-${scenario.key}` });
      const plan = scenario.status === 'scheduled' ? created : {
        ...created, status: scenario.status,
        ...(scenario.status === 'failed' ? { failureCode: 'LEGACY_DELIVERY_FAILED' } : {}),
        ...(scenario.status === 'delivered' ? { deliveredAt: t0.toISOString() } : {}),
        ...(scenario.status === 'cancelled' ? { cancelledAt: t0.toISOString() } : {}),
      };
      if (scenario.status !== 'scheduled') await planRepository.savePlan(plan);
      manualPlans.set(scenario.key, plan);
    }
    const interactions = createNotificationInteractionService({ store: createPostgresLiveRecordStore({ client: runtime.client }), workspaceId, now: () => cutoff });
    await interactions.set({ actorId, notificationId: manualPlans.get('scheduled-due')!.id, state: 'read' });
    await interactions.set({ actorId, notificationId: manualPlans.get('failed')!.id, state: 'ignored' });
    const beforePlans = await runtime.client.query<{ record_id: string; target_id: string }>(`select record_id,payload->'entity'->>'targetId' as target_id from orbit_records
      where workspace_id=$1 and user_id=$2 and collection_name='reminderPlans' and record_id like 'schedule-reminder:%' order by record_id`, [workspaceId, actorId]);
    assert.ok(beforePlans.rows.length > 0);
    assert.equal(beforePlans.rows.some(row => row.target_id === `${oldSeries.id}:occurrence:${targetDate}`), false, 'the selected occurrence is beyond the legacy 90-day generation horizon');
    assert.equal((await runtime.client.query('select series_id from orbit_schedule_reminder_windows where workspace_id=$1 and actor_id=$2', [workspaceId, actorId])).rows.length, 0);
    assert.equal((await runtime.client.query('select source_id from orbit_inbox_projection_work where workspace_id=$1 and actor_id=$2', [workspaceId, actorId])).rows.length, 0);

    // The flag turns on the actual configured schedule writer. Backfills run
    // against their existing checkpoints; no GET/request invokes either pass.
    process.env.ORBIT_CANONICAL_INBOX_PROJECTION = '1';
    const backfillOptions = { client: runtime.client, workspaceId, actorId, cutoff, writersReady: true, now: () => cutoff, limit: 25 };
    const windowBackfill = await runScheduleReminderWindowBootstrapPass({ ...backfillOptions, batchId: 'schedule-window-cutover-v1' });
    assert.equal(windowBackfill.progress?.done, true);
    const planBackfill = await runCanonicalInboxBackfillPass({ ...backfillOptions, batchId: 'canonical-reminder-cutover-v1' });
    assert.equal(planBackfill.progress?.done, true);
    const manualIds = [...manualPlans.values()].map(plan => plan.id);
    const queuedLegacy = await runtime.client.query<{ source_id: string; source_revision: string; state: string; available_at: Date }>(`select source_id,source_revision,state,available_at from orbit_inbox_projection_work
      where workspace_id=$1 and actor_id=$2 and source_id=any($3::text[]) order by source_id`, [workspaceId, actorId, manualIds]);
    assert.equal(queuedLegacy.rows.length, 4, 'backfill enqueues every non-cancelled legacy status, including future plans');
    const queuedById = new Map(queuedLegacy.rows.map(row => [row.source_id, row]));
    for (const key of ['scheduled-due', 'scheduled-future', 'failed', 'delivered'] as const) {
      const plan = manualPlans.get(key)!;
      assert.equal(queuedById.get(plan.id)?.state, 'pending');
      assert.equal(queuedById.get(plan.id)?.available_at.toISOString(), plan.fireAt);
    }
    assert.equal(queuedById.has(manualPlans.get('cancelled')!.id), false, 'cancelled authority facts are not projected');
    assert.equal((await runtime.client.query('select series_id from orbit_schedule_reminder_windows where workspace_id=$1 and actor_id=$2 and series_id=$3', [workspaceId, actorId, oldSeries.id])).rows.length, 1);

    // A post-backfill schedule write through the real configured factory must
    // atomically create both its window and projection work; the maintenance
    // task below is the same task registered in createConfiguredMaintenanceTasks.
    const current = createConfiguredPersonalScheduleService();
    const newStartsAt = new Date(t0.getTime() + 70 * day);
    const { scheduleItem: newSeries } = await current.create(actorId, {
      title: 'Writer-enabled monthly reminder', startsAt: newStartsAt.toISOString(), timeZone: 'UTC', reminderMinutes: 15,
      recurrence: { frequency: 'monthly' }, idempotencyKey: 'writer-enabled-monthly',
    });
    assert.equal((await runtime.client.query('select series_id from orbit_schedule_reminder_windows where workspace_id=$1 and actor_id=$2 and series_id=$3', [workspaceId, actorId, newSeries.id])).rows.length, 1);
    assert.ok((await runtime.client.query("select source_id from orbit_inbox_projection_work where workspace_id=$1 and actor_id=$2 and source_kind='canonical_reminder' and source_id like 'schedule-reminder:%'", [workspaceId, actorId])).rows.length > 0);

    const tasks = createConfiguredMaintenanceTasks({ env: process.env, workerId: 'schedule-cutover-local-test' });
    const reminderTask = tasks.find(task => task.name === 'canonical_reminder_dispatch');
    assert.ok(reminderTask, 'canonical_reminder_dispatch must be present in the production maintenance task list');
    const runReminderTask = (at: string) => reminderTask.run({ now: () => new Date(at), deadline: Date.parse(at) + 60_000 });
    const atCutover = await runReminderTask(cutoff);
    assert.ok('windowExtended' in atCutover && atCutover.windowExtended > 0, 'the due window worker, not a GET, extends old and current series');
    const projectedInbox = createInboxRuntime({ client: runtime.client, workspaceId, now: () => cutoff });
    const getLegacyNotification = (key: string) => projectedInbox.service.get(actorId, inboxNotificationId(actorId, `reminder-plan:${manualPlans.get(key)!.id}`));
    const duePlan = manualPlans.get('scheduled-due')!;
    const dueNotification = await getLegacyNotification('scheduled-due');
    assert.equal(dueNotification.readAt, cutoff, 'legacy read interaction is applied on first projection');
    assert.equal(dueNotification.disposition, 'open');
    assert.equal((await getLegacyNotification('failed')).disposition, 'dismissed', 'legacy ignored interaction becomes dismissed');
    assert.equal((await getLegacyNotification('delivered')).title, 'Legacy delivered');
    await assert.rejects(getLegacyNotification('scheduled-future'), /Notification not found/, 'a future plan stays out of the inbox before its fire time');
    await assert.rejects(getLegacyNotification('cancelled'), /Notification not found/, 'a cancelled plan does not appear in inbox history');
    const dismissed = await projectedInbox.service.action(actorId, dueNotification.id, {
      action: 'dismiss', expectedRevision: dueNotification.revision, idempotencyKey: 'dismiss-before-reschedule',
    });
    assert.equal(dismissed.notification.disposition, 'dismissed');

    // A real canonical command mutation re-enqueues the changed source. Once
    // the new fire time is due, reprojection must retain the prior user state.
    const changedFireAt = new Date(Date.parse(cutoff) + 60 * 60_000).toISOString();
    const currentReminders = createConfiguredReminderPlanService({
      runtime: { client: runtime.client, workspaceId, now: () => cutoff, publisher: { publish: async () => {} } },
      env: { ORBIT_CANONICAL_INBOX_PROJECTION: '1' },
    });
    const changedPlan = await currentReminders.reschedule({ actorId, reminderId: duePlan.id, fireAt: changedFireAt, timeZone: 'UTC',
      expectedUpdatedAt: duePlan.updatedAt, idempotencyKey: 'cutover-reschedule-read-state' });
    const changedWork = await runtime.client.query<{ source_revision: string; state: string; available_at: Date }>(`select source_revision,state,available_at from orbit_inbox_projection_work
      where workspace_id=$1 and actor_id=$2 and source_id=$3`, [workspaceId, actorId, duePlan.id]);
    assert.equal(changedWork.rows[0]?.state, 'pending');
    assert.equal(changedWork.rows[0]?.available_at.toISOString(), changedFireAt);
    assert.notEqual(changedWork.rows[0]?.source_revision, queuedById.get(duePlan.id)?.source_revision, 'the canonical writer advances the source revision');
    assert.ok(changedPlan.updatedAt >= cutoff);
    const afterChangedFire = await runReminderTask(changedFireAt);
    assert.ok('projectionCompleted' in afterChangedFire && afterChangedFire.projectionCompleted > 0);
    const afterChangedNotification = await getLegacyNotification('scheduled-due');
    assert.equal(afterChangedNotification.readAt, cutoff, 'source refresh does not clear an existing read timestamp');
    assert.equal(afterChangedNotification.disposition, 'dismissed', 'source refresh does not resurrect a dismissed item');
    assert.equal(afterChangedNotification.scheduledFor, changedFireAt);

    const generated = await runtime.client.query<{ record_id: string; fire_at: string; target_id: string }>(`select record_id,payload->'entity'->>'fireAt' as fire_at,payload->'entity'->>'targetId' as target_id
      from orbit_records where workspace_id=$1 and user_id=$2 and collection_name='reminderPlans'
        and payload->'entity'->>'targetId'=$3 and payload->'entity'->>'status'='scheduled'`, [workspaceId, actorId, `${oldSeries.id}:occurrence:${targetDate}`]);
    assert.equal(generated.rows.length, 1, 'the background window refresh created a plan beyond the legacy horizon');
    assert.equal(new Date(generated.rows[0]!.fire_at).toISOString(), targetFireAt);

    // Move only the worker clock to the actual future fire time. This is still
    // database-only: it runs the local due window + inbox projection workers,
    // never the typed Push sender.
    const atFire = await runReminderTask(targetFireAt);
    assert.ok('projectionCompleted' in atFire && atFire.projectionCompleted > 0);
    const inboxRow = await runtime.client.query(`select record_id from orbit_records where workspace_id=$1 and user_id=$2 and collection_name='inboxNotifications'
      and payload->'notification'->'sources' @> jsonb_build_array(jsonb_build_object('sourceKind','reminder_plan','sourceId',$3::text))`, [workspaceId, actorId, generated.rows[0]!.record_id]);
    assert.equal(inboxRow.rows.length, 1, 'the new future occurrence reaches the inbox from the due worker');
    await assert.rejects(getLegacyNotification('scheduled-future'), /Notification not found/, 'the separate future legacy plan is not projected early');
    const afterLegacyFuture = await runReminderTask(manualPlans.get('scheduled-future')!.fireAt);
    assert.ok('projectionCompleted' in afterLegacyFuture && afterLegacyFuture.projectionCompleted > 0);
    assert.equal((await getLegacyNotification('scheduled-future')).title, 'Legacy scheduled-future');

    const observed = track(runtime.client);
    const inbox = createInboxRuntime({ client: observed.client, workspaceId, now: () => targetFireAt });
    const handler = createInboxNotificationHandler({
      resolveActor: async () => ({ id: actorId, userId: actorId }) as never,
      enabled: () => true,
      runtime: (() => ({ ...inbox, client: observed.client, workspaceId })) as never,
    });
    const response = await handler('list', new Request('http://localhost/api/inbox/notifications?history=true'));
    assert.equal(response.status, 200);
    assert.match(JSON.stringify(await response.json()), new RegExp(oldSeries.id));
    const hasActorWideReminderPlanScan = (queries: readonly TrackedQuery[]) => queries.some(query =>
      /from\s+orbit_records/i.test(query.sql) && /collection_name\s*(?:=\s*'reminderPlans'|in\s*\([^)]*'reminderPlans')/i.test(query.sql) && !/record_id\s*=\s*\$\d+/i.test(query.sql));
    assert.equal(hasActorWideReminderPlanScan(observed.queries), false, 'inbox GET must not enumerate actor reminderPlans; source authorization stays ID-scoped');
    const scheduleReads = observed.queries.filter(query => query.values?.includes('personal_schedule_items'));
    assert.ok(scheduleReads.length > 0, 'the existing plan source is still authorized against its exact schedule record');
    assert.ok(scheduleReads.every(query => /record_id\s*=\s*\$\d+/i.test(query.sql)), 'GET must not enumerate personal_schedule_items');

    // Typed materialization consumes projected inbox rows and must not reintroduce
    // any actor-wide source scan.
    const store = createPostgresLiveRecordStore({ client: runtime.client });
    await store.upsertRecord({ workspaceId, collectionName: 'notificationCutover', recordId: actorId, userId: actorId,
      sourceType: 'system', sourceId: actorId, evidenceIds: [], lifecycleState: 'active', createdAt: cutoff, updatedAt: cutoff,
      payload: { enabled: true, generation: 1, since: cutoff, batchId: 'typed-materialize-cutover' } });
    observed.queries.length = 0;
    let pushCalls = 0;
    const typed = createTypedDeliveryRuntime({ actorId, client: observed.client, workspaceId, now: () => targetFireAt,
      devices: { listActive: async () => [] } as never,
      push: { send: async () => { pushCalls++; return { receiptId: 'must-not-send' }; } } as never,
    });
    await typed.materialize();
    assert.equal(hasActorWideReminderPlanScan(observed.queries), false, 'typed materialization does not scan reminder sources');
    const typedScheduleReads = observed.queries.filter(query => query.values?.includes('personal_schedule_items'));
    assert.ok(typedScheduleReads.length > 0);
    assert.ok(typedScheduleReads.every(query => /record_id\s*=\s*\$\d+/i.test(query.sql)), 'materialize must not enumerate personal_schedule_items');
    assert.equal(pushCalls, 0);
  } finally {
    for (const client of runtimeClients) await client.close();
    await pool.query(`drop schema if exists ${schema} cascade`);
    await baseClient.close();
    restoreEnvironment();
  }
});
